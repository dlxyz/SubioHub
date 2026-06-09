import { api } from '@/lib/api';

export type NotifyEmailEntry = {
  email: string;
  disabled: boolean;
  verified: boolean;
};

export type UserProfile = {
  id: number;
  email: string;
  username: string;
  invite_code: string;
  role: string;
  balance: number;
  concurrency: number;
  status: string;
  allowed_groups: number[];
  created_at: string;
  updated_at: string;
  balance_notify_enabled: boolean;
  balance_notify_threshold_type?: string;
  balance_notify_threshold?: number | null;
  balance_notify_extra_emails: NotifyEmailEntry[];
  total_recharged?: number;
};

export type UpdateUserProfilePayload = {
  username?: string;
  balance_notify_enabled?: boolean;
  balance_notify_threshold?: number | null;
};

export type TotpStatus = {
  enabled: boolean;
  enabled_at?: number;
  feature_enabled: boolean;
};

export type TotpVerificationMethod = {
  method: 'email' | 'password';
};

export type TotpSetupPayload = {
  email_code?: string;
  password?: string;
};

export type TotpSetupResult = {
  secret: string;
  qr_code_url: string;
  setup_token: string;
  countdown: number;
};

export type TotpEnablePayload = {
  totp_code: string;
  setup_token: string;
};

export type TotpDisablePayload = {
  email_code?: string;
  password?: string;
};

export async function getUserProfile() {
  return (await api.get('/user/profile')) as UserProfile;
}

export async function updateUserProfile(payload: UpdateUserProfilePayload) {
  return (await api.put('/user', payload)) as UserProfile;
}

export async function changeUserPassword(oldPassword: string, newPassword: string) {
  return (await api.put('/user/password', {
    old_password: oldPassword,
    new_password: newPassword,
  })) as { message: string };
}

export async function sendNotifyEmailCode(email: string) {
  return (await api.post('/user/notify-email/send-code', { email })) as { message?: string };
}

export async function verifyNotifyEmail(email: string, code: string) {
  return (await api.post('/user/notify-email/verify', { email, code })) as UserProfile;
}

export async function removeNotifyEmail(email: string) {
  return (await api.delete('/user/notify-email', { data: { email } })) as UserProfile;
}

export async function toggleNotifyEmail(email: string, disabled: boolean) {
  return (await api.put('/user/notify-email/toggle', { email, disabled })) as UserProfile;
}

export async function getTotpStatus() {
  return (await api.get('/user/totp/status')) as TotpStatus;
}

export async function getTotpVerificationMethod() {
  return (await api.get('/user/totp/verification-method')) as TotpVerificationMethod;
}

export async function sendTotpVerifyCode() {
  return (await api.post('/user/totp/send-code')) as { success: boolean };
}

export async function initiateTotpSetup(payload?: TotpSetupPayload) {
  return (await api.post('/user/totp/setup', payload || {})) as TotpSetupResult;
}

export async function enableTotp(payload: TotpEnablePayload) {
  return (await api.post('/user/totp/enable', payload)) as { success: boolean };
}

export async function disableTotp(payload: TotpDisablePayload) {
  return (await api.post('/user/totp/disable', payload)) as { success: boolean };
}
