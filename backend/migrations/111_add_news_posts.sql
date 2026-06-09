-- 创建资讯主表
CREATE TABLE IF NOT EXISTS news_posts (
    id BIGSERIAL PRIMARY KEY,
    slug VARCHAR(120) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    default_locale VARCHAR(16) NOT NULL DEFAULT 'zh-CN',
    cover_image_url VARCHAR(500) DEFAULT NULL,
    author_name VARCHAR(100) DEFAULT NULL,
    published_at TIMESTAMPTZ DEFAULT NULL,
    created_by BIGINT DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
    updated_by BIGINT DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 创建资讯多语言表
CREATE TABLE IF NOT EXISTS news_post_translations (
    id BIGSERIAL PRIMARY KEY,
    news_post_id BIGINT NOT NULL REFERENCES news_posts(id) ON DELETE CASCADE,
    locale VARCHAR(16) NOT NULL,
    title VARCHAR(200) NOT NULL,
    summary TEXT DEFAULT '',
    content TEXT NOT NULL,
    seo_title VARCHAR(200) DEFAULT NULL,
    seo_description TEXT DEFAULT NULL,
    translation_status VARCHAR(20) NOT NULL DEFAULT 'manual',
    translation_provider VARCHAR(100) DEFAULT NULL,
    translated_from_locale VARCHAR(16) DEFAULT NULL,
    last_translated_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(news_post_id, locale)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_news_posts_status ON news_posts(status);
CREATE INDEX IF NOT EXISTS idx_news_posts_published_at ON news_posts(published_at);
CREATE INDEX IF NOT EXISTS idx_news_posts_created_at ON news_posts(created_at);
CREATE INDEX IF NOT EXISTS idx_news_post_translations_news_post_id ON news_post_translations(news_post_id);
CREATE INDEX IF NOT EXISTS idx_news_post_translations_locale ON news_post_translations(locale);

COMMENT ON TABLE news_posts IS '资讯主表';
COMMENT ON COLUMN news_posts.slug IS '公开路由 slug';
COMMENT ON COLUMN news_posts.status IS '状态: draft, published, archived';
COMMENT ON COLUMN news_posts.default_locale IS '默认语言';
COMMENT ON COLUMN news_posts.cover_image_url IS '封面图地址';
COMMENT ON COLUMN news_posts.author_name IS '作者名称';
COMMENT ON COLUMN news_posts.published_at IS '发布时间';

COMMENT ON TABLE news_post_translations IS '资讯多语言内容表';
COMMENT ON COLUMN news_post_translations.locale IS '语言代码，如 zh-CN、en-US';
COMMENT ON COLUMN news_post_translations.title IS '资讯标题';
COMMENT ON COLUMN news_post_translations.summary IS '摘要';
COMMENT ON COLUMN news_post_translations.content IS 'HTML 正文';
COMMENT ON COLUMN news_post_translations.translation_status IS '翻译状态: manual, ai_draft, reviewed';
COMMENT ON COLUMN news_post_translations.translation_provider IS '翻译来源';
COMMENT ON COLUMN news_post_translations.translated_from_locale IS '翻译来源语言';
COMMENT ON COLUMN news_post_translations.last_translated_at IS '最后翻译时间';
