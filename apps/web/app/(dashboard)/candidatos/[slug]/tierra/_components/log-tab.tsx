"use client";

import { useEffect, useRef } from "react";
import type { LogEntry } from "./activity-log";

/* ========== Types ========== */

type Props = {
  entries: LogEntry[];
  onEntryClick: (entry: LogEntry) => void;
  onClearLog?: () => void;
  primaryColor: string;
};

/* ========== Constants ========== */

const ICON_BG: Record<LogEntry["type"], string> = {
  form_submitted: "#2563eb",
  form_new: "#1d4ed8",
  agent_connected: "#0d9488",
  agent_disconnected: "#64748b",
};

const ICON_LABEL: Record<LogEntry["type"], string> = {
  form_submitted: "^",
  form_new: "+",
  agent_connected: ">",
  agent_disconnected: "x",
};

/* ========== Helpers ========== */

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 10) return "ahora";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/* ========== Component ========== */

export function LogTab({ entries, onEntryClick, onClearLog, primaryColor }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(entries.length);

  // Auto-scroll to top when new entries arrive
  useEffect(() => {
    if (entries.length > prevCountRef.current && listRef.current) {
      listRef.current.scrollTop = 0;
    }
    prevCountRef.current = entries.length;
  }, [entries.length]);

  return (
    <div style={S.root}>
      {/* Header row */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <span style={S.liveDot} />
          <span style={S.title}>Log Operativo</span>
          <span style={{ ...S.countBadge, color: primaryColor }}>{entries.length}</span>
        </div>
        {onClearLog && entries.length > 0 && (
          <button type="button" onClick={onClearLog} style={S.clearBtn} aria-label="Limpiar log" title="Limpiar log">
            Limpiar
          </button>
        )}
      </div>

      {/* Entry list */}
      <div ref={listRef} style={S.list}>
        {entries.length === 0 ? (
          <div style={S.empty}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><title>Sin actividad</title><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#64748b" }}>Sin actividad reciente</span>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>Los eventos aparecerán aquí</span>
          </div>
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
                <span style={{ ...S.icon, backgroundColor: ICON_BG[entry.type] }}>
                  {ICON_LABEL[entry.type]}
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
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 16px",
    borderBottom: "1px solid #f1f5f9",
    flexShrink: 0,
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
    backgroundColor: "#0d9488",
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
  clearBtn: {
    fontSize: 11,
    fontWeight: 600,
    color: "#ef4444",
    backgroundColor: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 6,
    padding: "4px 10px",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },

  list: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "4px 8px",
  },
  empty: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 48,
    textAlign: "center" as const,
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
