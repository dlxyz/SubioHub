'use client';

import { Info } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import DashboardPlaceholderPage from '@/components/dashboard/dashboard-placeholder-page';

export default function DashboardAboutPage() {
  const { t, tm } = useI18n();
  return (
    <DashboardPlaceholderPage
      icon={Info}
      title={t('dashboard.pages.placeholders.about.title')}
      description={t('dashboard.pages.placeholders.about.description')}
      highlights={tm<string[]>('dashboard.pages.placeholders.about.highlights')}
      primaryAction={{ label: t('dashboard.pages.placeholders.about.primary'), href: '/dashboard/docs' }}
      secondaryAction={{ label: t('dashboard.pages.placeholders.about.secondary'), href: '/' }}
    />
  );
}
