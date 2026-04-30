package service

import (
	"context"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	dbent "github.com/dlxyz/SubioHub/ent"
	infraerrors "github.com/dlxyz/SubioHub/internal/pkg/errors"
	"github.com/dlxyz/SubioHub/internal/pkg/pagination"
)

var newsSlugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

type CreateNewsTranslationInput struct {
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
}

type CreateNewsInput struct {
	Slug          string
	Status        string
	DefaultLocale string
	CoverImageURL *string
	AuthorName    *string
	PublishedAt   *time.Time
	ActorID       *int64
	Translations  []CreateNewsTranslationInput
}

type UpdateNewsInput struct {
	Slug          *string
	Status        *string
	DefaultLocale *string
	CoverImageURL **string
	AuthorName    **string
	PublishedAt   **time.Time
	ActorID       *int64
	Translations  *[]CreateNewsTranslationInput
}

type AITranslateNewsInput struct {
	SourceLocale string
	TargetLocale string
	ActorID      *int64
}

type NewsService struct {
	repo                     NewsRepository
	entClient                *dbent.Client
	newsTranslationAIService *NewsTranslationAIService
}

func NewNewsService(repo NewsRepository, entClient *dbent.Client, newsTranslationAIService *NewsTranslationAIService) *NewsService {
	return &NewsService{
		repo:                     repo,
		entClient:                entClient,
		newsTranslationAIService: newsTranslationAIService,
	}
}

func (s *NewsService) Create(ctx context.Context, input *CreateNewsInput) (*NewsPost, error) {
	post, err := buildNewsPostForCreate(input)
	if err != nil {
		return nil, err
	}

	tx, err := s.entClient.Tx(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	txCtx := dbent.NewTxContext(ctx, tx)
	if err := s.repo.Create(txCtx, post); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit transaction: %w", err)
	}
	return post, nil
}

func (s *NewsService) GetByID(ctx context.Context, id int64) (*NewsPost, error) {
	if id <= 0 {
		return nil, infraerrors.BadRequest("NEWS_INVALID_ID", "invalid news post id")
	}
	return s.repo.GetByID(ctx, id)
}

func (s *NewsService) Update(ctx context.Context, id int64, input *UpdateNewsInput) (*NewsPost, error) {
	if id <= 0 {
		return nil, infraerrors.BadRequest("NEWS_INVALID_ID", "invalid news post id")
	}
	if input == nil {
		return nil, ErrNewsInvalidInput
	}

	existing, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if err := applyUpdateNewsInput(existing, input); err != nil {
		return nil, err
	}

	tx, err := s.entClient.Tx(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	txCtx := dbent.NewTxContext(ctx, tx)
	if err := s.repo.Update(txCtx, existing); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit transaction: %w", err)
	}
	return existing, nil
}

func (s *NewsService) Delete(ctx context.Context, id int64) error {
	if id <= 0 {
		return infraerrors.BadRequest("NEWS_INVALID_ID", "invalid news post id")
	}

	tx, err := s.entClient.Tx(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	txCtx := dbent.NewTxContext(ctx, tx)
	if err := s.repo.Delete(txCtx, id); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}
	return nil
}

func (s *NewsService) AITranslate(ctx context.Context, id int64, input *AITranslateNewsInput) (*NewsPost, *NewsPostTranslation, error) {
	if id <= 0 {
		return nil, nil, infraerrors.BadRequest("NEWS_INVALID_ID", "invalid news post id")
	}
	if input == nil {
		return nil, nil, ErrNewsInvalidInput
	}
	if s.newsTranslationAIService == nil || !s.newsTranslationAIService.Enabled(ctx) {
		return nil, nil, infraerrors.ServiceUnavailable("NEWS_AI_TRANSLATION_UNAVAILABLE", "AI translation is not configured")
	}

	post, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, nil, err
	}

	targetLocale := normalizeNewsLocale(input.TargetLocale)
	if targetLocale == "" {
		return nil, nil, infraerrors.BadRequest("NEWS_INVALID_LOCALE", "target locale is required")
	}

	sourceLocale := normalizeNewsLocale(input.SourceLocale)
	if sourceLocale == "" {
		sourceLocale = post.DefaultLocale
	}
	if strings.EqualFold(sourceLocale, targetLocale) {
		return nil, nil, infraerrors.BadRequest("NEWS_AI_TRANSLATION_SAME_LOCALE", "source locale and target locale must be different")
	}

	sourceTranslation := findNewsTranslation(post.Translations, sourceLocale)
	if sourceTranslation == nil {
		return nil, nil, infraerrors.BadRequest("NEWS_SOURCE_TRANSLATION_NOT_FOUND", "source translation not found")
	}

	translated, err := s.newsTranslationAIService.Translate(ctx, NewsAITranslateInput{
		SourceLocale:   sourceLocale,
		TargetLocale:   targetLocale,
		Title:          sourceTranslation.Title,
		Summary:        sourceTranslation.Summary,
		Content:        sourceTranslation.Content,
		SEOTitle:       sourceTranslation.SEOTitle,
		SEODescription: sourceTranslation.SEODescription,
	})
	if err != nil {
		return nil, nil, err
	}

	targetTranslation := findNewsTranslation(post.Translations, targetLocale)
	now := time.Now()
	if targetTranslation == nil {
		post.Translations = append(post.Translations, NewsPostTranslation{
			Locale: targetLocale,
		})
		targetTranslation = &post.Translations[len(post.Translations)-1]
	}

	targetTranslation.Locale = targetLocale
	targetTranslation.Title = translated.Title
	targetTranslation.Summary = translated.Summary
	targetTranslation.Content = translated.Content
	targetTranslation.SEOTitle = translated.SEOTitle
	targetTranslation.SEODescription = translated.SEODescription
	targetTranslation.TranslationStatus = NewsTranslationStatusAIDraft
	targetTranslation.TranslatedFromLocale = &sourceLocale
	targetTranslation.LastTranslatedAt = &now
	if translated.Provider != "" {
		provider := translated.Provider
		targetTranslation.TranslationProvider = &provider
	}

	if input.ActorID != nil && *input.ActorID > 0 {
		actorID := *input.ActorID
		post.UpdatedBy = &actorID
	}

	if err := validateNewsPost(post); err != nil {
		return nil, nil, err
	}

	tx, err := s.entClient.Tx(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	txCtx := dbent.NewTxContext(ctx, tx)
	if err := s.repo.Update(txCtx, post); err != nil {
		return nil, nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, nil, fmt.Errorf("commit transaction: %w", err)
	}

	updatedTranslation := findNewsTranslation(post.Translations, targetLocale)
	if updatedTranslation == nil {
		return nil, nil, infraerrors.InternalServer("NEWS_AI_TRANSLATION_SAVE_FAILED", "translated content was not persisted")
	}
	return post, updatedTranslation, nil
}

func (s *NewsService) List(ctx context.Context, params pagination.PaginationParams, filters NewsListFilters) ([]NewsPost, *pagination.PaginationResult, error) {
	if filters.Status != "" && !isValidNewsStatus(filters.Status) {
		return nil, nil, infraerrors.BadRequest("NEWS_INVALID_STATUS", "invalid news status")
	}
	filters.Search = strings.TrimSpace(filters.Search)
	if len(filters.Search) > 200 {
		filters.Search = filters.Search[:200]
	}
	return s.repo.List(ctx, params, filters)
}

func (s *NewsService) ListPublic(ctx context.Context, locale string) ([]LocalizedNewsPost, error) {
	posts, err := s.repo.ListPublished(ctx, time.Now())
	if err != nil {
		return nil, err
	}

	out := make([]LocalizedNewsPost, 0, len(posts))
	for i := range posts {
		localized, ok := localizeNewsPost(posts[i], locale)
		if !ok {
			continue
		}
		out = append(out, localized)
	}
	return out, nil
}

func (s *NewsService) GetPublicByID(ctx context.Context, id int64, locale string) (*LocalizedNewsPost, error) {
	post, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if !post.IsPublishedAt(time.Now()) {
		return nil, ErrNewsNotFound
	}

	localized, ok := localizeNewsPost(*post, locale)
	if !ok {
		return nil, ErrNewsNotFound
	}
	return &localized, nil
}

func buildNewsPostForCreate(input *CreateNewsInput) (*NewsPost, error) {
	if input == nil {
		return nil, ErrNewsInvalidInput
	}

	post := &NewsPost{
		Slug:          normalizeNewsSlug(input.Slug),
		Status:        normalizeNewsStatus(input.Status),
		DefaultLocale: normalizeNewsLocale(input.DefaultLocale),
		CoverImageURL: normalizeOptionalString(input.CoverImageURL),
		AuthorName:    normalizeOptionalString(input.AuthorName),
		PublishedAt:   input.PublishedAt,
		CreatedBy:     normalizeOptionalID(input.ActorID),
		UpdatedBy:     normalizeOptionalID(input.ActorID),
	}
	if post.Status == "" {
		post.Status = NewsStatusDraft
	}
	if post.DefaultLocale == "" {
		post.DefaultLocale = "zh-CN"
	}

	translations, err := normalizeNewsTranslations(input.Translations)
	if err != nil {
		return nil, err
	}
	post.Translations = translations

	if err := validateNewsPost(post); err != nil {
		return nil, err
	}
	return post, nil
}

func applyUpdateNewsInput(post *NewsPost, input *UpdateNewsInput) error {
	if post == nil || input == nil {
		return ErrNewsInvalidInput
	}

	if input.Slug != nil {
		post.Slug = normalizeNewsSlug(*input.Slug)
	}
	if input.Status != nil {
		post.Status = normalizeNewsStatus(*input.Status)
	}
	if input.DefaultLocale != nil {
		post.DefaultLocale = normalizeNewsLocale(*input.DefaultLocale)
	}
	if input.CoverImageURL != nil {
		post.CoverImageURL = normalizeOptionalString(*input.CoverImageURL)
	}
	if input.AuthorName != nil {
		post.AuthorName = normalizeOptionalString(*input.AuthorName)
	}
	if input.PublishedAt != nil {
		post.PublishedAt = *input.PublishedAt
	}
	if input.ActorID != nil && *input.ActorID > 0 {
		actorID := *input.ActorID
		post.UpdatedBy = &actorID
	}
	if input.Translations != nil {
		translations, err := normalizeNewsTranslations(*input.Translations)
		if err != nil {
			return err
		}
		post.Translations = translations
	}

	return validateNewsPost(post)
}

func normalizeNewsTranslations(items []CreateNewsTranslationInput) ([]NewsPostTranslation, error) {
	if len(items) == 0 {
		return nil, infraerrors.BadRequest("NEWS_TRANSLATIONS_EMPTY", "at least one translation is required")
	}

	out := make([]NewsPostTranslation, 0, len(items))
	seen := make(map[string]struct{}, len(items))

	for _, item := range items {
		locale := normalizeNewsLocale(item.Locale)
		if locale == "" {
			return nil, infraerrors.BadRequest("NEWS_INVALID_LOCALE", "translation locale is required")
		}
		key := strings.ToLower(locale)
		if _, ok := seen[key]; ok {
			return nil, infraerrors.BadRequest("NEWS_DUPLICATE_LOCALE", "duplicate translation locale")
		}
		seen[key] = struct{}{}

		title := strings.TrimSpace(item.Title)
		content := strings.TrimSpace(item.Content)
		if title == "" {
			return nil, infraerrors.BadRequest("NEWS_TITLE_REQUIRED", "translation title is required")
		}
		if content == "" {
			return nil, infraerrors.BadRequest("NEWS_CONTENT_REQUIRED", "translation content is required")
		}

		status := strings.TrimSpace(item.TranslationStatus)
		if status == "" {
			status = NewsTranslationStatusManual
		}
		if !isValidNewsTranslationStatus(status) {
			return nil, infraerrors.BadRequest("NEWS_INVALID_TRANSLATION_STATUS", "invalid translation status")
		}

		out = append(out, NewsPostTranslation{
			Locale:               locale,
			Title:                title,
			Summary:              strings.TrimSpace(item.Summary),
			Content:              sanitizeNewsHTML(content),
			SEOTitle:             normalizeOptionalString(item.SEOTitle),
			SEODescription:       normalizeOptionalString(item.SEODescription),
			TranslationStatus:    status,
			TranslationProvider:  normalizeOptionalString(item.TranslationProvider),
			TranslatedFromLocale: normalizeOptionalString(item.TranslatedFromLocale),
			LastTranslatedAt:     item.LastTranslatedAt,
		})
	}

	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i].Locale) < strings.ToLower(out[j].Locale)
	})
	return out, nil
}

func validateNewsPost(post *NewsPost) error {
	if post == nil {
		return ErrNewsInvalidInput
	}
	if post.Slug == "" {
		return infraerrors.BadRequest("NEWS_SLUG_REQUIRED", "slug is required")
	}
	if !newsSlugPattern.MatchString(post.Slug) {
		return infraerrors.BadRequest("NEWS_INVALID_SLUG", "slug must contain lowercase letters, numbers, and hyphens only")
	}
	if !isValidNewsStatus(post.Status) {
		return infraerrors.BadRequest("NEWS_INVALID_STATUS", "invalid news status")
	}
	if post.DefaultLocale == "" {
		return infraerrors.BadRequest("NEWS_DEFAULT_LOCALE_REQUIRED", "default locale is required")
	}
	if len(post.Translations) == 0 {
		return infraerrors.BadRequest("NEWS_TRANSLATIONS_EMPTY", "at least one translation is required")
	}

	hasDefaultLocale := false
	for _, translation := range post.Translations {
		if strings.EqualFold(translation.Locale, post.DefaultLocale) {
			hasDefaultLocale = true
			break
		}
	}
	if !hasDefaultLocale {
		return ErrNewsTranslationAbsent
	}

	if post.Status == NewsStatusPublished && post.PublishedAt == nil {
		now := time.Now()
		post.PublishedAt = &now
	}
	return nil
}

func localizeNewsPost(post NewsPost, requestedLocale string) (LocalizedNewsPost, bool) {
	if len(post.Translations) == 0 {
		return LocalizedNewsPost{}, false
	}

	requestedLocale = normalizeNewsLocale(requestedLocale)
	translations := make(map[string]NewsPostTranslation, len(post.Translations))
	for _, translation := range post.Translations {
		translations[strings.ToLower(translation.Locale)] = translation
	}

	if requestedLocale != "" {
		if translation, ok := translations[strings.ToLower(requestedLocale)]; ok {
			return LocalizedNewsPost{
				Post:        post,
				Translation: translation,
				Locale:      translation.Locale,
			}, true
		}
	}

	defaultKey := strings.ToLower(post.DefaultLocale)
	if translation, ok := translations[defaultKey]; ok {
		var fallback *string
		if requestedLocale != "" && !strings.EqualFold(requestedLocale, translation.Locale) {
			value := translation.Locale
			fallback = &value
		}
		return LocalizedNewsPost{
			Post:           post,
			Translation:    translation,
			Locale:         translation.Locale,
			FallbackLocale: fallback,
		}, true
	}

	for _, translation := range post.Translations {
		var fallback *string
		if requestedLocale != "" && !strings.EqualFold(requestedLocale, translation.Locale) {
			value := translation.Locale
			fallback = &value
		}
		return LocalizedNewsPost{
			Post:           post,
			Translation:    translation,
			Locale:         translation.Locale,
			FallbackLocale: fallback,
		}, true
	}

	return LocalizedNewsPost{}, false
}

func findNewsTranslation(items []NewsPostTranslation, locale string) *NewsPostTranslation {
	for i := range items {
		if strings.EqualFold(items[i].Locale, locale) {
			return &items[i]
		}
	}
	return nil
}

func normalizeNewsSlug(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func normalizeNewsStatus(value string) string {
	return strings.TrimSpace(strings.ToLower(value))
}

func normalizeNewsLocale(value string) string {
	return strings.TrimSpace(value)
}

func normalizeOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func normalizeOptionalID(value *int64) *int64 {
	if value == nil || *value <= 0 {
		return nil
	}
	id := *value
	return &id
}

func isValidNewsStatus(status string) bool {
	switch status {
	case NewsStatusDraft, NewsStatusPublished, NewsStatusArchived:
		return true
	default:
		return false
	}
}

func isValidNewsTranslationStatus(status string) bool {
	switch status {
	case NewsTranslationStatusManual, NewsTranslationStatusAIDraft, NewsTranslationStatusReviewed:
		return true
	default:
		return false
	}
}
