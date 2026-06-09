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

// CommissionLog holds the schema definition for the CommissionLog entity.
type CommissionLog struct {
	ent.Schema
}

func (CommissionLog) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "commission_logs"},
	}
}

func (CommissionLog) Mixin() []ent.Mixin {
	return []ent.Mixin{
		mixins.TimeMixin{},
	}
}

func (CommissionLog) Fields() []ent.Field {
	return []ent.Field{
		field.Int64("user_id").
			Comment("受益人 (收到佣金的用户 ID)"),
		field.Int64("invitee_id").
			Optional().
			Nillable().
			Comment("贡献佣金的下级用户 ID"),
		field.Int64("order_id").
			Optional().
			Nillable().
			Comment("关联的充值订单 ID (如果是充值返佣)"),
		field.Float("amount").
			SchemaType(map[string]string{dialect.Postgres: "decimal(20,8)"}).
			Comment("本次产生的佣金金额"),
		field.String("status").
			MaxLen(20).
			Default("settled").
			Comment("佣金状态: pending(待结算) | settled(已结算) | transferred(已划转到余额) | withdrawn(已提现)"),
		field.String("reason").
			MaxLen(255).
			Default("").
			Comment("佣金来源说明 (例如: 下级充值奖励)"),
	}
}

func (CommissionLog) Edges() []ent.Edge {
	return []ent.Edge{
		// 关联受益人 (User)
		edge.From("user", User.Type).
			Ref("commission_logs").
			Unique().
			Field("user_id").
			Required(),

		// 关联贡献者 (User)
		edge.To("invitee", User.Type).
			Unique().
			Field("invitee_id"),

		// 关联充值订单 (PaymentOrder)
		edge.To("payment_order", PaymentOrder.Type).
			Unique().
			Field("order_id"),
	}
}

func (CommissionLog) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("user_id", "status"),
	}
}
