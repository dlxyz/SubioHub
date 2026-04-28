import type { MetadataRoute } from 'next';
import { getMetadataBase } from '@/i18n/seo';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getMetadataBase();

  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: new URL('/sitemap.xml', baseUrl).toString(),
    host: baseUrl.toString(),
  };
}
