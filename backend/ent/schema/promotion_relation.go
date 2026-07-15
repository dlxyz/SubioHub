package schema

import (
	"time"

	"github.com/dlxyz/SubioHub/ent/schema/mixins"

	"entgo.io/ent"
	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// PromotionRelation stores the resolved promotion ownership chain for a user.
type PromotionRelation struct {
	ent.Schema
}

func (PromotionRelation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "promotion_relations"},
	}
}

func (PromotionRelation) Mixin() []ent.Mixin {
	return []ent.Mixin{
		mixins.TimeMixin{},
	}
}

func (PromotionRelation) Fields() []ent.Field {
	return []ent.Field{
		field.Int64("user_id").
			Comment("Target end user ID"),
		field.Int64("channel_partner_user_id").
			Optional().
			Nillable().
			Comment("Top-level channel partner user ID"),
		field.Int64("agent_user_id").
			Optional().
			Nillable().
			Comment("Owning agent user ID"),
		field.Int64("distributor_user_id").
			Optional().
			Nillable().
			Comment("Owning distributor user ID"),
		field.Int64("direct_parent_user_id").
			Optional().
			Nillable().
			Comment("Direct parent user ID"),
		field.String("direct_parent_role").
			MaxLen(20).
			Default("").
			Comment("Direct parent role"),
		field.String("binding_source").
			MaxLen(30).
			Default("manual").
			Comment("Binding source"),
		field.Bool("is_locked").
			Default(true).
			Comment("Whether the binding is locked"),
		field.Time("bound_at").
			Default(time.Now).
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}).
			Comment("First bound time"),
		field.String("notes").
			Optional().
			Nillable().
			SchemaType(map[string]string{dialect.Postgres: "text"}).
			Comment("Binding notes"),
	}
}

func (PromotionRelation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("user", User.Type).
			Unique().
			Required().
			Field("user_id"),
		edge.To("channel_partner_user", User.Type).
			Unique().
			Field("channel_partner_user_id"),
		edge.To("agent_user", User.Type).
			Unique().
			Field("agent_user_id"),
		edge.To("distributor_user", User.Type).
			Unique().
			Field("distributor_user_id"),
		edge.To("direct_parent_user", User.Type).
			Unique().
			Field("direct_parent_user_id"),
	}
}

func (PromotionRelation) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("user_id").Unique(),
		index.Fields("channel_partner_user_id"),
		index.Fields("agent_user_id"),
		index.Fields("distributor_user_id"),
		index.Fields("direct_parent_user_id"),
		index.Fields("direct_parent_role"),
		index.Fields("binding_source"),
		index.Fields("is_locked"),
		index.Fields("bound_at"),
	}
}
