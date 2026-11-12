-- 第三方中转站接入记录
-- API Key 仍保存在 accounts.credentials 中，本表只保存接入元数据与同步状态。
CREATE TABLE IF NOT EXISTS relay_integrations (
    id                 BIGSERIAL PRIMARY KEY,
    name               VARCHAR(100) NOT NULL,
    provider_key       VARCHAR(50)  NOT NULL,
    base_url           VARCHAR(500) NOT NULL,
    group_id           BIGINT       NOT NULL,
    channel_id         BIGINT       NOT NULL,
    primary_account_id BIGINT,
    status             VARCHAR(20)  NOT NULL DEFAULT 'active',
    model_catalog      JSONB        NOT NULL DEFAULT '[]'::jsonb,
    last_synced_at     TIMESTAMPTZ,
    last_sync_status   VARCHAR(20)  NOT NULL DEFAULT '',
    last_sync_error    TEXT,
    created_by         BIGINT,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at         TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS relay_integrations_name_active
    ON relay_integrations (lower(name))
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS relay_integrations_group_id
    ON relay_integrations (group_id);

CREATE INDEX IF NOT EXISTS relay_integrations_channel_id
    ON relay_integrations (channel_id);

CREATE INDEX IF NOT EXISTS relay_integrations_status
    ON relay_integrations (status)
    WHERE deleted_at IS NULL;

COMMENT ON TABLE relay_integrations IS '第三方中转站接入记录';
COMMENT ON COLUMN relay_integrations.provider_key IS '服务商: openrouter / siliconflow / openai_compatible';
COMMENT ON COLUMN relay_integrations.base_url IS '第三方 OpenAI 兼容网关地址';
COMMENT ON COLUMN relay_integrations.group_id IS '专用分组 ID';
COMMENT ON COLUMN relay_integrations.channel_id IS '绑定渠道 ID';
COMMENT ON COLUMN relay_integrations.primary_account_id IS '主凭证账号 ID';
COMMENT ON COLUMN relay_integrations.status IS '状态: active / disabled / error';
COMMENT ON COLUMN relay_integrations.model_catalog IS '最近一次同步的模型目录';
COMMENT ON COLUMN relay_integrations.last_sync_status IS '最近同步状态: success / failed';
COMMENT ON COLUMN relay_integrations.last_sync_error IS '最近同步错误';
