ALTER TABLE users
  ADD COLUMN IF NOT EXISTS channel_partner_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS agent_owner_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS distributor_owner_id BIGINT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_channel_partner_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_channel_partner_id_fkey
      FOREIGN KEY (channel_partner_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_agent_owner_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_agent_owner_id_fkey
      FOREIGN KEY (agent_owner_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_distributor_owner_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_distributor_owner_id_fkey
      FOREIGN KEY (distributor_owner_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_channel_partner_id ON users (channel_partner_id);
CREATE INDEX IF NOT EXISTS idx_users_agent_owner_id ON users (agent_owner_id);
CREATE INDEX IF NOT EXISTS idx_users_distributor_owner_id ON users (distributor_owner_id);

ALTER TABLE promotion_relations
  ADD COLUMN IF NOT EXISTS channel_partner_user_id BIGINT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'promotion_relations_channel_partner_user_id_fkey'
  ) THEN
    ALTER TABLE promotion_relations
      ADD CONSTRAINT promotion_relations_channel_partner_user_id_fkey
      FOREIGN KEY (channel_partner_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_promotion_relations_channel_partner_user_id
  ON promotion_relations(channel_partner_user_id)
  WHERE channel_partner_user_id IS NOT NULL;

ALTER TABLE commission_rules
  ADD COLUMN IF NOT EXISTS channel_partner_target_rate DECIMAL(5,4) NOT NULL DEFAULT 0.2500;

UPDATE commission_rules
SET channel_partner_target_rate = GREATEST(agent_target_rate, distributor_target_rate, 0.2500)
WHERE channel_partner_target_rate <= 0;

ALTER TABLE commission_split_logs
  ADD COLUMN IF NOT EXISTS channel_partner_user_id BIGINT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commission_split_logs_channel_partner_user_id_fkey'
  ) THEN
    ALTER TABLE commission_split_logs
      ADD CONSTRAINT commission_split_logs_channel_partner_user_id_fkey
      FOREIGN KEY (channel_partner_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_commission_split_logs_channel_partner_user_id
  ON commission_split_logs(channel_partner_user_id)
  WHERE channel_partner_user_id IS NOT NULL;

UPDATE users u
SET channel_partner_id = pr.channel_partner_user_id
FROM promotion_relations pr
WHERE u.id = pr.user_id
  AND u.channel_partner_id IS NULL
  AND pr.channel_partner_user_id IS NOT NULL;

UPDATE users u
SET agent_owner_id = pr.agent_user_id
FROM promotion_relations pr
WHERE u.id = pr.user_id
  AND u.agent_owner_id IS NULL
  AND pr.agent_user_id IS NOT NULL;

UPDATE users u
SET distributor_owner_id = pr.distributor_user_id
FROM promotion_relations pr
WHERE u.id = pr.user_id
  AND u.distributor_owner_id IS NULL
  AND pr.distributor_user_id IS NOT NULL;

UPDATE users u
SET channel_partner_id = parent.id
FROM users parent
WHERE u.role = 'agent'
  AND u.channel_partner_id IS NULL
  AND u.inviter_id = parent.id
  AND parent.role = 'channel_partner';

UPDATE users u
SET agent_owner_id = parent.id
FROM users parent
WHERE u.role = 'distributor'
  AND u.agent_owner_id IS NULL
  AND u.inviter_id = parent.id
  AND parent.role = 'agent';

UPDATE users u
SET channel_partner_id = parent.channel_partner_id
FROM users parent
WHERE u.role = 'distributor'
  AND u.channel_partner_id IS NULL
  AND u.inviter_id = parent.id
  AND parent.role = 'agent'
  AND parent.channel_partner_id IS NOT NULL;

UPDATE promotion_relations pr
SET channel_partner_user_id = u.channel_partner_id
FROM users u
WHERE pr.user_id = u.id
  AND pr.channel_partner_user_id IS NULL
  AND u.channel_partner_id IS NOT NULL;

UPDATE commission_split_logs csl
SET channel_partner_user_id = pr.channel_partner_user_id
FROM promotion_relations pr
WHERE csl.consumer_user_id = pr.user_id
  AND csl.channel_partner_user_id IS NULL
  AND pr.channel_partner_user_id IS NOT NULL;
