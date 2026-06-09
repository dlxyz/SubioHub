ALTER TABLE channels
    ADD COLUMN IF NOT EXISTS provider_type VARCHAR(50) NOT NULL DEFAULT 'standard',
    ADD COLUMN IF NOT EXISTS provider_config JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN channels.provider_type IS '渠道执行适配器类型，如 standard/deepseek/qwen/doubao/zhipu';
COMMENT ON COLUMN channels.provider_config IS '渠道 provider 运行配置，JSON 对象格式，包含上游 base_url/api_key/timeout 等';
