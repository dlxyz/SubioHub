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

// PromotionRelation holds the schema definition for the PromotionRelation entity.
// 用于固定用户当前归属的代理/分销关系，避免后续补差法结算时串账。
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
			Comment("被归属的终端用户 ID"),
		field.Int64("agent_user_id").
			Optional().
			Nillable().
			Comment("所属代理用户 ID"),
		field.Int64("distributor_user_id").
			Optional().
			Nillable().
			Comment("所属分销用户 ID"),
		field.Int64("direct_parent_user_id").
			Optional().
			Nillable().
			Comment("直接上级用户 ID，可能是代理或分销"),
		field.String("direct_parent_role").
			MaxLen(20).
			Default("").
			Comment("直接上级角色：admin/agent/distributor/user"),
		field.String("binding_source").
			MaxLen(30).
			Default("manual").
			Comment("绑定来源：manual / agent_direct / distributor_direct / import"),
		field.Bool("is_locked").
			Default(true).
			Comment("绑定关系是否锁定"),
		field.Time("bound_at").
			Default(time.Now).
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}).
			Comment("首次绑定时间"),
		field.String("notes").
			Optional().
			Nillable().
			SchemaType(map[string]string{dialect.Postgres: "text"}).
			Comment("归属关系备注"),
	}
}

func (PromotionRelation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("user", User.Type).
			Unique().
			Required().
			Field("user_id"),
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
		index.Fields("agent_user_id"),
		index.Fields("distributor_user_id"),
		index.Fields("direct_parent_user_id"),
		index.Fields("direct_parent_role"),
		index.Fields("binding_source"),
		index.Fields("is_locked"),
		index.Fields("bound_at"),
	}
}
