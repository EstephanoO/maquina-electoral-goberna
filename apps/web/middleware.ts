/**
 * GOBERNA — Next.js Middleware
 *
 * Server-side route protection + security headers.
 * Runs at the edge BEFORE any page content is served.
 *
 * - Dashboard routes require the `goberna_session` cookie (set by backend on login)
 * - Public routes (/, /login, /register, /onboarding, /mapa) are open
 * - Security headers are added to all responses
 */
import { NextRequest, NextResponse } from "next/server";

// ── Routes that require authentication ──────────────────────────────
const PROTECTED_PREFIXES = [
  "/home",
  "/candidatos",
  "/cms",
  "/cms-metrics",
  "/equipo",
  "/formularios",
  "/map",
  "/ops",
  "/settings",
];

// ── Public routes (no auth required) ────────────────────────────────
const PUBLIC_PATHS = new Set(["/", "/login", "/register", "/onboarding", "/descargar", "/extension", "/voluntarios", "/extension-monitor"]);

function isProtectedRoute(pathname: string): boolean {
  // Exact public paths
  if (PUBLIC_PATHS.has(pathname)) return false;

  // Public prefixes
  if (pathname.startsWith("/mapa")) return false;
  if (pathname.startsWith("/invite")) return false;

  // Static assets / API / internal Next.js routes — skip middleware
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/uploads/") ||
    pathname.includes(".")
  ) {
    return false;
  }

  // Check protected prefixes
  for (const prefix of PROTECTED_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return true;
    }
  }

  // FAIL-CLOSED: unknown routes are protected by default.
  // Only explicitly listed public paths/prefixes bypass auth.
  return true;
}

// ── Security headers ────────────────────────────────────────────────
const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
  "X-DNS-Prefetch-Control": "on",
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check auth for protected routes
  if (isProtectedRoute(pathname)) {
    const sessionCookie = request.cookies.get("goberna_session");

    if (!sessionCookie?.value) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Add security headers to all responses
  const response = NextResponse.next();

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  return response;
}

export const config = {
  // Run middleware on all routes except static files and API
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
