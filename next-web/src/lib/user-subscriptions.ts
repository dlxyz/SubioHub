import { api } from '@/lib/api';

export type SubscriptionGroup = {
  id: number;
  name: string;
  platform?: string;
  description?: string;
  daily_limit_usd?: number | null;
  weekly_limit_usd?: number | null;
  monthly_limit_usd?: number | null;
  rate_multiplier?: number | null;
  supported_model_scopes?: string[];
};

export type UserSubscription = {
  id: number;
  user_id: number;
  group_id: number;
  starts_at: string;
  expires_at: string;
  status: 'active' | 'expired' | 'revoked';
  daily_window_start?: string | null;
  weekly_window_start?: string | null;
  monthly_window_start?: string | null;
  daily_usage_usd: number;
  weekly_usage_usd: number;
  monthly_usage_usd: number;
  created_at: string;
  updated_at: string;
  group?: SubscriptionGroup | null;
};

export type SubscriptionProgressWindow = {
  used: number;
  limit: number | null;
  percentage: number;
  reset_in_seconds: number | null;
};

export type SubscriptionProgressInfo = {
  subscription: UserSubscription;
  progress: {
    daily?: SubscriptionProgressWindow | null;
    weekly?: SubscriptionProgressWindow | null;
    monthly?: SubscriptionProgressWindow | null;
    expires_at?: string | null;
    days_remaining?: number | null;
  } | null;
};

export type SubscriptionSummaryItem = {
  id: number;
  group_id: number;
  group_name: string;
  status: string;
  daily_used_usd: number;
  daily_limit_usd: number;
  weekly_used_usd: number;
  weekly_limit_usd: number;
  monthly_used_usd: number;
  monthly_limit_usd: number;
  expires_at?: string | null;
};

export type SubscriptionSummary = {
  active_count: number;
  total_used_usd: number;
  subscriptions: SubscriptionSummaryItem[];
};

export async function listUserSubscriptions(): Promise<UserSubscription[]> {
  const payload = (await api.get('/subscriptions')) as unknown;
  return Array.isArray(payload) ? (payload as UserSubscription[]) : [];
}

export async function listActiveUserSubscriptions(): Promise<UserSubscription[]> {
  const payload = (await api.get('/subscriptions/active')) as unknown;
  return Array.isArray(payload) ? (payload as UserSubscription[]) : [];
}

export async function getUserSubscriptionProgress(): Promise<SubscriptionProgressInfo[]> {
  const payload = (await api.get('/subscriptions/progress')) as unknown;
  return Array.isArray(payload) ? (payload as SubscriptionProgressInfo[]) : [];
}

export async function getUserSubscriptionSummary(): Promise<SubscriptionSummary> {
  return (await api.get('/subscriptions/summary')) as SubscriptionSummary;
}
