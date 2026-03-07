"use client";

import type { GA4Region } from "./types";

type Props = {
  regions: GA4Region[];
  primaryColor: string;
  onRegionHover?: (region: string | null) => void;
  onRegionClick?: (region: string | null) => void;
  clickedRegion?: string | null;
};

function formatEngagementTime(seconds: number): string {
  if (seconds <= 0) return "0s";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

// Normalize GA4 region names to display-friendly names
function displayName(region: string): string {
  const MAP: Record<string, string> = {
    "Lima Province": "Lima (Provincia)",
    "Lima Region": "Lima (Region)",
    "Callao Region": "Callao",
    "La Libertad": "La Libertad",
    "San Martin": "San Martin",
    "Madre de Dios": "Madre de Dios",
  };
  return MAP[region] ?? region;
}

export function RegionsRanking({
  regions,
  primaryColor,
  onRegionHover,
  onRegionClick,
  clickedRegion,
}: Props) {
  // Filter to only Peru regions (non-zero users)
  const peruRegions = regions.filter((r) => r.activeUsers > 0);
  const total = peruRegions.reduce((s, r) => s + r.activeUsers, 0);
  const maxUsers = Math.max(...peruRegions.map((r) => r.activeUsers), 1);
  const top = peruRegions.slice(0, 18);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={primaryColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
            <line x1="8" y1="2" x2="8" y2="18" />
            <line x1="16" y1="6" x2="16" y2="22" />
          </svg>
          <span style={styles.headerTitle}>Alcance por Region</span>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.badge}>{peruRegions.length} regiones</span>
          <span
            style={{
              ...styles.badge,
              backgroundColor: `${primaryColor}12`,
              color: primaryColor,
            }}
          >
            {total.toLocaleString()} usuarios
          </span>
        </div>
      </div>

      {/* Ranking list */}
      <ul style={styles.listWrapper}>
        {top.map((region, i) => {
          const pct = total > 0 ? (region.activeUsers / total) * 100 : 0;
          const barW = (region.activeUsers / maxUsers) * 100;
          const isTop3 = i < 3;
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
          const isClicked = clickedRegion === region.region;

          return (
            <li
              key={region.region}
              style={{
                ...styles.row,
                backgroundColor: isClicked ? `${primaryColor}10` : undefined,
                borderLeft: isClicked ? `3px solid ${primaryColor}` : "3px solid transparent",
                cursor: "pointer",
              }}
              onMouseEnter={() => onRegionHover?.(region.region)}
              onMouseLeave={() => onRegionHover?.(null)}
            >
              <button
                type="button"
                onClick={() => onRegionClick?.(isClicked ? null : region.region)}
                style={styles.rowButton}
                aria-label={`Zoom a ${region.region}`}
              >
                {/* Rank */}
                <div
                  style={{
                    ...styles.rank,
                    backgroundColor: isTop3 ? `${primaryColor}12` : "#f8fafc",
                    color: isTop3 ? primaryColor : "#94a3b8",
                    fontWeight: isTop3 ? 800 : 600,
                  }}
                >
                  {medal || i + 1}
                </div>

                {/* Region info */}
                <div style={styles.regionInfo}>
                  <div style={styles.regionTop}>
                    <span
                      style={{
                        ...styles.regionName,
                        color: isTop3 ? "#0f172a" : "#334155",
                        fontWeight: isTop3 ? 600 : 500,
                      }}
                    >
                      {displayName(region.region)}
                    </span>
                    <span
                      style={{
                        ...styles.regionUsers,
                        color: isTop3 ? primaryColor : "#64748b",
                        fontWeight: isTop3 ? 700 : 600,
                      }}
                    >
                      {region.activeUsers.toLocaleString()}
                    </span>
                  </div>

                  {/* Bar + percentage */}
                  <div style={styles.barRow}>
                    <div style={styles.barTrack}>
                      <div
                        style={{
                          ...styles.barFill,
                          width: `${barW}%`,
                          backgroundColor: isTop3 ? primaryColor : `${primaryColor}80`,
                          opacity: isTop3 ? 1 : 0.6,
                        }}
                      />
                    </div>
                    <span style={styles.pct}>{pct.toFixed(1)}%</span>
                  </div>

                  {/* Enriched metrics */}
                  {region.avgEngagementTime !== undefined &&
                    region.avgEngagementTime > 0 && (
                      <div style={styles.metricsRow}>
                        {region.newUsers !== undefined && (
                          <span style={styles.metric}>
                            <span style={styles.metricLabel}>Nuevos:</span>{" "}
                            {region.newUsers.toLocaleString()}
                          </span>
                        )}
                        <span style={styles.metric}>
                          <span style={styles.metricLabel}>Tiempo:</span>{" "}
                          {formatEngagementTime(region.avgEngagementTime)}
                        </span>
                        {region.engagementRate !== undefined &&
                          region.engagementRate > 0 && (
                            <span style={styles.metric}>
                              <span style={styles.metricLabel}>Eng:</span>{" "}
                              {(region.engagementRate * 100).toFixed(0)}%
                            </span>
                          )}
                      </div>
                    )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Footer */}
      {peruRegions.length > 18 && (
        <div style={styles.footer}>
          <span style={styles.footerText}>
            +{peruRegions.length - 18} regiones mas
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Styles ───────────────────────────────────────────────────────── */

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    border: "1px solid #e2e8f0",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 20px",
    borderBottom: "1px solid #f1f5f9",
    flexShrink: 0,
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  headerTitle: { fontSize: 15, fontWeight: 600, color: "#1e293b" },
  headerRight: { display: "flex", gap: 8 },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    color: "#64748b",
    backgroundColor: "#f1f5f9",
    padding: "4px 10px",
    borderRadius: 6,
  },
  listWrapper: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "8px 0",
    margin: 0,
    listStyle: "none",
  },
  row: {
    display: "flex",
    alignItems: "center",
    padding: 0,
    cursor: "default",
    transition: "background-color 0.12s ease",
  },
  rowButton: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 20px",
    width: "100%",
    background: "none",
    border: "none",
    cursor: "pointer",
    textAlign: "left" as const,
    font: "inherit",
    color: "inherit",
  },
  rank: {
    width: 28,
    height: 28,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    flexShrink: 0,
  },
  regionInfo: { flex: 1, minWidth: 0 },
  regionTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  regionName: { fontSize: 13, lineHeight: 1.2 },
  regionUsers: {
    fontSize: 13,
    fontVariantNumeric: "tabular-nums",
    flexShrink: 0,
    marginLeft: 8,
  },
  barRow: { display: "flex", alignItems: "center", gap: 8 },
  barTrack: {
    flex: 1,
    height: 4,
    backgroundColor: "#f1f5f9",
    borderRadius: 2,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 2,
    transition: "width 0.3s ease",
  },
  pct: {
    fontSize: 11,
    fontWeight: 500,
    color: "#94a3b8",
    width: 38,
    textAlign: "right" as const,
    flexShrink: 0,
  },
  footer: {
    padding: "10px 20px",
    borderTop: "1px solid #f1f5f9",
    textAlign: "center" as const,
    flexShrink: 0,
  },
  footerText: { fontSize: 12, color: "#94a3b8", fontWeight: 500 },
  metricsRow: {
    display: "flex",
    gap: 12,
    marginTop: 4,
    flexWrap: "wrap" as const,
  },
  metric: { fontSize: 10, color: "#64748b" },
  metricLabel: { color: "#94a3b8" },
};
