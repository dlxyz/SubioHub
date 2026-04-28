import type { NextConfig } from "next";

const backendOrigin =
  process.env.NEXT_SERVER_API_ORIGIN?.trim() || "http://localhost:8080";

const nextConfig: NextConfig = {
  output: 'standalone',
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
