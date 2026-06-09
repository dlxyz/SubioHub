package admin

import (
	infraerrors "github.com/dlxyz/SubioHub/internal/pkg/errors"
	"github.com/dlxyz/SubioHub/internal/pkg/response"

	"github.com/gin-gonic/gin"
)

type domesticDiagnosticsRequest struct {
	ProviderType   string         `json:"provider_type" binding:"required,oneof=deepseek qwen doubao zhipu kimi minimax openai_compat_domestic custom_domestic"`
	ProviderConfig map[string]any `json:"provider_config" binding:"required"`
	TestModel      string         `json:"test_model" binding:"omitempty,max=100"`
}

// TestDomesticResponses handles testing the domestic responses conversion chain.
// POST /api/v1/admin/channels/test-responses
func (h *ChannelHandler) TestDomesticResponses(c *gin.Context) {
	if h.domesticChannelService == nil {
		response.ErrorFrom(c, infraerrors.ServiceUnavailable("DOMESTIC_CHANNEL_EXECUTOR_UNAVAILABLE", "Domestic channel executor unavailable"))
		return
	}

	var req domesticDiagnosticsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("VALIDATION_ERROR", err.Error()))
		return
	}

	result, err := h.domesticChannelService.TestResponses(c.Request.Context(), req.ProviderType, req.ProviderConfig, req.TestModel)
	if err != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("DOMESTIC_CHANNEL_RESPONSES_TEST_FAILED", err.Error()))
		return
	}

	response.Success(c, result)
}

// TestDomesticMessages handles testing the domestic messages conversion chain.
// POST /api/v1/admin/channels/test-messages
func (h *ChannelHandler) TestDomesticMessages(c *gin.Context) {
	if h.domesticChannelService == nil {
		response.ErrorFrom(c, infraerrors.ServiceUnavailable("DOMESTIC_CHANNEL_EXECUTOR_UNAVAILABLE", "Domestic channel executor unavailable"))
		return
	}

	var req domesticDiagnosticsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("VALIDATION_ERROR", err.Error()))
		return
	}

	result, err := h.domesticChannelService.TestMessages(c.Request.Context(), req.ProviderType, req.ProviderConfig, req.TestModel)
	if err != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("DOMESTIC_CHANNEL_MESSAGES_TEST_FAILED", err.Error()))
		return
	}

	response.Success(c, result)
}

// FetchDomesticModels handles fetching available upstream models for a domestic channel.
// POST /api/v1/admin/channels/fetch-models
func (h *ChannelHandler) FetchDomesticModels(c *gin.Context) {
	if h.domesticChannelService == nil {
		response.ErrorFrom(c, infraerrors.ServiceUnavailable("DOMESTIC_CHANNEL_EXECUTOR_UNAVAILABLE", "Domestic channel executor unavailable"))
		return
	}

	var req domesticDiagnosticsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("VALIDATION_ERROR", err.Error()))
		return
	}

	result, err := h.domesticChannelService.FetchAvailableModels(c.Request.Context(), req.ProviderType, req.ProviderConfig)
	if err != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("DOMESTIC_CHANNEL_FETCH_MODELS_FAILED", err.Error()))
		return
	}

	response.Success(c, result)
}

// TestDomesticEmbeddings handles testing the domestic embeddings upstream chain.
// POST /api/v1/admin/channels/test-embeddings
func (h *ChannelHandler) TestDomesticEmbeddings(c *gin.Context) {
	if h.domesticChannelService == nil {
		response.ErrorFrom(c, infraerrors.ServiceUnavailable("DOMESTIC_CHANNEL_EXECUTOR_UNAVAILABLE", "Domestic channel executor unavailable"))
		return
	}

	var req domesticDiagnosticsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("VALIDATION_ERROR", err.Error()))
		return
	}

	result, err := h.domesticChannelService.TestEmbeddings(c.Request.Context(), req.ProviderType, req.ProviderConfig, req.TestModel)
	if err != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("DOMESTIC_CHANNEL_EMBEDDINGS_TEST_FAILED", err.Error()))
		return
	}

	response.Success(c, result)
}

// TestDomesticRerank handles testing the domestic rerank upstream chain.
// POST /api/v1/admin/channels/test-rerank
func (h *ChannelHandler) TestDomesticRerank(c *gin.Context) {
	if h.domesticChannelService == nil {
		response.ErrorFrom(c, infraerrors.ServiceUnavailable("DOMESTIC_CHANNEL_EXECUTOR_UNAVAILABLE", "Domestic channel executor unavailable"))
		return
	}

	var req domesticDiagnosticsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("VALIDATION_ERROR", err.Error()))
		return
	}

	result, err := h.domesticChannelService.TestRerank(c.Request.Context(), req.ProviderType, req.ProviderConfig, req.TestModel)
	if err != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("DOMESTIC_CHANNEL_RERANK_TEST_FAILED", err.Error()))
		return
	}

	response.Success(c, result)
}
