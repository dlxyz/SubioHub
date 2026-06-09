import { api } from '@/lib/api';

export type PaymentMethodLimit = {
  daily_limit: number;
  daily_used: number;
  daily_remaining: number;
  single_min: number;
  single_max: number;
  fee_rate: number;
  available: boolean;
};

export type CheckoutPlan = {
  id: number;
  group_id: number;
  group_platform?: string;
  group_name?: string;
  rate_multiplier?: number;
  daily_limit_usd?: number | null;
  weekly_limit_usd?: number | null;
  monthly_limit_usd?: number | null;
  supported_model_scopes?: string[];
  name: string;
  description: string;
  price: number;
  original_price?: number | null;
  validity_days: number;
  validity_unit: string;
  features: string[];
  product_name?: string;
};

export type CheckoutInfo = {
  methods: Record<string, PaymentMethodLimit>;
  global_min: number;
  global_max: number;
  plans: CheckoutPlan[];
  balance_disabled: boolean;
  balance_recharge_multiplier: number;
  recharge_fee_rate: number;
  help_text: string;
  help_image_url: string;
  stripe_publishable_key: string;
};

export type CreateOrderPayload = {
  amount: number;
  payment_type: string;
  order_type: 'balance' | 'subscription';
  plan_id?: number;
};

export type CreateOrderResult = {
  order_id: number;
  amount: number;
  pay_url?: string;
  qr_code?: string;
  client_secret?: string;
  pay_amount: number;
  fee_rate: number;
  expires_at: string;
  payment_mode?: string;
};

export type PaymentOrder = {
  id: number;
  user_id: number;
  amount: number;
  pay_amount: number;
  fee_rate: number;
  payment_type: string;
  out_trade_no: string;
  status:
    | 'PENDING'
    | 'PAID'
    | 'RECHARGING'
    | 'COMPLETED'
    | 'EXPIRED'
    | 'CANCELLED'
    | 'FAILED'
    | 'REFUND_REQUESTED'
    | 'REFUNDING'
    | 'PARTIALLY_REFUNDED'
    | 'REFUNDED'
    | 'REFUND_FAILED';
  order_type: 'balance' | 'subscription';
  created_at: string;
  expires_at: string;
  paid_at?: string;
  completed_at?: string;
  refund_amount: number;
  refund_reason?: string;
  refund_requested_at?: string;
  refund_request_reason?: string;
  plan_id?: number;
  provider_instance_id?: string;
};

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type RedeemHistoryItem = {
  id: number;
  code: string;
  type: string;
  value: number;
  status: string;
  used_at?: string | null;
  created_at: string;
  notes?: string | null;
  validity_days?: number;
  group?: {
    id: number;
    name: string;
  } | null;
};

type CurrentUserProfile = {
  id: number;
  email: string;
  username?: string;
  role: string;
  balance: number;
  concurrency: number;
  invite_code?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function normalizePaginated<T>(payload: unknown): PaginatedResult<T> {
  const record = asRecord(payload);
  const items = Array.isArray(record?.items) ? (record.items as T[]) : [];
  return {
    items,
    total: Number(record?.total ?? items.length ?? 0),
    page: Number(record?.page ?? 1),
    pageSize: Number(record?.page_size ?? items.length ?? 0),
  };
}

export async function getCheckoutInfo(): Promise<CheckoutInfo> {
  return (await api.get('/payment/checkout-info')) as CheckoutInfo;
}

export async function createPaymentOrder(payload: CreateOrderPayload): Promise<CreateOrderResult> {
  return (await api.post('/payment/orders', payload)) as CreateOrderResult;
}

export async function redeemCode(code: string): Promise<RedeemHistoryItem> {
  return (await api.post('/redeem', { code })) as RedeemHistoryItem;
}

export async function getRedeemHistory(): Promise<RedeemHistoryItem[]> {
  const payload = (await api.get('/redeem/history')) as unknown;
  return Array.isArray(payload) ? (payload as RedeemHistoryItem[]) : [];
}

export async function getCurrentUserProfile(): Promise<CurrentUserProfile> {
  return (await api.get('/users/me')) as CurrentUserProfile;
}

export async function listMyOrders(params: {
  page?: number;
  pageSize?: number;
  status?: string;
} = {}): Promise<PaginatedResult<PaymentOrder>> {
  const payload = (await api.get('/payment/orders/my', {
    params: {
      page: params.page ?? 1,
      page_size: params.pageSize ?? 20,
      status: params.status || undefined,
    },
  })) as unknown;
  return normalizePaginated<PaymentOrder>(payload);
}

export async function cancelMyOrder(id: number): Promise<{ message?: string }> {
  const payload = (await api.post(`/payment/orders/${id}/cancel`)) as unknown;
  const record = asRecord(payload);
  return record ? { message: typeof record.message === 'string' ? record.message : undefined } : {};
}

export async function requestOrderRefund(id: number, reason: string): Promise<{ message?: string }> {
  const payload = (await api.post(`/payment/orders/${id}/refund-request`, { reason })) as unknown;
  const record = asRecord(payload);
  return record ? { message: typeof record.message === 'string' ? record.message : undefined } : {};
}

export async function getRefundEligibleProviders(): Promise<string[]> {
  const payload = (await api.get('/payment/orders/refund-eligible-providers')) as unknown;
  const record = asRecord(payload);
  return Array.isArray(record?.provider_instance_ids) ? (record.provider_instance_ids as string[]) : [];
}
