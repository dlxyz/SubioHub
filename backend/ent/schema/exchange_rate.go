package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// ExchangeRate holds the schema definition for the ExchangeRate entity.
//
// 该表保存「1 单位币种 = 多少 USD」的汇率快照，用于多币种充值折算入账。
// 每个币种仅保留最近一次成功拉取的结果（currency 唯一），历史审计由订单的
// exchange_rate 快照字段承担，因此这里无需保留历史记录。
type ExchangeRate struct {
	ent.Schema
}

func (ExchangeRate) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "exchange_rates"},
	}
}

func (ExchangeRate) Fields() []ent.Field {
	return []ent.Field{
		field.String("currency").
			MaxLen(10).
			NotEmpty(),
		field.Float("rate").
			SchemaType(map[string]string{dialect.Postgres: "decimal(20,10)"}),
		field.Time("fetched_at").
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}),
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

func (ExchangeRate) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("currency").Unique(),
	}
}
