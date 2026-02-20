"use client";

import { AuthProvider, useAuth } from "../../lib/auth-context";
import { QueryProvider } from "../../lib/query-provider";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { useEffect, useRef, useState, useCallback } from "react";

// ── Nav items ───────────────────────────────────────────────────────

/**
 * UI role derived from backend role.
 * Backend roles: admin | consultor | jefe_campana | candidato | brigadista_zonal | agente_campo
 * UI mapping:
 *   admin                    → "admin"      (platform-wide control)
 *   consultor                → "consultor"  (external consultant — restricted data views)
 *   jefe_campana | candidato → "candidato"  (campaign owner — sees their own data)
 *   brigadista_zonal         → "agente"     (field coordinator — minimal web access)
 *   agente_campo             → "agente"     (field agent — minimal web access)
 */
type UIRole = "admin" | "consultor" | "candidato" | "agente";

function mapBackendRoleToUI(backendRole: string): UIRole {
  switch (backendRole) {
    case "admin":
      return "admin";
    case "consultor":
      return "consultor";
    case "supervisor":  // legacy alias
    case "jefe_campana":
    case "candidato":
      return "candidato";
    default:
      return "agente";
  }
}

type NavItem = {
  icon: React.ReactNode;
  label: string;
  /** Static href or function that receives campaign slug for dynamic routes */
  href: string | ((campaignSlug: string) => string);
  roles: UIRole[];
  section?: "main" | "admin";
};

const NAV_ITEMS: NavItem[] = [
  { icon: <AgentsIcon />, label: "Equipo", href: "/equipo", roles: ["admin", "candidato"], section: "main" },
  { icon: <DashboardIcon />, label: "Dashboard", href: (slug) => `/candidatos/${slug}/tierra`, roles: ["admin", "candidato", "consultor"], section: "main" },
  { icon: <CandidatosIcon />, label: "Candidatos", href: "/candidatos", roles: ["admin"], section: "admin" },
  { icon: <FormulariosIcon />, label: "Formularios", href: "/formularios", roles: ["admin"], section: "main" },
  { icon: <CMSIcon />, label: "CMS", href: "/cms", roles: ["admin", "candidato", "consultor"], section: "main" },
  // Metricas CMS: admin accede por ruta global; candidato/consultor acceden via /candidatos/[slug]/cms-metrics desde el dashboard
  { icon: <CmsMetricsIcon />, label: "Metricas CMS", href: "/cms-metrics", roles: ["admin"], section: "main" },
  // Consultor: acceso directo a dashboards de la campaña activa via sidebar
  { icon: <DigitalIcon />, label: "Analytics", href: (slug) => `/candidatos/${slug}/analytics`, roles: ["consultor"], section: "main" },
  { icon: <CmsMetricsIcon />, label: "Digital", href: (slug) => `/candidatos/${slug}/cms-metrics`, roles: ["consultor"], section: "main" },
  // /ops exists but is hidden from nav — access via direct URL only
  // { icon: <OpsIcon />, label: "Operaciones", href: "/ops", roles: ["admin"], section: "admin" },
  // Configuracion se renderiza como item fijo al fondo del sidebar (fuera del nav scrolleable)
];

// ── Simple SVG icons ────────────────────────────────────────────────

function MapIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <title>Mapa</title>
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <title>Dashboard</title>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function AgentsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <title>Agentes</title>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function SurveysIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <title>Encuestas</title>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function OpsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <title>Operaciones</title>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function CandidatosIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <title>Candidatos</title>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
      <path d="M12 11v4" />
      <path d="M8 15h8" />
    </svg>
  );
}

function FormulariosIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <title>Formularios</title>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}

function CMSIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <title>CMS</title>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="9" y1="9" x2="15" y2="9" />
      <line x1="9" y1="13" x2="13" y2="13" />
    </svg>
  );
}

function CmsMetricsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <title>Metricas CMS</title>
      <path d="M18 20V10" />
      <path d="M12 20V4" />
      <path d="M6 20v-6" />
    </svg>
  );
}

function DigitalIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <title>Digital</title>
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <title>Configuracion</title>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51-1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <title>Menu</title>
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <title>Cerrar</title>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{
        transform: collapsed ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.2s ease",
      }}
    >
      <title>Colapsar</title>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <title>Cerrar sesion</title>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      style={{
        flexShrink: 0,
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.15s ease",
      }}
    >
      <title>Expandir</title>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ── Loading screen ──────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#ffffff",
        zIndex: 9999,
        gap: "24px",
      }}
    >
      <Image
        src="/isotipo(2).jpg"
        alt="GOBERNA"
        width={64}
        height={64}
        style={{ borderRadius: "var(--radius-md)" }}
        priority
      />
      <div
        style={{
          width: "36px",
          height: "36px",
          border: "3px solid var(--goberna-blue-100)",
          borderTopColor: "var(--goberna-blue-900)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <span
        style={{
          fontFamily: "var(--font-montserrat), system-ui, sans-serif",
          fontSize: "13px",
          fontWeight: 600,
          letterSpacing: "2px",
          color: "var(--goberna-gold)",
        }}
      >
        GOBERNA
      </span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Sidebar state persistence ───────────────────────────────────────

const SIDEBAR_STORAGE_KEY = "goberna_sidebar_collapsed";

function readSidebarPref(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSidebarPref(collapsed: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "1" : "0");
  } catch { /* noop */ }
}

// ── Sidebar constants ───────────────────────────────────────────────

const SIDEBAR_W_EXPANDED = 260;
const SIDEBAR_W_COLLAPSED = 72;
const MOBILE_BREAKPOINT = 768;

// ── Dashboard shell (inner, needs AuthProvider above) ───────────────

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, campaigns, activeCampaignId, setActiveCampaign, isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // ── Sidebar state ─────────────────────────────────────────
  const [collapsed, setCollapsed] = useState(() => readSidebarPref());
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [campaignDropdownOpen, setCampaignDropdownOpen] = useState(false);

  // Derive UI role from the authenticated user's backend role
  const uiRole: UIRole = mapBackendRoleToUI(user?.role ?? "agent");

  // Immersive routes auto-collapse the sidebar (user can still toggle)
  const isImmersiveRoute = pathname.includes("/tierra");

  // The effective collapsed state: on immersive routes, default to collapsed
  // but don't lock it — user can still expand temporarily
  const showCollapsed = isMobile ? true : (isImmersiveRoute ? true : collapsed);
  const showLabel = !showCollapsed || mobileOpen;
  const sidebarWidth = showCollapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED;

  // Persist preference (only for non-immersive toggling)
  const handleToggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      writeSidebarPref(next);
      return next;
    });
  }, []);

  // Track viewport width for mobile detection (avoids SSR window access)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  // Close mobile sidebar on route change
  const prevPathname = useRef(pathname);
  useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      setMobileOpen(false);
      setCampaignDropdownOpen(false);
    }
  });

  const handleLogout = useCallback(async () => {
    await logout();
    router.replace("/login");
  }, [logout, router]);

  const activeCampaign = campaigns.find((c) => c.id === activeCampaignId);
  const isAdmin = user?.role === "admin";

  // Resolve dynamic hrefs (e.g., Tierra/Digital for consultor use campaign slug)
  const campaignSlug = activeCampaign?.slug ?? "";
  const resolveHref = (href: string | ((slug: string) => string)): string =>
    typeof href === "function" ? href(campaignSlug) : href;

  const filteredNav = NAV_ITEMS
    .filter((item) => item.roles.includes(uiRole))
    // Hide dynamic-href items when there's no active campaign slug
    .filter((item) => typeof item.href === "string" || campaignSlug);
  const mainNav = filteredNav.filter((item) => item.section === "main");
  const adminNav = filteredNav.filter((item) => item.section === "admin");

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <LoadingScreen />;

  // ── Render helper for nav buttons ──
  const renderNavButton = (item: NavItem, href: string) => {
    const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
    const isHovered = hoveredItem === href;
    const showText = showLabel;

    return (
      <button
        type="button"
        key={href}
        onClick={() => router.push(href)}
        onMouseEnter={() => setHoveredItem(href)}
        onMouseLeave={() => setHoveredItem(null)}
        title={showText ? undefined : item.label}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          padding: showText ? "11px 20px" : "11px 0",
          justifyContent: showText ? "flex-start" : "center",
          background: isActive
            ? "rgba(255,255,255,0.12)"
            : isHovered
              ? "rgba(255,255,255,0.06)"
              : "transparent",
          border: "none",
          borderLeft: isActive ? "3px solid var(--goberna-gold)" : "3px solid transparent",
          color: isActive ? "var(--goberna-gold)" : isHovered ? "#ffffff" : "rgba(255,255,255,0.7)",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: isActive ? 600 : 500,
          fontFamily: "inherit",
          transition: "all 0.15s ease",
          whiteSpace: "nowrap",
          textAlign: "left",
        }}
      >
        <span style={{ flexShrink: 0, display: "flex", alignItems: "center", width: 20, justifyContent: "center" }}>
          {item.icon}
        </span>
        {showText && <span>{item.label}</span>}
      </button>
    );
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--color-background)" }}>
      {/* ── Mobile overlay ──────────────────────────────────────── */}
      {mobileOpen && (
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Cerrar menu"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 998,
            transition: "opacity 0.2s ease",
            border: "none",
            cursor: "pointer",
            width: "100%",
            height: "100%",
            backdropFilter: "blur(2px)",
          }}
        />
      )}

      {/* ── Sidebar ────────────────────────────────────────────── */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: mobileOpen ? SIDEBAR_W_EXPANDED : sidebarWidth,
          background: "var(--goberna-blue-900)",
          color: "#ffffff",
          display: isMobile && !mobileOpen ? "none" : "flex",
          flexDirection: "column",
          transition: "width 0.2s cubic-bezier(0.4,0,0.2,1)",
          zIndex: 999,
          boxShadow: mobileOpen ? "4px 0 24px rgba(0,0,0,0.25)" : "2px 0 8px rgba(0,0,0,0.1)",
          overflow: "hidden",
        }}
      >
        {/* Logo area */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: showLabel ? 12 : 0,
            padding: showLabel ? "16px 20px" : "16px 0",
            justifyContent: showLabel ? "flex-start" : "center",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            minHeight: 64,
            flexShrink: 0,
          }}
        >
          <Image
            src="/isotipo(2).jpg"
            alt="GOBERNA"
            width={32}
            height={32}
            style={{ borderRadius: 6, flexShrink: 0 }}
          />
          {showLabel && (
            <span
              style={{
                fontWeight: 800,
                fontSize: 16,
                letterSpacing: 3,
                color: "var(--goberna-gold)",
                whiteSpace: "nowrap",
                fontFamily: "var(--font-montserrat), system-ui, sans-serif",
              }}
            >
              GOBERNA
            </span>
          )}

          {/* Mobile close button */}
          {mobileOpen && (
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              style={{
                marginLeft: "auto",
                background: "rgba(255,255,255,0.08)",
                border: "none",
                borderRadius: 6,
                color: "rgba(255,255,255,0.7)",
                cursor: "pointer",
                padding: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 0.15s ease",
              }}
              aria-label="Cerrar menu"
            >
              <CloseIcon />
            </button>
          )}
        </div>

        {/* Nav links */}
        <nav
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "8px 0",
          }}
        >
          {mainNav.map((item) => renderNavButton(item, resolveHref(item.href)))}

          {/* Admin section separator */}
          {adminNav.length > 0 && (
            <div
              style={{
                margin: "8px 0 4px",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                padding: showLabel ? "10px 20px 0" : "10px 0 0",
              }}
            >
              {showLabel && (
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "rgba(255,255,255,0.3)" }}>
                  Administracion
                </span>
              )}
            </div>
          )}

          {adminNav.map((item) => renderNavButton(item, resolveHref(item.href)))}
        </nav>

        {/* ── Bottom section ────────────────────────────────────── */}
        <div style={{ flexShrink: 0 }}>
          {/* Configuracion */}
          {(() => {
            const settingsRoles: UIRole[] = ["admin", "candidato"];
            if (!settingsRoles.includes(uiRole)) return null;
            const href = "/settings";
            const isActive = pathname === href || pathname.startsWith(href);
            const isHovered = hoveredItem === "__settings__";
            return (
              <button
                type="button"
                onClick={() => router.push(href)}
                onMouseEnter={() => setHoveredItem("__settings__")}
                onMouseLeave={() => setHoveredItem(null)}
                title={showLabel ? undefined : "Configuracion"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  padding: showLabel ? "11px 20px" : "11px 0",
                  justifyContent: showLabel ? "flex-start" : "center",
                  background: isActive
                    ? "rgba(255,255,255,0.12)"
                    : isHovered
                      ? "rgba(255,255,255,0.06)"
                      : "transparent",
                  border: "none",
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  borderLeft: isActive ? "3px solid var(--goberna-gold)" : "3px solid transparent",
                  color: isActive ? "var(--goberna-gold)" : isHovered ? "#ffffff" : "rgba(255,255,255,0.5)",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  fontFamily: "inherit",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                }}
                aria-label="Configuracion"
              >
                <span style={{ flexShrink: 0, display: "flex", alignItems: "center", width: 20, justifyContent: "center" }}>
                  <SettingsIcon />
                </span>
                {showLabel && <span>Configuracion</span>}
              </button>
            );
          })()}

          {/* Campaign selector */}
          {showLabel && campaigns.length > 1 && (
            <div
              style={{
                padding: "10px 16px",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                position: "relative",
              }}
            >
              <button
                type="button"
                onClick={() => setCampaignDropdownOpen((o) => !o)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "var(--radius-sm)",
                  color: "#ffffff",
                  fontSize: 12,
                  fontWeight: 500,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  transition: "background 0.15s ease",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {activeCampaign?.name ?? "Seleccionar campana"}
                </span>
                <ChevronIcon open={campaignDropdownOpen} />
              </button>

              {campaignDropdownOpen && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "100%",
                    left: 16,
                    right: 16,
                    background: "var(--goberna-blue-800)",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    boxShadow: "0 -4px 12px rgba(0,0,0,0.3)",
                    maxHeight: 200,
                    overflowY: "auto",
                    zIndex: 10,
                  }}
                >
                  {campaigns.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => {
                        setActiveCampaign(c.id);
                        setCampaignDropdownOpen(false);
                      }}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        background: c.id === activeCampaignId ? "rgba(255,200,0,0.1)" : "transparent",
                        border: "none",
                        color: c.id === activeCampaignId ? "var(--goberna-gold)" : "rgba(255,255,255,0.8)",
                        fontSize: 12,
                        fontWeight: c.id === activeCampaignId ? 600 : 400,
                        fontFamily: "inherit",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "background 0.1s ease",
                      }}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Collapse toggle (desktop only, not shown on mobile) */}
          {!isMobile && (
            <button
              type="button"
              onClick={handleToggleCollapse}
              title={showCollapsed ? "Expandir menu" : "Colapsar menu"}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "10px 20px",
                background: "none",
                border: "none",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.4)",
                cursor: "pointer",
                fontSize: 12,
                fontFamily: "inherit",
                transition: "color 0.15s ease",
                width: "100%",
              }}
              aria-label={showCollapsed ? "Expandir menu" : "Colapsar menu"}
              onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
            >
              <CollapseIcon collapsed={showCollapsed} />
              {!showCollapsed && <span>Colapsar</span>}
            </button>
          )}

          {/* User info */}
          <div
            style={{
              padding: showLabel ? "12px 20px" : "12px 0",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: showLabel ? "flex-start" : "center",
              flexDirection: showLabel ? "row" : "column",
              gap: 10,
              justifyContent: showLabel ? "flex-start" : "center",
            }}
          >
            {/* Avatar circle */}
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "var(--goberna-blue-700)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--goberna-gold)",
                flexShrink: 0,
              }}
            >
              {user?.full_name?.charAt(0)?.toUpperCase() ?? "?"}
            </div>

            {showLabel && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#ffffff",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {user?.full_name ?? "Usuario"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      padding: "2px 6px",
                      borderRadius: 3,
                      background: isAdmin ? "var(--goberna-gold)" : "rgba(255,255,255,0.15)",
                      color: isAdmin ? "var(--goberna-blue-950)" : "rgba(255,255,255,0.7)",
                    }}
                  >
                    {uiRole}
                  </span>
                  <button
                    type="button"
                    onClick={handleLogout}
                    style={{
                      background: "none",
                      border: "none",
                      color: "rgba(255,255,255,0.4)",
                      cursor: "pointer",
                      padding: 2,
                      display: "flex",
                      alignItems: "center",
                      transition: "color 0.15s ease",
                    }}
                    title="Cerrar sesion"
                    aria-label="Cerrar sesion"
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#ffffff"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
                  >
                    <LogoutIcon />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Mobile hamburger (only visible on mobile) ──────────── */}
      {isMobile && !mobileOpen && (
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          style={{
            position: "fixed",
            top: 12,
            left: 12,
            zIndex: 997,
            width: 44,
            height: 44,
            borderRadius: "var(--radius-md)",
            background: "var(--goberna-blue-900)",
            border: "none",
            color: "#ffffff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "var(--shadow-md)",
          }}
          aria-label="Abrir menu"
        >
          <MenuIcon />
        </button>
      )}

      {/* ── Main content ───────────────────────────────────────── */}
      <main
        style={{
          flex: 1,
          marginLeft: isMobile ? 0 : sidebarWidth,
          padding: isImmersiveRoute ? 0 : isMobile ? "68px 16px 16px" : 24,
          transition: "margin-left 0.2s cubic-bezier(0.4,0,0.2,1)",
          minHeight: "100vh",
          overflow: isImmersiveRoute ? "hidden" : undefined,
        }}
      >
        {children}
      </main>
    </div>
  );
}

// ── Exported layout wraps with AuthProvider ─────────────────────────

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>
        <DashboardShell>{children}</DashboardShell>
      </AuthProvider>
    </QueryProvider>
  );
}
