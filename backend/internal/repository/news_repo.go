package repository

import (
	"context"
	"strings"
	"time"

	dbent "github.com/dlxyz/SubioHub/ent"
	"github.com/dlxyz/SubioHub/ent/newspost"
	"github.com/dlxyz/SubioHub/ent/newsposttranslation"
	"github.com/dlxyz/SubioHub/internal/pkg/pagination"
	"github.com/dlxyz/SubioHub/internal/service"

	entsql "entgo.io/ent/dialect/sql"
)

type newsRepository struct {
	client *dbent.Client
}

func NewNewsRepository(client *dbent.Client) service.NewsRepository {
	return &newsRepository{client: client}
}

func (r *newsRepository) Create(ctx context.Context, post *service.NewsPost) error {
	client := clientFromContext(ctx, r.client)
	created, err := buildNewsPostCreate(client.NewsPost.Create(), post).Save(ctx)
	if err != nil {
		return translatePersistenceError(err, nil, service.ErrNewsSlugExists)
	}

	for i := range post.Translations {
		if _, err := buildNewsTranslationCreate(client.NewsPostTranslation.Create(), created.ID, &post.Translations[i]).Save(ctx); err != nil {
			return translatePersistenceError(err, nil, service.ErrNewsSlugExists)
		}
	}

	entity, err := client.NewsPost.Query().
		Where(newspost.IDEQ(created.ID)).
		WithTranslations().
		Only(ctx)
	if err != nil {
		return translatePersistenceError(err, service.ErrNewsNotFound, service.ErrNewsSlugExists)
	}

	applyNewsEntityToService(post, entity)
	return nil
}

func (r *newsRepository) GetByID(ctx context.Context, id int64) (*service.NewsPost, error) {
	client := clientFromContext(ctx, r.client)
	entity, err := client.NewsPost.Query().
		Where(newspost.IDEQ(id)).
		WithTranslations().
		Only(ctx)
	if err != nil {
		return nil, translatePersistenceError(err, service.ErrNewsNotFound, nil)
	}
	return newsEntityToService(entity), nil
}

func (r *newsRepository) Update(ctx context.Context, post *service.NewsPost) error {
	client := clientFromContext(ctx, r.client)
	existing, err := client.NewsPost.Query().
		Where(newspost.IDEQ(post.ID)).
		WithTranslations().
		Only(ctx)
	if err != nil {
		return translatePersistenceError(err, service.ErrNewsNotFound, nil)
	}

	if _, err := buildNewsPostUpdate(client.NewsPost.UpdateOneID(post.ID), post).Save(ctx); err != nil {
		return translatePersistenceError(err, service.ErrNewsNotFound, service.ErrNewsSlugExists)
	}

	existingByLocale := make(map[string]*dbent.NewsPostTranslation, len(existing.Edges.Translations))
	for _, translation := range existing.Edges.Translations {
		existingByLocale[strings.ToLower(strings.TrimSpace(translation.Locale))] = translation
	}

	incomingLocales := make(map[string]struct{}, len(post.Translations))
	for i := range post.Translations {
		item := &post.Translations[i]
		localeKey := strings.ToLower(strings.TrimSpace(item.Locale))
		incomingLocales[localeKey] = struct{}{}

		if current, ok := existingByLocale[localeKey]; ok {
			if _, err := buildNewsTranslationUpdate(client.NewsPostTranslation.UpdateOneID(current.ID), item).Save(ctx); err != nil {
				return translatePersistenceError(err, service.ErrNewsNotFound, nil)
			}
			continue
		}

		if _, err := buildNewsTranslationCreate(client.NewsPostTranslation.Create(), post.ID, item).Save(ctx); err != nil {
			return translatePersistenceError(err, nil, nil)
		}
	}

	for localeKey, translation := range existingByLocale {
		if _, ok := incomingLocales[localeKey]; ok {
			continue
		}
		if err := client.NewsPostTranslation.DeleteOneID(translation.ID).Exec(ctx); err != nil {
			return err
		}
	}

	entity, err := client.NewsPost.Query().
		Where(newspost.IDEQ(post.ID)).
		WithTranslations().
		Only(ctx)
	if err != nil {
		return translatePersistenceError(err, service.ErrNewsNotFound, nil)
	}

	applyNewsEntityToService(post, entity)
	return nil
}

func (r *newsRepository) Delete(ctx context.Context, id int64) error {
	client := clientFromContext(ctx, r.client)
	if _, err := client.NewsPostTranslation.Delete().Where(newsposttranslation.NewsPostIDEQ(id)).Exec(ctx); err != nil {
		return err
	}
	if err := client.NewsPost.DeleteOneID(id).Exec(ctx); err != nil {
		return translatePersistenceError(err, service.ErrNewsNotFound, nil)
	}
	return nil
}

func (r *newsRepository) List(
	ctx context.Context,
	params pagination.PaginationParams,
	filters service.NewsListFilters,
) ([]service.NewsPost, *pagination.PaginationResult, error) {
	client := clientFromContext(ctx, r.client)
	q := client.NewsPost.Query().WithTranslations()

	if filters.Status != "" {
		q = q.Where(newspost.StatusEQ(filters.Status))
	}
	if filters.Search != "" {
		q = q.Where(
			newspost.Or(
				newspost.SlugContainsFold(filters.Search),
				newspost.AuthorNameContainsFold(filters.Search),
				newspost.HasTranslationsWith(
					newsposttranslation.Or(
						newsposttranslation.TitleContainsFold(filters.Search),
						newsposttranslation.SummaryContainsFold(filters.Search),
					),
				),
			),
		)
	}

	total, err := q.Count(ctx)
	if err != nil {
		return nil, nil, err
	}

	itemsQuery := q.Offset(params.Offset()).Limit(params.Limit())
	for _, order := range newsListOrders(params) {
		itemsQuery = itemsQuery.Order(order)
	}

	items, err := itemsQuery.All(ctx)
	if err != nil {
		return nil, nil, err
	}

	out := newsEntitiesToService(items)
	return out, paginationResultFromTotal(int64(total), params), nil
}

func (r *newsRepository) ListPublished(ctx context.Context, now time.Time) ([]service.NewsPost, error) {
	client := clientFromContext(ctx, r.client)
	items, err := client.NewsPost.Query().
		Where(
			newspost.StatusEQ(service.NewsStatusPublished),
			newspost.PublishedAtNotNil(),
			newspost.PublishedAtLTE(now),
		).
		WithTranslations().
		Order(
			dbent.Desc(newspost.FieldPublishedAt),
			dbent.Desc(newspost.FieldID),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}
	return newsEntitiesToService(items), nil
}

func newsListOrder(params pagination.PaginationParams) (string, string) {
	sortBy := strings.ToLower(strings.TrimSpace(params.SortBy))
	sortOrder := params.NormalizedSortOrder(pagination.SortOrderDesc)

	switch sortBy {
	case "id":
		return newspost.FieldID, sortOrder
	case "slug":
		return newspost.FieldSlug, sortOrder
	case "status":
		return newspost.FieldStatus, sortOrder
	case "published_at":
		return newspost.FieldPublishedAt, sortOrder
	case "updated_at":
		return newspost.FieldUpdatedAt, sortOrder
	case "", "created_at":
		return newspost.FieldCreatedAt, sortOrder
	default:
		return newspost.FieldCreatedAt, pagination.SortOrderDesc
	}
}

func newsListOrders(params pagination.PaginationParams) []func(*entsql.Selector) {
	field, sortOrder := newsListOrder(params)
	if sortOrder == pagination.SortOrderAsc {
		if field == newspost.FieldID {
			return []func(*entsql.Selector){dbent.Asc(field)}
		}
		return []func(*entsql.Selector){dbent.Asc(field), dbent.Asc(newspost.FieldID)}
	}
	if field == newspost.FieldID {
		return []func(*entsql.Selector){dbent.Desc(field)}
	}
	return []func(*entsql.Selector){dbent.Desc(field), dbent.Desc(newspost.FieldID)}
}

func buildNewsPostCreate(builder *dbent.NewsPostCreate, post *service.NewsPost) *dbent.NewsPostCreate {
	builder.SetSlug(post.Slug).
		SetStatus(post.Status).
		SetDefaultLocale(post.DefaultLocale)
	if post.CoverImageURL != nil {
		builder.SetCoverImageURL(*post.CoverImageURL)
	}
	if post.AuthorName != nil {
		builder.SetAuthorName(*post.AuthorName)
	}
	if post.PublishedAt != nil {
		builder.SetPublishedAt(*post.PublishedAt)
	}
	if post.CreatedBy != nil {
		builder.SetCreatedBy(*post.CreatedBy)
	}
	if post.UpdatedBy != nil {
		builder.SetUpdatedBy(*post.UpdatedBy)
	}
	return builder
}

func buildNewsPostUpdate(builder *dbent.NewsPostUpdateOne, post *service.NewsPost) *dbent.NewsPostUpdateOne {
	builder.SetSlug(post.Slug).
		SetStatus(post.Status).
		SetDefaultLocale(post.DefaultLocale)
	if post.CoverImageURL != nil {
		builder.SetCoverImageURL(*post.CoverImageURL)
	} else {
		builder.ClearCoverImageURL()
	}
	if post.AuthorName != nil {
		builder.SetAuthorName(*post.AuthorName)
	} else {
		builder.ClearAuthorName()
	}
	if post.PublishedAt != nil {
		builder.SetPublishedAt(*post.PublishedAt)
	} else {
		builder.ClearPublishedAt()
	}
	if post.CreatedBy != nil {
		builder.SetCreatedBy(*post.CreatedBy)
	} else {
		builder.ClearCreatedBy()
	}
	if post.UpdatedBy != nil {
		builder.SetUpdatedBy(*post.UpdatedBy)
	} else {
		builder.ClearUpdatedBy()
	}
	return builder
}

func buildNewsTranslationCreate(builder *dbent.NewsPostTranslationCreate, postID int64, translation *service.NewsPostTranslation) *dbent.NewsPostTranslationCreate {
	builder.SetNewsPostID(postID).
		SetLocale(translation.Locale).
		SetTitle(translation.Title).
		SetSummary(translation.Summary).
		SetContent(translation.Content).
		SetTranslationStatus(translation.TranslationStatus)
	if translation.SEOTitle != nil {
		builder.SetSeoTitle(*translation.SEOTitle)
	}
	if translation.SEODescription != nil {
		builder.SetSeoDescription(*translation.SEODescription)
	}
	if translation.TranslationProvider != nil {
		builder.SetTranslationProvider(*translation.TranslationProvider)
	}
	if translation.TranslatedFromLocale != nil {
		builder.SetTranslatedFromLocale(*translation.TranslatedFromLocale)
	}
	if translation.LastTranslatedAt != nil {
		builder.SetLastTranslatedAt(*translation.LastTranslatedAt)
	}
	return builder
}

func buildNewsTranslationUpdate(builder *dbent.NewsPostTranslationUpdateOne, translation *service.NewsPostTranslation) *dbent.NewsPostTranslationUpdateOne {
	builder.SetLocale(translation.Locale).
		SetTitle(translation.Title).
		SetSummary(translation.Summary).
		SetContent(translation.Content).
		SetTranslationStatus(translation.TranslationStatus)
	if translation.SEOTitle != nil {
		builder.SetSeoTitle(*translation.SEOTitle)
	} else {
		builder.ClearSeoTitle()
	}
	if translation.SEODescription != nil {
		builder.SetSeoDescription(*translation.SEODescription)
	} else {
		builder.ClearSeoDescription()
	}
	if translation.TranslationProvider != nil {
		builder.SetTranslationProvider(*translation.TranslationProvider)
	} else {
		builder.ClearTranslationProvider()
	}
	if translation.TranslatedFromLocale != nil {
		builder.SetTranslatedFromLocale(*translation.TranslatedFromLocale)
	} else {
		builder.ClearTranslatedFromLocale()
	}
	if translation.LastTranslatedAt != nil {
		builder.SetLastTranslatedAt(*translation.LastTranslatedAt)
	} else {
		builder.ClearLastTranslatedAt()
	}
	return builder
}

func applyNewsEntityToService(dst *service.NewsPost, src *dbent.NewsPost) {
	if dst == nil || src == nil {
		return
	}
	mapped := newsEntityToService(src)
	if mapped == nil {
		return
	}
	*dst = *mapped
}

func newsEntityToService(entity *dbent.NewsPost) *service.NewsPost {
	if entity == nil {
		return nil
	}

	post := &service.NewsPost{
		ID:            entity.ID,
		Slug:          entity.Slug,
		Status:        entity.Status,
		DefaultLocale: entity.DefaultLocale,
		CoverImageURL: entity.CoverImageURL,
		AuthorName:    entity.AuthorName,
		PublishedAt:   entity.PublishedAt,
		CreatedBy:     entity.CreatedBy,
		UpdatedBy:     entity.UpdatedBy,
		CreatedAt:     entity.CreatedAt,
		UpdatedAt:     entity.UpdatedAt,
	}

	if len(entity.Edges.Translations) > 0 {
		post.Translations = make([]service.NewsPostTranslation, 0, len(entity.Edges.Translations))
		for _, translation := range entity.Edges.Translations {
			post.Translations = append(post.Translations, service.NewsPostTranslation{
				ID:                   translation.ID,
				NewsPostID:           translation.NewsPostID,
				Locale:               translation.Locale,
				Title:                translation.Title,
				Summary:              translation.Summary,
				Content:              translation.Content,
				SEOTitle:             translation.SeoTitle,
				SEODescription:       translation.SeoDescription,
				TranslationStatus:    translation.TranslationStatus,
				TranslationProvider:  translation.TranslationProvider,
				TranslatedFromLocale: translation.TranslatedFromLocale,
				LastTranslatedAt:     translation.LastTranslatedAt,
				CreatedAt:            translation.CreatedAt,
				UpdatedAt:            translation.UpdatedAt,
			})
		}
	}

	return post
}

func newsEntitiesToService(items []*dbent.NewsPost) []service.NewsPost {
	out := make([]service.NewsPost, 0, len(items))
	for _, item := range items {
		if mapped := newsEntityToService(item); mapped != nil {
			out = append(out, *mapped)
		}
	}
	return out
}
