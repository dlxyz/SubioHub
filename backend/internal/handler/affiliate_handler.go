package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/dlxyz/SubioHub/internal/handler/dto"
	"github.com/dlxyz/SubioHub/internal/pkg/pagination"
	"github.com/dlxyz/SubioHub/internal/pkg/response"

	middleware2 "github.com/dlxyz/SubioHub/internal/server/middleware"
	"github.com/dlxyz/SubioHub/internal/service"
	"github.com/gin-gonic/gin"
)

type AffiliateHandler struct {
	affiliateService *service.AffiliateService
	userService      *service.UserService
	adminService     service.AdminService
}

func NewAffiliateHandler(
	affiliateService *service.AffiliateService,
	userService *service.UserService,
	adminService service.AdminService,
) *AffiliateHandler {
	return &AffiliateHandler{
		affiliateService: affiliateService,
		userService:      userService,
		adminService:     adminService,
	}
}

type CreateAgentDistributorRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
	Username string `json:"username"`
	Notes    string `json:"notes"`
}

type CreateChannelPartnerAgentRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
	Username string `json:"username"`
	Notes    string `json:"notes"`
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

// CreateDistributor creates a distributor user from the agent console.
func (h *AffiliateHandler) CreateDistributor(c *gin.Context) {
	subject, authenticated := middleware2.GetAuthSubjectFromContext(c)
	role, ok := middleware2.GetUserRoleFromContext(c)
	if !ok || !authenticated {
		response.Unauthorized(c, "Unauthorized")
		return
	}
	if role != service.RoleAdmin && role != service.RoleAgent {
		response.Forbidden(c, "当前账号没有创建分销用户权限")
		return
	}

	var req CreateAgentDistributorRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	created, err := h.adminService.CreateUser(c.Request.Context(), &service.CreateUserInput{
		Email:    req.Email,
		Password: req.Password,
		Username: req.Username,
		Notes:    req.Notes,
	})
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	var (
		channelPartnerPatch **int64
		agentOwnerPatch     **int64
	)
	if role == service.RoleAgent {
		operator, err := h.userService.GetByID(c.Request.Context(), subject.UserID)
		if err != nil {
			response.ErrorFrom(c, err)
			return
		}

		agentOwnerValue := subject.UserID
		agentOwnerResolved := &agentOwnerValue
		agentOwnerPatch = &agentOwnerResolved

		if operator.ChannelPartnerID != nil && *operator.ChannelPartnerID > 0 {
			channelPartnerValue := *operator.ChannelPartnerID
			channelPartnerResolved := &channelPartnerValue
			channelPartnerPatch = &channelPartnerResolved
		}
	}

	distributorRole := service.RoleDistributor
	updated, err := h.adminService.UpdateUser(c.Request.Context(), created.ID, &service.UpdateUserInput{
		Role:             &distributorRole,
		ChannelPartnerID: channelPartnerPatch,
		AgentOwnerID:     agentOwnerPatch,
	})
	if err != nil {
		_ = h.adminService.DeleteUser(c.Request.Context(), created.ID)
		response.ErrorFrom(c, err)
		return
	}
	if role == service.RoleAgent {
		if err := h.affiliateService.BindInviter(c.Request.Context(), updated.ID, subject.UserID); err != nil {
			_ = h.adminService.DeleteUser(c.Request.Context(), updated.ID)
			response.ErrorFrom(c, err)
			return
		}
	}

	response.Created(c, dto.UserFromServiceAdmin(updated))
}

// CreateAgent creates an agent user from the channel partner console.
func (h *AffiliateHandler) CreateAgent(c *gin.Context) {
	subject, authenticated := middleware2.GetAuthSubjectFromContext(c)
	role, ok := middleware2.GetUserRoleFromContext(c)
	if !ok || !authenticated {
		response.Unauthorized(c, "Unauthorized")
		return
	}
	if role != service.RoleAdmin && role != service.RoleChannelPartner {
		response.Forbidden(c, "当前账号没有创建代理人权限")
		return
	}

	var req CreateChannelPartnerAgentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	created, err := h.adminService.CreateUser(c.Request.Context(), &service.CreateUserInput{
		Email:    req.Email,
		Password: req.Password,
		Username: req.Username,
		Notes:    req.Notes,
	})
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	var channelPartnerPatch **int64
	if role == service.RoleChannelPartner {
		channelPartnerValue := subject.UserID
		channelPartnerResolved := &channelPartnerValue
		channelPartnerPatch = &channelPartnerResolved
	}

	agentRole := service.RoleAgent
	updated, err := h.adminService.UpdateUser(c.Request.Context(), created.ID, &service.UpdateUserInput{
		Role:               &agentRole,
		ChannelPartnerID:   channelPartnerPatch,
		AgentOwnerID:       nil,
		DistributorOwnerID: nil,
	})
	if err != nil {
		_ = h.adminService.DeleteUser(c.Request.Context(), created.ID)
		response.ErrorFrom(c, err)
		return
	}

	if role == service.RoleChannelPartner {
		if err := h.affiliateService.BindInviter(c.Request.Context(), updated.ID, subject.UserID); err != nil {
			_ = h.adminService.DeleteUser(c.Request.Context(), created.ID)
			response.ErrorFrom(c, err)
			return
		}
	}

	response.Created(c, dto.UserFromServiceAdmin(updated))
}

func (h *AffiliateHandler) ListAgents(c *gin.Context) {
	subject, authenticated := middleware2.GetAuthSubjectFromContext(c)
	role, ok := middleware2.GetUserRoleFromContext(c)
	if !ok || !authenticated {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	page, pageSize := response.ParsePagination(c)
	search := strings.TrimSpace(c.Query("search"))
	status := strings.TrimSpace(c.Query("status"))

	filters := service.UserListFilters{
		Role:   service.RoleAgent,
		Search: search,
		Status: status,
	}
	if role == service.RoleChannelPartner {
		channelPartnerID := subject.UserID
		filters.ChannelPartnerID = &channelPartnerID
	}

	users, total, err := h.adminService.ListUsers(
		c.Request.Context(),
		page,
		pageSize,
		filters,
		"created_at",
		"desc",
	)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	out := make([]*dto.AdminUser, len(users))
	for i := range users {
		out[i] = dto.UserFromServiceAdmin(&users[i])
	}
	response.Paginated(c, out, total, page, pageSize)
}

func (h *AffiliateHandler) ListDistributors(c *gin.Context) {
	subject, authenticated := middleware2.GetAuthSubjectFromContext(c)
	role, ok := middleware2.GetUserRoleFromContext(c)
	if !ok || !authenticated {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	page, pageSize := response.ParsePagination(c)
	search := strings.TrimSpace(c.Query("search"))
	status := strings.TrimSpace(c.Query("status"))

	filters := service.UserListFilters{
		Role:   service.RoleDistributor,
		Search: search,
		Status: status,
	}
	switch role {
	case service.RoleChannelPartner:
		channelPartnerID := subject.UserID
		filters.ChannelPartnerID = &channelPartnerID
	case service.RoleAgent:
		agentOwnerID := subject.UserID
		filters.AgentOwnerID = &agentOwnerID
	}

	users, total, err := h.adminService.ListUsers(
		c.Request.Context(),
		page,
		pageSize,
		filters,
		"created_at",
		"desc",
	)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	out := make([]*dto.AdminUser, len(users))
	for i := range users {
		out[i] = dto.UserFromServiceAdmin(&users[i])
	}
	response.Paginated(c, out, total, page, pageSize)
}

func (h *AffiliateHandler) UpdateAgentStatus(c *gin.Context) {
	subject, authenticated := middleware2.GetAuthSubjectFromContext(c)
	role, ok := middleware2.GetUserRoleFromContext(c)
	if !ok || !authenticated {
		response.Unauthorized(c, "Unauthorized")
		return
	}
	if role != service.RoleAdmin && role != service.RoleChannelPartner {
		response.Forbidden(c, "当前账号没有更新代理人状态权限")
		return
	}

	userID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "Invalid user ID")
		return
	}

	var req struct {
		Status string `json:"status" binding:"required,oneof=active disabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}
	if role == service.RoleChannelPartner {
		if err := h.ensureChannelPartnerOwnsAgent(c, subject.UserID, userID); err != nil {
			return
		}
	}

	updated, err := h.adminService.UpdateUser(c.Request.Context(), userID, &service.UpdateUserInput{
		Status: req.Status,
	})
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, dto.UserFromServiceAdmin(updated))
}

func (h *AffiliateHandler) SetAgentRate(c *gin.Context) {
	subject, authenticated := middleware2.GetAuthSubjectFromContext(c)
	role, ok := middleware2.GetUserRoleFromContext(c)
	if !ok || !authenticated {
		response.Unauthorized(c, "Unauthorized")
		return
	}
	if role != service.RoleAdmin && role != service.RoleChannelPartner {
		response.Forbidden(c, "当前账号没有更新代理人提成权限")
		return
	}

	userID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "Invalid user ID")
		return
	}

	var req struct {
		Rate float64 `json:"rate" binding:"required,min=0,max=1"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}
	if role == service.RoleChannelPartner {
		if err := h.ensureChannelPartnerOwnsAgent(c, subject.UserID, userID); err != nil {
			return
		}
	}

	if err := h.affiliateService.AdminUpdateUserCommissionRate(c.Request.Context(), userID, req.Rate); err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, gin.H{"message": "Commission rate updated successfully"})
}

func (h *AffiliateHandler) UpdateDistributorStatus(c *gin.Context) {
	subject, authenticated := middleware2.GetAuthSubjectFromContext(c)
	role, ok := middleware2.GetUserRoleFromContext(c)
	if !ok || !authenticated {
		response.Unauthorized(c, "Unauthorized")
		return
	}
	if role != service.RoleAdmin && role != service.RoleAgent {
		response.Forbidden(c, "当前账号没有更新分销用户状态权限")
		return
	}

	userID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "Invalid user ID")
		return
	}

	var req struct {
		Status string `json:"status" binding:"required,oneof=active disabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}
	if role == service.RoleAgent {
		if err := h.ensureAgentOwnsDistributor(c, subject.UserID, userID); err != nil {
			return
		}
	}

	updated, err := h.adminService.UpdateUser(c.Request.Context(), userID, &service.UpdateUserInput{
		Status: req.Status,
	})
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, dto.UserFromServiceAdmin(updated))
}

func (h *AffiliateHandler) SetDistributorRate(c *gin.Context) {
	subject, authenticated := middleware2.GetAuthSubjectFromContext(c)
	role, ok := middleware2.GetUserRoleFromContext(c)
	if !ok || !authenticated {
		response.Unauthorized(c, "Unauthorized")
		return
	}
	if role != service.RoleAdmin && role != service.RoleAgent {
		response.Forbidden(c, "当前账号没有更新分销用户提成权限")
		return
	}

	userID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "Invalid user ID")
		return
	}

	var req struct {
		Rate float64 `json:"rate" binding:"required,min=0,max=1"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}
	if role == service.RoleAgent {
		if err := h.ensureAgentOwnsDistributor(c, subject.UserID, userID); err != nil {
			return
		}
	}

	if err := h.affiliateService.AdminUpdateUserCommissionRate(c.Request.Context(), userID, req.Rate); err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, gin.H{"message": "Commission rate updated successfully"})
}

func (h *AffiliateHandler) ensureAgentOwnsDistributor(c *gin.Context, agentUserID, distributorUserID int64) error {
	user, err := h.adminService.GetUser(c.Request.Context(), distributorUserID)
	if err != nil {
		response.ErrorFrom(c, err)
		return err
	}
	if user.Role != service.RoleDistributor {
		err = service.ErrUserNotFound
		response.ErrorFrom(c, err)
		return err
	}
	if user.AgentOwnerID == nil || *user.AgentOwnerID != agentUserID {
		err = service.ErrInsufficientPerms
		response.ErrorFrom(c, err)
		return err
	}
	return nil
}

func (h *AffiliateHandler) ensureChannelPartnerOwnsAgent(c *gin.Context, channelPartnerUserID, agentUserID int64) error {
	user, err := h.adminService.GetUser(c.Request.Context(), agentUserID)
	if err != nil {
		response.ErrorFrom(c, err)
		return err
	}
	if user.Role != service.RoleAgent {
		err = service.ErrUserNotFound
		response.ErrorFrom(c, err)
		return err
	}
	if user.ChannelPartnerID == nil || *user.ChannelPartnerID != channelPartnerUserID {
		err = service.ErrInsufficientPerms
		response.ErrorFrom(c, err)
		return err
	}
	return nil
}
