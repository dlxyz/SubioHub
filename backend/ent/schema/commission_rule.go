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

// CommissionRule stores the configured target rates for each promotion level.
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
			Comment("Rule name"),
		field.String("status").
			MaxLen(20).
			Default(domain.StatusActive).
			Comment("Rule status"),
		field.String("calc_mode").
			MaxLen(20).
			Default("diff").
			Comment("Split calculation mode"),
		field.Float("channel_partner_target_rate").
			SchemaType(map[string]string{dialect.Postgres: "decimal(5,4)"}).
			Default(0).
			Comment("Target rate for channel partners"),
		field.Float("agent_target_rate").
			SchemaType(map[string]string{dialect.Postgres: "decimal(5,4)"}).
			Default(0).
			Comment("Target rate for agents"),
		field.Float("distributor_target_rate").
			SchemaType(map[string]string{dialect.Postgres: "decimal(5,4)"}).
			Default(0).
			Comment("Target rate for distributors"),
		field.Int("freeze_hours").
			Default(168).
			Comment("Settlement freeze window in hours"),
		field.String("settlement_mode").
			MaxLen(20).
			Default("manual").
			Comment("Settlement mode"),
		field.String("scope_type").
			MaxLen(20).
			Default("global").
			Comment("Scope type: global / channel_partner / agent / distributor"),
		field.Int64("scope_id").
			Optional().
			Nillable().
			Comment("Scope object ID"),
		field.Int("priority").
			Default(0).
			Comment("Rule priority"),
		field.Time("effective_at").
			Optional().
			Nillable().
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}).
			Comment("Effective time"),
		field.Time("expired_at").
			Optional().
			Nillable().
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}).
			Comment("Expired time"),
		field.JSON("config_json", map[string]any{}).
			Optional().
			SchemaType(map[string]string{dialect.Postgres: "jsonb"}).
			Comment("Extended rule config"),
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
