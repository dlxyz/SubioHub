package schema

import (
	"time"

	"github.com/dlxyz/SubioHub/internal/domain"

	"entgo.io/ent"
	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// NewsPostTranslation holds the schema definition for the NewsPostTranslation entity.
type NewsPostTranslation struct {
	ent.Schema
}

func (NewsPostTranslation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "news_post_translations"},
	}
}

func (NewsPostTranslation) Fields() []ent.Field {
	return []ent.Field{
		field.Int64("news_post_id"),
		field.String("locale").
			MaxLen(16).
			NotEmpty().
			Comment("语言代码，如 zh-CN、en-US"),
		field.String("title").
			MaxLen(200).
			NotEmpty().
			Comment("资讯标题"),
		field.String("summary").
			Optional().
			SchemaType(map[string]string{dialect.Postgres: "text"}).
			Comment("摘要"),
		field.String("content").
			SchemaType(map[string]string{dialect.Postgres: "text"}).
			NotEmpty().
			Comment("HTML 正文"),
		field.String("seo_title").
			Optional().
			Nillable().
			MaxLen(200).
			Comment("SEO 标题"),
		field.String("seo_description").
			Optional().
			Nillable().
			SchemaType(map[string]string{dialect.Postgres: "text"}).
			Comment("SEO 描述"),
		field.String("translation_status").
			MaxLen(20).
			Default(domain.NewsTranslationStatusManual).
			Comment("翻译状态: manual, ai_draft, reviewed"),
		field.String("translation_provider").
			Optional().
			Nillable().
			MaxLen(100).
			Comment("翻译来源"),
		field.String("translated_from_locale").
			Optional().
			Nillable().
			MaxLen(16).
			Comment("翻译来源语言"),
		field.Time("last_translated_at").
			Optional().
			Nillable().
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}).
			Comment("最后翻译时间"),
		field.Time("created_at").
			Immutable().
			Default(time.Now).
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now).
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}),
	}
}

func (NewsPostTranslation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("news_post", NewsPost.Type).
			Ref("translations").
			Field("news_post_id").
			Unique().
			Required(),
	}
}

func (NewsPostTranslation) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("news_post_id"),
		index.Fields("locale"),
		index.Fields("news_post_id", "locale").Unique(),
	}
}
