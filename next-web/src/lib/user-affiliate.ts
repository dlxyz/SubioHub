import { api } from '@/lib/api';

type ApiRecord = Record<string, unknown>;

export type AffiliateInfo = {
  user_id?: number;
  invite_code: string;
  commission_rate: number;
  commission_balance: number;
  total_commission_earned: number;
  pending_amount: number;
};

export type AffiliateCommissionLog = {
  id: number;
  user_id: number;
  invitee_id: number | null;
  order_id: number | null;
  amount: number;
  status: string;
  reason: string;
  created_at?: string;
  updated_at?: string;
};

export type AffiliateCommissionListResult = {
  items: AffiliateCommissionLog[];
  total: number;
  page: number;
  pageSize: number;
};

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as ApiRecord) : null;
}

function getValue(record: ApiRecord | null, ...keys: string[]) {
  if (!record) return undefined;
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return undefined;
}

function normalizeCommissionLog(payload: unknown): AffiliateCommissionLog {
  const record = asRecord(payload);
  const inviteeID = getValue(record, 'invitee_id', 'InviteeID');
  const orderID = getValue(record, 'order_id', 'OrderID');
  return {
    id: Number(getValue(record, 'id', 'ID') ?? 0),
    user_id: Number(getValue(record, 'user_id', 'UserID') ?? 0),
    invitee_id: inviteeID == null ? null : Number(inviteeID),
    order_id: orderID == null ? null : Number(orderID),
    amount: Number(getValue(record, 'amount', 'Amount') ?? 0),
    status: String(getValue(record, 'status', 'Status') ?? ''),
    reason: String(getValue(record, 'reason', 'Reason') ?? ''),
    created_at: getValue(record, 'created_at', 'CreatedAt') as string | undefined,
    updated_at: getValue(record, 'updated_at', 'UpdatedAt') as string | undefined,
  };
}

export async function getAffiliateInfo() {
  return (await api.get('/affiliate/info')) as AffiliateInfo;
}

export async function transferAffiliateCommission(amount: number) {
  return (await api.post('/affiliate/transfer', { amount })) as { message?: string };
}

export async function listAffiliateCommissionLogs(page = 1, pageSize = 10): Promise<AffiliateCommissionListResult> {
  const payload = (await api.get('/affiliate/logs', {
    params: { page, page_size: pageSize },
  })) as unknown;
  const record = asRecord(payload);
  const list = Array.isArray(record?.data) ? record.data : [];
  const pagination = asRecord(record?.pagination);
  return {
    items: list.map((item) => normalizeCommissionLog(item)),
    total: Number(getValue(record, 'total', 'count') ?? getValue(pagination, 'total', 'Total') ?? list.length),
    page: Number(getValue(record, 'page', 'Page') ?? getValue(pagination, 'page', 'Page') ?? page),
    pageSize: Number(
      getValue(record, 'page_size', 'PageSize') ?? getValue(pagination, 'page_size', 'PageSize') ?? pageSize
    ),
  };
}
