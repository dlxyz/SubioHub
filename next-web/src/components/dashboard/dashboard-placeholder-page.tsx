'use client';

import Link from 'next/link';
import { ArrowRight, LucideIcon, Sparkles } from 'lucide-react';

type DashboardPlaceholderPageProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  highlights: string[];
  primaryAction?: {
    label: string;
    href: string;
  };
  secondaryAction?: {
    label: string;
    href: string;
  };
};

export default function DashboardPlaceholderPage({
  icon: Icon,
  title,
  description,
  highlights,
  primaryAction,
  secondaryAction,
}: DashboardPlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#161616]">
        <div className="bg-[linear-gradient(135deg,rgba(59,130,246,0.10),rgba(147,51,234,0.10))] px-6 py-8 dark:bg-[linear-gradient(135deg,rgba(59,130,246,0.18),rgba(147,51,234,0.14))]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/80 text-blue-600 shadow-sm dark:bg-black/20 dark:text-blue-300">
                <Icon className="h-7 w-7" />
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">{title}</h1>
              <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">{description}</p>
            </div>

            {(primaryAction || secondaryAction) && (
              <div className="flex flex-wrap items-center gap-3">
                {primaryAction ? (
                  <Link
                    href={primaryAction.href}
                    className="inline-flex items-center rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
                  >
                    {primaryAction.label}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                ) : null}
                {secondaryAction ? (
                  <Link
                    href={secondaryAction.href}
                    className="inline-flex items-center rounded-2xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    {secondaryAction.label}
                  </Link>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 px-6 py-6 md:grid-cols-2 xl:grid-cols-3">
          {highlights.map((item) => (
            <div key={item} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-[#111111]">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-xl bg-blue-100 p-2 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="text-sm leading-6 text-gray-600 dark:text-gray-300">{item}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
