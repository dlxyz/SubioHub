package schema

import (
	"github.com/dlxyz/SubioHub/ent/schema/mixins"
	"github.com/dlxyz/SubioHub/internal/domain"

	"entgo.io/ent"
	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// CommissionRule holds the schema definition for the CommissionRule entity.
// 第一阶段先把规则表建好，后续可逐步接平台默认规则、按代理覆盖、按时间生效。
type CommissionRule struct {
	ent.Schema
}

func (CommissionRule) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "commission_rules"},
	}
}

func (CommissionRule) Mixin() []ent.Mixin {
	return []ent.Mixin{
		mixins.TimeMixin{},
	}
}

func (CommissionRule) Fields() []ent.Field {
	return []ent.Field{
		field.String("name").
			MaxLen(100).
			NotEmpty().
			Comment("规则名称"),
		field.String("status").
			MaxLen(20).
			Default(domain.StatusActive).
			Comment("规则状态"),
		field.String("calc_mode").
			MaxLen(20).
			Default("diff").
			Comment("分润计算模式：diff=补差法，additive=叠加法"),
		field.Float("agent_target_rate").
			SchemaType(map[string]string{dialect.Postgres: "decimal(5,4)"}).
			Default(0).
			Comment("代理层目标比例"),
		field.Float("distributor_target_rate").
			SchemaType(map[string]string{dialect.Postgres: "decimal(5,4)"}).
			Default(0).
			Comment("分销层目标比例"),
		field.Int("freeze_hours").
			Default(168).
			Comment("冻结小时数，默认 7 天"),
		field.String("settlement_mode").
			MaxLen(20).
			Default("manual").
			Comment("结算模式：manual / auto"),
		field.String("scope_type").
			MaxLen(20).
			Default("global").
			Comment("作用域：global / agent / distributor"),
		field.Int64("scope_id").
			Optional().
			Nillable().
			Comment("作用域对象 ID"),
		field.Int("priority").
			Default(0).
			Comment("优先级，数值越大越优先"),
		field.Time("effective_at").
			Optional().
			Nillable().
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}).
			Comment("生效时间"),
		field.Time("expired_at").
			Optional().
			Nillable().
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}).
			Comment("失效时间"),
		field.JSON("config_json", map[string]any{}).
			Optional().
			SchemaType(map[string]string{dialect.Postgres: "jsonb"}).
			Comment("扩展规则配置"),
	}
}

func (CommissionRule) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("status"),
		index.Fields("calc_mode"),
		index.Fields("scope_type", "scope_id"),
		index.Fields("priority"),
		index.Fields("effective_at"),
		index.Fields("expired_at"),
	}
}
