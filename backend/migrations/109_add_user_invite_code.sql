ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS invite_code VARCHAR(32);

UPDATE users
SET invite_code = 'U' || LPAD(UPPER(TO_HEX(id)), 7, '0')
WHERE invite_code IS NULL OR BTRIM(invite_code) = '';

ALTER TABLE users
  ALTER COLUMN invite_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_invite_code_key
  ON users(invite_code);
