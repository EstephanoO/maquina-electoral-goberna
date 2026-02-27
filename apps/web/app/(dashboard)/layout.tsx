"use client";

import { AuthProvider, useAuth } from "../../lib/auth-context";
import { QueryProvider } from "../../lib/query-provider";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { useEffect, useMemo, useState, useCallback, memo } from "react";
import { SupportChat } from "./_components/support-chat";

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
  /** When the item is visible: "always" | "campaign" (only with active campaign) | "global" (only Admin General) */
  visibility?: "always" | "campaign" | "global";
};

const NAV_ITEMS: NavItem[] = [
  { icon: <AgentsIcon />, label: "Equipo", href: "/equipo", roles: ["admin", "candidato"], section: "main", visibility: "always" },
  { icon: <DashboardIcon />, label: "Dashboard", href: (slug) => `/candidatos/${slug}/tierra`, roles: ["admin", "candidato", "consultor"], section: "main", visibility: "campaign" },
  { icon: <ValidacionIcon />, label: "Validacion", href: (slug) => `/candidatos/${slug}/validacion`, roles: ["admin", "candidato", "consultor"], section: "main", visibility: "campaign" },
  // Admin-only: visible only in Admin General mode
  { icon: <CandidatosIcon />, label: "Candidatos", href: "/candidatos", roles: ["admin"], section: "admin", visibility: "global" },
  { icon: <FormulariosIcon />, label: "Formularios", href: "/formularios", roles: ["admin"], section: "admin", visibility: "global" },
  // Configuracion se renderiza como item fijo al fondo del sidebar (fuera del nav scrolleable)
];

// ── Simple SVG icons ────────────────────────────────────────────────

function DashboardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function CandidatosIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}

function ValidacionIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}


function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51-1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
        src="/isotipo_2_-removebg-preview.png"
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
  if (typeof window === "undefined") return true;
  try {
    const val = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    // Default to collapsed on first visit (no stored preference)
    if (val === null) return true;
    return val === "1";
  } catch {
    return true;
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
const OPEN_MOBILE_SIDEBAR_EVENT = "goberna:open-mobile-sidebar";

// ── Shared nav link styles ──────────────────────────────────────────

const navLinkBase: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  border: "none",
  cursor: "pointer",
  fontSize: 13,
  fontFamily: "inherit",
  transition: "background 0.15s ease, color 0.15s ease",
  whiteSpace: "nowrap",
  textAlign: "left",
  textDecoration: "none",
};

// ── Dashboard shell (inner, needs AuthProvider above) ───────────────

const DashboardShell = memo(function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, campaigns, activeCampaignId, setActiveCampaign, isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // ── Sidebar state ─────────────────────────────────────────
  const [collapsed, setCollapsed] = useState(() => readSidebarPref());
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [campaignDropdownOpen, setCampaignDropdownOpen] = useState(false);
  const [edgeHover, setEdgeHover] = useState(false);

  // Derive UI role from the authenticated user's backend role
  const uiRole: UIRole = mapBackendRoleToUI(user?.role ?? "agent");

  // Sidebar respects user preference on all routes (including /tierra)
  const showCollapsed = isMobile ? true : collapsed;
  const showLabel = !showCollapsed || mobileOpen;
  const sidebarWidth = showCollapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED;
  const isCmsRoute = pathname === "/cms" || pathname.startsWith("/cms/");
  const isImmersiveRoute = pathname.includes("/tierra");

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

  // FIX: Close mobile sidebar on route change (was missing dependency array)
  useEffect(() => {
    setMobileOpen(false);
    setCampaignDropdownOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleOpenMobileSidebar = () => {
      if (isMobile) setMobileOpen(true);
    };

    window.addEventListener(OPEN_MOBILE_SIDEBAR_EVENT, handleOpenMobileSidebar);
    return () => window.removeEventListener(OPEN_MOBILE_SIDEBAR_EVENT, handleOpenMobileSidebar);
  }, [isMobile]);

  const handleLogout = useCallback(async () => {
    await logout();
    router.replace("/login");
  }, [logout, router]);

  const activeCampaign = campaigns.find((c) => c.id === activeCampaignId);
  const isAdmin = user?.role === "admin";

  // Resolve dynamic hrefs (e.g., Tierra/Digital for consultor use campaign slug)
  const campaignSlug = activeCampaign?.slug ?? "";
  const resolveHref = useCallback(
    (href: string | ((slug: string) => string)): string =>
      typeof href === "function" ? href(campaignSlug) : href,
    [campaignSlug],
  );

  // Memoize nav lists — filters by role, campaign context, and visibility
  const hasCampaign = !!activeCampaignId;
  const { mainNav, adminNav } = useMemo(() => {
    const filtered = NAV_ITEMS
      .filter((item) => item.roles.includes(uiRole))
      .filter((item) => {
        const vis = item.visibility ?? "always";
        if (vis === "campaign") return hasCampaign && !!campaignSlug;
        if (vis === "global") return !hasCampaign;
        return true; // "always"
      });
    return {
      mainNav: filtered.filter((item) => item.section === "main"),
      adminNav: filtered.filter((item) => item.section === "admin"),
    };
  }, [uiRole, campaignSlug, hasCampaign]);

  // ── Active state: smart matching ──
  // Dynamic hrefs (functions — "/candidatos/slug/tierra") use prefix match
  // so that sub-routes stay highlighted.
  // Static hrefs ("/candidatos", "/cms", etc.) use EXACT match only.
  // This prevents "/candidatos" lighting up on "/candidatos/slug/tierra".
  const isNavActive = useCallback(
    (item: NavItem, href: string): boolean => {
      if (pathname === href) return true;
      if (href === "/home") return false;
      // Dynamic href → prefix match
      if (typeof item.href === "function") {
        return pathname.startsWith(href);
      }
      // Static href → exact match only (already checked above)
      return false;
    },
    [pathname],
  );

  // ── Early returns AFTER all hooks ─────────────────────────
  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <LoadingScreen />;

  // ── Render helper: <Link> with prefetch for instant navigation ──
  const renderNavLink = (item: NavItem, href: string) => {
    const isActive = isNavActive(item, href);

    return (
      <Link
        key={href}
        href={href}
        prefetch={true}
        onClick={() => { if (isMobile) setMobileOpen(false); }}
        title={showLabel ? undefined : item.label}
        className={`sidebar-nav-link${isActive ? " sidebar-nav-active" : ""}`}
        style={{
          ...navLinkBase,
          padding: showLabel ? "11px 20px" : "11px 0",
          justifyContent: showLabel ? "flex-start" : "center",
          background: isActive ? "rgba(255,255,255,0.12)" : "transparent",
          borderLeft: isActive ? "3px solid var(--goberna-gold)" : "3px solid transparent",
          color: isActive ? "var(--goberna-gold)" : "rgba(255,255,255,0.7)",
          fontWeight: isActive ? 600 : 500,
        }}
      >
        <span style={{ flexShrink: 0, display: "flex", alignItems: "center", width: 20, justifyContent: "center" }}>
          {item.icon}
        </span>
        {showLabel && <span>{item.label}</span>}
      </Link>
    );
  };

  return (
    <div
      data-dashboard-shell-root
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--color-background)",
        // Expose current sidebar width as CSS variable for child layouts
        "--sidebar-current-width": `${isMobile ? 0 : sidebarWidth}px`,
      } as React.CSSProperties}
    >
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
        className="dashboard-shell-sidebar"
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
            gap: showLabel ? 14 : 0,
            padding: showLabel ? "14px 20px" : "14px 0",
            justifyContent: showLabel ? "flex-start" : "center",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            minHeight: 64,
            flexShrink: 0,
          }}
        >
          <Image
            src="/isotipo_2_-removebg-preview.png"
            alt="GOBERNA"
            width={36}
            height={36}
            style={{ flexShrink: 0 }}
          />
          {showLabel && (
            <>
              <span
                style={{
                  width: 1.5,
                  height: 28,
                  backgroundColor: "var(--goberna-gold)",
                  borderRadius: 1,
                  flexShrink: 0,
                  opacity: 0.6,
                }}
              />
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 15,
                  letterSpacing: 4,
                  color: "var(--goberna-gold)",
                  whiteSpace: "nowrap",
                  fontFamily: "var(--font-montserrat), system-ui, sans-serif",
                  lineHeight: 1,
                }}
              >
                GOBERNA
              </span>
            </>
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

        {/* Active campaign context indicator */}
        {showLabel && (
          <div
            style={{
              padding: "10px 20px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "rgba(255,255,255,0.35)", marginBottom: 4 }}>
              {activeCampaign ? "Campaña activa" : "Vista"}
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: activeCampaign ? "var(--goberna-gold)" : "rgba(255,255,255,0.6)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {activeCampaign?.name ?? "General"}
            </div>
          </div>
        )}

        {/* Nav links */}
        <nav
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "8px 0",
          }}
        >
          {mainNav.map((item) => renderNavLink(item, resolveHref(item.href)))}

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
                  Administración
                </span>
              )}
            </div>
          )}

          {adminNav.map((item) => renderNavLink(item, resolveHref(item.href)))}
        </nav>

        {/* ── Bottom section ────────────────────────────────────── */}
        <div style={{ flexShrink: 0 }}>
          {/* Configuracion — Link instead of button */}
          {(() => {
            const settingsRoles: UIRole[] = ["admin", "candidato"];
            if (!settingsRoles.includes(uiRole)) return null;
            const href = "/settings";
            const isActive = pathname === href;
            return (
              <Link
                href={href}
                prefetch={true}
                onClick={() => { if (isMobile) setMobileOpen(false); }}
                 title={showLabel ? undefined : "Configuración"}
                className={`sidebar-nav-link${isActive ? " sidebar-nav-active" : ""}`}
                style={{
                  ...navLinkBase,
                  padding: showLabel ? "11px 20px" : "11px 0",
                  justifyContent: showLabel ? "flex-start" : "center",
                  background: isActive ? "rgba(255,255,255,0.12)" : "transparent",
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  borderLeft: isActive ? "3px solid var(--goberna-gold)" : "3px solid transparent",
                  color: isActive ? "var(--goberna-gold)" : "rgba(255,255,255,0.5)",
                  fontWeight: isActive ? 600 : 400,
                }}
                aria-label="Configuración"
              >
                <span style={{ flexShrink: 0, display: "flex", alignItems: "center", width: 20, justifyContent: "center" }}>
                  <SettingsIcon />
                </span>
                {showLabel && <span>Configuración</span>}
              </Link>
            );
          })()}

          {/* Support chat moved to floating position — see below */}

          {/* Campaign selector — admin always sees it (with "Admin" global option) */}
          {showLabel && (isAdmin || campaigns.length > 1) && (
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
                  background: activeCampaignId ? "rgba(255,255,255,0.07)" : "rgba(255,200,0,0.08)",
                  border: activeCampaignId ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(255,200,0,0.25)",
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
                  {activeCampaign?.name ?? (isAdmin ? "Admin — General" : "Seleccionar campaña")}
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
                  {/* Admin global option */}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveCampaign(null);
                        setCampaignDropdownOpen(false);
                      }}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        background: !activeCampaignId ? "rgba(255,200,0,0.1)" : "transparent",
                        border: "none",
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                        color: !activeCampaignId ? "var(--goberna-gold)" : "rgba(255,255,255,0.8)",
                        fontSize: 12,
                        fontWeight: !activeCampaignId ? 700 : 400,
                        fontFamily: "inherit",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "background 0.1s ease",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                      Admin — General
                    </button>
                  )}
                  {campaigns.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => {
                        setActiveCampaign(c.id);
                        setCampaignDropdownOpen(false);
                        // If on a /candidatos/[slug]/* route, navigate to same sub-route with new slug
                        const slugMatch = pathname.match(/^\/candidatos\/([^/]+)(\/.*)?$/);
                        if (slugMatch && c.slug && slugMatch[1] !== c.slug) {
                          const subPath = slugMatch[2] ?? "/tierra";
                          router.push(`/candidatos/${c.slug}${subPath}`);
                        }
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
                    title="Cerrar sesión"
                    aria-label="Cerrar sesión"
                  >
                    <LogoutIcon />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Sidebar edge hover zone + toggle (desktop only) ──── */}
      {!isMobile && (
        <div
          className="sidebar-edge-zone dashboard-sidebar-edge-zone"
          onMouseEnter={() => setEdgeHover(true)}
          onMouseLeave={() => setEdgeHover(false)}
          style={{
            position: "fixed",
            top: 0,
            left: sidebarWidth - 10,
            bottom: 0,
            width: 20,
            zIndex: 1000,
            cursor: "pointer",
            transition: "left 0.2s cubic-bezier(0.4,0,0.2,1)",
          }}
          onClick={handleToggleCollapse}
          role="presentation"
        >
          {/* Visible edge line on hover */}
          <div
            className="sidebar-edge-line"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 9,
              width: 2,
              borderRadius: 1,
              background: "var(--goberna-gold)",
              opacity: edgeHover ? 0.7 : 0,
              transition: "opacity 0.2s ease",
              pointerEvents: "none",
            }}
          />
          {/* Toggle pill centered on edge — always partially visible */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleToggleCollapse(); }}
            aria-label={showCollapsed ? "Expandir menu" : "Colapsar menu"}
            className="sidebar-edge-btn"
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 20,
              height: 40,
              borderRadius: 10,
              background: edgeHover ? "var(--goberna-blue-700)" : "var(--goberna-blue-800)",
              border: "2px solid var(--color-background)",
              color: edgeHover ? "#ffffff" : "rgba(255,255,255,0.45)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              opacity: edgeHover ? 1 : 0.5,
              transition: "opacity 0.2s ease, background 0.15s ease, color 0.15s ease, transform 0.15s ease",
              boxShadow: edgeHover ? "0 2px 8px rgba(0,0,0,0.25)" : "0 1px 3px rgba(0,0,0,0.15)",
            }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{
                transform: showCollapsed ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
              }}
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Mobile hamburger (only visible on mobile) ──────────── */}
      {isMobile && !mobileOpen && !isCmsRoute && (
        <button
          className="dashboard-mobile-menu-btn"
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
        className="dashboard-shell-main"
        style={{
          flex: 1,
          marginLeft: "var(--sidebar-current-width)",
          padding: isImmersiveRoute ? 0 : isMobile ? (isCmsRoute ? 0 : "68px 16px 16px") : 24,
          transition: "margin-left 0.2s cubic-bezier(0.4,0,0.2,1)",
          minHeight: "100vh",
          overflow: isImmersiveRoute ? "hidden" : undefined,
        } as React.CSSProperties}
      >
        {children}
      </main>

      {/* ── Floating Support Chat (bottom-right) ─────────────── */}
      {(uiRole === "admin" || uiRole === "candidato" || uiRole === "consultor") && user && (
        <SupportChat userId={user.id} isAdmin={isAdmin} />
      )}

      {/* ── Sidebar CSS (hover, edge zone) ───────────────────── */}
      <style>{`
        .sidebar-nav-link:hover:not(.sidebar-nav-active) {
          background: rgba(255,255,255,0.07) !important;
          color: rgba(255,255,255,0.95) !important;
        }
        .sidebar-nav-link:active {
          background: rgba(255,255,255,0.14) !important;
        }
        .sidebar-nav-active:hover {
          background: rgba(255,255,255,0.16) !important;
        }
        .sidebar-edge-zone:hover .sidebar-edge-btn {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  );
});

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
