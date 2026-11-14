import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SubioHub - AI API Gateway',
    short_name: 'SubioHub',
    description: '统一的 AI 模型 API 分发管理系统，兼容 OpenAI 协议。',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1d2f71',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
