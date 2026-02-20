/**
 * GOBERNA — SourceQuality Component
 * Channel quality analysis: which sources bring the best users.
 * Combines source data with engagement metrics.
 */

"use client";

import { useMemo } from "react";
import type { GA4Source, GA4SessionSource } from "./types";

type Props = {
  sources: GA4Source[];
  sessionSources: GA4SessionSource[];
  primaryColor: string;
};

type SourceWithQuality = {
  source: string;
  medium: string;
  users: number;
  sessions: number;
  sessionsPerUser: number;
  userShare: number;
  qualityScore: number; // 0-100 composite score
};

/** Known channel colors */
const CHANNEL_COLORS: Record<string, string> = {
  facebook: "#1877F2",
  fb: "#1877F2",
  instagram: "#E4405F",
  ig: "#E4405F",
  google: "#4285F4",
  twitter: "#1DA1F2",
  tiktok: "#000000",
  youtube: "#FF0000",
  direct: "#64748b",
  "(direct)": "#64748b",
};

const MEDIUM_LABELS: Record<string, string> = {
  paid: "Pagado",
  Pagado: "Pagado",
  organic: "Organico",
  referral: "Referencia",
  "(none)": "Directo",
  cpc: "CPC",
  social: "Social",
};

export function SourceQuality({ sources, sessionSources, primaryColor }: Props) {
  const data = useMemo(() => {
    if (!sources.length) return [];

    const totalUsers = sources.reduce((sum, s) => sum + s.users, 0);

    // Build session map for lookup
    const sessionMap = new Map<string, number>();
    for (const ss of sessionSources) {
      const key = `${ss.source.toLowerCase()}/${ss.medium.toLowerCase()}`;
      sessionMap.set(key, (sessionMap.get(key) || 0) + ss.sessions);
    }

    const result: SourceWithQuality[] = sources.map((s) => {
      const key = `${s.source.toLowerCase()}/${s.medium.toLowerCase()}`;
      const sessions = sessionMap.get(key) || 0;
      const sessionsPerUser = s.users > 0 ? sessions / s.users : 0;
      const userShare = totalUsers > 0 ? s.users / totalUsers : 0;

      // Quality score: composite of sessions/user ratio and user share
      // Higher sessions/user = more engaged audience
      const engagementScore = Math.min(sessionsPerUser * 40, 60); // 0-60
      const volumeScore = Math.min(userShare * 200, 40); // 0-40
      const qualityScore = Math.round(engagementScore + volumeScore);

      return {
        source: s.source,
        medium: s.medium,
        users: s.users,
        sessions,
        sessionsPerUser,
        userShare,
        qualityScore: Math.min(qualityScore, 100),
      };
    });

    // Sort by users descending
    return result.sort((a, b) => b.users - a.users);
  }, [sources, sessionSources]);

  if (!data.length) {
    return (
      <div style={S.container}>
        <div style={S.headerRow}>
          <h3 style={S.title}>Calidad por Canal</h3>
        </div>
        <div style={S.empty}>
          <span style={S.emptyText}>Sin datos de canales</span>
        </div>
      </div>
    );
  }

  const maxUsers = data[0]?.users || 1;

  return (
    <div style={S.container}>
      <div style={S.headerRow}>
        <h3 style={S.title}>Calidad por Canal</h3>
        <span style={S.badge}>{data.length} canales</span>
      </div>

      {/* Summary row */}
      <div style={S.summaryRow}>
        <SummaryCard
          label="Total usuarios"
          value={data.reduce((s, d) => s + d.users, 0).toLocaleString()}
        />
        <SummaryCard
          label="Canal principal"
          value={formatSourceName(data[0]?.source || "")}
        />
        <SummaryCard
          label="Mejor engagement"
          value={formatSourceName(
            data.filter((d) => d.users > 5).sort((a, b) => b.sessionsPerUser - a.sessionsPerUser)[0]?.source || "-"
          )}
        />
      </div>

      {/* Channel list */}
      <div style={S.list}>
        {data.slice(0, 10).map((ch, idx) => {
          const barWidth = Math.max(4, (ch.users / maxUsers) * 100);
          const color = getChannelColor(ch.source, primaryColor);

          return (
            <div key={`${ch.source}/${ch.medium}`} style={S.row}>
              {/* Color dot + source */}
              <div style={S.sourceCol}>
                <div style={{ ...S.colorDot, backgroundColor: color }} />
                <div style={S.sourceInfo}>
                  <span style={S.sourceName}>{formatSourceName(ch.source)}</span>
                  <span style={S.mediumTag}>
                    {MEDIUM_LABELS[ch.medium] || ch.medium}
                  </span>
                </div>
              </div>

              {/* Bar + stats */}
              <div style={S.dataCol}>
                <div style={S.barContainer}>
                  <div style={S.barBg}>
                    <div style={{
                      ...S.bar,
                      width: `${barWidth}%`,
                      backgroundColor: color,
                    }} />
                  </div>
                  <span style={S.barPercent}>
                    {(ch.userShare * 100).toFixed(1)}%
                  </span>
                </div>

                <div style={S.statsRow}>
                  <span style={S.stat}>
                    <strong>{ch.users.toLocaleString()}</strong> usuarios
                  </span>
                  {ch.sessions > 0 && (
                    <span style={S.stat}>
                      <strong>{ch.sessionsPerUser.toFixed(1)}</strong> ses/usr
                    </span>
                  )}
                  {/* Quality indicator */}
                  <span style={{
                    ...S.qualityBadge,
                    backgroundColor: ch.qualityScore >= 60 ? "#dcfce7" :
                                     ch.qualityScore >= 30 ? "#fef9c3" : "#fef2f2",
                    color: ch.qualityScore >= 60 ? "#166534" :
                           ch.qualityScore >= 30 ? "#854d0e" : "#991b1b",
                  }}>
                    {ch.qualityScore >= 60 ? "Alta" : ch.qualityScore >= 30 ? "Media" : "Baja"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {data.length > 10 && (
        <div style={S.moreText}>+{data.length - 10} canales mas</div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={S.summaryCard}>
      <span style={S.summaryValue}>{value}</span>
      <span style={S.summaryLabel}>{label}</span>
    </div>
  );
}

function formatSourceName(source: string): string {
  const names: Record<string, string> = {
    fb: "Facebook",
    ig: "Instagram",
    google: "Google",
    "(direct)": "Directo",
    "(not set)": "No definido",
    "(data not available)": "Sin datos",
    "m.facebook.com": "Facebook (m)",
    "l.facebook.com": "Facebook (l)",
    "facebook.com": "Facebook",
    "t.co": "Twitter/X",
  };
  return names[source] || source;
}

function getChannelColor(source: string, fallback: string): string {
  const lower = source.toLowerCase();
  for (const [key, color] of Object.entries(CHANNEL_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return fallback;
}

const S: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    border: "1px solid #e2e8f0",
    padding: 20,
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: "#0f172a",
  },
  badge: {
    fontSize: 11,
    fontWeight: 500,
    color: "#64748b",
    backgroundColor: "#f1f5f9",
    padding: "3px 8px",
    borderRadius: 4,
  },
  summaryRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 8,
    marginBottom: 16,
  },
  summaryCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    padding: "10px 12px",
    textAlign: "center" as const,
  },
  summaryValue: {
    display: "block",
    fontSize: 14,
    fontWeight: 700,
    color: "#1e293b",
  },
  summaryLabel: {
    display: "block",
    fontSize: 9,
    fontWeight: 500,
    color: "#94a3b8",
    textTransform: "uppercase" as const,
    marginTop: 2,
  },
  list: {
    flex: 1,
    overflow: "auto",
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  },
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
  },
  sourceCol: {
    width: 120,
    flexShrink: 0,
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    paddingTop: 2,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    marginTop: 4,
    flexShrink: 0,
  },
  sourceInfo: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
  },
  sourceName: {
    fontSize: 12,
    fontWeight: 600,
    color: "#1e293b",
  },
  mediumTag: {
    fontSize: 9,
    fontWeight: 500,
    color: "#64748b",
    backgroundColor: "#f1f5f9",
    padding: "1px 5px",
    borderRadius: 3,
    display: "inline-block",
    width: "fit-content",
  },
  dataCol: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
    minWidth: 0,
  },
  barContainer: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  barBg: {
    flex: 1,
    height: 6,
    backgroundColor: "#f1f5f9",
    borderRadius: 3,
    overflow: "hidden",
  },
  bar: {
    height: "100%",
    borderRadius: 3,
    transition: "width 0.4s ease",
  },
  barPercent: {
    fontSize: 11,
    fontWeight: 600,
    color: "#334155",
    minWidth: 36,
    textAlign: "right" as const,
  },
  statsRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
  },
  stat: {
    fontSize: 10,
    color: "#64748b",
  },
  qualityBadge: {
    fontSize: 9,
    fontWeight: 600,
    padding: "1px 6px",
    borderRadius: 3,
  },
  moreText: {
    fontSize: 11,
    color: "#94a3b8",
    textAlign: "center" as const,
    marginTop: 8,
  },
  empty: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: 32,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: 600,
    color: "#94a3b8",
  },
};
