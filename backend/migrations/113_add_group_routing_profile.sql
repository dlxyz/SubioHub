ALTER TABLE groups
ADD COLUMN IF NOT EXISTS routing_profile VARCHAR(20) NOT NULL DEFAULT 'overseas';

UPDATE groups
SET routing_profile = 'overseas'
WHERE routing_profile IS NULL OR TRIM(routing_profile) = '';

CREATE INDEX IF NOT EXISTS idx_groups_routing_profile ON groups (routing_profile);
