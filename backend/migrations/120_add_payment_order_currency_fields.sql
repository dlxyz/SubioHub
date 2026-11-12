-- 多币种支付字段：Ent schema 与下单服务已在读写这三列，
-- 但历史迁移未创建，导致全新库创建订单时 SQL 报错。
ALTER TABLE payment_orders
    ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'CNY',
    ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(20,10) NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS base_amount DECIMAL(20,10) NOT NULL DEFAULT 0;

COMMENT ON COLUMN payment_orders.currency IS '订单原币种，如 CNY / USD';
COMMENT ON COLUMN payment_orders.exchange_rate IS '原币种 → USD 汇率快照（1 原币 = N USD）';
COMMENT ON COLUMN payment_orders.base_amount IS '折算后的 USD 金额，用于统一统计与限额';
