'use client';

import { Gift } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import DashboardPlaceholderPage from '@/components/dashboard/dashboard-placeholder-page';

export default function DashboardRedeemPage() {
  const { t, tm } = useI18n();
  return (
    <DashboardPlaceholderPage
      icon={Gift}
      title={t('dashboard.pages.placeholders.redeem.title')}
      description={t('dashboard.pages.placeholders.redeem.description')}
      highlights={tm<string[]>('dashboard.pages.placeholders.redeem.highlights')}
      primaryAction={{ label: t('dashboard.pages.placeholders.redeem.primary'), href: '/dashboard/finance' }}
      secondaryAction={{ label: t('dashboard.pages.placeholders.redeem.secondary'), href: '/dashboard/orders' }}
    />
  );
}
