"use client";

import { AuthProvider, useAuth } from "../../lib/auth-context";
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
  { icon: <DashboardIcon />, label: "Dashboard", href: "/", roles: ["admin", "candidato", "consultor"], section: "main" },
  { icon: <CandidatosIcon />, label: "Candidatos", href: "/candidatos", roles: ["admin"], section: "admin" },
  { icon: <AgentsIcon />, label: "Equipo", href: "/equipo", roles: ["admin", "candidato"], section: "main" },
  { icon: <FormulariosIcon />, label: "Formularios", href: "/formularios", roles: ["admin", "candidato"], section: "main" },
  { icon: <CMSIcon />, label: "CMS", href: "/cms", roles: ["admin", "candidato", "consultor"], section: "main" },
  // Metricas CMS: admin accede por ruta global; candidato/consultor acceden via /candidatos/[slug]/cms-metrics desde el dashboard
  { icon: <CmsMetricsIcon />, label: "Metricas CMS", href: "/cms-metrics", roles: ["admin"], section: "main" },
  // Consultor: acceso directo a dashboards de la campaña activa via sidebar
  { icon: <MapIcon />, label: "Territorio", href: (slug) => `/candidatos/${slug}/tierra`, roles: ["consultor"], section: "main" },
  { icon: <DigitalIcon />, label: "Analytics", href: (slug) => `/candidatos/${slug}/analytics`, roles: ["consultor"], section: "main" },
  { icon: <CmsMetricsIcon />, label: "Digital", href: (slug) => `/candidatos/${slug}/cms-metrics`, roles: ["consultor"], section: "main" },
  // /ops exists but is hidden from nav — access via direct URL only
  // { icon: <OpsIcon />, label: "Operaciones", href: "/ops", roles: ["admin"], section: "admin" },
  { icon: <SettingsIcon />, label: "Configuracion", href: "/settings", roles: ["admin", "candidato"], section: "admin" },
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

// ── Dashboard shell (inner, needs AuthProvider above) ───────────────

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, campaigns, activeCampaignId, setActiveCampaign, isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Auto-collapse sidebar on /tierra routes (immersive map mode)
  const isTierraRoute = pathname.includes("/tierra");

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [campaignDropdownOpen, setCampaignDropdownOpen] = useState(false);

  // Derive UI role from the authenticated user's backend role
  const uiRole: UIRole = mapBackendRoleToUI(user?.role ?? "agent");

  // Force collapsed on tierra
  const effectiveCollapsed = isTierraRoute || collapsed;

  // Track viewport width for mobile detection (avoids SSR window access)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
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

  const sidebarWidth = isTierraRoute ? "52px" : effectiveCollapsed ? "72px" : "260px";

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
            background: "rgba(0,0,0,0.5)",
            zIndex: 998,
            transition: "opacity 0.2s ease",
            border: "none",
            cursor: "pointer",
            width: "100%",
            height: "100%",
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
          width: mobileOpen ? "260px" : isTierraRoute ? "52px" : sidebarWidth,
          background: "var(--goberna-blue-900)",
          color: "#ffffff",
          display: "flex",
          flexDirection: "column",
          transition: "width 0.25s cubic-bezier(0.4,0,0.2,1), transform 0.25s cubic-bezier(0.4,0,0.2,1)",
          zIndex: 999,
          boxShadow: "2px 0 12px rgba(0,0,0,0.15)",
          overflow: "hidden",
          transform: isMobile && !mobileOpen ? "translateX(-100%)" : "translateX(0)",
        }}
      >
        {/* Logo area */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: effectiveCollapsed && !mobileOpen ? "0px" : "12px",
            padding: effectiveCollapsed && !mobileOpen ? "20px 0" : "20px 20px",
            justifyContent: effectiveCollapsed && !mobileOpen ? "center" : "flex-start",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            minHeight: "72px",
            flexShrink: 0,
          }}
        >
          <Image
            src="/isotipo(2).jpg"
            alt="GOBERNA"
            width={36}
            height={36}
            style={{ borderRadius: "6px", flexShrink: 0 }}
          />
          {(!effectiveCollapsed || mobileOpen) && (
            <span
              style={{
                fontWeight: 800,
                fontSize: "18px",
                letterSpacing: "3px",
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
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.6)",
                cursor: "pointer",
                padding: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
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
            padding: "12px 0",
          }}
        >
          {mainNav.map((item) => {
            const href = resolveHref(item.href);
            const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
            const isHovered = hoveredItem === href;
            const showLabel = !effectiveCollapsed || mobileOpen;

            return (
              <button
                type="button"
                key={href}
                onClick={() => router.push(href)}
                onMouseEnter={() => setHoveredItem(href)}
                onMouseLeave={() => setHoveredItem(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  width: "100%",
                  padding: showLabel ? "12px 20px" : "12px 0",
                  justifyContent: showLabel ? "flex-start" : "center",
                  background: isActive
                    ? "rgba(255,255,255,0.1)"
                    : isHovered
                      ? "rgba(255,255,255,0.05)"
                      : "transparent",
                  border: "none",
                  borderLeft: isActive ? "3px solid var(--goberna-gold)" : "3px solid transparent",
                  color: isActive ? "var(--goberna-gold)" : isHovered ? "#ffffff" : "rgba(255,255,255,0.7)",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: isActive ? 600 : 500,
                  fontFamily: "inherit",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                  textAlign: "left",
                }}
              >
                <span style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
                  {item.icon}
                </span>
                {showLabel && <span>{item.label}</span>}
              </button>
            );
          })}

          {/* Section separator */}
          {adminNav.length > 0 && (
            <div
              style={{
                margin: "8px 0",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                padding: (!effectiveCollapsed || mobileOpen) ? "8px 20px 0" : "8px 0 0",
              }}
            >
              {(!effectiveCollapsed || mobileOpen) && (
                <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(255,255,255,0.35)" }}>
                  Administracion
                </span>
              )}
            </div>
          )}

          {adminNav.map((item) => {
            const href = resolveHref(item.href);
            const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
            const isHovered = hoveredItem === href;
            const showLabel = !effectiveCollapsed || mobileOpen;

            return (
              <button
                type="button"
                key={href}
                onClick={() => router.push(href)}
                onMouseEnter={() => setHoveredItem(href)}
                onMouseLeave={() => setHoveredItem(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  width: "100%",
                  padding: showLabel ? "12px 20px" : "12px 0",
                  justifyContent: showLabel ? "flex-start" : "center",
                  background: isActive
                    ? "rgba(255,255,255,0.1)"
                    : isHovered
                      ? "rgba(255,255,255,0.05)"
                      : "transparent",
                  border: "none",
                  borderLeft: isActive ? "3px solid var(--goberna-gold)" : "3px solid transparent",
                  color: isActive ? "var(--goberna-gold)" : isHovered ? "#ffffff" : "rgba(255,255,255,0.7)",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: isActive ? 600 : 500,
                  fontFamily: "inherit",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                  textAlign: "left",
                }}
              >
                <span style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
                  {item.icon}
                </span>
                {showLabel && <span>{item.label}</span>}
              </button>
            );
          })}


        </nav>

        {/* Collapse toggle (desktop only) */}
        {!mobileOpen && (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "10px 20px",
              background: "none",
              border: "none",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.5)",
              cursor: "pointer",
              fontSize: "12px",
              fontFamily: "inherit",
              transition: "color 0.15s ease",
              flexShrink: 0,
            }}
            aria-label={effectiveCollapsed ? "Expandir menu" : "Colapsar menu"}
          >
            <CollapseIcon collapsed={effectiveCollapsed} />
            {!effectiveCollapsed && <span>Colapsar</span>}
          </button>
        )}

        {/* Campaign selector */}
        {(!effectiveCollapsed || mobileOpen) && campaigns.length > 1 && (
          <div
            style={{
              padding: "12px 16px",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              flexShrink: 0,
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
                fontSize: "12px",
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
                  left: "16px",
                  right: "16px",
                  background: "var(--goberna-blue-800)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  boxShadow: "0 -4px 12px rgba(0,0,0,0.3)",
                  maxHeight: "200px",
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
                      fontSize: "12px",
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

        {/* User info */}
        <div
          style={{
            padding: effectiveCollapsed && !mobileOpen ? "16px 0" : "16px 20px",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: effectiveCollapsed && !mobileOpen ? "center" : "flex-start",
            flexDirection: effectiveCollapsed && !mobileOpen ? "column" : "row",
            gap: "12px",
            flexShrink: 0,
            justifyContent: effectiveCollapsed && !mobileOpen ? "center" : "flex-start",
          }}
        >
          {/* Avatar circle */}
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              background: "var(--goberna-blue-700)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "13px",
              fontWeight: 700,
              color: "var(--goberna-gold)",
              flexShrink: 0,
            }}
          >
            {user?.full_name?.charAt(0)?.toUpperCase() ?? "?"}
          </div>

          {(!effectiveCollapsed || mobileOpen) && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#ffffff",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user?.full_name ?? "Usuario"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                    padding: "2px 6px",
                    borderRadius: "3px",
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
                    color: "rgba(255,255,255,0.5)",
                    cursor: "pointer",
                    padding: "2px",
                    display: "flex",
                    alignItems: "center",
                    transition: "color 0.15s ease",
                  }}
                  title="Cerrar sesion"
                  aria-label="Cerrar sesion"
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#ffffff"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
                >
                  <LogoutIcon />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Mobile hamburger ───────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        style={{
          position: "fixed",
          top: "12px",
          left: "12px",
          zIndex: 997,
          width: "44px",
          height: "44px",
          borderRadius: "var(--radius-md)",
          background: "var(--goberna-blue-900)",
          border: "none",
          color: "#ffffff",
          cursor: "pointer",
          display: "none",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "var(--shadow-md)",
        }}
        className="mobile-hamburger"
        aria-label="Abrir menu"
      >
        <MenuIcon />
      </button>

      {/* ── Main content ───────────────────────────────────────── */}
      <main
        style={{
          flex: 1,
          marginLeft: sidebarWidth,
          padding: isTierraRoute ? "0" : "24px",
          transition: "margin-left 0.25s cubic-bezier(0.4,0,0.2,1)",
          minHeight: "100vh",
          overflow: isTierraRoute ? "hidden" : undefined,
        }}
        className="dashboard-main"
      >
        {children}
      </main>

      {/* ── Responsive styles ──────────────────────────────────── */}
      <style>{`
        @media (max-width: 767px) {
          .mobile-hamburger {
            display: flex !important;
          }
          .dashboard-main {
            margin-left: 0 !important;
            padding: 16px !important;
            padding-top: 68px !important;
          }
        }
      `}</style>
    </div>
  );
}

// ── Exported layout wraps with AuthProvider ─────────────────────────

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}
