package service

import (
	"context"
	"time"

	"github.com/dlxyz/SubioHub/internal/domain"
	"github.com/dlxyz/SubioHub/internal/pkg/pagination"
)

const (
	NewsStatusDraft     = domain.NewsStatusDraft
	NewsStatusPublished = domain.NewsStatusPublished
	NewsStatusArchived  = domain.NewsStatusArchived
)

const (
	NewsTranslationStatusManual   = domain.NewsTranslationStatusManual
	NewsTranslationStatusAIDraft  = domain.NewsTranslationStatusAIDraft
	NewsTranslationStatusReviewed = domain.NewsTranslationStatusReviewed
)

var (
	ErrNewsNotFound          = domain.ErrNewsNotFound
	ErrNewsSlugExists        = domain.ErrNewsSlugExists
	ErrNewsInvalidInput      = domain.ErrNewsInvalidInput
	ErrNewsTranslationAbsent = domain.ErrNewsTranslationAbsent
)

type NewsPost = domain.NewsPost

type NewsPostTranslation = domain.NewsPostTranslation

type LocalizedNewsPost struct {
	Post           NewsPost
	Translation    NewsPostTranslation
	Locale         string
	FallbackLocale *string
}

type NewsListFilters struct {
	Status string
	Search string
}

type NewsRepository interface {
	Create(ctx context.Context, post *NewsPost) error
	GetByID(ctx context.Context, id int64) (*NewsPost, error)
	Update(ctx context.Context, post *NewsPost) error
	Delete(ctx context.Context, id int64) error
	List(ctx context.Context, params pagination.PaginationParams, filters NewsListFilters) ([]NewsPost, *pagination.PaginationResult, error)
	ListPublished(ctx context.Context, now time.Time) ([]NewsPost, error)
}
