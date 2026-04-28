package handler

import (
	"net/http"

	"github.com/dlxyz/SubioHub/internal/pkg/pagination"
	"github.com/dlxyz/SubioHub/internal/pkg/response"

	middleware2 "github.com/dlxyz/SubioHub/internal/server/middleware"
	"github.com/dlxyz/SubioHub/internal/service"
	"github.com/gin-gonic/gin"
)

type AffiliateHandler struct {
	affiliateService *service.AffiliateService
	userService      *service.UserService
}

func NewAffiliateHandler(affiliateService *service.AffiliateService, userService *service.UserService) *AffiliateHandler {
	return &AffiliateHandler{
		affiliateService: affiliateService,
		userService:      userService,
	}
}

// GetAffiliateInfo 获取分销信息面板
func (h *AffiliateHandler) GetAffiliateInfo(c *gin.Context) {
	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := subject.UserID

	user, err := h.userService.GetByID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get user info"})
		return
	}

	pendingAmount, err := h.affiliateService.GetPendingAmount(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get pending amount"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"user_id":                 user.ID,
		"invite_code":             user.InviteCode,
		"commission_rate":         user.CommissionRate,
		"commission_balance":      user.CommissionBalance,
		"total_commission_earned": user.TotalCommissionEarned,
		"pending_amount":          pendingAmount,
	})
}

// GetCommissionLogs 获取佣金流水
func (h *AffiliateHandler) GetCommissionLogs(c *gin.Context) {
	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := subject.UserID

	page, pageSize := response.ParsePagination(c)
	params := pagination.PaginationParams{
		Page:     page,
		PageSize: pageSize,
	}
	logs, paginator, err := h.affiliateService.ListUserCommissions(c.Request.Context(), userID, params)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get commission logs"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":       logs,
		"pagination": paginator,
	})
}

// TransferCommissionToBalance 佣金划转到余额
func (h *AffiliateHandler) TransferCommissionToBalance(c *gin.Context) {
	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := subject.UserID

	var req struct {
		Amount float64 `json:"amount" binding:"required,gt=0"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}

	if err := h.affiliateService.TransferToBalance(c.Request.Context(), userID, req.Amount); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Transfer successful"})
}
