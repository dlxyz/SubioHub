package admin

import (
	"net/http"
	"strconv"

	"github.com/dlxyz/SubioHub/internal/pkg/pagination"
	"github.com/dlxyz/SubioHub/internal/pkg/response"
	"github.com/dlxyz/SubioHub/internal/service"
	"github.com/gin-gonic/gin"
)

type AffiliateHandler struct {
	affiliateService *service.AffiliateService
	settingService   *service.SettingService
}

func NewAffiliateHandler(affiliateService *service.AffiliateService, settingService *service.SettingService) *AffiliateHandler {
	return &AffiliateHandler{
		affiliateService: affiliateService,
		settingService:   settingService,
	}
}

// ListCommissions 获取全站佣金流水 (管理端)
func (h *AffiliateHandler) ListCommissions(c *gin.Context) {
	page, pageSize := response.ParsePagination(c)
	params := pagination.PaginationParams{
		Page:     page,
		PageSize: pageSize,
	}

	var filters service.CommissionLogListFilters

	// Optional filter by UserID
	if userIDStr := c.Query("user_id"); userIDStr != "" {
		if id, err := strconv.ParseInt(userIDStr, 10, 64); err == nil {
			filters.UserID = &id
		}
	}

	// Optional filter by Status
	if status := c.Query("status"); status != "" {
		filters.Status = status
	}

	logs, paginator, err := h.affiliateService.AdminListCommissions(c.Request.Context(), params, filters)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get commissions: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":       logs,
		"pagination": paginator,
	})
}

// ListCommissionSplits 获取补差法分润明细 (管理端)
func (h *AffiliateHandler) ListCommissionSplits(c *gin.Context) {
	page, pageSize := response.ParsePagination(c)
	params := pagination.PaginationParams{
		Page:     page,
		PageSize: pageSize,
	}

	var filters service.CommissionSplitLogListFilters

	if userIDStr := c.Query("beneficiary_user_id"); userIDStr != "" {
		if id, err := strconv.ParseInt(userIDStr, 10, 64); err == nil {
			filters.BeneficiaryUserID = &id
		}
	}
	if role := c.Query("beneficiary_role"); role != "" {
		filters.BeneficiaryRole = role
	}
	if status := c.Query("status"); status != "" {
		filters.Status = status
	}

	logs, paginator, err := h.affiliateService.AdminListCommissionSplits(c.Request.Context(), params, filters)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get commission split logs: " + err.Error()})
		return
	}

	response.PaginatedWithResult(c, logs, &response.PaginationResult{
		Total:    paginator.Total,
		Page:     paginator.Page,
		PageSize: paginator.PageSize,
		Pages:    paginator.Pages,
	})
}

// SettleCommission 手动结算一条待结算的佣金
func (h *AffiliateHandler) SettleCommission(c *gin.Context) {
	if h.settingService != nil && !h.settingService.IsAffiliateManualPayoutSettlementEnabled(c.Request.Context()) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Manual payout settlement is disabled in system settings"})
		return
	}

	logIDStr := c.Param("id")
	logID, err := strconv.ParseInt(logIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid commission log ID"})
		return
	}

	if err := h.affiliateService.SettleCommission(c.Request.Context(), logID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Commission settled successfully"})
}

// SettleCommissionSplit 手动结算一条待结算的补差法分润明细
func (h *AffiliateHandler) SettleCommissionSplit(c *gin.Context) {
	if h.settingService != nil && !h.settingService.IsAffiliateManualPayoutSettlementEnabled(c.Request.Context()) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Manual payout settlement is disabled in system settings"})
		return
	}

	logIDStr := c.Param("id")
	logID, err := strconv.ParseInt(logIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid commission split log ID"})
		return
	}

	if err := h.affiliateService.SettleCommissionSplit(c.Request.Context(), logID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Commission split settled successfully"})
}

// SetUserCommissionRate 设置某个用户的专属返佣比例
func (h *AffiliateHandler) SetUserCommissionRate(c *gin.Context) {
	userIDStr := c.Param("id")
	userID, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	var req struct {
		Rate float64 `json:"rate" binding:"required,min=0,max=1"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}

	if err := h.affiliateService.AdminUpdateUserCommissionRate(c.Request.Context(), userID, req.Rate); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Commission rate updated successfully"})
}
