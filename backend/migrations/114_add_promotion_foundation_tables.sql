CREATE TABLE IF NOT EXISTS promotion_relations (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id BIGINT NOT NULL,
  agent_user_id BIGINT NULL,
  distributor_user_id BIGINT NULL,
  direct_parent_user_id BIGINT NULL,
  direct_parent_role VARCHAR(20) NOT NULL DEFAULT '',
  binding_source VARCHAR(30) NOT NULL DEFAULT 'manual',
  is_locked BOOLEAN NOT NULL DEFAULT TRUE,
  bound_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'promotion_relations_user_id_fkey'
  ) THEN
    ALTER TABLE promotion_relations
      ADD CONSTRAINT promotion_relations_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'promotion_relations_agent_user_id_fkey'
  ) THEN
    ALTER TABLE promotion_relations
      ADD CONSTRAINT promotion_relations_agent_user_id_fkey
      FOREIGN KEY (agent_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'promotion_relations_distributor_user_id_fkey'
  ) THEN
    ALTER TABLE promotion_relations
      ADD CONSTRAINT promotion_relations_distributor_user_id_fkey
      FOREIGN KEY (distributor_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'promotion_relations_direct_parent_user_id_fkey'
  ) THEN
    ALTER TABLE promotion_relations
      ADD CONSTRAINT promotion_relations_direct_parent_user_id_fkey
      FOREIGN KEY (direct_parent_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_promotion_relations_user_id
  ON promotion_relations(user_id);

CREATE INDEX IF NOT EXISTS idx_promotion_relations_agent_user_id
  ON promotion_relations(agent_user_id)
  WHERE agent_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_promotion_relations_distributor_user_id
  ON promotion_relations(distributor_user_id)
  WHERE distributor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_promotion_relations_direct_parent_user_id
  ON promotion_relations(direct_parent_user_id)
  WHERE direct_parent_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_promotion_relations_binding_source
  ON promotion_relations(binding_source);

CREATE INDEX IF NOT EXISTS idx_promotion_relations_is_locked
  ON promotion_relations(is_locked);

CREATE INDEX IF NOT EXISTS idx_promotion_relations_bound_at
  ON promotion_relations(bound_at);


CREATE TABLE IF NOT EXISTS commission_rules (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  calc_mode VARCHAR(20) NOT NULL DEFAULT 'diff',
  agent_target_rate DECIMAL(5,4) NOT NULL DEFAULT 0,
  distributor_target_rate DECIMAL(5,4) NOT NULL DEFAULT 0,
  freeze_hours INTEGER NOT NULL DEFAULT 168,
  settlement_mode VARCHAR(20) NOT NULL DEFAULT 'manual',
  scope_type VARCHAR(20) NOT NULL DEFAULT 'global',
  scope_id BIGINT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  effective_at TIMESTAMPTZ NULL,
  expired_at TIMESTAMPTZ NULL,
  config_json JSONB NULL
);

CREATE INDEX IF NOT EXISTS idx_commission_rules_status
  ON commission_rules(status);

CREATE INDEX IF NOT EXISTS idx_commission_rules_calc_mode
  ON commission_rules(calc_mode);

CREATE INDEX IF NOT EXISTS idx_commission_rules_scope
  ON commission_rules(scope_type, scope_id);

CREATE INDEX IF NOT EXISTS idx_commission_rules_priority
  ON commission_rules(priority);

CREATE INDEX IF NOT EXISTS idx_commission_rules_effective_at
  ON commission_rules(effective_at);

CREATE INDEX IF NOT EXISTS idx_commission_rules_expired_at
  ON commission_rules(expired_at);


CREATE TABLE IF NOT EXISTS commission_split_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  order_id BIGINT NULL,
  consumer_user_id BIGINT NOT NULL,
  beneficiary_user_id BIGINT NOT NULL,
  beneficiary_role VARCHAR(20) NOT NULL DEFAULT 'user',
  agent_user_id BIGINT NULL,
  distributor_user_id BIGINT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  calc_mode VARCHAR(20) NOT NULL DEFAULT 'diff',
  base_amount DECIMAL(20,8) NOT NULL DEFAULT 0,
  target_rate DECIMAL(5,4) NOT NULL DEFAULT 0,
  parent_rate DECIMAL(5,4) NOT NULL DEFAULT 0,
  commission_amount DECIMAL(20,8) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  rule_id BIGINT NULL,
  settled_at TIMESTAMPTZ NULL,
  relation_snapshot JSONB NULL,
  remark TEXT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commission_split_logs_order_id_fkey'
  ) THEN
    ALTER TABLE commission_split_logs
      ADD CONSTRAINT commission_split_logs_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES payment_orders(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commission_split_logs_consumer_user_id_fkey'
  ) THEN
    ALTER TABLE commission_split_logs
      ADD CONSTRAINT commission_split_logs_consumer_user_id_fkey
      FOREIGN KEY (consumer_user_id) REFERENCES users(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commission_split_logs_beneficiary_user_id_fkey'
  ) THEN
    ALTER TABLE commission_split_logs
      ADD CONSTRAINT commission_split_logs_beneficiary_user_id_fkey
      FOREIGN KEY (beneficiary_user_id) REFERENCES users(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commission_split_logs_agent_user_id_fkey'
  ) THEN
    ALTER TABLE commission_split_logs
      ADD CONSTRAINT commission_split_logs_agent_user_id_fkey
      FOREIGN KEY (agent_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commission_split_logs_distributor_user_id_fkey'
  ) THEN
    ALTER TABLE commission_split_logs
      ADD CONSTRAINT commission_split_logs_distributor_user_id_fkey
      FOREIGN KEY (distributor_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commission_split_logs_rule_id_fkey'
  ) THEN
    ALTER TABLE commission_split_logs
      ADD CONSTRAINT commission_split_logs_rule_id_fkey
      FOREIGN KEY (rule_id) REFERENCES commission_rules(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_commission_split_logs_order_id
  ON commission_split_logs(order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commission_split_logs_consumer_user_id
  ON commission_split_logs(consumer_user_id);

CREATE INDEX IF NOT EXISTS idx_commission_split_logs_beneficiary_status
  ON commission_split_logs(beneficiary_user_id, status);

CREATE INDEX IF NOT EXISTS idx_commission_split_logs_agent_user_id
  ON commission_split_logs(agent_user_id)
  WHERE agent_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commission_split_logs_distributor_user_id
  ON commission_split_logs(distributor_user_id)
  WHERE distributor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commission_split_logs_rule_id
  ON commission_split_logs(rule_id)
  WHERE rule_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commission_split_logs_calc_mode
  ON commission_split_logs(calc_mode);

CREATE INDEX IF NOT EXISTS idx_commission_split_logs_created_at
  ON commission_split_logs(created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_split_logs_order_beneficiary_level
  ON commission_split_logs(order_id, beneficiary_user_id, level);
