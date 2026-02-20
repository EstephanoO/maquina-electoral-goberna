"use client";

import { useParams, usePathname, useRouter } from "next/navigation";

/* ── Tab config ─────────────────────────────────────────────────── */

const TABS = [
  { key: "tierra", label: "TERRITORIO", icon: MapPinIcon },
  { key: "analytics", label: "ANALYTICS", icon: MonitorIcon },
  { key: "cms-metrics", label: "DIGITAL", icon: CmsIcon },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/* ── Layout ─────────────────────────────────────────────────────── */

export default function CandidatoSlugLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const slug = params.slug as string;

  const activeTab: TabKey =
    (TABS.find((t) => pathname.includes(`/${t.key}`))?.key as TabKey) ?? "tierra";
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
                  if (!isActive) e.currentTarget.style.background = "rgba(15,23,42,0.04)";
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
      stroke={active ? "var(--goberna-blue-900)" : "#64748b"}
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
      stroke={active ? "var(--goberna-blue-900)" : "#64748b"}
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
      stroke={active ? "var(--goberna-blue-900)" : "#64748b"}
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
    background: "#ffffff",
    borderBottom: "1px solid #e2e8f0",
    flexShrink: 0,
    zIndex: 60,
    position: "relative",
  },
  tabBarTierra: {
    display: "flex",
    alignItems: "center",
    height: 48,
    padding: "0 16px",
    background: "#ffffff",
    borderBottom: "1px solid #e2e8f0",
    flexShrink: 0,
    /* Fixed so it stays above the Tierra fixed container */
    position: "fixed",
    top: 0,
    left: 72, /* collapsed sidebar width (SIDEBAR_W_COLLAPSED) */
    right: 0,
    zIndex: 60,
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
    color: "#64748b",
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "inherit",
    cursor: "pointer",
    borderRadius: 6,
    transition: "all 0.15s ease",
    whiteSpace: "nowrap" as const,
  },
  tabActive: {
    color: "var(--goberna-blue-900)",
    fontWeight: 600,
    background: "rgba(15,23,42,0.05)",
  },
  activeIndicator: {
    position: "absolute" as const,
    bottom: -9,
    left: 12,
    right: 12,
    height: 2,
    borderRadius: 1,
    background: "var(--goberna-blue-900)",
  },
};
