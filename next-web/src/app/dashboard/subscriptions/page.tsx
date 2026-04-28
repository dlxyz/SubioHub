'use client';

import { CreditCard } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import DashboardPlaceholderPage from '@/components/dashboard/dashboard-placeholder-page';

export default function DashboardSubscriptionsPage() {
  const { t, tm } = useI18n();
  return (
    <DashboardPlaceholderPage
      icon={CreditCard}
      title={t('dashboard.pages.placeholders.subscriptions.title')}
      description={t('dashboard.pages.placeholders.subscriptions.description')}
      highlights={tm<string[]>('dashboard.pages.placeholders.subscriptions.highlights')}
      primaryAction={{ label: t('dashboard.pages.placeholders.subscriptions.primary'), href: '/dashboard/plans' }}
      secondaryAction={{ label: t('dashboard.pages.placeholders.subscriptions.secondary'), href: '/dashboard/finance' }}
    />
  );
}
