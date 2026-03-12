"use client";

import { useState } from "react";
import type { GA4Page } from "./types";

type Props = {
  pages: GA4Page[];
  primaryColor: string;
};

const INITIAL_ROWS = 10;

export function PagesTable({ pages, primaryColor }: Props) {
  const [expanded, setExpanded] = useState(false);
  const maxViews = Math.max(...pages.map((p) => p.views), 1);
  const totalViews = pages.reduce((sum, p) => sum + p.views, 0);
  const visiblePages = expanded ? pages : pages.slice(0, INITIAL_ROWS);
  const hasMore = pages.length > INITIAL_ROWS;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={primaryColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span>Paginas Principales</span>
        </div>
        <div style={styles.headerMeta}>
          <span style={styles.metaValue}>{totalViews.toLocaleString()}</span>
          <span style={styles.metaLabel}>vistas totales</span>
        </div>
      </div>

      {/* Table */}
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.th, ...styles.thPage }}>Pagina</th>
              <th style={{ ...styles.th, ...styles.thNum }}>Vistas</th>
              <th style={{ ...styles.th, ...styles.thNum }}>Usuarios</th>
              <th style={{ ...styles.th, ...styles.thNum }}>Rebote</th>
            </tr>
          </thead>
          <tbody>
            {visiblePages.map((page, i) => {
              const barWidth = (page.views / maxViews) * 100;
              const bounce = Math.round(page.bounceRate * 100);
              const bounceColor = bounce > 90 ? "#ef4444" : bounce > 70 ? "#f59e0b" : "#10b981";

              return (
                <tr key={page.title} style={styles.row}>
                  <td style={styles.tdPage}>
                    <div style={styles.pageCell}>
                      <span style={{ ...styles.rank, backgroundColor: i < 3 ? `${primaryColor}15` : "var(--color-surface-hover)", color: i < 3 ? primaryColor : "var(--color-text-tertiary)" }}>
                        {i + 1}
                      </span>
                      <div style={styles.pageInfo}>
                        <span style={styles.pageTitle} title={page.title}>
                          {truncate(page.title, 45)}
                        </span>
                        <div style={styles.progressBar}>
                          <div style={{ ...styles.progressFill, width: `${barWidth}%`, backgroundColor: primaryColor, opacity: 0.2 + (barWidth / 100) * 0.6 }} />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={styles.tdNum}>
                    <span style={styles.numValue}>{page.views.toLocaleString()}</span>
                  </td>
                  <td style={styles.tdNum}>
                    <span style={styles.numValueLight}>{page.activeUsers.toLocaleString()}</span>
                  </td>
                  <td style={styles.tdNum}>
                    <span style={{ ...styles.bounceChip, backgroundColor: `${bounceColor}15`, color: bounceColor }}>
                      {bounce}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Expand/collapse */}
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          style={styles.expandBtn}
        >
          {expanded ? "Mostrar menos" : `Ver todas (${pages.length})`}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: expanded ? "rotate(180deg)" : undefined, transition: "transform 0.2s" }}
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}
    </div>
  );
}

function truncate(str: string, len: number): string {
  // Remove common suffixes for cleaner display
  let clean = str.replace(/ - Cesar Vasquez( 2026)?/gi, "").replace(/Cesar Vasquez/gi, "").trim();
  if (clean.length === 0) clean = str;
  if (clean.length <= len) return clean;
  return clean.slice(0, len - 1) + "…";
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
  headerMeta: {
    display: "flex",
    alignItems: "baseline",
    gap: 6,
  },
  metaValue: {
    fontSize: 18,
    fontWeight: 700,
    color: "var(--color-text-primary)",
  },
  metaLabel: {
    fontSize: 12,
    color: "var(--color-text-tertiary)",
  },
  tableWrapper: {
    overflowX: "auto" as const,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
  },
  th: {
    padding: "10px 20px",
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: "var(--color-text-tertiary)",
    borderBottom: "1px solid var(--color-surface-active)",
    backgroundColor: "#fafbfc",
  },
  thPage: {
    textAlign: "left" as const,
  },
  thNum: {
    textAlign: "right" as const,
    width: 80,
  },
  row: {
    transition: "background-color 0.15s ease",
  },
  tdPage: {
    padding: "12px 20px",
    borderBottom: "1px solid var(--color-surface-hover)",
  },
  tdNum: {
    padding: "12px 20px",
    textAlign: "right" as const,
    borderBottom: "1px solid var(--color-surface-hover)",
  },
  pageCell: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  rank: {
    width: 24,
    height: 24,
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
  },
  pageInfo: {
    flex: 1,
    minWidth: 0,
  },
  pageTitle: {
    display: "block",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--color-text-secondary)",
    marginBottom: 6,
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  progressBar: {
    height: 3,
    backgroundColor: "var(--color-surface-active)",
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 4,
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
    transition: "width 0.4s ease",
  },
  numValue: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--color-text-primary)",
  },
  numValueLight: {
    fontSize: 14,
    fontWeight: 500,
    color: "var(--color-text-secondary)",
  },
  bounceChip: {
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
  },
  expandBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: "100%",
    padding: "10px 0",
    border: "none",
    borderTop: "1px solid var(--color-surface-active)",
    backgroundColor: "transparent",
    color: "var(--color-text-secondary)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
};
