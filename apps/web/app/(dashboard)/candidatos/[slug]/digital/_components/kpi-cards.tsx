"use client";

import type { GA4Overview } from "./types";

type Props = {
  overview: GA4Overview;
  primaryColor: string;
  secondaryColor?: string;
};

export function KpiCards({ overview, primaryColor, secondaryColor }: Props) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins > 0) return { value: mins, unit: "min", sub: `${secs}s` };
    return { value: secs, unit: "seg", sub: null };
  };

  const time = formatTime(overview.avgEngagementTime);
  const newUsersPct = overview.activeUsers > 0 
    ? ((overview.newUsers / overview.activeUsers) * 100).toFixed(1) 
    : "0";

  const kpis = [
    {
      label: "Usuarios Activos",
      value: overview.activeUsers.toLocaleString(),
      change: null,
      icon: "users",
      color: primaryColor,
    },
    {
      label: "Usuarios Nuevos", 
      value: overview.newUsers.toLocaleString(),
      change: `${newUsersPct}% del total`,
      icon: "user-plus",
      color: secondaryColor || "#10b981",
    },
    {
      label: "Tiempo Promedio",
      value: `${time.value}`,
      unit: time.unit,
      change: time.sub ? `+ ${time.sub}` : null,
      icon: "clock",
      color: "#6366f1",
    },
    {
      label: "Eventos Totales",
      value: overview.totalEvents.toLocaleString(),
      change: `${(overview.totalEvents / overview.activeUsers).toFixed(1)} por usuario`,
      icon: "activity",
      color: "#f59e0b",
    },
  ];

  return (
    <div style={styles.grid}>
      {kpis.map((kpi, i) => (
        <div key={kpi.label} style={styles.card}>
          <div style={styles.cardInner}>
            <div style={styles.iconWrapper}>
              <div style={{ ...styles.iconBg, backgroundColor: `${kpi.color}15` }}>
                <KpiIcon name={kpi.icon} color={kpi.color} />
              </div>
            </div>
            <div style={styles.content}>
              <p style={styles.label}>{kpi.label}</p>
              <div style={styles.valueRow}>
                <span style={{ ...styles.value, color: kpi.color }}>{kpi.value}</span>
                {kpi.unit && <span style={styles.unit}>{kpi.unit}</span>}
              </div>
              {kpi.change && <p style={styles.change}>{kpi.change}</p>}
            </div>
          </div>
          {i < 3 && <div style={styles.divider} />}
        </div>
      ))}
    </div>
  );
}

function KpiIcon({ name, color }: { name: string; color: string }) {
  const props = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  
  switch (name) {
    case "users":
      return (
        <svg {...props} aria-hidden="true">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "user-plus":
      return (
        <svg {...props} aria-hidden="true">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <line x1="20" y1="8" x2="20" y2="14" />
          <line x1="23" y1="11" x2="17" y2="11" />
        </svg>
      );
    case "clock":
      return (
        <svg {...props} aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case "activity":
      return (
        <svg {...props} aria-hidden="true">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      );
    default:
      return null;
  }
}

const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: "flex",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    border: "1px solid #e2e8f0",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
    overflow: "hidden",
  },
  card: {
    flex: 1,
    display: "flex",
    alignItems: "stretch",
  },
  cardInner: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "20px 24px",
  },
  divider: {
    width: 1,
    backgroundColor: "#f1f5f9",
    margin: "12px 0",
  },
  iconWrapper: {},
  iconBg: {
    width: 48,
    height: 48,
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    margin: 0,
    fontSize: 12,
    fontWeight: 500,
    color: "#64748b",
    textTransform: "uppercase" as const,
    letterSpacing: "0.025em",
  },
  valueRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 4,
    marginTop: 4,
  },
  value: {
    fontSize: 28,
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: "-0.02em",
  },
  unit: {
    fontSize: 14,
    fontWeight: 500,
    color: "#94a3b8",
  },
  change: {
    margin: 0,
    marginTop: 6,
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: 500,
  },
};
