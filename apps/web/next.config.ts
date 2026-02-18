import type { NextConfig } from "next";

/** Proxy /api/* and /uploads/* to backend VPS via beforeFiles rewrites. */
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "dashboard.grupogoberna.com",
        pathname: "/uploads/**",
      },
      {
        protocol: "http",
        hostname: "161.132.39.165",
        pathname: "/uploads/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        pathname: "/uploads/**",
      },
    ],
  },
  async rewrites() {
    const target = process.env.BACKEND_PROXY_TARGET ?? "http://161.132.39.165";

    return {
      beforeFiles: [
        {
          source: "/api/:path*",
          destination: `${target}/api/:path*`,
        },
        {
          source: "/uploads/:path*",
          destination: `${target}/uploads/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
