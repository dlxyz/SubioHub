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

// NewsPost holds the schema definition for the NewsPost entity.
type NewsPost struct {
	ent.Schema
}

func (NewsPost) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "news_posts"},
	}
}

func (NewsPost) Fields() []ent.Field {
	return []ent.Field{
		field.String("slug").
			MaxLen(120).
			NotEmpty().
			Unique().
			Comment("公开路由 slug"),
		field.String("status").
			MaxLen(20).
			Default(domain.NewsStatusDraft).
			Comment("状态: draft, published, archived"),
		field.String("default_locale").
			MaxLen(16).
			Default("zh-CN").
			Comment("默认语言"),
		field.String("cover_image_url").
			Optional().
			Nillable().
			MaxLen(500).
			Comment("封面图地址"),
		field.String("author_name").
			Optional().
			Nillable().
			MaxLen(100).
			Comment("作者名称"),
		field.Time("published_at").
			Optional().
			Nillable().
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}).
			Comment("发布时间"),
		field.Int64("created_by").
			Optional().
			Nillable().
			Comment("创建人用户ID（管理员）"),
		field.Int64("updated_by").
			Optional().
			Nillable().
			Comment("更新人用户ID（管理员）"),
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

func (NewsPost) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("translations", NewsPostTranslation.Type),
	}
}

func (NewsPost) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("status"),
		index.Fields("published_at"),
		index.Fields("created_at"),
	}
}
