package admin

import (
	"strconv"
	"strings"
	"time"

	"github.com/dlxyz/SubioHub/internal/handler/dto"
	"github.com/dlxyz/SubioHub/internal/pkg/pagination"
	"github.com/dlxyz/SubioHub/internal/pkg/response"
	middleware2 "github.com/dlxyz/SubioHub/internal/server/middleware"
	"github.com/dlxyz/SubioHub/internal/service"

	"github.com/gin-gonic/gin"
)

type NewsHandler struct {
	newsService *service.NewsService
}

func NewNewsHandler(newsService *service.NewsService) *NewsHandler {
	return &NewsHandler{newsService: newsService}
}

type NewsTranslationPayload struct {
	Locale               string  `json:"locale" binding:"required"`
	Title                string  `json:"title" binding:"required"`
	Summary              string  `json:"summary"`
	Content              string  `json:"content" binding:"required"`
	SEOTitle             *string `json:"seo_title"`
	SEODescription       *string `json:"seo_description"`
	TranslationStatus    string  `json:"translation_status" binding:"omitempty,oneof=manual ai_draft reviewed"`
	TranslationProvider  *string `json:"translation_provider"`
	TranslatedFromLocale *string `json:"translated_from_locale"`
	LastTranslatedAt     *int64  `json:"last_translated_at"`
}

type CreateNewsRequest struct {
	Slug          string                   `json:"slug" binding:"required"`
	Status        string                   `json:"status" binding:"omitempty,oneof=draft published archived"`
	DefaultLocale string                   `json:"default_locale" binding:"required"`
	CoverImageURL *string                  `json:"cover_image_url"`
	AuthorName    *string                  `json:"author_name"`
	PublishedAt   *int64                   `json:"published_at"`
	Translations  []NewsTranslationPayload `json:"translations" binding:"required,min=1"`
}

type UpdateNewsRequest struct {
	Slug          *string                   `json:"slug"`
	Status        *string                   `json:"status" binding:"omitempty,oneof=draft published archived"`
	DefaultLocale *string                   `json:"default_locale"`
	CoverImageURL **string                  `json:"cover_image_url"`
	AuthorName    **string                  `json:"author_name"`
	PublishedAt   *int64                    `json:"published_at"`
	Translations  *[]NewsTranslationPayload `json:"translations"`
}

type AITranslateNewsRequest struct {
	SourceLocale string `json:"source_locale"`
}

func (h *NewsHandler) List(c *gin.Context) {
	page, pageSize := response.ParsePagination(c)
	params := pagination.PaginationParams{
		Page:      page,
		PageSize:  pageSize,
		SortBy:    c.DefaultQuery("sort_by", "created_at"),
		SortOrder: c.DefaultQuery("sort_order", "desc"),
	}

	items, paginationResult, err := h.newsService.List(c.Request.Context(), params, service.NewsListFilters{
		Status: strings.TrimSpace(c.Query("status")),
		Search: strings.TrimSpace(c.Query("search")),
	})
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	out := make([]dto.NewsPost, 0, len(items))
	for i := range items {
		out = append(out, *dto.NewsPostFromService(&items[i]))
	}
	response.Paginated(c, out, paginationResult.Total, page, pageSize)
}

func (h *NewsHandler) GetByID(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		response.BadRequest(c, "Invalid news ID")
		return
	}

	item, err := h.newsService.GetByID(c.Request.Context(), id)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, dto.NewsPostFromService(item))
}

func (h *NewsHandler) Create(c *gin.Context) {
	var req CreateNewsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		response.Unauthorized(c, "User not found in context")
		return
	}

	input := &service.CreateNewsInput{
		Slug:          req.Slug,
		Status:        req.Status,
		DefaultLocale: req.DefaultLocale,
		CoverImageURL: req.CoverImageURL,
		AuthorName:    req.AuthorName,
		ActorID:       &subject.UserID,
		Translations:  make([]service.CreateNewsTranslationInput, 0, len(req.Translations)),
	}
	if req.PublishedAt != nil && *req.PublishedAt > 0 {
		t := time.Unix(*req.PublishedAt, 0)
		input.PublishedAt = &t
	}
	for i := range req.Translations {
		input.Translations = append(input.Translations, newsTranslationPayloadToService(req.Translations[i]))
	}

	created, err := h.newsService.Create(c.Request.Context(), input)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, dto.NewsPostFromService(created))
}

func (h *NewsHandler) Update(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		response.BadRequest(c, "Invalid news ID")
		return
	}

	var req UpdateNewsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		response.Unauthorized(c, "User not found in context")
		return
	}

	input := &service.UpdateNewsInput{
		Slug:          req.Slug,
		Status:        req.Status,
		DefaultLocale: req.DefaultLocale,
		CoverImageURL: req.CoverImageURL,
		AuthorName:    req.AuthorName,
		ActorID:       &subject.UserID,
	}
	if req.PublishedAt != nil {
		if *req.PublishedAt <= 0 {
			var cleared *time.Time
			input.PublishedAt = &cleared
		} else {
			t := time.Unix(*req.PublishedAt, 0)
			value := &t
			input.PublishedAt = &value
		}
	}
	if req.Translations != nil {
		items := make([]service.CreateNewsTranslationInput, 0, len(*req.Translations))
		for i := range *req.Translations {
			items = append(items, newsTranslationPayloadToService((*req.Translations)[i]))
		}
		input.Translations = &items
	}

	updated, err := h.newsService.Update(c.Request.Context(), id, input)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, dto.NewsPostFromService(updated))
}

func (h *NewsHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		response.BadRequest(c, "Invalid news ID")
		return
	}

	if err := h.newsService.Delete(c.Request.Context(), id); err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, gin.H{"message": "News deleted successfully"})
}

func (h *NewsHandler) AITranslate(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		response.BadRequest(c, "Invalid news ID")
		return
	}

	targetLocale := strings.TrimSpace(c.Param("locale"))
	if targetLocale == "" {
		response.BadRequest(c, "Target locale is required")
		return
	}

	var req AITranslateNewsRequest
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&req); err != nil {
			response.BadRequest(c, "Invalid request: "+err.Error())
			return
		}
	}

	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		response.Unauthorized(c, "User not found in context")
		return
	}

	post, translation, err := h.newsService.AITranslate(c.Request.Context(), id, &service.AITranslateNewsInput{
		SourceLocale: req.SourceLocale,
		TargetLocale: targetLocale,
		ActorID:      &subject.UserID,
	})
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	response.Success(c, gin.H{
		"post":        dto.NewsPostFromService(post),
		"translation": dto.NewsTranslationFromService(translation),
	})
}

func newsTranslationPayloadToService(item NewsTranslationPayload) service.CreateNewsTranslationInput {
	out := service.CreateNewsTranslationInput{
		Locale:               item.Locale,
		Title:                item.Title,
		Summary:              item.Summary,
		Content:              item.Content,
		SEOTitle:             item.SEOTitle,
		SEODescription:       item.SEODescription,
		TranslationStatus:    item.TranslationStatus,
		TranslationProvider:  item.TranslationProvider,
		TranslatedFromLocale: item.TranslatedFromLocale,
	}
	if item.LastTranslatedAt != nil && *item.LastTranslatedAt > 0 {
		t := time.Unix(*item.LastTranslatedAt, 0)
		out.LastTranslatedAt = &t
	}
	return out
}
