package handler

import (
	"context"
	"errors"
	"net/http"
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

// Embeddings handles OpenAI Embeddings requests for domestic channels.
// POST /v1/embeddings
func (h *OpenAIGatewayHandler) Embeddings(c *gin.Context) {
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
		"handler.openai_gateway.embeddings",
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

	body, err := pkghttputil.ReadRequestBodyWithPrealloc(c.Request)
	if err != nil {
		if maxErr, ok := extractMaxBytesError(err); ok {
			h.errorResponse(c, http.StatusRequestEntityTooLarge, "invalid_request_error", buildBodyTooLargeMessage(maxErr.Limit))
			return
		}
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Failed to read request body")
		return
	}
	if len(body) == 0 {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Request body is empty")
		return
	}
	if !gjson.ValidBytes(body) {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Failed to parse request body")
		return
	}

	modelResult := gjson.GetBytes(body, "model")
	if !modelResult.Exists() || modelResult.Type != gjson.String || modelResult.String() == "" {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "model is required")
		return
	}
	reqModel := modelResult.String()
	reqLog = reqLog.With(zap.String("model", reqModel))

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
		reqLog.Info("openai_embeddings.billing_eligibility_check_failed", zap.Error(err))
		status, code, message := billingErrorDetails(err)
		h.errorResponse(c, status, code, message)
		return
	}

	domesticChannel, err := h.domesticChannelService.GetDomesticChannelForGroup(c.Request.Context(), apiKey.GroupID)
	if err != nil {
		reqLog.Warn("openai_embeddings.domestic_channel_lookup_failed", zap.Error(err))
		h.errorResponse(c, http.StatusServiceUnavailable, "api_error", "Channel temporarily unavailable")
		return
	}
	if domesticChannel == nil {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Domestic embeddings is not configured for this group")
		return
	}

	forwardBody := body
	if channelMapping.Mapped {
		forwardBody = h.gatewayService.ReplaceModelInBody(body, channelMapping.MappedModel)
	}
	result, err := h.domesticChannelService.ForwardOpenAIEmbeddings(c.Request.Context(), c, domesticChannel, forwardBody, reqModel)
	if err != nil && !errors.Is(err, service.ErrDomesticResponseWritten) {
		reqLog.Warn("openai_embeddings.domestic_forward_failed",
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
		reqLog.Warn("openai_embeddings.domestic_usage_account_prepare_failed",
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
				UpstreamEndpoint:   EndpointEmbeddings,
				UserAgent:          userAgent,
				IPAddress:          clientIP,
				RequestPayloadHash: requestPayloadHash,
				APIKeyService:      h.apiKeyService,
				ChannelUsageFields: channelMapping.ToUsageFields(reqModel, result.UpstreamModel),
			}); err != nil {
				logger.L().With(
					zap.String("component", "handler.openai_gateway.embeddings"),
					zap.Int64("user_id", subject.UserID),
					zap.Int64("api_key_id", apiKey.ID),
					zap.Int64("channel_id", domesticChannel.ID),
					zap.String("provider_type", domesticChannel.ProviderType),
					zap.String("model", reqModel),
				).Error("openai_embeddings.domestic_record_usage_failed", zap.Error(err))
			}
		})
	}

	reqLog.Debug("openai_embeddings.domestic_request_completed",
		zap.Int64("channel_id", domesticChannel.ID),
		zap.String("provider_type", domesticChannel.ProviderType),
	)
}
