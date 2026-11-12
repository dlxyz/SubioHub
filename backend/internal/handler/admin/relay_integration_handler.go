package admin

import (
	"strconv"

	infraerrors "github.com/dlxyz/SubioHub/internal/pkg/errors"
	"github.com/dlxyz/SubioHub/internal/pkg/response"
	"github.com/dlxyz/SubioHub/internal/server/middleware"
	"github.com/dlxyz/SubioHub/internal/service"

	"github.com/gin-gonic/gin"
)

// RelayIntegrationHandler 处理第三方中转站接入管理。
type RelayIntegrationHandler struct {
	relayService *service.RelayIntegrationService
}

// NewRelayIntegrationHandler 创建第三方接入处理器。
func NewRelayIntegrationHandler(relayService *service.RelayIntegrationService) *RelayIntegrationHandler {
	return &RelayIntegrationHandler{relayService: relayService}
}

type previewRelayModelsRequest struct {
	ProviderKey string `json:"provider_key"`
	BaseURL     string `json:"base_url" binding:"required"`
	APIKey      string `json:"api_key" binding:"required"`
}

type createRelayIntegrationRequest struct {
	Name           string               `json:"name" binding:"required,max=100"`
	ProviderKey    string               `json:"provider_key"`
	BaseURL        string               `json:"base_url" binding:"required"`
	APIKey         string               `json:"api_key" binding:"required"`
	APIStyle       string               `json:"api_style" binding:"omitempty,oneof=chat_completions responses"`
	GroupName      string               `json:"group_name" binding:"max=100"`
	RateMultiplier float64              `json:"rate_multiplier"`
	ProxyID        *int64               `json:"proxy_id"`
	Concurrency    int                  `json:"concurrency"`
	Priority       int                  `json:"priority"`
	Models         []service.RelayModel `json:"models" binding:"required,min=1"`
}

type applyRelayModelsRequest struct {
	Models []service.RelayModel `json:"models" binding:"required,min=1"`
}

type testRelayRequest struct {
	Model string `json:"model" binding:"required"`
}

type relayStatusRequest struct {
	Status string `json:"status" binding:"required,oneof=active disabled"`
}

// PreviewModels 拉取第三方模型列表，不落库。
// POST /api/v1/admin/relay-integrations/preview-models
func (h *RelayIntegrationHandler) PreviewModels(c *gin.Context) {
	var req previewRelayModelsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("VALIDATION_ERROR", err.Error()))
		return
	}
	result, err := h.relayService.PreviewModels(c.Request.Context(), req.ProviderKey, req.BaseURL, req.APIKey)
	if err != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("RELAY_PREVIEW_FAILED", err.Error()))
		return
	}
	response.Success(c, result)
}

// Create 创建第三方接入。
// POST /api/v1/admin/relay-integrations
func (h *RelayIntegrationHandler) Create(c *gin.Context) {
	var req createRelayIntegrationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("VALIDATION_ERROR", err.Error()))
		return
	}
	var createdBy int64
	if subject, ok := middleware.GetAuthSubjectFromContext(c); ok {
		createdBy = subject.UserID
	}
	integration, err := h.relayService.Create(c.Request.Context(), &service.CreateRelayIntegrationInput{
		Name:           req.Name,
		ProviderKey:    req.ProviderKey,
		BaseURL:        req.BaseURL,
		APIKey:         req.APIKey,
		APIStyle:       req.APIStyle,
		GroupName:      req.GroupName,
		RateMultiplier: req.RateMultiplier,
		ProxyID:        req.ProxyID,
		Concurrency:    req.Concurrency,
		Priority:       req.Priority,
		Models:         req.Models,
	}, createdBy)
	if err != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("RELAY_CREATE_FAILED", err.Error()))
		return
	}
	response.Success(c, integration)
}

// List 返回第三方接入列表。
// GET /api/v1/admin/relay-integrations
func (h *RelayIntegrationHandler) List(c *gin.Context) {
	items, err := h.relayService.List(c.Request.Context())
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, gin.H{"items": items, "total": len(items)})
}

// Get 返回第三方接入详情。
// GET /api/v1/admin/relay-integrations/:id
func (h *RelayIntegrationHandler) Get(c *gin.Context) {
	id, err := parseRelayIntegrationID(c)
	if err != nil {
		return
	}
	detail, err := h.relayService.Get(c.Request.Context(), id)
	if err != nil {
		response.ErrorFrom(c, infraerrors.NotFound("RELAY_NOT_FOUND", err.Error()))
		return
	}
	response.Success(c, detail)
}

// Sync 拉取最新模型并返回 diff。
// POST /api/v1/admin/relay-integrations/:id/sync
func (h *RelayIntegrationHandler) Sync(c *gin.Context) {
	id, err := parseRelayIntegrationID(c)
	if err != nil {
		return
	}
	result, err := h.relayService.SyncModels(c.Request.Context(), id)
	if err != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("RELAY_SYNC_FAILED", err.Error()))
		return
	}
	response.Success(c, result)
}

// ApplyModels 将选择的模型写入账号和渠道。
// PUT /api/v1/admin/relay-integrations/:id/models
func (h *RelayIntegrationHandler) ApplyModels(c *gin.Context) {
	id, err := parseRelayIntegrationID(c)
	if err != nil {
		return
	}
	var req applyRelayModelsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("VALIDATION_ERROR", err.Error()))
		return
	}
	if err := h.relayService.ApplyModels(c.Request.Context(), id, req.Models); err != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("RELAY_APPLY_MODELS_FAILED", err.Error()))
		return
	}
	response.Success(c, gin.H{"ok": true})
}

// Test 发起一次最小对话测试。
// POST /api/v1/admin/relay-integrations/:id/test
func (h *RelayIntegrationHandler) Test(c *gin.Context) {
	id, err := parseRelayIntegrationID(c)
	if err != nil {
		return
	}
	var req testRelayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("VALIDATION_ERROR", err.Error()))
		return
	}
	result, err := h.relayService.Test(c.Request.Context(), id, req.Model)
	if err != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("RELAY_TEST_FAILED", err.Error()))
		return
	}
	response.Success(c, result)
}

// UpdateStatus 启用或停用接入。
// PATCH /api/v1/admin/relay-integrations/:id/status
func (h *RelayIntegrationHandler) UpdateStatus(c *gin.Context) {
	id, err := parseRelayIntegrationID(c)
	if err != nil {
		return
	}
	var req relayStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("VALIDATION_ERROR", err.Error()))
		return
	}
	if err := h.relayService.SetStatus(c.Request.Context(), id, req.Status); err != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("RELAY_STATUS_FAILED", err.Error()))
		return
	}
	response.Success(c, gin.H{"ok": true})
}

// Delete 停用并软删除接入。
// DELETE /api/v1/admin/relay-integrations/:id
func (h *RelayIntegrationHandler) Delete(c *gin.Context) {
	id, err := parseRelayIntegrationID(c)
	if err != nil {
		return
	}
	if err := h.relayService.Delete(c.Request.Context(), id); err != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("RELAY_DELETE_FAILED", err.Error()))
		return
	}
	response.Success(c, gin.H{"ok": true})
}

func parseRelayIntegrationID(c *gin.Context) (int64, error) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		response.ErrorFrom(c, infraerrors.BadRequest("INVALID_ID", "invalid relay integration id"))
		return 0, err
	}
	return id, nil
}
