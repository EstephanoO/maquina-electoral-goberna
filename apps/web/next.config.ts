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
      // iOS Universal Links: apple-app-site-association must be served as application/json
      {
        source: "/.well-known/apple-app-site-association",
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
        // Pretty share URL para QR de referido. Mobile comparte /r/:token,
        // que el backend sirve como /api/r/:token (nginx solo rutea /api/*).
        // Va en beforeFiles para que Next.js no intente match contra page route.
        {
          source: "/r/:token",
          destination: `${target}/api/r/:token`,
        },
      ],
    };
  },
};

export default nextConfig;
