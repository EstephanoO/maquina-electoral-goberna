"use client";

/**
 * DashboardShell — sidebar + main content area.
 * Manages sidebar state, viewport detection, nav filtering.
 * Children are rendered in the <main> area.
 *
 * ~290 lines (within 300-line feature component limit).
 */

import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo, useState, useCallback, memo } from "react";
import { useAuth } from "../../../lib/auth-context";
import { SupportChat } from "./support-chat";
import { LoadingScreen } from "./loading-screen";
import { NotificationsButton } from "./notifications-button";
import { CampaignSelector } from "./campaign-selector";
import { SidebarUserPanel } from "./sidebar-user-panel";
import {
  DashboardIcon,
  AgentsIcon,
  CandidatosIcon,
  FormulariosIcon,
  ValidacionIcon,
  GestionIcon,
  BrigadistasIcon,
  SettingsIcon,
  MenuIcon,
  CloseIcon,
} from "./icons";
import {
  type NavItem,
  type UIRole,
  mapBackendRoleToUI,
  SIDEBAR_W_EXPANDED,
  SIDEBAR_W_COLLAPSED,
  MOBILE_BREAKPOINT,
  OPEN_MOBILE_SIDEBAR_EVENT,
  navLinkBase,
} from "./nav-config";

// ── Nav items (module-scope constant) ───────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { icon: <AgentsIcon />, label: "Equipo", href: "/equipo", roles: ["admin", "candidato"], section: "main", visibility: "always" },
  { icon: <DashboardIcon />, label: "Territorio", href: (slug) => `/candidatos/${slug}/tierra`, roles: ["admin", "candidato", "consultor", "agente"], section: "main", visibility: "campaign" },
  { icon: <ValidacionIcon />, label: "Digital", href: (slug) => `/candidatos/${slug}/validacion`, roles: ["admin", "candidato", "consultor"], section: "main", visibility: "campaign" },
  { icon: <GestionIcon />, label: "Gestión", href: "/gestion", roles: ["admin", "consultor"], section: "main", visibility: "always" },
  { icon: <CandidatosIcon />, label: "Candidatos", href: "/candidatos", roles: ["admin"], section: "admin", visibility: "global" },
  { icon: <FormulariosIcon />, label: "Formularios", href: "/formularios", roles: ["admin"], section: "admin", visibility: "global" },
  { icon: <BrigadistasIcon />, label: "Brigadistas", href: "/brigadistas", roles: ["admin"], section: "admin", visibility: "global" },
];

// ── Component ───────────────────────────────────────────────────────

export const DashboardShell = memo(function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    user,
    campaigns,
    activeCampaignId,
    setActiveCampaign,
    isAuthenticated,
    isLoading,
    logout,
  } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // ── Sidebar state
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarHoverOpen, setSidebarHoverOpen] = useState(false);

  const uiRole: UIRole = mapBackendRoleToUI(user?.role ?? "agent");
  const showCollapsed = isMobile ? true : !sidebarHoverOpen;
  const showLabel = !showCollapsed || mobileOpen;
  const sidebarWidth = showCollapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED;
  const isCmsRoute = pathname === "/cms" || pathname.startsWith("/cms/");
  const isImmersiveRoute = pathname.includes("/tierra");
  const isAdmin = user?.role === "admin";
  const activeCampaign = campaigns.find((c) => c.id === activeCampaignId);
  const campaignSlug = activeCampaign?.slug ?? "";

  // ── Effects
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/login");
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    void pathname;
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handler = () => { if (isMobile) setMobileOpen(true); };
    window.addEventListener(OPEN_MOBILE_SIDEBAR_EVENT, handler);
    return () => window.removeEventListener(OPEN_MOBILE_SIDEBAR_EVENT, handler);
  }, [isMobile]);

  // ── Callbacks
  const handleLogout = useCallback(async () => {
    await logout();
    router.replace("/login");
  }, [logout, router]);

  const resolveHref = useCallback(
    (href: string | ((slug: string) => string)): string =>
      typeof href === "function" ? href(campaignSlug) : href,
    [campaignSlug],
  );

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  // ── Memoized nav lists
  const hasCampaign = !!activeCampaignId;
  const { mainNav, adminNav } = useMemo(() => {
    const filtered = NAV_ITEMS
      .filter((item) => item.roles.includes(uiRole))
      .filter((item) => {
        const vis = item.visibility ?? "always";
        if (vis === "campaign") return hasCampaign && !!campaignSlug;
        if (vis === "global") return !hasCampaign;
        return true;
      });
    return {
      mainNav: filtered.filter((item) => item.section === "main"),
      adminNav: filtered.filter((item) => item.section === "admin"),
    };
  }, [uiRole, campaignSlug, hasCampaign]);

  const isNavActive = useCallback(
    (item: NavItem, href: string): boolean => {
      if (pathname === href) return true;
      if (href === "/home") return false;
      if (typeof item.href === "function") return pathname.startsWith(href);
      return false;
    },
    [pathname],
  );

  // ── Early returns
  if (isLoading || !isAuthenticated) return <LoadingScreen />;

  // ── Render helper
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
          position: "relative",
          padding: showLabel ? "10px 20px" : "10px 0",
          justifyContent: showLabel ? "flex-start" : "center",
          background: isActive ? "var(--sidebar-active-bg)" : "transparent",
          borderLeft: isActive ? "3px solid var(--goberna-gold)" : "3px solid transparent",
          color: isActive ? "var(--sidebar-text-active)" : "var(--sidebar-text)",
          fontWeight: isActive ? 600 : 500,
          borderRadius: 0,
        }}
      >
        <span style={{ flexShrink: 0, display: "flex", alignItems: "center", width: 20, justifyContent: "center" }}>{item.icon}</span>
        {showLabel && <span>{item.label}</span>}
        {!showLabel && <span className="sidebar-tooltip">{item.label}</span>}
      </Link>
    );
  };

  // ── Settings link helper
  const settingsActive = pathname === "/settings";
  const settingsVisible = uiRole === "admin" || uiRole === "candidato";

  return (
    <div
      data-dashboard-shell-root
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--color-background)",
        "--sidebar-current-width": `${isMobile ? 0 : sidebarWidth}px`,
      } as React.CSSProperties}
    >
      {/* Mobile overlay */}
      {mobileOpen && (
        <button
          type="button"
          onClick={closeMobile}
          aria-label="Cerrar menu"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 998, border: "none", cursor: "pointer", width: "100%", height: "100%", backdropFilter: "blur(2px)" }}
        />
      )}

      {/* Sidebar */}
      <aside
        className="dashboard-shell-sidebar"
        onMouseEnter={() => { if (!isMobile) setSidebarHoverOpen(true); }}
        onMouseLeave={() => { if (!isMobile) setSidebarHoverOpen(false); }}
        style={{
          position: "fixed", top: 0, left: 0, bottom: 0,
          width: mobileOpen ? SIDEBAR_W_EXPANDED : sidebarWidth,
          background: "var(--sidebar-bg)", color: "#ffffff",
          display: isMobile && !mobileOpen ? "none" : "flex",
          flexDirection: "column",
          transition: "width var(--duration-normal) var(--ease-in-out)",
          zIndex: 999,
          boxShadow: mobileOpen ? "4px 0 24px rgba(0,0,0,0.3)" : "1px 0 0 rgba(255,255,255,0.1)",
          overflow: "hidden",
        }}
      >
        {/* Logo area */}
        <div style={{ display: "flex", alignItems: "center", gap: showLabel ? 14 : 0, padding: showLabel ? "16px 20px" : "16px 0", justifyContent: showLabel ? "flex-start" : "center", borderBottom: "1px solid var(--sidebar-border)", minHeight: 64, flexShrink: 0 }}>
          <Image src="/isotipo_2_-removebg-preview.png" alt="GOBERNA" width={34} height={34} style={{ flexShrink: 0, borderRadius: 6 }} />
          {showLabel && (
            <>
              <span style={{ width: 1.5, height: 24, backgroundColor: "var(--goberna-gold)", borderRadius: 1, flexShrink: 0, opacity: 0.4 }} />
              <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: 4, color: "var(--goberna-gold)", whiteSpace: "nowrap", fontFamily: "var(--font-montserrat), system-ui, sans-serif", lineHeight: 1 }}>GOBERNA</span>
            </>
          )}
          {mobileOpen && (
            <button type="button" onClick={closeMobile} style={{ marginLeft: "auto", background: "rgba(255,255,255,0.06)", border: "none", borderRadius: "var(--radius-sm)", color: "rgba(255,255,255,0.6)", cursor: "pointer", padding: 6, display: "flex", alignItems: "center", justifyContent: "center", transition: "background var(--duration-fast) ease" }} aria-label="Cerrar menu">
              <CloseIcon />
            </button>
          )}
        </div>

        {/* Active campaign indicator */}
        {showLabel && (
          <div style={{ padding: "10px 20px 12px", borderBottom: "1px solid var(--sidebar-border)", flexShrink: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.5, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>
              {activeCampaign ? "Campaña activa" : "Vista"}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: activeCampaign ? "var(--goberna-gold)" : "rgba(255,255,255,0.5)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {activeCampaign?.name ?? "General"}
            </div>
          </div>
        )}

        {/* Nav links */}
        <nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "8px 0" }}>
          {mainNav.map((item) => renderNavLink(item, resolveHref(item.href)))}
          {adminNav.length > 0 && (
            <div style={{ margin: "8px 0 4px", borderTop: "1px solid var(--sidebar-border)", padding: showLabel ? "10px 20px 0" : "10px 0 0" }}>
              {showLabel && <span style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.5, color: "rgba(255,255,255,0.25)" }}>Administración</span>}
            </div>
          )}
          {adminNav.map((item) => renderNavLink(item, resolveHref(item.href)))}
        </nav>

        {/* Bottom section */}
        <div style={{ flexShrink: 0 }}>
          {(uiRole === "admin" || uiRole === "consultor") && (
            <NotificationsButton showLabel={showLabel} isMobile={isMobile} onClose={closeMobile} />
          )}

          {settingsVisible && (
            <Link
              href="/settings"
              prefetch={true}
              onClick={() => { if (isMobile) setMobileOpen(false); }}
              title={showLabel ? undefined : "Configuración"}
              className={`sidebar-nav-link${settingsActive ? " sidebar-nav-active" : ""}`}
              style={{
                ...navLinkBase,
                position: "relative",
                padding: showLabel ? "10px 20px" : "10px 0",
                justifyContent: showLabel ? "flex-start" : "center",
                background: settingsActive ? "var(--sidebar-active-bg)" : "transparent",
                borderTop: "1px solid var(--sidebar-border)",
                borderLeft: settingsActive ? "3px solid var(--goberna-gold)" : "3px solid transparent",
                color: settingsActive ? "var(--sidebar-text-active)" : "rgba(255,255,255,0.45)",
                fontWeight: settingsActive ? 600 : 400,
              }}
              aria-label="Configuración"
            >
              <span style={{ flexShrink: 0, display: "flex", alignItems: "center", width: 20, justifyContent: "center" }}><SettingsIcon /></span>
              {showLabel && <span>Configuración</span>}
              {!showLabel && <span className="sidebar-tooltip">Configuración</span>}
            </Link>
          )}

          {showLabel && (isAdmin || campaigns.length > 1) && (
            <CampaignSelector
              campaigns={campaigns}
              activeCampaignId={activeCampaignId}
              isAdmin={!!isAdmin}
              setActiveCampaign={setActiveCampaign}
            />
          )}

          <SidebarUserPanel
            fullName={user?.full_name}
            uiRole={uiRole}
            isAdmin={!!isAdmin}
            showLabel={showLabel}
            onLogout={handleLogout}
          />
        </div>
      </aside>

      {/* Mobile hamburger */}
      {isMobile && !mobileOpen && !isCmsRoute && (
        <button
          className="dashboard-mobile-menu-btn"
          type="button"
          onClick={() => setMobileOpen(true)}
          style={{ position: "fixed", top: 12, left: 12, zIndex: 997, width: 44, height: 44, borderRadius: "var(--radius-md)", background: "var(--goberna-blue-900)", border: "none", color: "#ffffff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--shadow-md)" }}
          aria-label="Abrir menu"
        >
          <MenuIcon />
        </button>
      )}

      {/* Main content */}
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

      {/* Floating Support Chat */}
      {(uiRole === "admin" || uiRole === "candidato" || uiRole === "consultor")
        && user
        && !(isMobile && isCmsRoute) && (
        <SupportChat userId={user.id} isAdmin={!!isAdmin} />
      )}

      {/* Sidebar user panel hover animation */}
      <style jsx>{`
        .sidebar-user-panel {
          transition: transform 180ms var(--ease-in-out);
        }
        .sidebar-logout-slot {
          display: inline-flex;
          width: 0;
          opacity: 0;
          overflow: hidden;
          transform: translateX(-6px);
          transition: width 180ms var(--ease-in-out), opacity 160ms ease, transform 180ms var(--ease-in-out);
          pointer-events: none;
        }
        .sidebar-logout-btn {
          flex-shrink: 0;
        }
        .sidebar-user-panel:hover,
        .sidebar-user-panel:focus-within {
          transform: translateX(4px);
        }
        .sidebar-user-panel:hover .sidebar-logout-slot,
        .sidebar-user-panel:focus-within .sidebar-logout-slot {
          width: 22px;
          opacity: 1;
          transform: translateX(0);
          pointer-events: auto;
        }
      `}</style>
    </div>
  );
});
