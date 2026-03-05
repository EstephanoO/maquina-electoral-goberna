import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "dashboard.grupogoberna.com",
        pathname: "/uploads/**",
      },
      {
        protocol: "https",
        hostname: "api.goberna.us",
        pathname: "/uploads/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        pathname: "/uploads/**",
      },
    ],
  },

  // ── Security headers ──────────────────────────────────────────────
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
      // Android App Links: assetlinks.json must be served as application/json
      {
        source: "/.well-known/assetlinks.json",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
    ];
  },

  // ── API + uploads proxy ───────────────────────────────────────────
  async rewrites() {
    const target = process.env.BACKEND_PROXY_TARGET ?? "https://api.goberna.us";

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
