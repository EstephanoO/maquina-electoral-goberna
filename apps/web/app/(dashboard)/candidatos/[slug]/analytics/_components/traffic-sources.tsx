"use client";

import type { GA4Source } from "./types";

type Props = {
  sources: GA4Source[];
  primaryColor: string;
};

const SOURCE_COLORS: Record<string, string> = {
  fb: "#1877f2",
  facebook: "#1877f2",
  ig: "#e4405f",
  instagram: "#e4405f",
  google: "#34a853",
  direct: "#6366f1",
  "(direct)": "#6366f1",
  twitter: "#1da1f2",
  tiktok: "#000000",
  youtube: "#ff0000",
};

const SOURCE_ICONS: Record<string, string> = {
  fb: "facebook",
  "(direct)": "globe",
  ig: "instagram",
  google: "search",
  "m.facebook.com": "smartphone",
  "l.facebook.com": "link",
  "facebook.com": "facebook",
};

export function TrafficSources({ sources, primaryColor }: Props) {
  const total = sources.reduce((sum, s) => sum + s.users, 0);
  const sorted = [...sources].sort((a, b) => b.users - a.users);
  const top = sorted.slice(0, 6);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={primaryColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <span>Fuentes de Trafico</span>
        </div>
      </div>

      <div style={styles.content}>
        {/* Donut chart */}
        <div style={styles.chartWrapper}>
          <svg viewBox="0 0 100 100" style={styles.donut} aria-hidden="true">
            {renderDonutSegments(sorted, total)}
            <circle cx="50" cy="50" r="32" fill="#fff" />
          </svg>
          <div style={styles.chartCenter}>
            <span style={styles.chartValue}>{total.toLocaleString()}</span>
            <span style={styles.chartLabel}>usuarios</span>
          </div>
        </div>

        {/* Legend */}
        <div style={styles.legend}>
          {top.map((source) => {
            const pct = total > 0 ? ((source.users / total) * 100) : 0;
            const color = getSourceColor(source.source);
            const label = getSourceLabel(source.source);
            const medium = getMediumLabel(source.medium);

            return (
              <div key={`${source.source}-${source.medium}`} style={styles.legendItem}>
                <div style={{ ...styles.legendDot, backgroundColor: color }} />
                <div style={styles.legendContent}>
                  <div style={styles.legendMain}>
                    <span style={styles.legendLabel}>{label}</span>
                    {medium && <span style={styles.legendMedium}>{medium}</span>}
                  </div>
                  <div style={styles.legendStats}>
                    <span style={styles.legendValue}>{source.users.toLocaleString()}</span>
                    <div style={styles.legendBar}>
                      <div style={{ ...styles.legendBarFill, width: `${pct}%`, backgroundColor: color }} />
                    </div>
                    <span style={styles.legendPct}>{pct.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function getSourceColor(source: string): string {
  const key = source.toLowerCase();
  for (const [k, color] of Object.entries(SOURCE_COLORS)) {
    if (key.includes(k)) return color;
  }
  return "var(--color-text-tertiary)";
}

function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    fb: "Facebook Ads",
    "(direct)": "Trafico Directo",
    ig: "Instagram Ads",
    google: "Google",
    "m.facebook.com": "Facebook Mobile",
    "l.facebook.com": "Facebook Links",
    "facebook.com": "Facebook",
    "(data not available)": "No disponible",
  };
  return labels[source] || source;
}

function getMediumLabel(medium: string): string | null {
  const labels: Record<string, string> = {
    paid: "Pagado",
    referral: "Referencia",
    organic: "Organico",
    cpc: "CPC",
  };
  if (medium === "(none)" || !medium) return null;
  return labels[medium] || medium;
}

function renderDonutSegments(sources: GA4Source[], total: number) {
  if (total === 0) return null;

  const segments: React.ReactElement[] = [];
  let cumulative = 0;
  const circumference = 2 * Math.PI * 42;

  for (const source of sources.slice(0, 8)) {
    const pct = source.users / total;
    const color = getSourceColor(source.source);
    const dashArray = `${pct * circumference} ${circumference}`;
    const dashOffset = -cumulative * circumference;

    segments.push(
      <circle
        key={`${source.source}-${source.medium}`}
        cx="50"
        cy="50"
        r="42"
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeDasharray={dashArray}
        strokeDashoffset={dashOffset}
        transform="rotate(-90 50 50)"
        style={{ transition: "stroke-dasharray 0.4s ease" }}
      />
    );
    cumulative += pct;
  }

  return segments;
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
  content: {
    display: "flex",
    padding: 20,
    gap: 24,
  },
  chartWrapper: {
    position: "relative" as const,
    width: 160,
    height: 160,
    flexShrink: 0,
  },
  donut: {
    width: "100%",
    height: "100%",
  },
  chartCenter: {
    position: "absolute" as const,
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    textAlign: "center" as const,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
  },
  chartValue: {
    fontSize: 24,
    fontWeight: 700,
    color: "var(--color-text-primary)",
    lineHeight: 1,
  },
  chartLabel: {
    fontSize: 11,
    color: "var(--color-text-tertiary)",
    marginTop: 2,
  },
  legend: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    gap: 12,
  },
  legendItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    marginTop: 4,
    flexShrink: 0,
  },
  legendContent: {
    flex: 1,
    minWidth: 0,
  },
  legendMain: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  legendLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--color-text-secondary)",
  },
  legendMedium: {
    fontSize: 10,
    fontWeight: 500,
    color: "var(--color-text-tertiary)",
    backgroundColor: "var(--color-surface-active)",
    padding: "2px 6px",
    borderRadius: 4,
  },
  legendStats: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  legendValue: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--color-text-secondary)",
    width: 50,
  },
  legendBar: {
    flex: 1,
    height: 4,
    backgroundColor: "var(--color-surface-active)",
    borderRadius: 2,
    overflow: "hidden",
  },
  legendBarFill: {
    height: "100%",
    borderRadius: 2,
    transition: "width 0.4s ease",
  },
  legendPct: {
    fontSize: 11,
    fontWeight: 500,
    color: "var(--color-text-tertiary)",
    width: 40,
    textAlign: "right" as const,
  },
};
