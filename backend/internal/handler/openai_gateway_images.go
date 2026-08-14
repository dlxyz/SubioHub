package handler

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	pkghttputil "github.com/dlxyz/SubioHub/internal/pkg/httputil"
	"github.com/dlxyz/SubioHub/internal/pkg/ip"
	"github.com/dlxyz/SubioHub/internal/pkg/logger"
	middleware2 "github.com/dlxyz/SubioHub/internal/server/middleware"
	"github.com/dlxyz/SubioHub/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
	"go.uber.org/zap"
)

// Images handles OpenAI-compatible image generation requests for domestic channels.
// POST /v1/images/generations
func (h *OpenAIGatewayHandler) Images(c *gin.Context) {
	h.forwardImages(c, false)
}

// ImagesEdits handles OpenAI-compatible image editing requests for domestic channels.
// POST /v1/images/edits (multipart/form-data or JSON body, normalized to JSON upstream).
func (h *OpenAIGatewayHandler) ImagesEdits(c *gin.Context) {
	h.forwardImages(c, true)
}

func (h *OpenAIGatewayHandler) forwardImages(c *gin.Context, edits bool) {
	requestStart := time.Now()

	apiKey, ok := middleware2.GetAPIKeyFromContext(c)
	if !ok {
		h.errorResponse(c, http.StatusUnauthorized, "authentication_error", "Invalid API key")
		return
	}

	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		h.errorResponse(c, http.StatusInternalServerError, "api_error", "User context not found")
		return
	}

	reqLog := requestLogger(
		c,
		"handler.openai_gateway.images",
		zap.Int64("user_id", subject.UserID),
		zap.Int64("api_key_id", apiKey.ID),
		zap.Any("group_id", apiKey.GroupID),
	)
	if !h.ensureResponsesDependencies(c, reqLog) {
		return
	}
	if h.domesticChannelService == nil {
		h.errorResponse(c, http.StatusServiceUnavailable, "api_error", "Domestic channel executor unavailable")
		return
	}

	body, reqModel, ok := h.readImagesBody(c, edits)
	if !ok {
		return
	}
	reqLog = reqLog.With(zap.String("model", reqModel))

	upstreamEndpoint := EndpointImages
	if edits {
		upstreamEndpoint = EndpointImagesEdits
	}

	setOpsRequestContext(c, reqModel, false, body)
	setOpsEndpointContext(c, "", int16(service.RequestTypeSync))

	channelMapping, _ := h.gatewayService.ResolveChannelMappingAndRestrict(c.Request.Context(), apiKey.GroupID, reqModel)
	subscription, _ := middleware2.GetSubscriptionFromContext(c)

	service.SetOpsLatencyMs(c, service.OpsAuthLatencyMsKey, time.Since(requestStart).Milliseconds())

	streamStarted := false
	userReleaseFunc, acquired := h.acquireResponsesUserSlot(c, subject.UserID, subject.Concurrency, false, &streamStarted, reqLog)
	if !acquired {
		return
	}
	if userReleaseFunc != nil {
		defer userReleaseFunc()
	}

	if err := h.billingCacheService.CheckBillingEligibility(c.Request.Context(), apiKey.User, apiKey, apiKey.Group, subscription); err != nil {
		reqLog.Info("openai_images.billing_eligibility_check_failed", zap.Error(err))
		status, code, message := billingErrorDetails(err)
		h.errorResponse(c, status, code, message)
		return
	}

	domesticChannel, err := h.domesticChannelService.GetDomesticChannelForGroup(c.Request.Context(), apiKey.GroupID)
	if err != nil {
		reqLog.Warn("openai_images.domestic_channel_lookup_failed", zap.Error(err))
		h.errorResponse(c, http.StatusServiceUnavailable, "api_error", "Channel temporarily unavailable")
		return
	}
	if domesticChannel == nil {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Domestic image generation is not configured for this group")
		return
	}

	forwardBody := body
	if channelMapping.Mapped {
		forwardBody = h.gatewayService.ReplaceModelInBody(body, channelMapping.MappedModel)
	}
	result, err := h.domesticChannelService.ForwardOpenAIImages(c.Request.Context(), c, domesticChannel, forwardBody, reqModel, edits)
	if err != nil && !errors.Is(err, service.ErrDomesticResponseWritten) {
		reqLog.Warn("openai_images.domestic_forward_failed",
			zap.Int64("channel_id", domesticChannel.ID),
			zap.String("provider_type", domesticChannel.ProviderType),
			zap.Error(err),
		)
		h.errorResponse(c, http.StatusBadGateway, "upstream_error", "Domestic upstream request failed")
		return
	}
	if result == nil {
		return
	}

	usageAccount, usageErr := h.domesticChannelService.EnsureUsageAccountForChannel(c.Request.Context(), domesticChannel)
	if usageErr != nil {
		reqLog.Warn("openai_images.domestic_usage_account_prepare_failed",
			zap.Int64("channel_id", domesticChannel.ID),
			zap.Error(usageErr),
		)
	} else if usageAccount != nil {
		userAgent := c.GetHeader("User-Agent")
		clientIP := ip.GetClientIP(c)
		requestPayloadHash := service.HashUsageRequestPayload(body)
		h.submitUsageRecordTask(func(ctx context.Context) {
			if err := h.gatewayService.RecordUsage(ctx, &service.OpenAIRecordUsageInput{
				Result:             result,
				APIKey:             apiKey,
				User:               apiKey.User,
				Account:            usageAccount,
				Subscription:       subscription,
				InboundEndpoint:    GetInboundEndpoint(c),
				UpstreamEndpoint:   upstreamEndpoint,
				UserAgent:          userAgent,
				IPAddress:          clientIP,
				RequestPayloadHash: requestPayloadHash,
				APIKeyService:      h.apiKeyService,
				ChannelUsageFields: channelMapping.ToUsageFields(reqModel, result.UpstreamModel),
			}); err != nil {
				logger.L().With(
					zap.String("component", "handler.openai_gateway.images"),
					zap.Int64("user_id", subject.UserID),
					zap.Int64("api_key_id", apiKey.ID),
					zap.Int64("channel_id", domesticChannel.ID),
					zap.String("provider_type", domesticChannel.ProviderType),
					zap.String("model", reqModel),
				).Error("openai_images.domestic_record_usage_failed", zap.Error(err))
			}
		})
	}

	reqLog.Debug("openai_images.domestic_request_completed",
		zap.Int64("channel_id", domesticChannel.ID),
		zap.String("provider_type", domesticChannel.ProviderType),
	)
}

// readImagesBody reads and validates the inbound image request. For edits it
// normalizes multipart/form-data into a JSON body first so the downstream
// forwarding chain stays protocol-agnostic. Returns the JSON body, the requested
// model, and whether parsing succeeded.
func (h *OpenAIGatewayHandler) readImagesBody(c *gin.Context, edits bool) ([]byte, string, bool) {
	var (
		body []byte
		err  error
	)
	if edits {
		body, err = buildImagesEditsJSON(c)
	} else {
		body, err = pkghttputil.ReadRequestBodyWithPrealloc(c.Request)
	}
	if err != nil {
		if maxErr, ok := extractMaxBytesError(err); ok {
			h.errorResponse(c, http.StatusRequestEntityTooLarge, "invalid_request_error", buildBodyTooLargeMessage(maxErr.Limit))
			return nil, "", false
		}
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Failed to read request body")
		return nil, "", false
	}
	if len(body) == 0 {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Request body is empty")
		return nil, "", false
	}
	if !gjson.ValidBytes(body) {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Failed to parse request body")
		return nil, "", false
	}

	modelResult := gjson.GetBytes(body, "model")
	if !modelResult.Exists() || modelResult.Type != gjson.String || modelResult.String() == "" {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "model is required")
		return nil, "", false
	}
	return body, modelResult.String(), true
}

// buildImagesEditsJSON normalizes an OpenAI /v1/images/edits request into a JSON
// body. multipart/form-data (the OpenAI convention) is flattened into JSON; JSON
// requests are passed through unchanged. File parts (image/mask) are base64
// encoded into data URLs so providers that only accept a JSON image body (e.g.
// Doubao /api/v3/images/generations) can consume them.
func buildImagesEditsJSON(c *gin.Context) ([]byte, error) {
	contentType := strings.ToLower(c.GetHeader("Content-Type"))
	if !strings.Contains(contentType, "multipart/form-data") {
		return pkghttputil.ReadRequestBodyWithPrealloc(c.Request)
	}

	if _, err := c.MultipartForm(); err != nil {
		return nil, err
	}

	payload := map[string]any{}
	for _, field := range []string{"model", "prompt", "size", "quality", "response_format"} {
		if v := c.PostForm(field); v != "" {
			payload[field] = v
		}
	}
	if n, err := strconv.Atoi(c.PostForm("n")); err == nil && n > 0 {
		payload["n"] = n
	}
	if values, ok := c.Request.PostForm["watermark"]; ok && len(values) > 0 {
		payload["watermark"] = strings.EqualFold(strings.TrimSpace(values[0]), "true")
	}
	if v := imageEditFormField(c, "image"); v != "" {
		payload["image"] = v
	}
	if v := imageEditFormField(c, "mask"); v != "" {
		payload["mask"] = v
	}

	return json.Marshal(payload)
}

// imageEditFormField returns a form field value, reading multipart file parts as
// base64 data URLs and falling back to plain form values (URL or base64 strings).
func imageEditFormField(c *gin.Context, field string) string {
	if file, header, err := c.Request.FormFile(field); err == nil {
		data, readErr := io.ReadAll(file)
		_ = file.Close()
		if readErr == nil && len(data) > 0 {
			mime := header.Header.Get("Content-Type")
			if mime == "" {
				mime = http.DetectContentType(data)
			}
			return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data)
		}
	}
	return c.PostForm(field)
}
