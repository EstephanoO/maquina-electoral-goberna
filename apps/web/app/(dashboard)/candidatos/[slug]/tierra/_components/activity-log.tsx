"use client";

import { useEffect, useRef } from "react";
import type { LogEntry } from "./types";
import { LOG_ICON_BG, LOG_ICON_LABEL } from "./constants";
import { timeAgo } from "./utils";

/* ========== Types ========== */

// LogEntry is now defined in types.ts and re-exported from index.ts

type Props = {
  entries: LogEntry[];
  onEntryClick: (entry: LogEntry) => void;
  onClearLog?: () => void;
  primaryColor: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
};

/* ========== Component ========== */

export function ActivityLog({ entries, onEntryClick, onClearLog, primaryColor, collapsed, onToggleCollapse }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(entries.length);

  // Auto-scroll to top when new entries arrive
  useEffect(() => {
    if (entries.length > prevCountRef.current && listRef.current) {
      listRef.current.scrollTop = 0;
    }
    prevCountRef.current = entries.length;
  }, [entries.length]);

  if (collapsed) {
    return (
      <div style={S.collapsedRoot}>
        <button type="button" onClick={onToggleCollapse} style={S.expandBtn} title="Abrir log operativo">
          <span style={S.expandIcon}>&#9650;</span>
          <span style={S.expandLabel}>LOG</span>
          {entries.length > 0 && <span style={{ ...S.badge, backgroundColor: primaryColor }}>{entries.length}</span>}
        </button>
      </div>
    );
  }

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <span style={{ ...S.liveDot, backgroundColor: "#0d9488" }} />
          <span style={S.title}>Log Operativo</span>
          <span style={{ ...S.countBadge, color: primaryColor }}>{entries.length}</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {onClearLog && entries.length > 0 && (
            <button type="button" onClick={onClearLog} style={S.clearBtn} aria-label="Limpiar log" title="Limpiar log">
              &#10005;
            </button>
          )}
          <button type="button" onClick={onToggleCollapse} style={S.collapseBtn} aria-label="Minimizar log">
            &#9660;
          </button>
        </div>
      </div>

      {/* Entry list */}
      <div ref={listRef} style={S.list}>
        {entries.length === 0 ? (
          <div style={S.empty}>Sin actividad reciente</div>
        ) : (
          entries.map((entry) => {
            const hasLocation = entry.lat != null && entry.lng != null;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => hasLocation && onEntryClick(entry)}
                style={{
                  ...S.entry,
                  cursor: hasLocation ? "pointer" : "default",
                }}
                title={hasLocation ? "Click para ver en mapa" : undefined}
              >
                {/* Icon */}
                <span style={{ ...S.icon, backgroundColor: LOG_ICON_BG[entry.type] }}>
                  {LOG_ICON_LABEL[entry.type]}
                </span>

                {/* Content */}
                <div style={S.entryContent}>
                  <div style={S.entryMsg}>
                    <span style={S.entryAgent}>{entry.agentName}</span>
                    {" "}
                    <span style={S.entryAction}>{entry.message}</span>
                  </div>
                  <span style={S.entryTime}>{timeAgo(entry.timestamp)}</span>
                </div>

                {/* Location indicator */}
                {hasLocation && (
                  <span style={{ ...S.locPin, color: primaryColor }}>&#9679;</span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ========== Styles ========== */

const S: Record<string, React.CSSProperties> = {
  root: {
    width: 300,
    maxHeight: 340,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  collapsedRoot: {
    display: "flex",
  },
  expandBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 700,
    color: "#64748b",
    letterSpacing: "0.05em",
  },
  expandIcon: {
    fontSize: 8,
  },
  expandLabel: {},
  badge: {
    color: "#fff",
    fontSize: 10,
    fontWeight: 700,
    padding: "1px 6px",
    borderRadius: 10,
    minWidth: 18,
    textAlign: "center" as const,
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 14px",
    borderBottom: "1px solid #f1f5f9",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
  },
  title: {
    fontSize: 12,
    fontWeight: 700,
    color: "#1e293b",
    letterSpacing: "0.02em",
  },
  countBadge: {
    fontSize: 11,
    fontWeight: 700,
  },
  collapseBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    border: "1px solid #e2e8f0",
    backgroundColor: "#f8fafc",
    color: "#94a3b8",
    fontSize: 10,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  clearBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    border: "1px solid #fecaca",
    backgroundColor: "#fef2f2",
    color: "#ef4444",
    fontSize: 10,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  list: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "4px 6px",
  },
  empty: {
    padding: 24,
    textAlign: "center" as const,
    color: "#94a3b8",
    fontSize: 12,
  },
  entry: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 8,
    border: "none",
    backgroundColor: "transparent",
    textAlign: "left" as const,
    transition: "background 0.12s ease",
  },
  icon: {
    width: 26,
    height: 26,
    borderRadius: 7,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontSize: 12,
    fontWeight: 800,
    flexShrink: 0,
  },
  entryContent: {
    flex: 1,
    minWidth: 0,
  },
  entryMsg: {
    fontSize: 12,
    lineHeight: 1.3,
    color: "#334155",
  },
  entryAgent: {
    fontWeight: 700,
    color: "#1e293b",
  },
  entryAction: {
    fontWeight: 400,
    color: "#64748b",
  },
  entryTime: {
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 1,
  },
  locPin: {
    fontSize: 8,
    flexShrink: 0,
    opacity: 0.6,
  },
};
