/**
 * GOBERNA — PagesDetailedTable Component
 * Table showing page performance by URL path with engagement metrics.
 * Data from Paginas y Pantallas CSV.
 */

"use client";

import { useMemo, useState } from "react";
import type { GA4PageDetailed } from "./types";

type Props = {
  pages: GA4PageDetailed[];
  primaryColor: string;
};

type SortKey = "views" | "activeUsers" | "avgEngagementTime" | "events";

export function PagesDetailedTable({ pages, primaryColor }: Props) {
  const [sortBy, setSortBy] = useState<SortKey>("views");

  const sorted = useMemo(() => {
    return [...pages].sort((a, b) => b[sortBy] - a[sortBy]);
  }, [pages, sortBy]);

  if (!sorted.length) {
    return (
      <div style={S.container}>
        <div style={S.headerRow}>
          <h3 style={S.title}>Performance por Pagina</h3>
        </div>
        <div style={S.empty}>
          <span style={S.emptyText}>Sin datos detallados de paginas</span>
          <span style={S.emptyHint}>Sube el CSV de Paginas y Pantallas</span>
        </div>
      </div>
    );
  }

  const maxViews = sorted[0]?.views || 1;
  const maxTime = Math.max(...sorted.map((p) => p.avgEngagementTime));

  return (
    <div style={S.container}>
      <div style={S.headerRow}>
        <h3 style={S.title}>Performance por Pagina</h3>
        <span style={S.badge}>{sorted.length} URLs</span>
      </div>

      {/* Sort tabs */}
      <div style={S.sortRow}>
        {(["views", "activeUsers", "avgEngagementTime", "events"] as SortKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setSortBy(key)}
            style={{
              ...S.sortBtn,
              backgroundColor: sortBy === key ? primaryColor : "transparent",
              color: sortBy === key ? "#fff" : "var(--color-text-secondary)",
            }}
          >
            {key === "views" && "Vistas"}
            {key === "activeUsers" && "Usuarios"}
            {key === "avgEngagementTime" && "Tiempo"}
            {key === "events" && "Eventos"}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={S.tableWrap}>
        {sorted.map((page, idx) => {
          const viewsPct = (page.views / maxViews) * 100;
          const timeLabel = formatTime(page.avgEngagementTime);
          const isHome = page.path === "/";
          const isBlog = page.path.includes("/2026/") || page.path.includes("/archivo-blog");

          return (
            <div key={page.path} style={S.row}>
              {/* Rank */}
              <div style={S.rankCol}>
                <span style={{
                  ...S.rank,
                  backgroundColor: idx < 3 ? primaryColor : "var(--color-surface-active)",
                  color: idx < 3 ? "#fff" : "var(--color-text-secondary)",
                }}>
                  {idx + 1}
                </span>
              </div>

              {/* Page info */}
              <div style={S.pageCol}>
                <div style={S.pagePath}>
                  {isHome && <span style={S.homeTag}>HOME</span>}
                  {isBlog && <span style={S.blogTag}>BLOG</span>}
                  <span style={S.pathText}>{truncatePath(page.path)}</span>
                </div>
                {/* Progress bar */}
                <div style={S.progressBg}>
                  <div style={{
                    ...S.progressBar,
                    width: `${viewsPct}%`,
                    backgroundColor: primaryColor,
                  }} />
                </div>
              </div>

              {/* Metrics */}
              <div style={S.metricsCol}>
                <div style={S.metric}>
                  <span style={S.metricValue}>{page.views.toLocaleString()}</span>
                  <span style={S.metricLabel}>vistas</span>
                </div>
                <div style={S.metric}>
                  <span style={S.metricValue}>{page.activeUsers.toLocaleString()}</span>
                  <span style={S.metricLabel}>usuarios</span>
                </div>
                <div style={S.metric}>
                  <span style={{
                    ...S.metricValue,
                    color: page.avgEngagementTime > (maxTime * 0.5) ? "#10b981" :
                           page.avgEngagementTime > (maxTime * 0.2) ? "#f59e0b" : "var(--color-text-tertiary)",
                  }}>
                    {timeLabel}
                  </span>
                  <span style={S.metricLabel}>tiempo</span>
                </div>
                <div style={S.metric}>
                  <span style={S.metricValue}>{page.viewsPerUser.toFixed(1)}</span>
                  <span style={S.metricLabel}>v/usr</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function truncatePath(path: string): string {
  if (path.length <= 40) return path;
  return `${path.slice(0, 37)}...`;
}

function formatTime(seconds: number): string {
  if (seconds < 1) return "0s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

const S: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: "var(--color-surface)",
    borderRadius: 16,
    border: "1px solid var(--color-border)",
    padding: 20,
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: "var(--color-text-primary)",
  },
  badge: {
    fontSize: 11,
    fontWeight: 500,
    color: "var(--color-text-secondary)",
    backgroundColor: "var(--color-surface-active)",
    padding: "3px 8px",
    borderRadius: 4,
  },
  sortRow: {
    display: "flex",
    gap: 4,
    marginBottom: 14,
    padding: 3,
    backgroundColor: "var(--color-surface-hover)",
    borderRadius: 8,
  },
  sortBtn: {
    flex: 1,
    padding: "5px 8px",
    borderRadius: 6,
    border: "none",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  tableWrap: {
    flex: 1,
    overflow: "auto",
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 6px",
    borderRadius: 8,
    transition: "background 0.15s",
  },
  rankCol: {
    width: 28,
    flexShrink: 0,
  },
  rank: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 22,
    height: 22,
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 700,
  },
  pageCol: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
  },
  pagePath: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  pathText: {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--color-text-primary)",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
    fontFamily: "monospace",
  },
  homeTag: {
    fontSize: 8,
    fontWeight: 700,
    color: "#fff",
    backgroundColor: "#3b82f6",
    padding: "1px 5px",
    borderRadius: 3,
    flexShrink: 0,
  },
  blogTag: {
    fontSize: 8,
    fontWeight: 700,
    color: "#fff",
    backgroundColor: "#8b5cf6",
    padding: "1px 5px",
    borderRadius: 3,
    flexShrink: 0,
  },
  progressBg: {
    height: 3,
    backgroundColor: "var(--color-surface-active)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 2,
    transition: "width 0.4s ease",
  },
  metricsCol: {
    display: "flex",
    gap: 14,
    flexShrink: 0,
  },
  metric: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "flex-end",
    minWidth: 42,
  },
  metricValue: {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--color-text-primary)",
  },
  metricLabel: {
    fontSize: 9,
    color: "var(--color-text-tertiary)",
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
    color: "var(--color-text-tertiary)",
  },
  emptyHint: {
    fontSize: 11,
    color: "#cbd5e1",
  },
};
