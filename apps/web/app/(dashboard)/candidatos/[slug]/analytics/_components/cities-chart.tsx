"use client";

import type { GA4City } from "./types";

type Props = {
  cities: GA4City[];
  primaryColor: string;
};

// Ciudades internacionales conocidas
const INTERNATIONAL_CITIES = new Set([
  "Fort Worth", "Aspen", "Council Bluffs", "Lulea", "Collegno", "Duluth",
  "Frankfurt am Main", "Gwalior", "Miami", "Paris", "Prineville", "Springfield",
  "Turin", "L'Hospitalet de Llobregat", "Siberut Tengah", "Srumbung",
]);

export function CitiesChart({ cities, primaryColor }: Props) {
  const peruCities = cities.filter((c) => 
    !INTERNATIONAL_CITIES.has(c.city) && 
    !c.city.match(/^\d+$/) && 
    !c.city.includes("Congressional")
  );
  
  const topCities = peruCities.slice(0, 10);
  const maxUsers = Math.max(...topCities.map((c) => c.activeUsers), 1);
  const totalPeru = peruCities.reduce((sum, c) => sum + c.activeUsers, 0);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={primaryColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span>Alcance Geografico</span>
        </div>
        <div style={styles.headerMeta}>
          <span style={styles.metaBadge}>{peruCities.length} ciudades</span>
        </div>
      </div>

      {/* Chart */}
      <div style={styles.chartArea}>
        {topCities.map((city, i) => {
          const pct = (city.activeUsers / maxUsers) * 100;
          const shareOfTotal = totalPeru > 0 ? ((city.activeUsers / totalPeru) * 100).toFixed(1) : "0";
          const isTop3 = i < 3;

          return (
            <div key={city.city} style={styles.row}>
              <div style={styles.rowLeft}>
                <span style={{ 
                  ...styles.rank, 
                  backgroundColor: isTop3 ? primaryColor : "var(--color-surface-active)",
                  color: isTop3 ? "var(--color-surface)" : "var(--color-text-secondary)",
                }}>
                  {i + 1}
                </span>
                <span style={{ ...styles.cityName, fontWeight: isTop3 ? 600 : 500 }}>
                  {city.city}
                </span>
              </div>
              <div style={styles.rowRight}>
                <div style={styles.barWrapper}>
                  <div 
                    style={{ 
                      ...styles.bar, 
                      width: `${pct}%`,
                      backgroundColor: isTop3 ? primaryColor : "#cbd5e1",
                      opacity: isTop3 ? 1 : 0.6,
                    }} 
                  />
                </div>
                <span style={{ ...styles.value, color: isTop3 ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}>
                  {city.activeUsers.toLocaleString()}
                </span>
                <span style={styles.pct}>{shareOfTotal}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {peruCities.length > 10 && (
        <div style={styles.footer}>
          <span style={styles.footerText}>
            y {peruCities.length - 10} ciudades mas en Peru
          </span>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: "var(--color-surface)",
    borderRadius: 16,
    border: "1px solid var(--color-border)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid var(--color-surface-active)",
  },
  headerTitle: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 15,
    fontWeight: 600,
    color: "var(--color-text-primary)",
  },
  headerMeta: {},
  metaBadge: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--color-text-secondary)",
    backgroundColor: "var(--color-surface-active)",
    padding: "4px 10px",
    borderRadius: 6,
  },
  chartArea: {
    padding: "12px 20px",
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 0",
    gap: 16,
  },
  rowLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: 140,
    flexShrink: 0,
  },
  rank: {
    width: 22,
    height: 22,
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
  },
  cityName: {
    fontSize: 13,
    color: "var(--color-text-secondary)",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  rowRight: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  barWrapper: {
    flex: 1,
    height: 8,
    backgroundColor: "var(--color-surface-active)",
    borderRadius: 4,
    overflow: "hidden",
  },
  bar: {
    height: "100%",
    borderRadius: 4,
    transition: "width 0.4s ease",
  },
  value: {
    fontSize: 13,
    fontWeight: 600,
    width: 50,
    textAlign: "right" as const,
  },
  pct: {
    fontSize: 11,
    color: "var(--color-text-tertiary)",
    width: 40,
    textAlign: "right" as const,
  },
  footer: {
    padding: "12px 20px",
    borderTop: "1px solid var(--color-surface-active)",
    backgroundColor: "#fafbfc",
  },
  footerText: {
    fontSize: 12,
    color: "var(--color-text-tertiary)",
  },
};
