'use client';

import { PackageCheck } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import DashboardPlaceholderPage from '@/components/dashboard/dashboard-placeholder-page';

export default function DashboardPlansPage() {
  const { t, tm } = useI18n();
  return (
    <DashboardPlaceholderPage
      icon={PackageCheck}
      title={t('dashboard.pages.placeholders.plans.title')}
      description={t('dashboard.pages.placeholders.plans.description')}
      highlights={tm<string[]>('dashboard.pages.placeholders.plans.highlights')}
      primaryAction={{ label: t('dashboard.pages.placeholders.plans.primary'), href: '/dashboard/orders' }}
      secondaryAction={{ label: t('dashboard.pages.placeholders.plans.secondary'), href: '/dashboard/subscriptions' }}
    />
  );
}
