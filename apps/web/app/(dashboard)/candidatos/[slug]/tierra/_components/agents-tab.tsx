"use client";

import { useState, useMemo, useCallback } from "react";
import type { EnrichedAgent, AgentStatus } from "./types";
import { STATUS_CFG } from "./constants";
import { getTimeAgo } from "./utils";

/* ========== Types ========== */

type Props = {
  agents: EnrichedAgent[];
  selectedAgentId: string | null;
  primaryColor: string;
  onSelectAgent: (agentId: string) => void;
  onWhatsApp?: (agent: EnrichedAgent) => void;
  routeAgentId?: string | null;
  onViewRoute?: (agentId: string) => void;
};

/* ========== Component ========== */

export function AgentsTab({ agents, selectedAgentId, primaryColor, onSelectAgent, onWhatsApp, routeAgentId, onViewRoute }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AgentStatus | "all">("all");

  // Status counts
  const counts = useMemo(() => {
    const c = { connected: 0, idle: 0, inactive: 0 };
    for (const a of agents) c[a.status]++;
    return c;
  }, [agents]);

  // Filtered agents
  const filtered = useMemo(() => {
    return agents.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return a.name.toLowerCase().includes(q) || a.id.includes(q);
      }
      return true;
    });
  }, [agents, statusFilter, search]);

  const handleWhatsApp = useCallback((e: React.MouseEvent, agent: EnrichedAgent) => {
    e.stopPropagation();
    if (onWhatsApp) onWhatsApp(agent);
  }, [onWhatsApp]);

  const handleRoute = useCallback((e: React.MouseEvent, agentId: string) => {
    e.stopPropagation();
    if (onViewRoute) onViewRoute(agentId);
  }, [onViewRoute]);

  return (
    <div style={S.root}>
      {/* Status filter pills */}
      <div style={S.filters}>
        {(["connected", "idle", "inactive"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
            style={{
              ...S.filterBtn,
              backgroundColor: statusFilter === s ? STATUS_CFG[s].color : "#f8fafc",
              color: statusFilter === s ? "#fff" : STATUS_CFG[s].color,
              borderColor: statusFilter === s ? STATUS_CFG[s].color : "#e2e8f0",
            }}
          >
            <span style={S.filterCount}>{counts[s]}</span>
            <span style={S.filterLabel}>{STATUS_CFG[s].label}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={S.searchBox}>
        <div style={S.searchWrap}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><title>Buscar</title><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar agente..."
            style={S.searchInput}
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} style={S.clearBtn} aria-label="Limpiar">&#10005;</button>
          )}
        </div>
      </div>

      {/* List header */}
      <div style={S.listHeader}>
        <span style={S.listTitle}>Agentes ({filtered.length})</span>
        <span style={S.liveTag}>
          <span style={S.liveDot} />
          LIVE
        </span>
      </div>

      {/* Agent list */}
      <div style={S.list}>
        {filtered.length === 0 ? (
          <div style={S.empty}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><title>Sin agentes</title><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#64748b" }}>Sin agentes</span>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              {search || statusFilter !== "all" ? "Intenta con otros filtros" : "Los agentes aparecerán aquí"}
            </span>
          </div>
        ) : (
          filtered.map((agent) => {
            const isSelected = selectedAgentId === agent.id;
            const cfg = STATUS_CFG[agent.status];
            return (
              <div
                key={agent.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectAgent(agent.id)}
                onKeyDown={(e) => e.key === "Enter" && onSelectAgent(agent.id)}
                style={{
                  ...S.row,
                  backgroundColor: isSelected ? `${primaryColor}08` : "transparent",
                  borderLeftColor: cfg.color,
                }}
              >
                {/* Status dot + info */}
                <div style={S.rowMain}>
                  <span style={{ ...S.statusDot, backgroundColor: cfg.color }} />
                  <div style={S.rowInfo}>
                    <div style={S.rowName}>{agent.name}</div>
                    <div style={S.rowMeta}>
                      <span style={{ color: cfg.color, fontSize: 11, fontWeight: 500 }}>{cfg.label}</span>
                      <span style={S.rowSep}>·</span>
                      <span style={S.rowTime}>{getTimeAgo(agent.lastSeen)}</span>
                    </div>
                  </div>
                </div>

                {/* Right: forms count + route + WhatsApp */}
                <div style={S.rowRight}>
                  <div style={{ ...S.formsBadge, color: primaryColor, backgroundColor: `${primaryColor}12` }}>
                    {agent.forms_count}
                  </div>
                  {onViewRoute && (
                    <button
                      type="button"
                      onClick={(e) => handleRoute(e, agent.id)}
                      style={{
                        ...S.routeBtn,
                        backgroundColor: routeAgentId === agent.id ? primaryColor : "#f8fafc",
                        color: routeAgentId === agent.id ? "#ffffff" : "#475569",
                        borderColor: routeAgentId === agent.id ? primaryColor : "#e2e8f0",
                      }}
                      title={routeAgentId === agent.id ? "Cerrar ruta" : `Ver ruta de ${agent.name}`}
                      aria-label={routeAgentId === agent.id ? "Cerrar ruta" : `Ver ruta de ${agent.name}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><title>Ruta</title><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                    </button>
                  )}
                  {onWhatsApp && (
                    <button
                      type="button"
                      onClick={(e) => handleWhatsApp(e, agent)}
                      style={S.waBtn}
                      title={`WhatsApp a ${agent.name}`}
                      aria-label={`WhatsApp a ${agent.name}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366"><title>WhatsApp</title><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                    </button>
                  )}
                </div>
              </div>
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
  filters: {
    display: "flex",
    gap: 6,
    padding: "10px 16px",
    borderBottom: "1px solid #f1f5f9",
    flexShrink: 0,
  },
  filterBtn: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    padding: "8px 6px",
    borderRadius: 8,
    border: "1px solid",
    cursor: "pointer",
    transition: "all 0.15s ease",
    backgroundColor: "transparent",
  },
  filterCount: { fontSize: 16, fontWeight: 700 },
  filterLabel: { fontSize: 9, fontWeight: 600, letterSpacing: "0.03em" },

  searchBox: {
    padding: "8px 16px",
    borderBottom: "1px solid #f1f5f9",
    flexShrink: 0,
  },
  searchWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    backgroundColor: "#f8fafc",
  },
  searchInput: {
    flex: 1,
    border: "none",
    outline: "none",
    backgroundColor: "transparent",
    fontSize: 13,
    color: "#334155",
  },
  clearBtn: {
    width: 20,
    height: 20,
    borderRadius: 4,
    border: "none",
    backgroundColor: "#e2e8f0",
    color: "#64748b",
    cursor: "pointer",
    fontSize: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  listHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 16px",
    borderBottom: "1px solid #f1f5f9",
    flexShrink: 0,
  },
  listTitle: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    color: "#64748b",
    letterSpacing: "0.05em",
  },
  liveTag: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 10,
    fontWeight: 700,
    color: "#22c55e",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    backgroundColor: "#22c55e",
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

  row: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    marginBottom: 2,
    borderRadius: 8,
    borderLeft: "3px solid",
    cursor: "pointer",
    transition: "background 0.12s ease",
  },
  rowMain: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  },
  rowInfo: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#1e293b",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  rowMeta: {
    fontSize: 11,
    display: "flex",
    alignItems: "center",
    gap: 4,
    marginTop: 1,
  },
  rowSep: { color: "#cbd5e1" },
  rowTime: { color: "#94a3b8", fontSize: 11 },

  rowRight: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
    marginLeft: 8,
  },
  formsBadge: {
    fontSize: 14,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 6,
    minWidth: 28,
    textAlign: "center" as const,
  },
  routeBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    border: "1px solid",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.15s ease",
    flexShrink: 0,
  },
  waBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    backgroundColor: "#f0fdf4",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.15s ease",
    flexShrink: 0,
  },
};
