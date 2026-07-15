package schema

import (
	"github.com/dlxyz/SubioHub/ent/schema/mixins"
	"github.com/dlxyz/SubioHub/internal/domain"

	"entgo.io/ent"
	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// User holds the schema definition for the User entity.
type User struct {
	ent.Schema
}

func (User) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "users"},
	}
}

func (User) Mixin() []ent.Mixin {
	return []ent.Mixin{
		mixins.TimeMixin{},
		mixins.SoftDeleteMixin{},
	}
}

func (User) Fields() []ent.Field {
	return []ent.Field{
		field.String("email").
			MaxLen(255).
			NotEmpty(),
		field.String("password_hash").
			MaxLen(255).
			NotEmpty(),
		field.String("role").
			MaxLen(20).
			Default(domain.RoleUser),
		field.Float("balance").
			SchemaType(map[string]string{dialect.Postgres: "decimal(20,8)"}).
			Default(0),
		field.Int("concurrency").
			Default(5),
		field.String("status").
			MaxLen(20).
			Default(domain.StatusActive),
		field.String("username").
			MaxLen(100).
			Default(""),
		field.String("notes").
			SchemaType(map[string]string{dialect.Postgres: "text"}).
			Default(""),
		field.String("totp_secret_encrypted").
			SchemaType(map[string]string{dialect.Postgres: "text"}).
			Optional().
			Nillable(),
		field.Bool("totp_enabled").
			Default(false),
		field.Time("totp_enabled_at").
			Optional().
			Nillable(),
		field.Bool("balance_notify_enabled").
			Default(true),
		field.String("balance_notify_threshold_type").
			Default("fixed"),
		field.Float("balance_notify_threshold").
			SchemaType(map[string]string{dialect.Postgres: "decimal(20,8)"}).
			Optional().
			Nillable(),
		field.String("balance_notify_extra_emails").
			SchemaType(map[string]string{dialect.Postgres: "text"}).
			Default("[]"),
		field.Float("total_recharged").
			SchemaType(map[string]string{dialect.Postgres: "decimal(20,8)"}).
			Default(0),
		field.Int64("inviter_id").
			Optional().
			Nillable().
			Comment("Direct inviter user ID"),
		field.String("invite_code").
			Optional().
			MaxLen(32).
			Unique().
			Comment("User invite code"),
		field.Float("commission_rate").
			SchemaType(map[string]string{dialect.Postgres: "decimal(5,4)"}).
			Default(0.10).
			Comment("User commission rate"),
		field.Float("commission_balance").
			SchemaType(map[string]string{dialect.Postgres: "decimal(20,8)"}).
			Default(0).
			Comment("Available commission balance"),
		field.Float("total_commission_earned").
			SchemaType(map[string]string{dialect.Postgres: "decimal(20,8)"}).
			Default(0).
			Comment("Total historical commission earned"),
		field.Int64("channel_partner_id").
			Optional().
			Nillable().
			Comment("Top-level marketing channel partner owner user ID"),
		field.Int64("agent_owner_id").
			Optional().
			Nillable().
			Comment("Owning agent user ID within the marketing hierarchy"),
		field.Int64("distributor_owner_id").
			Optional().
			Nillable().
			Comment("Owning distributor user ID within the marketing hierarchy"),
		field.Bool("is_key_account").
			Default(false).
			Comment("Whether the user is a key account"),
		field.String("key_account_level").
			MaxLen(20).
			Default("standard").
			Comment("Key account level"),
		field.Float("key_account_discount_rate").
			SchemaType(map[string]string{dialect.Postgres: "decimal(5,4)"}).
			Default(1).
			Comment("Key account discount rate"),
		field.Float("key_account_rebate_rate").
			SchemaType(map[string]string{dialect.Postgres: "decimal(5,4)"}).
			Default(0).
			Comment("Key account rebate rate"),
		field.String("key_account_manager_notes").
			SchemaType(map[string]string{dialect.Postgres: "text"}).
			Default("").
			Comment("Key account manager notes"),
	}
}

func (User) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("invitees", User.Type).
			From("inviter").
			Unique().
			Field("inviter_id"),
		edge.To("channel_members", User.Type).
			From("channel_partner").
			Unique().
			Field("channel_partner_id"),
		edge.To("agent_members", User.Type).
			From("agent_owner").
			Unique().
			Field("agent_owner_id"),
		edge.To("distributor_members", User.Type).
			From("distributor_owner").
			Unique().
			Field("distributor_owner_id"),
		edge.To("commission_logs", CommissionLog.Type),
		edge.To("api_keys", APIKey.Type),
		edge.To("redeem_codes", RedeemCode.Type),
		edge.To("subscriptions", UserSubscription.Type),
		edge.To("assigned_subscriptions", UserSubscription.Type),
		edge.To("announcement_reads", AnnouncementRead.Type),
		edge.To("allowed_groups", Group.Type).
			Through("user_allowed_groups", UserAllowedGroup.Type),
		edge.To("usage_logs", UsageLog.Type),
		edge.To("attribute_values", UserAttributeValue.Type),
		edge.To("promo_code_usages", PromoCodeUsage.Type),
		edge.To("payment_orders", PaymentOrder.Type),
	}
}

func (User) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("status"),
		index.Fields("deleted_at"),
		index.Fields("channel_partner_id"),
		index.Fields("agent_owner_id"),
		index.Fields("distributor_owner_id"),
		index.Fields("is_key_account"),
		index.Fields("key_account_level"),
	}
}
