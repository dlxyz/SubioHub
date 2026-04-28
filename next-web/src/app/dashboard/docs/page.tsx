'use client';

import { BookOpen } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import DashboardPlaceholderPage from '@/components/dashboard/dashboard-placeholder-page';

export default function DashboardDocsPage() {
  const { t, tm } = useI18n();
  return (
    <DashboardPlaceholderPage
      icon={BookOpen}
      title={t('dashboard.pages.placeholders.docs.title')}
      description={t('dashboard.pages.placeholders.docs.description')}
      highlights={tm<string[]>('dashboard.pages.placeholders.docs.highlights')}
      primaryAction={{ label: t('dashboard.pages.placeholders.docs.primary'), href: '/dashboard' }}
      secondaryAction={{ label: t('dashboard.pages.placeholders.docs.secondary'), href: '/dashboard/models' }}
    />
  );
}
