ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS inviter_id BIGINT,
  ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,4) NOT NULL DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS commission_balance DECIMAL(20,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_commission_earned DECIMAL(20,8) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_inviter_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_inviter_id_fkey
      FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_inviter_id
  ON users(inviter_id)
  WHERE inviter_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS commission_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  amount DECIMAL(20,8) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'settled',
  reason VARCHAR(255) NOT NULL DEFAULT '',
  invitee_id BIGINT NOT NULL,
  order_id BIGINT,
  user_id BIGINT NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'commission_logs_users_invitee'
  ) THEN
    ALTER TABLE commission_logs
      ADD CONSTRAINT commission_logs_users_invitee
      FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'commission_logs_payment_orders_payment_order'
  ) THEN
    ALTER TABLE commission_logs
      ADD CONSTRAINT commission_logs_payment_orders_payment_order
      FOREIGN KEY (order_id) REFERENCES payment_orders(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'commission_logs_users_commission_logs'
  ) THEN
    ALTER TABLE commission_logs
      ADD CONSTRAINT commission_logs_users_commission_logs
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS commissionlog_user_id_status
  ON commission_logs(user_id, status);

CREATE INDEX IF NOT EXISTS idx_commission_logs_status_created_at
  ON commission_logs(status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_logs_order_id_unique
  ON commission_logs(order_id)
  WHERE order_id IS NOT NULL;
