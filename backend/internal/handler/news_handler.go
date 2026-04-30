package handler

import (
	"strconv"
	"strings"

	"github.com/dlxyz/SubioHub/internal/handler/dto"
	"github.com/dlxyz/SubioHub/internal/pkg/response"
	"github.com/dlxyz/SubioHub/internal/service"

	"github.com/gin-gonic/gin"
)

type NewsHandler struct {
	newsService *service.NewsService
}

func NewNewsHandler(newsService *service.NewsService) *NewsHandler {
	return &NewsHandler{newsService: newsService}
}

// ListPublic handles listing public news posts.
// GET /api/v1/news
func (h *NewsHandler) ListPublic(c *gin.Context) {
	locale := strings.TrimSpace(c.Query("locale"))
	items, err := h.newsService.ListPublic(c.Request.Context(), locale)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	out := make([]dto.PublicNewsPost, 0, len(items))
	for i := range items {
		out = append(out, *dto.PublicNewsPostFromService(&items[i]))
	}
	response.Success(c, out)
}

// GetPublic handles getting a public news post by id.
// GET /api/v1/news/:id
func (h *NewsHandler) GetPublic(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		response.BadRequest(c, "Invalid news ID")
		return
	}

	locale := strings.TrimSpace(c.Query("locale"))
	item, err := h.newsService.GetPublicByID(c.Request.Context(), id, locale)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, dto.PublicNewsPostFromService(item))
}
