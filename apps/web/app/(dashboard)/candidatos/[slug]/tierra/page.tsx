"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";

import { getCampaignStats, getRecentForms, type FormRecord } from "@/lib/services";
import type { CampaignStats, TopAgent } from "@/lib/types";

import { TierraMap, type EnrichedAgent, type AgentStatus, type FormPoint } from "./_components/tierra-map";
import { api } from "@/lib/services";

/* ========== Types ========== */

type AgentLocation = {
  agent_id: string;
  agent_name?: string;
  ts: string;
  lat: number;
  lng: number;
};

type ViewMode = "map" | "split";

/* ========== Constants ========== */

const TWO_MINUTES = 2 * 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;

const STATUS_CONFIG: Record<AgentStatus, { label: string; color: string; short: string }> = {
  connected: { label: "Conectado", color: "#22c55e", short: "ON" },
  idle: { label: "Inactivo", color: "#eab308", short: "IDLE" },
  inactive: { label: "Sin señal", color: "#94a3b8", short: "OFF" },
};

/* ========== Helpers ========== */

function getAgentStatus(ts: string, now: number): AgentStatus {
  const age = now - new Date(ts).getTime();
  if (age < TWO_MINUTES) return "connected";
  if (age < TEN_MINUTES) return "idle";
  return "inactive";
}

function getTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/* ========== Main Component ========== */

export default function TierraPage() {
  const params = useParams();
  const slug = params.slug as string;

  // Data state
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [locations, setLocations] = useState<AgentLocation[]>([]);
  const [forms, setForms] = useState<FormRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AgentStatus | "all">("all");
  const [showTracking, setShowTracking] = useState(true);
  const [showDatos, setShowDatos] = useState(true);

  // Fetch campaign stats
  const fetchStats = useCallback(async () => {
    const res = await getCampaignStats(slug, "day");
    if (res.ok && res.data) {
      setStats(res.data);
      setError(null);
    } else {
      setError(res.error?.message ?? "Error cargando datos");
    }
    setLoading(false);
  }, [slug]);

  // Fetch live locations
  const fetchLocations = useCallback(async () => {
    if (!stats) return;
    try {
      const res = await api.get<{ agents: AgentLocation[] }>("/api/agents/live", {
        campaignId: stats.campaign.id,
      });
      if (res.ok && res.data?.agents) {
        setLocations(res.data.agents);
      }
    } catch {
      // ignore
    }
  }, [stats]);

  // Fetch forms
  const fetchForms = useCallback(async () => {
    if (!stats) return;
    const res = await getRecentForms(stats.campaign.id, 100);
    if (res.ok && res.data?.forms) {
      setForms(res.data.forms);
    }
  }, [stats]);

  // Initial load
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Polling
  useEffect(() => {
    if (!stats) return;
    fetchLocations();
    fetchForms();
    const locInterval = setInterval(fetchLocations, 10000);
    const formInterval = setInterval(fetchForms, 15000);
    return () => {
      clearInterval(locInterval);
      clearInterval(formInterval);
    };
  }, [stats, fetchLocations, fetchForms]);

  // Enrich agents with location data
  const enrichedAgents = useMemo((): EnrichedAgent[] => {
    if (!stats) return [];
    const now = Date.now();
    const locationMap = new Map(locations.map((l) => [l.agent_id, l]));
    const agentMap = new Map<string, EnrichedAgent>();

    // From top_agents (have forms_count)
    for (const agent of stats.top_agents) {
      const loc = locationMap.get(agent.id);
      // Si tiene ubicación en tiempo real, usar esa
      if (loc) {
        agentMap.set(agent.id, {
          id: agent.id,
          name: agent.name,
          status: getAgentStatus(loc.ts, now),
          lastSeen: new Date(loc.ts),
          forms_count: agent.forms_count,
          lat: loc.lat,
          lng: loc.lng,
        });
      } else {
        // Sin ubicación en tiempo real - usar última ubicación de forms o centro de Perú
        const agentForms = forms.filter((f) => f.encuestador_id === agent.id || f.agent_id === agent.id);
        const lastForm = agentForms[0]; // forms ya vienen ordenados por fecha desc
        agentMap.set(agent.id, {
          id: agent.id,
          name: agent.name,
          status: "inactive",
          lastSeen: lastForm ? new Date(lastForm.created_at) : new Date(0),
          forms_count: agent.forms_count,
          // Usar coordenadas del último form, o centro de Lima como fallback
          lat: lastForm?.y ?? -12.0464,
          lng: lastForm?.x ?? -77.0428,
        });
      }
    }

    // Add agents from locations not in top_agents
    for (const loc of locations) {
      if (!agentMap.has(loc.agent_id)) {
        agentMap.set(loc.agent_id, {
          id: loc.agent_id,
          name: loc.agent_name || `Agente ${loc.agent_id.slice(0, 6)}`,
          status: getAgentStatus(loc.ts, now),
          lastSeen: new Date(loc.ts),
          forms_count: 0,
          lat: loc.lat,
          lng: loc.lng,
        });
      }
    }

    return Array.from(agentMap.values()).sort((a, b) => {
      const statusOrder = { connected: 0, idle: 1, inactive: 2 };
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      return b.forms_count - a.forms_count;
    });
  }, [stats, locations, forms]);

  // Filtered agents
  const filteredAgents = useMemo(() => {
    return enrichedAgents.filter((agent) => {
      if (statusFilter !== "all" && agent.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return agent.name.toLowerCase().includes(q) || agent.id.includes(q);
      }
      return true;
    });
  }, [enrichedAgents, statusFilter, searchQuery]);

  // Status counts
  const statusCounts = useMemo(() => {
    const counts = { connected: 0, idle: 0, inactive: 0 };
    for (const agent of enrichedAgents) counts[agent.status]++;
    return counts;
  }, [enrichedAgents]);

  // Filtered forms (by selected agent)
  const filteredForms = useMemo(() => {
    if (!selectedAgentId) return forms;
    return forms.filter((f) => f.agent_id === selectedAgentId);
  }, [forms, selectedAgentId]);

  // Selected agent
  const selectedAgent = useMemo(
    () => enrichedAgents.find((a) => a.id === selectedAgentId) || null,
    [enrichedAgents, selectedAgentId],
  );

  if (loading) {
    return (
      <div style={styles.centerScreen}>
        <div style={styles.spinner} />
        <span style={styles.loadingText}>Cargando campaña...</span>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div style={styles.centerScreen}>
        <div style={styles.errorIcon}>⚠️</div>
        <div style={styles.errorTitle}>No se pudo cargar</div>
        <div style={styles.errorMessage}>{error ?? "Candidato no encontrado"}</div>
        <button type="button" onClick={fetchStats} style={styles.retryButton}>
          Reintentar
        </button>
      </div>
    );
  }

  const { campaign, metas, totals } = stats;
  const primaryColor = campaign.color_primario;
  const secondaryColor = campaign.color_secundario;
  const progress = metas.datos > 0 ? (totals.forms_count / metas.datos) * 100 : 0;

  return (
    <div style={styles.container}>
      {/* ===== SIDEBAR ===== */}
      <aside
        style={{
          ...styles.sidebar,
          width: sidebarCollapsed ? 60 : 320,
        }}
      >
        {/* Header */}
        <div style={styles.sidebarHeader}>
          {!sidebarCollapsed && (
            <>
              <div style={{ ...styles.candidateAvatar, backgroundColor: primaryColor, borderColor: secondaryColor }}>
                {campaign.foto_url ? (
                  <Image src={campaign.foto_url} alt="" width={36} height={36} style={styles.avatarImg} unoptimized />
                ) : (
                  <span style={styles.avatarInitials}>
                    {campaign.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                  </span>
                )}
              </div>
              <div style={styles.candidateInfo}>
                <div style={styles.candidateName}>{campaign.name}</div>
                <div style={styles.candidateMeta}>{campaign.cargo}</div>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            style={styles.collapseBtn}
            aria-label={sidebarCollapsed ? "Expandir" : "Colapsar"}
          >
            {sidebarCollapsed ? "→" : "←"}
          </button>
        </div>

        {!sidebarCollapsed && (
          <>
            {/* Progress card */}
            <div style={styles.progressCard}>
              <div style={styles.progressHeader}>
                <span style={styles.progressLabel}>Progreso de datos</span>
                <span style={{ ...styles.progressPercent, color: primaryColor }}>{progress.toFixed(1)}%</span>
              </div>
              <div style={styles.progressBar}>
                <div style={{ ...styles.progressFill, width: `${Math.min(progress, 100)}%`, backgroundColor: primaryColor }} />
              </div>
              <div style={styles.progressNumbers}>
                <span style={{ ...styles.progressCurrent, color: primaryColor }}>{totals.forms_count.toLocaleString()}</span>
                <span style={styles.progressTarget}>/ {metas.datos.toLocaleString()} meta</span>
              </div>
            </div>

            {/* Status filters */}
            <div style={styles.statusFilters}>
              {(["connected", "idle", "inactive"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(statusFilter === status ? "all" : status)}
                  style={{
                    ...styles.statusBtn,
                    backgroundColor: statusFilter === status ? STATUS_CONFIG[status].color : "#f8fafc",
                    color: statusFilter === status ? "#fff" : STATUS_CONFIG[status].color,
                    borderColor: STATUS_CONFIG[status].color,
                  }}
                >
                  <span style={styles.statusCount}>{statusCounts[status]}</span>
                  <span style={styles.statusLabel}>{STATUS_CONFIG[status].short}</span>
                </button>
              ))}
            </div>

            {/* Search */}
            <div style={styles.searchBox}>
              <input
                type="text"
                placeholder="Buscar agente..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={styles.searchInput}
              />
            </div>

            {/* Agents list header */}
            <div style={styles.agentsListHeader}>
              <span style={styles.agentsListTitle}>Agentes ({filteredAgents.length})</span>
              <span style={styles.liveIndicator}>
                <span style={styles.liveDot} />
                LIVE
              </span>
            </div>

            {/* Agents list */}
            <div style={styles.agentsList}>
              {filteredAgents.length === 0 ? (
                <div style={styles.emptyList}>Sin agentes</div>
              ) : (
                filteredAgents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => setSelectedAgentId(selectedAgentId === agent.id ? null : agent.id)}
                    style={{
                      ...styles.agentRow,
                      backgroundColor: selectedAgentId === agent.id ? "#f0f9ff" : "#fff",
                      borderLeftColor: STATUS_CONFIG[agent.status].color,
                    }}
                  >
                    <div style={styles.agentRowInfo}>
                      <div style={styles.agentRowName}>{agent.name}</div>
                      <div style={styles.agentRowMeta}>
                        <span style={{ color: STATUS_CONFIG[agent.status].color }}>{STATUS_CONFIG[agent.status].label}</span>
                        <span style={styles.agentRowTime}>{getTimeAgo(agent.lastSeen)}</span>
                      </div>
                    </div>
                    <div style={{ ...styles.agentRowCount, color: primaryColor }}>{agent.forms_count}</div>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </aside>

      {/* ===== MAIN AREA ===== */}
      <main style={styles.main}>
        {/* Map */}
        <div style={styles.mapArea}>
          <TierraMap
            campaignId={campaign.id}
            primaryColor={primaryColor}
            agents={enrichedAgents}
            forms={forms.map((f) => ({
              id: f.id,
              lat: f.y,
              lng: f.x,
              nombre: f.nombre,
              created_at: f.created_at,
              agent_id: f.agent_id || f.encuestador_id,
            }))}
            selectedAgentId={selectedAgentId}
            onSelectAgent={setSelectedAgentId}
            showTracking={showTracking}
            showDatos={showDatos}
          />

          {/* Layer filters */}
          <div style={styles.layerFilters}>
            <div style={styles.filterTitle}>Capas</div>
            <button
              type="button"
              onClick={() => setShowTracking(!showTracking)}
              style={{
                ...styles.filterBtn,
                backgroundColor: showTracking ? "#22c55e" : "#f1f5f9",
                color: showTracking ? "#fff" : "#64748b",
              }}
            >
              <span style={styles.filterIcon}>📍</span>
              <span>Tracking</span>
              <span style={styles.filterCount}>{enrichedAgents.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowDatos(!showDatos)}
              style={{
                ...styles.filterBtn,
                backgroundColor: showDatos ? "#6366f1" : "#f1f5f9",
                color: showDatos ? "#fff" : "#64748b",
              }}
            >
              <span style={styles.filterIcon}>📋</span>
              <span>Datos</span>
              <span style={styles.filterCount}>{forms.length}</span>
            </button>
            <div style={styles.filterDivider} />
            <button
              type="button"
              onClick={() => setViewMode(viewMode === "map" ? "split" : "map")}
              style={{
                ...styles.filterBtn,
                backgroundColor: viewMode === "split" ? primaryColor : "#f1f5f9",
                color: viewMode === "split" ? "#fff" : "#64748b",
              }}
            >
              <span style={styles.filterIcon}>📊</span>
              <span>Tabla</span>
            </button>
          </div>

          {/* Map legend */}
          <div style={styles.mapLegend}>
            {showTracking && (
              <>
                <div style={styles.legendItem}>
                  <span style={{ ...styles.legendDot, backgroundColor: "#22c55e" }} />
                  <span style={styles.legendLabel}>Conectado</span>
                </div>
                <div style={styles.legendItem}>
                  <span style={{ ...styles.legendDot, backgroundColor: "#eab308" }} />
                  <span style={styles.legendLabel}>Inactivo</span>
                </div>
                <div style={styles.legendItem}>
                  <span style={{ ...styles.legendDot, backgroundColor: "#94a3b8" }} />
                  <span style={styles.legendLabel}>Sin señal</span>
                </div>
              </>
            )}
            {showDatos && (
              <div style={styles.legendItem}>
                <span style={{ ...styles.legendDot, backgroundColor: "#6366f1" }} />
                <span style={styles.legendLabel}>Dato</span>
              </div>
            )}
          </div>

          {/* Selected agent info overlay */}
          {selectedAgent && (
            <div style={styles.agentOverlay}>
              <div style={styles.overlayHeader}>
                <span style={{ ...styles.overlayDot, backgroundColor: STATUS_CONFIG[selectedAgent.status].color }} />
                <span style={styles.overlayName}>{selectedAgent.name}</span>
                <button type="button" onClick={() => setSelectedAgentId(null)} style={styles.overlayClose}>✕</button>
              </div>
              <div style={styles.overlayStats}>
                <div style={styles.overlayStat}>
                  <span style={{ ...styles.overlayStatValue, color: primaryColor }}>{selectedAgent.forms_count}</span>
                  <span style={styles.overlayStatLabel}>datos</span>
                </div>
                <div style={styles.overlayStat}>
                  <span style={styles.overlayStatValue}>{getTimeAgo(selectedAgent.lastSeen)}</span>
                  <span style={styles.overlayStatLabel}>última vez</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Data panel (split view) */}
        {viewMode === "split" && (
          <div style={styles.dataPanel}>
            <div style={styles.dataPanelHeader}>
              <h3 style={styles.dataPanelTitle}>
                {selectedAgent ? `Datos de ${selectedAgent.name}` : "Todos los datos"}
              </h3>
              <span style={styles.dataPanelCount}>{filteredForms.length} registros</span>
            </div>
            <div style={styles.dataTable}>
              {filteredForms.length === 0 ? (
                <div style={styles.emptyData}>Sin datos capturados</div>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Nombre</th>
                      <th style={styles.th}>Teléfono</th>
                      <th style={styles.th}>Zona</th>
                      <th style={styles.th}>Hora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredForms.slice(0, 50).map((form) => (
                      <tr key={form.id} style={styles.tr}>
                        <td style={styles.td}>{form.nombre || "-"}</td>
                        <td style={styles.td}>{form.telefono || "-"}</td>
                        <td style={styles.td}>{form.zona || "-"}</td>
                        <td style={styles.tdTime}>
                          {new Date(form.created_at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/* ========== Styles ========== */

const styles: Record<string, React.CSSProperties> = {
  container: { display: "flex", height: "100vh", backgroundColor: "#f8fafc", overflow: "hidden" },
  centerScreen: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 12 },
  spinner: { width: 32, height: 32, border: "3px solid #e2e8f0", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 1s linear infinite" },
  loadingText: { fontSize: 14, color: "#64748b" },
  errorIcon: { fontSize: 48 },
  errorTitle: { fontSize: 18, fontWeight: 600, color: "#334155" },
  errorMessage: { fontSize: 14, color: "#64748b" },
  retryButton: { marginTop: 12, padding: "8px 20px", borderRadius: 8, border: "1px solid #e2e8f0", backgroundColor: "#fff", fontSize: 13, cursor: "pointer" },

  // Sidebar
  sidebar: { height: "100%", backgroundColor: "#fff", borderRight: "1px solid #e2e8f0", display: "flex", flexDirection: "column", transition: "width 0.2s ease", flexShrink: 0 },
  sidebarHeader: { display: "flex", alignItems: "center", gap: 12, padding: 16, borderBottom: "1px solid #e2e8f0" },
  candidateAvatar: { width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", border: "2px solid", flexShrink: 0 },
  avatarImg: { width: "100%", height: "100%", objectFit: "cover" as const },
  avatarInitials: { color: "#fff", fontSize: 12, fontWeight: 700 },
  candidateInfo: { flex: 1, minWidth: 0 },
  candidateName: { fontSize: 14, fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  candidateMeta: { fontSize: 11, color: "#64748b" },
  collapseBtn: { width: 28, height: 28, borderRadius: 6, border: "none", backgroundColor: "#f1f5f9", color: "#64748b", fontSize: 12, cursor: "pointer", flexShrink: 0 },

  // Progress
  progressCard: { margin: 16, padding: 16, backgroundColor: "#f8fafc", borderRadius: 12 },
  progressHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  progressLabel: { fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, color: "#64748b", letterSpacing: "0.05em" },
  progressPercent: { fontSize: 14, fontWeight: 700 },
  progressBar: { height: 8, backgroundColor: "#e2e8f0", borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4, transition: "width 0.3s ease" },
  progressNumbers: { marginTop: 8, display: "flex", alignItems: "baseline", gap: 4 },
  progressCurrent: { fontSize: 20, fontWeight: 700 },
  progressTarget: { fontSize: 12, color: "#94a3b8" },

  // Status filters
  statusFilters: { display: "flex", gap: 8, padding: "0 16px", marginBottom: 12 },
  statusBtn: { flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", padding: "10px 8px", borderRadius: 8, border: "1px solid", cursor: "pointer", transition: "all 0.15s ease" },
  statusCount: { fontSize: 16, fontWeight: 700 },
  statusLabel: { fontSize: 9, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.05em" },

  // Search
  searchBox: { padding: "0 16px", marginBottom: 12 },
  searchInput: { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, outline: "none" },

  // Agents list
  agentsListHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 16px", borderBottom: "1px solid #f1f5f9" },
  agentsListTitle: { fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, color: "#94a3b8", letterSpacing: "0.05em" },
  liveIndicator: { display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 700, color: "#22c55e" },
  liveDot: { width: 6, height: 6, borderRadius: "50%", backgroundColor: "#22c55e", animation: "pulse 2s ease-in-out infinite" },
  agentsList: { flex: 1, overflowY: "auto" as const, padding: "8px 8px" },
  emptyList: { padding: 24, textAlign: "center" as const, color: "#94a3b8", fontSize: 13 },
  agentRow: { width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 12px", marginBottom: 4, borderRadius: 8, border: "none", borderLeft: "3px solid", cursor: "pointer", textAlign: "left" as const, transition: "background 0.15s ease" },
  agentRowInfo: { flex: 1, minWidth: 0 },
  agentRowName: { fontSize: 13, fontWeight: 600, color: "#334155", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  agentRowMeta: { fontSize: 11, display: "flex", gap: 8 },
  agentRowTime: { color: "#94a3b8" },
  agentRowCount: { fontSize: 18, fontWeight: 700, marginLeft: 8 },

  // Main
  main: { flex: 1, display: "flex", flexDirection: "column" as const, overflow: "hidden" },
  mapArea: { flex: 1, position: "relative" as const, minHeight: 0 },

  // Layer filters
  layerFilters: { position: "absolute" as const, top: 16, left: 16, backgroundColor: "#fff", borderRadius: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", padding: 12, zIndex: 10, display: "flex", flexDirection: "column" as const, gap: 8 },
  filterTitle: { fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, color: "#94a3b8", letterSpacing: "0.05em", marginBottom: 4 },
  filterBtn: { display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s ease", minWidth: 130 },
  filterIcon: { fontSize: 14 },
  filterCount: { marginLeft: "auto", fontSize: 12, opacity: 0.8 },
  filterDivider: { height: 1, backgroundColor: "#e2e8f0", margin: "4px 0" },

  // Map legend
  mapLegend: { position: "absolute" as const, bottom: 24, right: 16, backgroundColor: "#fff", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", padding: "10px 14px", zIndex: 10, display: "flex", gap: 16 },
  legendItem: { display: "flex", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: "50%", border: "2px solid #fff", boxShadow: "0 0 0 1px rgba(0,0,0,0.15)" },
  legendLabel: { fontSize: 11, color: "#64748b", fontWeight: 500 },

  // Agent overlay
  agentOverlay: { position: "absolute" as const, bottom: 24, left: 16, backgroundColor: "#fff", borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", padding: 16, minWidth: 200, zIndex: 10 },
  overlayHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 },
  overlayDot: { width: 10, height: 10, borderRadius: "50%" },
  overlayName: { flex: 1, fontSize: 14, fontWeight: 700, color: "#334155" },
  overlayClose: { width: 24, height: 24, borderRadius: 4, border: "none", backgroundColor: "#f1f5f9", color: "#64748b", fontSize: 12, cursor: "pointer" },
  overlayStats: { display: "flex", gap: 24 },
  overlayStat: { display: "flex", flexDirection: "column" as const },
  overlayStatValue: { fontSize: 20, fontWeight: 700, color: "#334155" },
  overlayStatLabel: { fontSize: 10, color: "#94a3b8", textTransform: "uppercase" as const },

  // Data panel
  dataPanel: { height: 280, borderTop: "1px solid #e2e8f0", backgroundColor: "#fff", display: "flex", flexDirection: "column" as const },
  dataPanelHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderBottom: "1px solid #e2e8f0" },
  dataPanelTitle: { margin: 0, fontSize: 14, fontWeight: 700, color: "#334155" },
  dataPanelCount: { fontSize: 12, color: "#64748b" },
  dataTable: { flex: 1, overflowY: "auto" as const },
  emptyData: { padding: 32, textAlign: "center" as const, color: "#94a3b8", fontSize: 13 },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
  th: { padding: "10px 16px", textAlign: "left" as const, fontWeight: 600, color: "#64748b", fontSize: 11, textTransform: "uppercase" as const, backgroundColor: "#f8fafc", position: "sticky" as const, top: 0 },
  tr: { borderBottom: "1px solid #f1f5f9" },
  td: { padding: "10px 16px", color: "#334155" },
  tdTime: { padding: "10px 16px", color: "#94a3b8", fontSize: 12 },
};
