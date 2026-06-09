import { api } from '@/lib/api';

export type PublicSettings = {
  registration_enabled: boolean;
  email_verify_enabled: boolean;
  promo_code_enabled: boolean;
  password_reset_enabled: boolean;
  invitation_code_enabled: boolean;
  site_name: string;
  site_logo: string;
  site_subtitle: string;
  contact_info?: string;
  balance_low_notify_enabled?: boolean;
  balance_low_notify_threshold?: number;
};

export async function getPublicSettings() {
  return (await api.get('/settings/public')) as PublicSettings;
}
