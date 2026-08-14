package handler

import (
	"context"
	"errors"
	"net/http"
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

// AudioSpeech handles OpenAI-compatible text-to-speech requests for domestic channels.
// POST /v1/audio/speech (JSON body in, audio bytes out).
func (h *OpenAIGatewayHandler) AudioSpeech(c *gin.Context) {
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
		"handler.openai_gateway.audio_speech",
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

	body, reqModel, ok := h.readAudioSpeechBody(c)
	if !ok {
		return
	}
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
		reqLog.Info("openai_audio_speech.billing_eligibility_check_failed", zap.Error(err))
		status, code, message := billingErrorDetails(err)
		h.errorResponse(c, status, code, message)
		return
	}

	domesticChannel, err := h.domesticChannelService.GetDomesticChannelForGroup(c.Request.Context(), apiKey.GroupID)
	if err != nil {
		reqLog.Warn("openai_audio_speech.domestic_channel_lookup_failed", zap.Error(err))
		h.errorResponse(c, http.StatusServiceUnavailable, "api_error", "Channel temporarily unavailable")
		return
	}
	if domesticChannel == nil {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Domestic audio speech is not configured for this group")
		return
	}

	forwardBody := body
	if channelMapping.Mapped {
		forwardBody = h.gatewayService.ReplaceModelInBody(body, channelMapping.MappedModel)
	}
	result, err := h.domesticChannelService.ForwardOpenAIAudioSpeech(c.Request.Context(), c, domesticChannel, forwardBody, reqModel)
	if err != nil && !errors.Is(err, service.ErrDomesticResponseWritten) {
		reqLog.Warn("openai_audio_speech.domestic_forward_failed",
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
		reqLog.Warn("openai_audio_speech.domestic_usage_account_prepare_failed",
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
				UpstreamEndpoint:   EndpointAudioSpeech,
				UserAgent:          userAgent,
				IPAddress:          clientIP,
				RequestPayloadHash: requestPayloadHash,
				APIKeyService:      h.apiKeyService,
				ChannelUsageFields: channelMapping.ToUsageFields(reqModel, result.UpstreamModel),
			}); err != nil {
				logger.L().With(
					zap.String("component", "handler.openai_gateway.audio_speech"),
					zap.Int64("user_id", subject.UserID),
					zap.Int64("api_key_id", apiKey.ID),
					zap.Int64("channel_id", domesticChannel.ID),
					zap.String("provider_type", domesticChannel.ProviderType),
					zap.String("model", reqModel),
				).Error("openai_audio_speech.domestic_record_usage_failed", zap.Error(err))
			}
		})
	}

	reqLog.Debug("openai_audio_speech.domestic_request_completed",
		zap.Int64("channel_id", domesticChannel.ID),
		zap.String("provider_type", domesticChannel.ProviderType),
	)
}

// readAudioSpeechBody reads and validates the inbound audio speech request.
// Returns the JSON body, the requested model, and whether parsing succeeded.
func (h *OpenAIGatewayHandler) readAudioSpeechBody(c *gin.Context) ([]byte, string, bool) {
	body, err := pkghttputil.ReadRequestBodyWithPrealloc(c.Request)
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

// AudioTranscriptions handles OpenAI-compatible speech-to-text requests for domestic channels.
// POST /v1/audio/transcriptions (multipart form data in, JSON text out).
func (h *OpenAIGatewayHandler) AudioTranscriptions(c *gin.Context) {
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
		"handler.openai_gateway.audio_transcriptions",
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

	if _, err := c.MultipartForm(); err != nil {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Failed to parse multipart form")
		return
	}
	reqModel := strings.TrimSpace(c.PostForm("model"))
	if reqModel == "" {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "model is required")
		return
	}
	reqLog = reqLog.With(zap.String("model", reqModel))

	setOpsRequestContext(c, reqModel, false, []byte{})
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
		reqLog.Info("openai_audio_transcriptions.billing_eligibility_check_failed", zap.Error(err))
		status, code, message := billingErrorDetails(err)
		h.errorResponse(c, status, code, message)
		return
	}

	domesticChannel, err := h.domesticChannelService.GetDomesticChannelForGroup(c.Request.Context(), apiKey.GroupID)
	if err != nil {
		reqLog.Warn("openai_audio_transcriptions.domestic_channel_lookup_failed", zap.Error(err))
		h.errorResponse(c, http.StatusServiceUnavailable, "api_error", "Channel temporarily unavailable")
		return
	}
	if domesticChannel == nil {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Domestic audio transcription is not configured for this group")
		return
	}

	upstreamModel := reqModel
	if channelMapping.Mapped {
		upstreamModel = channelMapping.MappedModel
	}

	result, err := h.domesticChannelService.ForwardOpenAIAudioTranscription(c.Request.Context(), c, domesticChannel, reqModel, upstreamModel)
	if err != nil && !errors.Is(err, service.ErrDomesticResponseWritten) {
		reqLog.Warn("openai_audio_transcriptions.domestic_forward_failed",
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
		reqLog.Warn("openai_audio_transcriptions.domestic_usage_account_prepare_failed",
			zap.Int64("channel_id", domesticChannel.ID),
			zap.Error(usageErr),
		)
	} else if usageAccount != nil {
		userAgent := c.GetHeader("User-Agent")
		clientIP := ip.GetClientIP(c)
		requestPayloadHash := service.HashUsageRequestPayload([]byte(reqModel))
		h.submitUsageRecordTask(func(ctx context.Context) {
			if err := h.gatewayService.RecordUsage(ctx, &service.OpenAIRecordUsageInput{
				Result:             result,
				APIKey:             apiKey,
				User:               apiKey.User,
				Account:            usageAccount,
				Subscription:       subscription,
				InboundEndpoint:    GetInboundEndpoint(c),
				UpstreamEndpoint:   EndpointAudioTranscriptions,
				UserAgent:          userAgent,
				IPAddress:          clientIP,
				RequestPayloadHash: requestPayloadHash,
				APIKeyService:      h.apiKeyService,
				ChannelUsageFields: channelMapping.ToUsageFields(reqModel, result.UpstreamModel),
			}); err != nil {
				logger.L().With(
					zap.String("component", "handler.openai_gateway.audio_transcriptions"),
					zap.Int64("user_id", subject.UserID),
					zap.Int64("api_key_id", apiKey.ID),
					zap.Int64("channel_id", domesticChannel.ID),
					zap.String("provider_type", domesticChannel.ProviderType),
					zap.String("model", reqModel),
				).Error("openai_audio_transcriptions.domestic_record_usage_failed", zap.Error(err))
			}
		})
	}

	reqLog.Debug("openai_audio_transcriptions.domestic_request_completed",
		zap.Int64("channel_id", domesticChannel.ID),
		zap.String("provider_type", domesticChannel.ProviderType),
	)
}
