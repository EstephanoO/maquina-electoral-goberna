"use client";

import Image from "next/image";
import type { CampaignStats } from "@/lib/types";
import type { EnrichedAgent, AgentStatus } from "./types";

/* ========== Types ========== */

type Props = {
  stats: CampaignStats;
  agents: EnrichedAgent[];
  selectedAgentId: string | null;
  onSelectAgent: (id: string | null) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: AgentStatus | "all";
  onStatusFilter: (s: AgentStatus | "all") => void;
};

/* ========== Constants ========== */

const STATUS_CFG: Record<AgentStatus, { label: string; color: string; short: string }> = {
  connected: { label: "Conectado", color: "#22c55e", short: "ON" },
  idle: { label: "Inactivo", color: "#eab308", short: "IDLE" },
  inactive: { label: "Sin señal", color: "#94a3b8", short: "OFF" },
};

/* ========== Helpers ========== */

function getTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/* ========== Component ========== */

export function AgentsSidebar({
  stats,
  agents,
  selectedAgentId,
  onSelectAgent,
  collapsed,
  onToggleCollapse,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilter,
}: Props) {
  const { campaign, metas, totals } = stats;
  const primaryColor = campaign.color_primario;
  const secondaryColor = campaign.color_secundario;
  const progress = metas.datos > 0 ? (totals.forms_count / metas.datos) * 100 : 0;

  // Status counts from all agents (not filtered)
  const counts = { connected: 0, idle: 0, inactive: 0 };
  for (const a of agents) counts[a.status]++;

  // Apply filters
  const filtered = agents.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return a.name.toLowerCase().includes(q) || a.id.includes(q);
    }
    return true;
  });

  return (
    <aside style={{ ...S.root, width: collapsed ? 56 : 320 }}>
      {/* Header */}
      <div style={S.header}>
        {!collapsed && (
          <>
            <div style={{ ...S.avatar, backgroundColor: primaryColor, borderColor: secondaryColor }}>
              {campaign.foto_url ? (
                <Image src={campaign.foto_url} alt="" width={36} height={36} style={S.avatarImg} unoptimized />
              ) : (
                <span style={S.avatarInitials}>
                  {campaign.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                </span>
              )}
            </div>
            <div style={S.info}>
              <div style={S.name}>{campaign.name}</div>
              <div style={S.meta}>{campaign.cargo}</div>
            </div>
          </>
        )}
        <button type="button" onClick={onToggleCollapse} style={S.collapseBtn} aria-label={collapsed ? "Expandir" : "Colapsar"}>
          {collapsed ? "→" : "←"}
        </button>
      </div>

      {collapsed ? null : (
        <>
          {/* Progress */}
          <div style={S.progressCard}>
            <div style={S.progressRow}>
              <span style={S.progressLabel}>Progreso de datos</span>
              <span style={{ ...S.progressPct, color: primaryColor }}>{progress.toFixed(1)}%</span>
            </div>
            <div style={S.progressBar}>
              <div style={{ ...S.progressFill, width: `${Math.min(progress, 100)}%`, backgroundColor: primaryColor }} />
            </div>
            <div style={S.progressNums}>
              <span style={{ ...S.progressCur, color: primaryColor }}>{totals.forms_count.toLocaleString()}</span>
              <span style={S.progressMax}>/ {metas.datos.toLocaleString()} meta</span>
            </div>
            <div style={S.todayRow}>
              <span style={S.todayLabel}>Hoy</span>
              <span style={{ ...S.todayVal, color: primaryColor }}>+{totals.forms_today}</span>
            </div>
          </div>

          {/* Status filters */}
          <div style={S.filters}>
            {(["connected", "idle", "inactive"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onStatusFilter(statusFilter === s ? "all" : s)}
                style={{
                  ...S.filterBtn,
                  backgroundColor: statusFilter === s ? STATUS_CFG[s].color : "rgba(255,255,255,0.05)",
                  color: statusFilter === s ? "#fff" : STATUS_CFG[s].color,
                  borderColor: statusFilter === s ? STATUS_CFG[s].color : "rgba(255,255,255,0.1)",
                }}
              >
                <span style={S.filterCount}>{counts[s]}</span>
                <span style={S.filterLabel}>{STATUS_CFG[s].short}</span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={S.searchBox}>
            <input
              type="text"
              placeholder="Buscar agente..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              style={S.searchInput}
            />
          </div>

          {/* List header */}
          <div style={S.listHeader}>
            <span style={S.listTitle}>Agentes ({filtered.length})</span>
            <span style={S.liveTag}><span style={S.liveDot} />LIVE</span>
          </div>

          {/* Agent list */}
          <div style={S.list}>
            {filtered.length === 0 ? (
              <div style={S.empty}>Sin agentes</div>
            ) : (
              filtered.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => onSelectAgent(selectedAgentId === agent.id ? null : agent.id)}
                  style={{
                    ...S.row,
                    backgroundColor: selectedAgentId === agent.id ? "rgba(99,102,241,0.15)" : "transparent",
                    borderLeftColor: STATUS_CFG[agent.status].color,
                  }}
                >
                  <div style={S.rowInfo}>
                    <div style={S.rowName}>{agent.name}</div>
                    <div style={S.rowMeta}>
                      <span style={{ color: STATUS_CFG[agent.status].color, fontSize: 11 }}>{STATUS_CFG[agent.status].label}</span>
                      <span style={S.rowTime}>{getTimeAgo(agent.lastSeen)}</span>
                    </div>
                  </div>
                  <div style={{ ...S.rowCount, color: primaryColor }}>{agent.forms_count}</div>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </aside>
  );
}

/* ========== Styles ========== */

const S: Record<string, React.CSSProperties> = {
  root: { height: "100%", backgroundColor: "#0f172a", borderRight: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", transition: "width 0.2s ease", flexShrink: 0, overflow: "hidden" },
  header: { display: "flex", alignItems: "center", gap: 12, padding: 16, borderBottom: "1px solid rgba(255,255,255,0.08)" },
  avatar: { width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", border: "2px solid", flexShrink: 0 },
  avatarImg: { width: "100%", height: "100%", objectFit: "cover" as const },
  avatarInitials: { color: "#fff", fontSize: 12, fontWeight: 700 },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, fontWeight: 700, color: "#f1f5f9", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  meta: { fontSize: 11, color: "#94a3b8" },
  collapseBtn: { width: 28, height: 28, borderRadius: 6, border: "none", backgroundColor: "rgba(255,255,255,0.08)", color: "#94a3b8", fontSize: 12, cursor: "pointer", flexShrink: 0 },

  progressCard: { margin: "12px 16px", padding: 14, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12 },
  progressRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  progressLabel: { fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, color: "#64748b", letterSpacing: "0.05em" },
  progressPct: { fontSize: 14, fontWeight: 700 },
  progressBar: { height: 6, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3, transition: "width 0.3s ease" },
  progressNums: { marginTop: 8, display: "flex", alignItems: "baseline", gap: 4 },
  progressCur: { fontSize: 20, fontWeight: 700 },
  progressMax: { fontSize: 12, color: "#64748b" },
  todayRow: { marginTop: 6, display: "flex", justifyContent: "space-between" },
  todayLabel: { fontSize: 11, color: "#64748b" },
  todayVal: { fontSize: 13, fontWeight: 700 },

  filters: { display: "flex", gap: 6, padding: "0 16px", marginBottom: 10 },
  filterBtn: { flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", padding: "8px 6px", borderRadius: 8, border: "1px solid", cursor: "pointer", transition: "all 0.15s ease", backgroundColor: "transparent" },
  filterCount: { fontSize: 16, fontWeight: 700 },
  filterLabel: { fontSize: 9, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.05em" },

  searchBox: { padding: "0 16px", marginBottom: 10 },
  searchInput: { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", fontSize: 13, outline: "none", backgroundColor: "rgba(255,255,255,0.05)", color: "#e2e8f0" },

  listHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  listTitle: { fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, color: "#64748b", letterSpacing: "0.05em" },
  liveTag: { display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 700, color: "#22c55e" },
  liveDot: { width: 6, height: 6, borderRadius: "50%", backgroundColor: "#22c55e" },

  list: { flex: 1, overflowY: "auto" as const, padding: "6px 8px" },
  empty: { padding: 24, textAlign: "center" as const, color: "#64748b", fontSize: 13 },
  row: { width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", marginBottom: 2, borderRadius: 8, border: "none", borderLeft: "3px solid", cursor: "pointer", textAlign: "left" as const, transition: "background 0.15s ease" },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 13, fontWeight: 600, color: "#e2e8f0", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  rowMeta: { fontSize: 11, display: "flex", gap: 8 },
  rowTime: { color: "#64748b" },
  rowCount: { fontSize: 18, fontWeight: 700, marginLeft: 8 },
};
