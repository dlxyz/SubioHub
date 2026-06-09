package handler

import (
	"strconv"
	"strings"

	"github.com/dlxyz/SubioHub/internal/handler/dto"
	"github.com/dlxyz/SubioHub/internal/pkg/response"
	middleware2 "github.com/dlxyz/SubioHub/internal/server/middleware"
	"github.com/dlxyz/SubioHub/internal/service"

	"github.com/gin-gonic/gin"
)

// AnnouncementHandler handles user announcement operations
type AnnouncementHandler struct {
	announcementService *service.AnnouncementService
}

// NewAnnouncementHandler creates a new user announcement handler
func NewAnnouncementHandler(announcementService *service.AnnouncementService) *AnnouncementHandler {
	return &AnnouncementHandler{
		announcementService: announcementService,
	}
}

// List handles listing announcements visible to current user
// GET /api/v1/announcements
func (h *AnnouncementHandler) List(c *gin.Context) {
	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		response.Unauthorized(c, "User not found in context")
		return
	}

	unreadOnly := parseBoolQuery(c.Query("unread_only"))

	items, err := h.announcementService.ListForUser(c.Request.Context(), subject.UserID, unreadOnly)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	out := make([]dto.UserAnnouncement, 0, len(items))
	for i := range items {
		out = append(out, *dto.UserAnnouncementFromService(&items[i]))
	}
	response.Success(c, out)
}

// ListPublic handles listing announcements visible on the public site
// GET /api/v1/news
func (h *AnnouncementHandler) ListPublic(c *gin.Context) {
	items, err := h.announcementService.ListPublic(c.Request.Context())
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	out := make([]dto.PublicAnnouncement, 0, len(items))
	for i := range items {
		out = append(out, *dto.PublicAnnouncementFromService(&items[i]))
	}
	response.Success(c, out)
}

// GetPublic handles getting a public announcement by id
// GET /api/v1/news/:id
func (h *AnnouncementHandler) GetPublic(c *gin.Context) {
	announcementID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || announcementID <= 0 {
		response.BadRequest(c, "Invalid announcement ID")
		return
	}

	item, err := h.announcementService.GetPublicByID(c.Request.Context(), announcementID)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	response.Success(c, dto.PublicAnnouncementFromService(item))
}

// MarkRead marks an announcement as read for current user
// POST /api/v1/announcements/:id/read
func (h *AnnouncementHandler) MarkRead(c *gin.Context) {
	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		response.Unauthorized(c, "User not found in context")
		return
	}

	announcementID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || announcementID <= 0 {
		response.BadRequest(c, "Invalid announcement ID")
		return
	}

	if err := h.announcementService.MarkRead(c.Request.Context(), subject.UserID, announcementID); err != nil {
		response.ErrorFrom(c, err)
		return
	}

	response.Success(c, gin.H{"message": "ok"})
}

func parseBoolQuery(v string) bool {
	switch strings.TrimSpace(strings.ToLower(v)) {
	case "1", "true", "yes", "y", "on":
		return true
	default:
		return false
	}
}
