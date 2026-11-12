-- 为已存在的第三方接入渠道补充 relay 标记
-- 模型广场依赖 channels.provider_config.relay 区分「官方直连」与「第三方直连」。
-- 该迁移只影响由 relay_integrations 关联的渠道，可重复执行。
UPDATE channels c
SET provider_config = COALESCE(c.provider_config, '{}'::jsonb)
    || jsonb_build_object('relay', true)
WHERE EXISTS (
        SELECT 1 FROM relay_integrations r WHERE r.channel_id = c.id
    )
  AND COALESCE(c.provider_config->>'relay', 'false') <> 'true';
