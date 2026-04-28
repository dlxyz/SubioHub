'use client';

import { ReceiptText } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import DashboardPlaceholderPage from '@/components/dashboard/dashboard-placeholder-page';

export default function DashboardOrdersPage() {
  const { t, tm } = useI18n();
  return (
    <DashboardPlaceholderPage
      icon={ReceiptText}
      title={t('dashboard.pages.placeholders.orders.title')}
      description={t('dashboard.pages.placeholders.orders.description')}
      highlights={tm<string[]>('dashboard.pages.placeholders.orders.highlights')}
      primaryAction={{ label: t('dashboard.pages.placeholders.orders.primary'), href: '/dashboard/plans' }}
      secondaryAction={{ label: t('dashboard.pages.placeholders.orders.secondary'), href: '/dashboard/finance' }}
    />
  );
}
