package schema

import (
	"github.com/dlxyz/SubioHub/ent/schema/mixins"

	"entgo.io/ent"
	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// CommissionSplitLog records the generated split plan for a completed order.
type CommissionSplitLog struct {
	ent.Schema
}

func (CommissionSplitLog) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "commission_split_logs"},
	}
}

func (CommissionSplitLog) Mixin() []ent.Mixin {
	return []ent.Mixin{
		mixins.TimeMixin{},
	}
}

func (CommissionSplitLog) Fields() []ent.Field {
	return []ent.Field{
		field.Int64("order_id").
			Optional().
			Nillable().
			Comment("Related payment order ID"),
		field.Int64("consumer_user_id").
			Comment("Consumer user ID"),
		field.Int64("beneficiary_user_id").
			Comment("Beneficiary user ID"),
		field.String("beneficiary_role").
			MaxLen(20).
			Default("user").
			Comment("Beneficiary role"),
		field.Int64("channel_partner_user_id").
			Optional().
			Nillable().
			Comment("Channel partner user ID in the relation chain"),
		field.Int64("agent_user_id").
			Optional().
			Nillable().
			Comment("Agent user ID in the relation chain"),
		field.Int64("distributor_user_id").
			Optional().
			Nillable().
			Comment("Distributor user ID in the relation chain"),
		field.Int("level").
			Default(1).
			Comment("Split level"),
		field.String("calc_mode").
			MaxLen(20).
			Default("diff").
			Comment("Split calculation mode"),
		field.Float("base_amount").
			SchemaType(map[string]string{dialect.Postgres: "decimal(20,8)"}).
			Default(0).
			Comment("Split base amount"),
		field.Float("target_rate").
			SchemaType(map[string]string{dialect.Postgres: "decimal(5,4)"}).
			Default(0).
			Comment("Configured target rate"),
		field.Float("parent_rate").
			SchemaType(map[string]string{dialect.Postgres: "decimal(5,4)"}).
			Default(0).
			Comment("Already consumed child rate"),
		field.Float("commission_amount").
			SchemaType(map[string]string{dialect.Postgres: "decimal(20,8)"}).
			Default(0).
			Comment("Final commission amount"),
		field.String("status").
			MaxLen(20).
			Default("pending").
			Comment("Split status"),
		field.Int64("rule_id").
			Optional().
			Nillable().
			Comment("Matched commission rule ID"),
		field.Time("settled_at").
			Optional().
			Nillable().
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}).
			Comment("Settled time"),
		field.JSON("relation_snapshot", map[string]any{}).
			Optional().
			SchemaType(map[string]string{dialect.Postgres: "jsonb"}).
			Comment("Relation snapshot"),
		field.String("remark").
			Optional().
			Nillable().
			SchemaType(map[string]string{dialect.Postgres: "text"}).
			Comment("Split remark"),
	}
}

func (CommissionSplitLog) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("payment_order", PaymentOrder.Type).
			Unique().
			Field("order_id"),
		edge.To("consumer_user", User.Type).
			Unique().
			Required().
			Field("consumer_user_id"),
		edge.To("beneficiary_user", User.Type).
			Unique().
			Required().
			Field("beneficiary_user_id"),
		edge.To("channel_partner_user", User.Type).
			Unique().
			Field("channel_partner_user_id"),
		edge.To("agent_user", User.Type).
			Unique().
			Field("agent_user_id"),
		edge.To("distributor_user", User.Type).
			Unique().
			Field("distributor_user_id"),
		edge.To("commission_rule", CommissionRule.Type).
			Unique().
			Field("rule_id"),
	}
}

func (CommissionSplitLog) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("order_id"),
		index.Fields("consumer_user_id"),
		index.Fields("beneficiary_user_id", "status"),
		index.Fields("channel_partner_user_id"),
		index.Fields("agent_user_id"),
		index.Fields("distributor_user_id"),
		index.Fields("rule_id"),
		index.Fields("calc_mode"),
		index.Fields("created_at"),
		index.Fields("order_id", "beneficiary_user_id", "level").Unique(),
	}
}
