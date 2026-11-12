-- Ent schema 已定义 ExchangeRate（表 exchange_rates），
-- 但历史迁移缺少建表语句，导致汇率拉取写入时报 relation does not exist。
CREATE TABLE IF NOT EXISTS exchange_rates (
    id BIGSERIAL PRIMARY KEY,
    currency VARCHAR(10) NOT NULL,
    rate DECIMAL(20,10) NOT NULL DEFAULT 0,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS exchange_rates_currency
    ON exchange_rates (currency);

COMMENT ON TABLE exchange_rates IS '各币种相对 USD 的最新汇率快照';
COMMENT ON COLUMN exchange_rates.currency IS '币种代码，如 CNY';
COMMENT ON COLUMN exchange_rates.rate IS '1 单位币种 = N USD';
COMMENT ON COLUMN exchange_rates.fetched_at IS '汇率拉取时间';
