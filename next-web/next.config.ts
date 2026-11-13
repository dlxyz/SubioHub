import type { NextConfig } from "next";

const backendOrigin =
  process.env.NEXT_SERVER_API_ORIGIN?.trim() || "http://localhost:8080";

const nextConfig: NextConfig = {
  output: 'standalone',
  async redirects() {
    return [
      // 套餐/充值入口统一指向公开定价页，避免访问旧路径 404。
      { source: '/plans', destination: '/pricing', permanent: true },
      { source: '/recharge', destination: '/pricing', permanent: true },
      { source: '/:locale(zh|en)/plans', destination: '/:locale/pricing', permanent: true },
      { source: '/:locale(zh|en)/recharge', destination: '/:locale/pricing', permanent: true },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${backendOrigin}/api/v1/:path*`, // 代理到 Go 后端
      },
      {
        source: '/setup/:path*',
        destination: `${backendOrigin}/setup/:path*`, // 代理安装向导
      },
    ];
  },
};

export default nextConfig;
