"use client";

import type { GA4City } from "./types";

type Props = {
  cities: GA4City[];
  primaryColor: string;
  onCityHover?: (city: string | null) => void;
  onCityClick?: (city: string | null) => void;
  clickedCity?: string | null;
};

/* ── Peru city filter ────────────────────────────────────────────── */
const INTERNATIONAL_CITIES = new Set([
  "Fort Worth", "Aspen", "Council Bluffs", "Lulea", "Collegno", "Duluth",
  "Frankfurt am Main", "Gwalior", "Miami", "Paris", "Prineville", "Springfield",
  "Turin", "L'Hospitalet de Llobregat", "Siberut Tengah", "Srumbung",
  "North Carolina's 3rd Congressional District 2022 redistricting",
]);

function filterPeruCities(cities: GA4City[]): GA4City[] {
  return cities.filter(
    (c) => !INTERNATIONAL_CITIES.has(c.city) && !/^\d+$/.test(c.city) && !c.city.includes("Congressional"),
  );
}

function formatEngagementTime(seconds: number): string {
  if (seconds <= 0) return "0s";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

/* ── Component ───────────────────────────────────────────────────── */

export function CitiesRanking({ cities, primaryColor, onCityHover, onCityClick, clickedCity }: Props) {
  const peruCities = filterPeruCities(cities);
  const total = peruCities.reduce((s, c) => s + c.activeUsers, 0);
  const maxUsers = Math.max(...peruCities.map((c) => c.activeUsers), 1);
  const top = peruCities.slice(0, 15);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={primaryColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span style={styles.headerTitle}>Alcance Geografico</span>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.badge}>{peruCities.length} ciudades</span>
          <span style={{ ...styles.badge, backgroundColor: `${primaryColor}12`, color: primaryColor }}>
            {total.toLocaleString()} usuarios
          </span>
        </div>
      </div>

      {/* Ranking list */}
      <ul style={styles.listWrapper}>
        {top.map((city, i) => {
          const pct = total > 0 ? (city.activeUsers / total) * 100 : 0;
          const barW = (city.activeUsers / maxUsers) * 100;
          const isTop3 = i < 3;
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;

          const isClicked = clickedCity === city.city;

          return (
            <li
              key={city.city}
              style={{
                ...styles.row,
                backgroundColor: isClicked ? `${primaryColor}10` : undefined,
                borderLeft: isClicked ? `3px solid ${primaryColor}` : "3px solid transparent",
                cursor: "pointer",
              }}
              onMouseEnter={() => onCityHover?.(city.city)}
              onMouseLeave={() => onCityHover?.(null)}
            >
              <button
                type="button"
                onClick={() => onCityClick?.(isClicked ? null : city.city)}
                style={styles.rowButton}
                aria-label={`Zoom a ${city.city}`}
              >
              {/* Rank */}
              <div style={{
                ...styles.rank,
                backgroundColor: isTop3 ? `${primaryColor}12` : "var(--color-surface-hover)",
                color: isTop3 ? primaryColor : "var(--color-text-tertiary)",
                fontWeight: isTop3 ? 800 : 600,
              }}>
                {medal || i + 1}
              </div>

              {/* City info */}
              <div style={styles.cityInfo}>
                <div style={styles.cityTop}>
                  <span style={{
                    ...styles.cityName,
                    color: isTop3 ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                    fontWeight: isTop3 ? 600 : 500,
                  }}>
                    {city.city}
                  </span>
                  <span style={{
                    ...styles.cityUsers,
                    color: isTop3 ? primaryColor : "var(--color-text-secondary)",
                    fontWeight: isTop3 ? 700 : 600,
                  }}>
                    {city.activeUsers.toLocaleString()}
                  </span>
                </div>

                {/* Bar + percentage */}
                <div style={styles.barRow}>
                  <div style={styles.barTrack}>
                    <div style={{
                      ...styles.barFill,
                      width: `${barW}%`,
                      backgroundColor: isTop3 ? primaryColor : `${primaryColor}80`,
                      opacity: isTop3 ? 1 : 0.6,
                    }} />
                  </div>
                  <span style={styles.pct}>{pct.toFixed(1)}%</span>
                </div>

                {/* Enriched metrics row (only if available) */}
                {city.avgEngagementTime !== undefined && city.avgEngagementTime > 0 && (
                  <div style={styles.metricsRow}>
                    {city.newUsers !== undefined && (
                      <span style={styles.metric}>
                        <span style={styles.metricLabel}>Nuevos:</span>{" "}
                        {city.newUsers.toLocaleString()}
                      </span>
                    )}
                    <span style={styles.metric}>
                      <span style={styles.metricLabel}>Tiempo:</span>{" "}
                      {formatEngagementTime(city.avgEngagementTime)}
                    </span>
                    {city.events !== undefined && city.events > 0 && (
                      <span style={styles.metric}>
                        <span style={styles.metricLabel}>Eventos:</span>{" "}
                        {city.events.toLocaleString()}
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
      {peruCities.length > 15 && (
        <div style={styles.footer}>
          <span style={styles.footerText}>
            +{peruCities.length - 15} ciudades mas
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Styles ───────────────────────────────────────────────────────── */

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: "var(--color-surface)",
    borderRadius: 16,
    border: "1px solid var(--color-border)",
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
    borderBottom: "1px solid var(--color-surface-active)",
    flexShrink: 0,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "var(--color-text-primary)",
  },
  headerRight: {
    display: "flex",
    gap: 8,
  },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--color-text-secondary)",
    backgroundColor: "var(--color-surface-active)",
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
    gap: 0,
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
  cityInfo: {
    flex: 1,
    minWidth: 0,
  },
  cityTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  cityName: {
    fontSize: 13,
    lineHeight: 1.2,
  },
  cityUsers: {
    fontSize: 13,
    fontVariantNumeric: "tabular-nums",
    flexShrink: 0,
    marginLeft: 8,
  },
  barRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  barTrack: {
    flex: 1,
    height: 4,
    backgroundColor: "var(--color-surface-active)",
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
    color: "var(--color-text-tertiary)",
    width: 38,
    textAlign: "right" as const,
    flexShrink: 0,
  },
  footer: {
    padding: "10px 20px",
    borderTop: "1px solid var(--color-surface-active)",
    textAlign: "center" as const,
    flexShrink: 0,
  },
  footerText: {
    fontSize: 12,
    color: "var(--color-text-tertiary)",
    fontWeight: 500,
  },
  metricsRow: {
    display: "flex",
    gap: 12,
    marginTop: 4,
    flexWrap: "wrap" as const,
  },
  metric: {
    fontSize: 10,
    color: "var(--color-text-secondary)",
  },
  metricLabel: {
    color: "var(--color-text-tertiary)",
  },
};
