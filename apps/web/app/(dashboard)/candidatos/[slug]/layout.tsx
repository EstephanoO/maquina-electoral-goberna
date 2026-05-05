"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "../../../../lib/auth-context";
import { useTheme } from "../../../../lib/theme-context";

/* ── Tab config ─────────────────────────────────────────────────── */

type UIRole = "admin" | "consultor" | "candidato" | "agente";

function mapBackendRoleToUI(backendRole: string): UIRole {
  switch (backendRole) {
    case "admin":
      return "admin";
    case "consultor":
      return "consultor";
    case "supervisor":
    case "jefe_campana":
    case "candidato":
      return "candidato";
    default:
      return "agente";
  }
}

const ALL_TABS = [
  { key: "analytics", label: "ANALYTICS", icon: MonitorIcon, roles: ["admin", "consultor", "candidato"] as UIRole[] },
  { key: "monitor", label: "MONITOR", icon: WhatsAppIcon, roles: ["admin", "consultor", "candidato"] as UIRole[] },
  { key: "whatsapp", label: "WHATSAPP", icon: WhatsAppIcon, roles: ["admin"] as UIRole[] },
] as const;

type TabKey = (typeof ALL_TABS)[number]["key"];

/* ── Layout ─────────────────────────────────────────────────────── */

export default function CandidatoSlugLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const slug = params.slug as string;
  const { user } = useAuth();
  const { theme } = useTheme();

  const uiRole: UIRole = mapBackendRoleToUI(user?.role ?? "agente_campo");
  const TABS = ALL_TABS.filter((tab) => tab.roles.includes(uiRole));

  // Redirect restricted roles away from tabs they can't access
  useEffect(() => {
    if (!user) return;
    const currentTabKey = ALL_TABS.find((t) => pathname.includes(`/${t.key}`))?.key;
    if (!currentTabKey) return; // on a sub-route we don't control (e.g. /validacion)
    const allowed = ALL_TABS.filter((t) => t.roles.includes(uiRole)).map((t) => t.key);
    if (!allowed.includes(currentTabKey)) {
      router.replace(`/candidatos/${slug}/${allowed[0] ?? "analytics"}`);
    }
  }, [pathname, uiRole, slug, router, user]);

  // Keep candidato top tabbar synced with app theme (Monitor / Analytics / etc.)
  useEffect(() => {
    const root = document.documentElement;
    const isDark = theme === "dark";
    void pathname;

    root.style.setProperty("--tierra-tabbar-bg", isDark ? "#090D15" : "#ffffff");
    root.style.setProperty("--tierra-tabbar-border", isDark ? "#1d2f43" : "#e2e8f0");
    root.style.setProperty("--tierra-tab-active-color", isDark ? "#ffffff" : "#0f2744");
    root.style.setProperty("--tierra-tab-inactive-color", isDark ? "#cbd5e1" : "#64748b");
    root.style.setProperty("--tierra-tab-hover-bg", isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.04)");
  }, [theme, pathname]);

  const activeTab: TabKey =
    (TABS.find((t) => pathname.includes(`/${t.key}`))?.key as TabKey) ?? "analytics";
  const isTierra = pathname.includes("/tierra");

  return (
    <div style={isTierra ? styles.wrapperTierra : styles.wrapper}>
      {/* Tab bar */}
      <nav
        style={isTierra ? styles.tabBarTierra : styles.tabBar}
        className={isTierra ? "candidato-tabbar-tierra" : undefined}
      >
        <div style={styles.tabGroup}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const Icon = tab.icon;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => router.push(`/candidatos/${slug}/${tab.key}`)}
                style={{
                  ...styles.tab,
                  ...(isActive ? styles.tabActive : {}),
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = "var(--tierra-tab-hover-bg, rgba(15,23,42,0.04))";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = "transparent";
                }}
              >
                <Icon size={15} active={isActive} />
                <span>{tab.label}</span>
                {isActive && <span style={styles.activeIndicator} />}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Page content */}
      <div style={{ flex: 1, position: "relative" }}>{children}</div>

      {/* Responsive tierra tab bar */}
      <style>{`
        @media (max-width: 767px) {
          .candidato-tabbar-tierra {
            left: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ── Icons ──────────────────────────────────────────────────────── */

function MapPinIcon({ size = 16, active = false }: { size?: number; active?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? "var(--tierra-tab-active-color, var(--goberna-blue-900))" : "var(--tierra-tab-inactive-color, #64748b)"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}

function MonitorIcon({ size = 16, active = false }: { size?: number; active?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? "var(--tierra-tab-active-color, var(--goberna-blue-900))" : "var(--tierra-tab-inactive-color, #64748b)"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}



function CmsIcon({ size = 16, active = false }: { size?: number; active?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? "var(--tierra-tab-active-color, var(--goberna-blue-900))" : "var(--tierra-tab-inactive-color, #64748b)"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 20V10" />
      <path d="M12 20V4" />
      <path d="M6 20v-6" />
    </svg>
  );
}

function WhatsAppIcon({ size = 16, active = false }: { size?: number; active?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? "var(--tierra-tab-active-color, var(--goberna-blue-900))" : "var(--tierra-tab-inactive-color, #64748b)"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

/* ── Styles ─────────────────────────────────────────────────────── */

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: "flex",
    flexDirection: "column",
    minHeight: "calc(100vh - 48px)",
    /* Pull the whole block flush against the dashboard padding so the
       tab bar spans edge-to-edge. Children render below the bar. */
    margin: "-24px -24px 0 -24px",
  },
  wrapperTierra: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
    /* Tierra route: dashboard main has padding:0, no negative margin needed */
    margin: 0,
  },
  tabBar: {
    display: "flex",
    alignItems: "center",
    height: 48,
    padding: "0 16px",
    background: "var(--tierra-tabbar-bg, #ffffff)",
    borderBottom: "1px solid var(--tierra-tabbar-border, #e2e8f0)",
    flexShrink: 0,
    zIndex: 60,
    position: "relative",
  },
  tabBarTierra: {
    display: "flex",
    alignItems: "center",
    height: 48,
    padding: "0 16px",
    background: "var(--tierra-tabbar-bg, #ffffff)",
    borderBottom: "1px solid var(--tierra-tabbar-border, #e2e8f0)",
    flexShrink: 0,
    /* Fixed so it stays above the Tierra fixed container */
    position: "fixed",
    top: 0,
    left: "var(--sidebar-current-width, 72px)" as unknown as number, /* adapts to sidebar state */
    right: 0,
    zIndex: 60,
    transition: "left 0.2s cubic-bezier(0.4,0,0.2,1)",
  },
  tabGroup: {
    display: "flex",
    gap: 4,
  },
  tab: {
    position: "relative" as const,
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 16px",
    border: "none",
    background: "transparent",
    color: "var(--tierra-tab-inactive-color, #64748b)",
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "inherit",
    cursor: "pointer",
    borderRadius: 6,
    transition: "all 0.15s ease",
    whiteSpace: "nowrap" as const,
  },
  tabActive: {
    color: "var(--tierra-tab-active-color, var(--goberna-blue-900))",
    fontWeight: 600,
    background: "var(--tierra-tab-active-bg, rgba(15,23,42,0.05))",
  },
  activeIndicator: {
    position: "absolute" as const,
    bottom: -9,
    left: 12,
    right: 12,
    height: 2,
    borderRadius: 1,
    background: "var(--tierra-tab-indicator, var(--goberna-blue-900))",
  },
};
