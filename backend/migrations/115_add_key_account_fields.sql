ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_key_account BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS key_account_level VARCHAR(20) NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS key_account_discount_rate DECIMAL(5,4) NOT NULL DEFAULT 1.0000,
  ADD COLUMN IF NOT EXISTS key_account_rebate_rate DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS key_account_manager_notes TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_users_is_key_account ON users (is_key_account);
CREATE INDEX IF NOT EXISTS idx_users_key_account_level ON users (key_account_level);
