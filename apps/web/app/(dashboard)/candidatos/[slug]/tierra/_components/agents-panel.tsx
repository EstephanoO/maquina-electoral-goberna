"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/services";
import type { TopAgent } from "@/lib/types";

/* ========== Types ========== */

type AgentLocation = {
  agent_id: string;
  agent_name?: string;
  ts: string;
  lat: number;
  lng: number;
};

type AgentStatus = "connected" | "idle" | "inactive";

type EnrichedAgent = {
  id: string;
  name: string;
  status: AgentStatus;
  lastSeen: Date;
  forms_count: number;
  lat?: number;
  lng?: number;
};

type StatusFilter = "all" | AgentStatus;

/* ========== Props ========== */

interface AgentsPanelProps {
  campaignId: string;
  topAgents: TopAgent[];
  primaryColor: string;
  onClose: () => void;
  onSelectAgent?: (agentId: string | null) => void;
}

/* ========== Constants ========== */

const TWO_MINUTES = 2 * 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;

const STATUS_CONFIG: Record<AgentStatus, { label: string; color: string; dot: string }> = {
  connected: { label: "Conectado", color: "#22c55e", dot: "●" },
  idle: { label: "Inactivo reciente", color: "#eab308", dot: "●" },
  inactive: { label: "Sin conexión", color: "#94a3b8", dot: "○" },
};

/* ========== Helpers ========== */

function getAgentStatus(ts: string, now: number): AgentStatus {
  const lastSeenMs = new Date(ts).getTime();
  const age = now - lastSeenMs;
  if (age < TWO_MINUTES) return "connected";
  if (age < TEN_MINUTES) return "idle";
  return "inactive";
}

function getTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes}m`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

/* ========== Component ========== */

export function AgentsPanel({
  campaignId,
  topAgents,
  primaryColor,
  onClose,
  onSelectAgent,
}: AgentsPanelProps) {
  const [locations, setLocations] = useState<AgentLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  // Fetch live locations
  const fetchLocations = useCallback(async () => {
    try {
      const res = await api.get<{ agents: AgentLocation[] }>("/api/agents/live", {
        campaignId,
      });
      if (res.ok && res.data?.agents) {
        setLocations(res.data.agents);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    fetchLocations();
    const interval = setInterval(fetchLocations, 10000);
    return () => clearInterval(interval);
  }, [fetchLocations]);

  // Merge top agents with live locations
  const enrichedAgents = useMemo((): EnrichedAgent[] => {
    const now = Date.now();
    const locationMap = new Map(locations.map((l) => [l.agent_id, l]));
    
    // Start with top agents (they have forms_count)
    const agentMap = new Map<string, EnrichedAgent>();
    
    for (const agent of topAgents) {
      const location = locationMap.get(agent.id);
      agentMap.set(agent.id, {
        id: agent.id,
        name: agent.name,
        status: location ? getAgentStatus(location.ts, now) : "inactive",
        lastSeen: location ? new Date(location.ts) : new Date(0),
        forms_count: agent.forms_count,
        lat: location?.lat,
        lng: location?.lng,
      });
    }
    
    // Add any agents from locations that aren't in topAgents
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
    
    return Array.from(agentMap.values());
  }, [topAgents, locations]);

  // Filter agents
  const filteredAgents = useMemo(() => {
    return enrichedAgents
      .filter((agent) => {
        // Status filter
        if (statusFilter !== "all" && agent.status !== statusFilter) return false;
        // Search filter
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          return agent.name.toLowerCase().includes(query) || agent.id.includes(query);
        }
        return true;
      })
      .sort((a, b) => {
        // Connected first, then by forms_count
        const statusOrder = { connected: 0, idle: 1, inactive: 2 };
        if (statusOrder[a.status] !== statusOrder[b.status]) {
          return statusOrder[a.status] - statusOrder[b.status];
        }
        return b.forms_count - a.forms_count;
      });
  }, [enrichedAgents, statusFilter, searchQuery]);

  // Status counts
  const statusCounts = useMemo(() => {
    const counts = { connected: 0, idle: 0, inactive: 0 };
    for (const agent of enrichedAgents) {
      counts[agent.status]++;
    }
    return counts;
  }, [enrichedAgents]);

  const handleSelectAgent = (agentId: string) => {
    const newId = selectedAgentId === agentId ? null : agentId;
    setSelectedAgentId(newId);
    onSelectAgent?.(newId);
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <span style={styles.title}>Agentes en campo</span>
          <span style={styles.totalBadge}>{enrichedAgents.length}</span>
        </div>
        <button type="button" onClick={onClose} style={styles.closeButton}>
          ✕
        </button>
      </div>

      {/* Status summary */}
      <div style={styles.statusBar}>
        {(["connected", "idle", "inactive"] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(statusFilter === status ? "all" : status)}
            style={{
              ...styles.statusPill,
              backgroundColor: statusFilter === status ? STATUS_CONFIG[status].color : "#f1f5f9",
              color: statusFilter === status ? "#ffffff" : STATUS_CONFIG[status].color,
              borderColor: STATUS_CONFIG[status].color,
            }}
          >
            <span style={styles.statusDot}>{STATUS_CONFIG[status].dot}</span>
            <span style={styles.statusCount}>{statusCounts[status]}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={styles.searchContainer}>
        <input
          type="text"
          placeholder="Buscar agente..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={styles.searchInput}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            style={styles.clearSearch}
          >
            ✕
          </button>
        )}
      </div>

      {/* Agents list */}
      <div style={styles.agentsList}>
        {loading ? (
          <div style={styles.emptyState}>Cargando agentes...</div>
        ) : filteredAgents.length === 0 ? (
          <div style={styles.emptyState}>
            {searchQuery || statusFilter !== "all"
              ? "No hay agentes que coincidan"
              : "Sin agentes activos"}
          </div>
        ) : (
          filteredAgents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => handleSelectAgent(agent.id)}
              style={{
                ...styles.agentCard,
                borderLeftColor: STATUS_CONFIG[agent.status].color,
                backgroundColor: selectedAgentId === agent.id ? "#f0f9ff" : "#ffffff",
              }}
            >
              <div style={styles.agentInfo}>
                <div style={styles.agentName}>{agent.name}</div>
                <div style={styles.agentMeta}>
                  <span
                    style={{
                      ...styles.statusIndicator,
                      color: STATUS_CONFIG[agent.status].color,
                    }}
                  >
                    {STATUS_CONFIG[agent.status].dot} {STATUS_CONFIG[agent.status].label}
                  </span>
                  <span style={styles.lastSeen}>{getTimeAgo(agent.lastSeen)}</span>
                </div>
              </div>
              <div style={styles.agentStats}>
                <span style={{ ...styles.formsCount, color: primaryColor }}>
                  {agent.forms_count}
                </span>
                <span style={styles.formsLabel}>datos</span>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <span style={styles.footerText}>
          {filteredAgents.length} de {enrichedAgents.length} agentes
        </span>
        <span style={styles.autoRefresh}>● Auto-refresh 10s</span>
      </div>
    </div>
  );
}

/* ========== Styles ========== */

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    backgroundColor: "#ffffff",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: "1px solid #e2e8f0",
    flexShrink: 0,
  },
  headerTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    color: "#334155",
  },
  totalBadge: {
    padding: "2px 8px",
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    fontSize: 12,
    fontWeight: 600,
    color: "#64748b",
  },
  closeButton: {
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    border: "none",
    backgroundColor: "#f1f5f9",
    color: "#64748b",
    fontSize: 12,
    cursor: "pointer",
  },
  statusBar: {
    display: "flex",
    gap: 8,
    padding: "12px 20px",
    borderBottom: "1px solid #e2e8f0",
    flexShrink: 0,
  },
  statusPill: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  statusDot: {
    fontSize: 10,
  },
  statusCount: {
    fontSize: 14,
    fontWeight: 700,
  },
  searchContainer: {
    position: "relative" as const,
    padding: "12px 20px",
    borderBottom: "1px solid #e2e8f0",
    flexShrink: 0,
  },
  searchInput: {
    width: "100%",
    padding: "10px 36px 10px 12px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    fontSize: 13,
    color: "#334155",
    outline: "none",
  },
  clearSearch: {
    position: "absolute" as const,
    right: 28,
    top: "50%",
    transform: "translateY(-50%)",
    width: 20,
    height: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    border: "none",
    backgroundColor: "#e2e8f0",
    color: "#64748b",
    fontSize: 10,
    cursor: "pointer",
  },
  agentsList: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "8px 12px",
  },
  emptyState: {
    padding: "32px 20px",
    textAlign: "center" as const,
    color: "#94a3b8",
    fontSize: 13,
  },
  agentCard: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    marginBottom: 8,
    borderRadius: 8,
    border: "none",
    borderLeft: "3px solid",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    cursor: "pointer",
    transition: "all 0.15s ease",
    textAlign: "left" as const,
  },
  agentInfo: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
    minWidth: 0,
    flex: 1,
  },
  agentName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#334155",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  agentMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 11,
  },
  statusIndicator: {
    fontWeight: 500,
  },
  lastSeen: {
    color: "#94a3b8",
  },
  agentStats: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "flex-end",
    flexShrink: 0,
    marginLeft: 12,
  },
  formsCount: {
    fontSize: 18,
    fontWeight: 700,
  },
  formsLabel: {
    fontSize: 10,
    color: "#94a3b8",
    textTransform: "uppercase" as const,
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 20px",
    borderTop: "1px solid #e2e8f0",
    backgroundColor: "#f8fafc",
    flexShrink: 0,
  },
  footerText: {
    fontSize: 11,
    color: "#64748b",
  },
  autoRefresh: {
    fontSize: 11,
    color: "#22c55e",
  },
};
