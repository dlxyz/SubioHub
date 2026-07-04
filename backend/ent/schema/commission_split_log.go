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

// CommissionSplitLog holds the schema definition for the CommissionSplitLog entity.
// 用于记录一笔订单在代理/分销层级中的拆分结果，为补差法分润留底。
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
			Comment("关联订单 ID"),
		field.Int64("consumer_user_id").
			Comment("消费用户 ID"),
		field.Int64("beneficiary_user_id").
			Comment("实际收益人用户 ID"),
		field.String("beneficiary_role").
			MaxLen(20).
			Default("user").
			Comment("收益人角色：admin/agent/distributor/user"),
		field.Int64("agent_user_id").
			Optional().
			Nillable().
			Comment("关系链中的代理用户 ID"),
		field.Int64("distributor_user_id").
			Optional().
			Nillable().
			Comment("关系链中的分销用户 ID"),
		field.Int("level").
			Default(1).
			Comment("分润层级，1=直接收益，2=上级补差"),
		field.String("calc_mode").
			MaxLen(20).
			Default("diff").
			Comment("分润计算模式：diff=补差法，additive=叠加法"),
		field.Float("base_amount").
			SchemaType(map[string]string{dialect.Postgres: "decimal(20,8)"}).
			Default(0).
			Comment("分润基数"),
		field.Float("target_rate").
			SchemaType(map[string]string{dialect.Postgres: "decimal(5,4)"}).
			Default(0).
			Comment("该层目标比例"),
		field.Float("parent_rate").
			SchemaType(map[string]string{dialect.Postgres: "decimal(5,4)"}).
			Default(0).
			Comment("下层已占比例，补差法时用于计算差额"),
		field.Float("commission_amount").
			SchemaType(map[string]string{dialect.Postgres: "decimal(20,8)"}).
			Default(0).
			Comment("最终分润金额"),
		field.String("status").
			MaxLen(20).
			Default("pending").
			Comment("分润状态：pending / settled / transferred / reversed / cancelled"),
		field.Int64("rule_id").
			Optional().
			Nillable().
			Comment("命中的分润规则 ID"),
		field.Time("settled_at").
			Optional().
			Nillable().
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}).
			Comment("结算时间"),
		field.JSON("relation_snapshot", map[string]any{}).
			Optional().
			SchemaType(map[string]string{dialect.Postgres: "jsonb"}).
			Comment("关系快照，避免后续关系调整影响历史分润"),
		field.String("remark").
			Optional().
			Nillable().
			SchemaType(map[string]string{dialect.Postgres: "text"}).
			Comment("分润备注"),
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
		index.Fields("agent_user_id"),
		index.Fields("distributor_user_id"),
		index.Fields("rule_id"),
		index.Fields("calc_mode"),
		index.Fields("created_at"),
		index.Fields("order_id", "beneficiary_user_id", "level").Unique(),
	}
}
