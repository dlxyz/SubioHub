export type PricingTier = {
  amount: number;
  credited: number;
  fee: number;
  pay: number;
};

// 推荐充值档位（USD），起充 10 美元。
export const RECHARGE_PRESETS = [10, 20, 30, 50, 100, 200, 500];

// 单笔充值与到账规则（与后端支付配置一致：6% 手续费，1:1 到账）。
export const RECHARGE_MIN_USD = 10;
export const RECHARGE_MAX_USD = 500;
export const RECHARGE_FEE_RATE = 6;
export const SMALL_AMOUNT_THRESHOLD_USD = 20;
export const SMALL_AMOUNT_SURCHARGE_USD = 0.5;
export const RECHARGE_CREDITED_RATIO = 1;

// 手续费：20 USD 以下为 6% + 0.50 USD，20 USD 及以上仅 6%。
// 与后端 internal/payment/fee.go 的计算口径保持一致（百分比向上取整到分）。
export function calcRechargeFee(amount: number): number {
  if (amount <= 0 || RECHARGE_FEE_RATE <= 0) {
    return 0;
  }
  const percentageFee = Math.ceil(amount * RECHARGE_FEE_RATE) / 100;
  const fee = amount < SMALL_AMOUNT_THRESHOLD_USD
    ? percentageFee + SMALL_AMOUNT_SURCHARGE_USD
    : percentageFee;
  return Number(fee.toFixed(2));
}

export const RECHARGE_TIERS: PricingTier[] = RECHARGE_PRESETS.map((amount) => {
  const fee = calcRechargeFee(amount);
  return {
    amount,
    credited: Number((amount * RECHARGE_CREDITED_RATIO).toFixed(2)),
    fee,
    pay: Number((amount + fee).toFixed(2)),
  };
});

// 定价页条目顺序，文案位于 i18n 的 pricing 命名空间（按语言拆分）。
export const PRICING_HIGHLIGHT_KEYS = ['noSubscription', 'permanent', 'realtime'] as const;

export const PRICING_BILLING_KEYS = [
  'tokenBilling',
  'fee',
  'modelPrices',
  'currency',
  'balanceValidity',
  'payment',
] as const;

export const PRICING_FAQ_KEYS = [
  'balanceExpiry',
  'autoRenewal',
  'minimum',
  'fee',
  'usage',
  'refund',
] as const;
