package domain

import (
	"time"

	infraerrors "github.com/dlxyz/SubioHub/internal/pkg/errors"
)

const (
	NewsStatusDraft     = "draft"
	NewsStatusPublished = "published"
	NewsStatusArchived  = "archived"
)

const (
	NewsTranslationStatusManual   = "manual"
	NewsTranslationStatusAIDraft  = "ai_draft"
	NewsTranslationStatusReviewed = "reviewed"
)

var (
	ErrNewsNotFound          = infraerrors.NotFound("NEWS_NOT_FOUND", "news post not found")
	ErrNewsSlugExists        = infraerrors.BadRequest("NEWS_SLUG_EXISTS", "news slug already exists")
	ErrNewsInvalidInput      = infraerrors.BadRequest("NEWS_INVALID_INPUT", "invalid news post input")
	ErrNewsTranslationAbsent = infraerrors.BadRequest("NEWS_TRANSLATION_REQUIRED", "default locale translation is required")
)

type NewsPostTranslation struct {
	ID                   int64
	NewsPostID           int64
	Locale               string
	Title                string
	Summary              string
	Content              string
	SEOTitle             *string
	SEODescription       *string
	TranslationStatus    string
	TranslationProvider  *string
	TranslatedFromLocale *string
	LastTranslatedAt     *time.Time
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

type NewsPost struct {
	ID            int64
	Slug          string
	Status        string
	DefaultLocale string
	CoverImageURL *string
	AuthorName    *string
	PublishedAt   *time.Time
	CreatedBy     *int64
	UpdatedBy     *int64
	CreatedAt     time.Time
	UpdatedAt     time.Time
	Translations  []NewsPostTranslation
}

func (n *NewsPost) IsPublishedAt(now time.Time) bool {
	if n == nil {
		return false
	}
	if n.Status != NewsStatusPublished {
		return false
	}
	if n.PublishedAt == nil {
		return false
	}
	return !n.PublishedAt.After(now)
}
