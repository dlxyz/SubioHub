package dto

import (
	"time"

	"github.com/dlxyz/SubioHub/internal/service"
)

type NewsTranslation struct {
	ID                   int64      `json:"id"`
	NewsPostID           int64      `json:"news_post_id"`
	Locale               string     `json:"locale"`
	Title                string     `json:"title"`
	Summary              string     `json:"summary"`
	Content              string     `json:"content"`
	SEOTitle             *string    `json:"seo_title,omitempty"`
	SEODescription       *string    `json:"seo_description,omitempty"`
	TranslationStatus    string     `json:"translation_status"`
	TranslationProvider  *string    `json:"translation_provider,omitempty"`
	TranslatedFromLocale *string    `json:"translated_from_locale,omitempty"`
	LastTranslatedAt     *time.Time `json:"last_translated_at,omitempty"`
	CreatedAt            time.Time  `json:"created_at"`
	UpdatedAt            time.Time  `json:"updated_at"`
}

type NewsPost struct {
	ID            int64             `json:"id"`
	Slug          string            `json:"slug"`
	Status        string            `json:"status"`
	DefaultLocale string            `json:"default_locale"`
	CoverImageURL *string           `json:"cover_image_url,omitempty"`
	AuthorName    *string           `json:"author_name,omitempty"`
	PublishedAt   *time.Time        `json:"published_at,omitempty"`
	CreatedBy     *int64            `json:"created_by,omitempty"`
	UpdatedBy     *int64            `json:"updated_by,omitempty"`
	CreatedAt     time.Time         `json:"created_at"`
	UpdatedAt     time.Time         `json:"updated_at"`
	Translations  []NewsTranslation `json:"translations"`
}

type PublicNewsPost struct {
	ID             int64      `json:"id"`
	Slug           string     `json:"slug"`
	Locale         string     `json:"locale"`
	FallbackLocale *string    `json:"fallback_locale,omitempty"`
	Title          string     `json:"title"`
	Summary        string     `json:"summary"`
	Content        string     `json:"content"`
	SEOTitle       *string    `json:"seo_title,omitempty"`
	SEODescription *string    `json:"seo_description,omitempty"`
	CoverImageURL  *string    `json:"cover_image_url,omitempty"`
	AuthorName     *string    `json:"author_name,omitempty"`
	PublishedAt    *time.Time `json:"published_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

func NewsPostFromService(post *service.NewsPost) *NewsPost {
	if post == nil {
		return nil
	}
	translations := make([]NewsTranslation, 0, len(post.Translations))
	for i := range post.Translations {
		translations = append(translations, *NewsTranslationFromService(&post.Translations[i]))
	}
	return &NewsPost{
		ID:            post.ID,
		Slug:          post.Slug,
		Status:        post.Status,
		DefaultLocale: post.DefaultLocale,
		CoverImageURL: post.CoverImageURL,
		AuthorName:    post.AuthorName,
		PublishedAt:   post.PublishedAt,
		CreatedBy:     post.CreatedBy,
		UpdatedBy:     post.UpdatedBy,
		CreatedAt:     post.CreatedAt,
		UpdatedAt:     post.UpdatedAt,
		Translations:  translations,
	}
}

func NewsTranslationFromService(item *service.NewsPostTranslation) *NewsTranslation {
	if item == nil {
		return nil
	}
	return &NewsTranslation{
		ID:                   item.ID,
		NewsPostID:           item.NewsPostID,
		Locale:               item.Locale,
		Title:                item.Title,
		Summary:              item.Summary,
		Content:              item.Content,
		SEOTitle:             item.SEOTitle,
		SEODescription:       item.SEODescription,
		TranslationStatus:    item.TranslationStatus,
		TranslationProvider:  item.TranslationProvider,
		TranslatedFromLocale: item.TranslatedFromLocale,
		LastTranslatedAt:     item.LastTranslatedAt,
		CreatedAt:            item.CreatedAt,
		UpdatedAt:            item.UpdatedAt,
	}
}

func PublicNewsPostFromService(item *service.LocalizedNewsPost) *PublicNewsPost {
	if item == nil {
		return nil
	}
	return &PublicNewsPost{
		ID:             item.Post.ID,
		Slug:           item.Post.Slug,
		Locale:         item.Locale,
		FallbackLocale: item.FallbackLocale,
		Title:          item.Translation.Title,
		Summary:        item.Translation.Summary,
		Content:        item.Translation.Content,
		SEOTitle:       item.Translation.SEOTitle,
		SEODescription: item.Translation.SEODescription,
		CoverImageURL:  item.Post.CoverImageURL,
		AuthorName:     item.Post.AuthorName,
		PublishedAt:    item.Post.PublishedAt,
		CreatedAt:      item.Post.CreatedAt,
		UpdatedAt:      item.Post.UpdatedAt,
	}
}
