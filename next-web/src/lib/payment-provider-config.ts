export type PaymentProviderOption = {
  value: string;
  label: string;
};

export type PaymentProviderConfigField = {
  key: string;
  label: string;
  sensitive: boolean;
  optional?: boolean;
  defaultValue?: string;
};

export type PaymentProviderCallbackPaths = {
  notifyUrl?: string;
  returnUrl?: string;
};

export const PAYMENT_MODE_QRCODE = 'qrcode';
export const PAYMENT_MODE_POPUP = 'popup';
export const PAYMENT_RESULT_PATH = '/payment/result';

export const PROVIDER_SUPPORTED_TYPES: Record<string, string[]> = {
  easypay: ['alipay', 'wxpay'],
  alipay: ['alipay'],
  wxpay: ['wxpay'],
  stripe: ['card', 'alipay', 'wxpay', 'link'],
  creem: ['creem'],
  tegro: ['tegro'],
};

export const PROVIDER_WEBHOOK_PATHS: Record<string, string> = {
  easypay: '/api/v1/payment/webhook/easypay',
  alipay: '/api/v1/payment/webhook/alipay',
  wxpay: '/api/v1/payment/webhook/wxpay',
  stripe: '/api/v1/payment/webhook/stripe',
  creem: '/api/v1/payment/webhook/creem',
  tegro: '/api/v1/payment/webhook/tegro',
};

export const PROVIDER_CALLBACK_PATHS: Record<string, PaymentProviderCallbackPaths> = {
  easypay: {
    notifyUrl: PROVIDER_WEBHOOK_PATHS.easypay,
    returnUrl: PAYMENT_RESULT_PATH,
  },
  alipay: {
    notifyUrl: PROVIDER_WEBHOOK_PATHS.alipay,
    returnUrl: PAYMENT_RESULT_PATH,
  },
  wxpay: {
    notifyUrl: PROVIDER_WEBHOOK_PATHS.wxpay,
  },
};

export const PROVIDER_CONFIG_FIELDS: Record<string, PaymentProviderConfigField[]> = {
  easypay: [
    { key: 'pid', label: 'PID', sensitive: false },
    { key: 'pkey', label: 'PKey', sensitive: true },
    { key: 'apiBase', label: 'API Base URL', sensitive: false },
    { key: 'cidAlipay', label: '支付宝通道号', sensitive: false, optional: true },
    { key: 'cidWxpay', label: '微信通道号', sensitive: false, optional: true },
  ],
  alipay: [
    { key: 'appId', label: 'App ID', sensitive: false },
    { key: 'privateKey', label: '应用私钥', sensitive: true },
    { key: 'publicKey', label: '支付宝公钥', sensitive: true },
  ],
  wxpay: [
    { key: 'appId', label: 'App ID', sensitive: false },
    { key: 'mchId', label: '商户号', sensitive: false },
    { key: 'privateKey', label: '商户私钥', sensitive: true },
    { key: 'apiV3Key', label: 'API V3 Key', sensitive: true },
    { key: 'publicKey', label: '微信支付公钥', sensitive: true },
    { key: 'publicKeyId', label: '公钥 ID', sensitive: false, optional: true },
    { key: 'certSerial', label: '证书序列号', sensitive: false, optional: true },
  ],
  stripe: [
    { key: 'secretKey', label: 'Secret Key', sensitive: true },
    { key: 'publishableKey', label: 'Publishable Key', sensitive: false },
    { key: 'webhookSecret', label: 'Webhook Secret', sensitive: true },
  ],
  creem: [
    { key: 'apiKey', label: 'API Key', sensitive: true },
    { key: 'webhookSecret', label: 'Webhook Secret', sensitive: true },
    { key: 'productAmounts', label: '面额映射 (金额=产品ID，逗号分隔)', sensitive: false },
    { key: 'successUrl', label: 'Success URL', sensitive: false, optional: true },
    { key: 'testMode', label: '测试模式 (true/false)', sensitive: false, optional: true, defaultValue: 'false' },
  ],
  tegro: [
    { key: 'shopId', label: 'Shop ID', sensitive: false },
    { key: 'secretKey', label: 'Secret Key', sensitive: true },
    { key: 'paymentSystem', label: '支付系统 ID (payment_system)', sensitive: false },
    { key: 'currency', label: '币种 (USD/RUB/EUR)', sensitive: false, optional: true, defaultValue: 'USD' },
    { key: 'rate', label: '汇率 (1 USD = ? currency)', sensitive: false, optional: true, defaultValue: '1' },
  ],
};

export function getProviderTypeOptions(
  providerKey: string,
  allPaymentTypes: PaymentProviderOption[]
): PaymentProviderOption[] {
  const supportedTypes = PROVIDER_SUPPORTED_TYPES[providerKey] || [];
  return supportedTypes.map((value) => {
    const matched = allPaymentTypes.find((item) => item.value === value);
    return matched || { value, label: value };
  });
}

export function extractBaseUrl(fullUrl: string, path: string): string {
  if (!fullUrl) return '';
  if (fullUrl.endsWith(path)) {
    return fullUrl.slice(0, -path.length);
  }
  try {
    return new URL(fullUrl).origin;
  } catch {
    return fullUrl;
  }
}
