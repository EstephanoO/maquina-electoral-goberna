"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import type { FormRecord } from "@/lib/services";
import type { CampaignStats } from "@/lib/types";
import { formCoordsToLatLng } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useCampaignStats, useRecentForms, useAgentLocationsSnapshot, tierraKeys, type AgentLocation } from "@/lib/hooks";

import {
  TierraMap,
  TierraHeader,
  MapControls,
  DataPanel,
  KpiPanel,
  ActivityCharts,
  INITIAL_DRILL,
  type TierraMapHandle,
  type EnrichedAgent,
  type AgentStatus,
  type LogEntry,
  type DrillState,
  type ActiveLayer,
} from "./_components";

/* ========== Constants ========== */

const TWO_MIN = 2 * 60_000;
const TEN_MIN = 10 * 60_000;

/** DataPanel width — all overlays must respect this boundary when panel is open */
const PANEL_W = 420;
/** Metrics panel height when expanded */
const METRICS_H = 280;

function getAgentStatus(ts: string, now: number): AgentStatus {
  const age = now - new Date(ts).getTime();
  if (age < TWO_MIN) return "connected";
  if (age < TEN_MIN) return "idle";
  return "inactive";
}

/* ========== SSE Hook ========== */

function useAgentSSE(campaignId: string | null, onUpdate: (agents: AgentLocation[]) => void) {
  const cbRef = useRef(onUpdate);
  cbRef.current = onUpdate;

  useEffect(() => {
    if (!campaignId) return;

    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    function connect() {
      es = new EventSource(`/api/agents/stream`);

      es.addEventListener("snapshot", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.agents) cbRef.current(data.agents);
          attempt = 0;
        } catch { /* ignore */ }
      });

      es.addEventListener("location.batch", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.locations) cbRef.current(data.locations);
        } catch { /* ignore */ }
      });

      es.onerror = () => {
        es?.close();
        const delay = Math.min(1000 * 2 ** attempt, 30000);
        attempt++;
        reconnectTimer = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [campaignId]);
}

/* ========== Fullscreen ========== */

/** Zero-rerender fullscreen hook — subscribes to native fullscreenchange event */
function useFullscreen(ref: React.RefObject<HTMLElement | null>) {
  const subscribe = useCallback((cb: () => void) => {
    document.addEventListener("fullscreenchange", cb);
    return () => document.removeEventListener("fullscreenchange", cb);
  }, []);
  const getSnapshot = useCallback(() => document.fullscreenElement === ref.current, [ref]);
  const isFullscreen = useSyncExternalStore(subscribe, getSnapshot, () => false);

  const toggle = useCallback(() => {
    if (!ref.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      ref.current.requestFullscreen().catch(() => {});
    }
  }, [ref]);

  return { isFullscreen, toggle } as const;
}

/* ========== Page ========== */

export default function TierraPage() {
  const params = useParams();
  const slug = params.slug as string;
  const mapHandleRef = useRef<TierraMapHandle | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const { user, campaigns } = useAuth();
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(shellRef);
  const queryClient = useQueryClient();

  // ─── TanStack Query: stats (P3/P4 — structuralSharing prevents re-renders) ───
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useCampaignStats(slug);

  const campaignId = stats?.campaign.id;

  // ─── TanStack Query: forms (P3 — polled every 5s, structuralSharing key) ───
  const { data: forms = EMPTY_FORMS } = useRecentForms(campaignId);

  // ─── TanStack Query: initial agent locations seed ───
  const { data: initialLocations } = useAgentLocationsSnapshot(campaignId);

  // ─── SSE: live agent locations (imperative — merges into local state) ───
  const [locations, setLocations] = useState<AgentLocation[]>([]);

  // Seed locations from initial query when it arrives
  useEffect(() => {
    if (initialLocations?.length) {
      setLocations(initialLocations);
    }
  }, [initialLocations]);

  const handleSSEUpdate = useCallback((incoming: AgentLocation[]) => {
    setLocations((prev) => {
      const map = new Map(prev.map((l) => [l.agent_id, l]));
      for (const loc of incoming) map.set(loc.agent_id, loc);
      return Array.from(map.values());
    });
  }, []);

  useAgentSSE(campaignId ?? null, handleSSEUpdate);

  // UI — single active layer (mutually exclusive)
  const [activeLayer, setActiveLayer] = useState<ActiveLayer>("datos");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set());
  const [showTable, setShowTable] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);
  const [logClearedAt, setLogClearedAt] = useState<number>(0);

  // Derive booleans from activeLayer
  const showTracking = activeLayer === "agentes";
  const showDatos = activeLayer === "datos";
  const showHeatmap = activeLayer === "densidad";

  // Drill-down state for geographic navigation
  const [drillState, setDrillState] = useState<DrillState>(INITIAL_DRILL);

  // Layer change handler — mutually exclusive
  const handleLayerChange = useCallback((layer: ActiveLayer) => {
    setActiveLayer(layer);
    if (layer !== "agentes") {
      setSelectedAgentId(null);
      setSelectedAgentIds(new Set());
    }
  }, []);

  // Agent click from map or list: fly to agent + auto-enable Agentes layer
  const handleSelectAgent = useCallback((agentId: string | null) => {
    setSelectedAgentId(agentId);
    if (agentId) {
      setActiveLayer("agentes");
    }
  }, []);

  // Agent click from agents list: fly to agent, enable layer, toggle multi-select
  const handleAgentListClick = useCallback((agentId: string) => {
    setActiveLayer("agentes");
    setSelectedAgentId(agentId);
    setSelectedAgentIds((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
    const agent = enrichedAgentsRef.current.find((a) => a.id === agentId);
    if (agent) {
      mapHandleRef.current?.flyToPoint(agent.lng, agent.lat, 15);
    }
  }, []);

  // Enrich agents (P4 fix: forms from TanStack Query has stable reference via structuralSharing)
  const enrichedAgents = useMemo((): EnrichedAgent[] => {
    if (!stats) return [];
    const now = Date.now();
    const locMap = new Map(locations.map((l) => [l.agent_id, l]));
    const agentMap = new Map<string, EnrichedAgent>();

    for (const agent of stats.top_agents) {
      const loc = locMap.get(agent.id);
      if (loc) {
        agentMap.set(agent.id, { id: agent.id, name: agent.name, status: getAgentStatus(loc.ts, now), lastSeen: new Date(loc.ts), forms_count: agent.forms_count, lat: loc.lat, lng: loc.lng });
      } else {
        const af = forms.filter((f) => f.encuestador_id === agent.id || f.agent_id === agent.id);
        const last = af[0];
        const lastCoords = last ? formCoordsToLatLng(last.x, last.y, last.zona) : null;
        agentMap.set(agent.id, { id: agent.id, name: agent.name, status: "inactive", lastSeen: last ? new Date(last.created_at) : new Date(0), forms_count: agent.forms_count, lat: lastCoords?.lat ?? -12.046, lng: lastCoords?.lng ?? -77.043 });
      }
    }

    for (const loc of locations) {
      if (!agentMap.has(loc.agent_id)) {
        agentMap.set(loc.agent_id, { id: loc.agent_id, name: loc.agent_name || `Agente ${loc.agent_id.slice(0, 6)}`, status: getAgentStatus(loc.ts, now), lastSeen: new Date(loc.ts), forms_count: 0, lat: loc.lat, lng: loc.lng });
      }
    }

    return Array.from(agentMap.values()).sort((a, b) => {
      const o = { connected: 0, idle: 1, inactive: 2 };
      return o[a.status] !== o[b.status] ? o[a.status] - o[b.status] : b.forms_count - a.forms_count;
    });
  }, [stats, locations, forms]);

  // Keep a ref for imperative access (agent list click handler)
  const enrichedAgentsRef = useRef(enrichedAgents);
  enrichedAgentsRef.current = enrichedAgents;

  // Form points for map — convert UTM to lat/lng
  const formPoints = useMemo(
    () =>
      forms
        .map((f) => {
          const coords = formCoordsToLatLng(f.x, f.y, f.zona);
          if (!coords) return null;
          return { id: f.id, lat: coords.lat, lng: coords.lng, nombre: f.nombre, created_at: f.created_at, agent_id: f.agent_id || f.encuestador_id };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null),
    [forms],
  );

  // Connected count
  const connectedCount = useMemo(
    () => enrichedAgents.filter((a) => a.status === "connected").length,
    [enrichedAgents],
  );

  // Filtered forms for table — by selected agent(s) or all
  const filteredForms = useMemo(() => {
    if (selectedAgentIds.size > 0) {
      return forms.filter((f) => selectedAgentIds.has(f.agent_id ?? "") || selectedAgentIds.has(f.encuestador_id ?? ""));
    }
    if (selectedAgentId) {
      return forms.filter((f) => f.agent_id === selectedAgentId || f.encuestador_id === selectedAgentId);
    }
    return forms;
  }, [forms, selectedAgentId, selectedAgentIds]);

  // Filtered agents for metrics — by selection or all
  const filteredAgents = useMemo(() => {
    if (selectedAgentIds.size > 0) {
      return enrichedAgents.filter((a) => selectedAgentIds.has(a.id));
    }
    if (selectedAgentId) {
      return enrichedAgents.filter((a) => a.id === selectedAgentId);
    }
    return enrichedAgents;
  }, [enrichedAgents, selectedAgentId, selectedAgentIds]);

  // ─── Activity log entries ─────────────────────────────────
  const logEntries = useMemo((): LogEntry[] => {
    const entries: LogEntry[] = forms.slice(0, 50).map((f) => {
      const coords = formCoordsToLatLng(f.x, f.y, f.zona);
      return {
        id: `form-${f.id}`,
        type: "form_new" as const,
        agentName: f.encuestador || "Agente",
        message: `registro a ${f.nombre || "contacto"}`,
        timestamp: new Date(f.created_at),
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      };
    });

    if (stats?.recent_events) {
      for (const ev of stats.recent_events) {
        entries.push({
          id: `ev-${ev.timestamp}-${ev.agent_id}`,
          type: ev.type,
          agentName: ev.agent_name,
          message: ev.message,
          timestamp: new Date(ev.timestamp),
          lat: null,
          lng: null,
        });
      }
    }

    entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const filtered = logClearedAt > 0
      ? entries.filter((e) => e.timestamp.getTime() > logClearedAt)
      : entries;
    return filtered.slice(0, 60);
  }, [forms, stats, logClearedAt]);

  // Clear log handler
  const handleClearLog = useCallback(() => {
    setLogClearedAt(Date.now());
  }, []);

  // Handle log entry click → fly to point
  const handleLogEntryClick = useCallback((entry: LogEntry) => {
    if (entry.lat != null && entry.lng != null) {
      mapHandleRef.current?.flyToPoint(entry.lng, entry.lat, 17);
    }
  }, []);

  // WhatsApp handler for agent tab
  const handleWhatsApp = useCallback((agent: EnrichedAgent) => {
    window.open(`https://wa.me/?text=Hola ${encodeURIComponent(agent.name)}`, "_blank");
  }, []);

  // Refetch forms after deletion (invalidate TanStack Query cache)
  const handleFormsDeleted = useCallback(() => {
    if (campaignId) {
      queryClient.invalidateQueries({ queryKey: tierraKeys.forms(campaignId) });
    }
  }, [queryClient, campaignId]);

  // ─── Loading / Error ──────────────────────────────────────

  if (statsLoading) {
    return (
      <div style={FULL_SCREEN}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 12, backgroundColor: "#f8fafc" }}>
          <div style={{ width: 32, height: 32, border: "3px solid #e2e8f0", borderTopColor: "#1d4ed8", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: 14, color: "#64748b" }}>Cargando campana...</span>
          <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
        </div>
      </div>
    );
  }

  if (statsError || !stats) {
    return (
      <div style={FULL_SCREEN}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 12, backgroundColor: "#f8fafc" }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#1e293b" }}>No se pudo cargar</div>
          <div style={{ fontSize: 14, color: "#64748b" }}>{statsError instanceof Error ? statsError.message : "Candidato no encontrado"}</div>
          <button type="button" onClick={() => refetchStats()} style={{ marginTop: 12, padding: "8px 20px", borderRadius: 8, border: "1px solid #e2e8f0", backgroundColor: "#ffffff", color: "#334155", fontSize: 13, cursor: "pointer" }}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const { campaign } = stats;

  // Check if user is admin for this campaign
  const campaignMembership = campaigns.find((c) => c.id === campaign.id || c.slug === slug);
  const isAdmin = user?.role === "admin" || campaignMembership?.role === "admin" || campaignMembership?.role === "jefe_campana";

  // Selection context label for metrics
  const selectionLabel = selectedAgentIds.size > 0
    ? `${selectedAgentIds.size} agente${selectedAgentIds.size > 1 ? "s" : ""}`
    : selectedAgentId
    ? enrichedAgents.find((a) => a.id === selectedAgentId)?.name ?? "Agente"
    : null;

  return (
    <div ref={shellRef} style={isFullscreen ? FULL_SCREEN_FS : FULL_SCREEN}>
      {/* ── Header ── */}
      <TierraHeader
        stats={stats}
        agentCount={enrichedAgents.length}
        formCount={forms.length}
        connectedCount={connectedCount}
      />

      {/* ── Main content area: map column + DataPanel side-by-side ── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

        {/* Left column: map (shrinks) + metrics (grows) — flex column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>

          {/* Map area — flex: 1 shrinks when metrics open */}
          <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
            <TierraMap
              ref={mapHandleRef}
              campaignId={campaign.id}
              slug={slug}
              primaryColor={campaign.color_primario}
              agents={enrichedAgents}
              forms={formPoints}
              selectedAgentId={selectedAgentId}
              onSelectAgent={handleSelectAgent}
              showTracking={showTracking}
              showDatos={showDatos}
              showHeatmap={showHeatmap}
              drillState={drillState}
              onDrillChange={setDrillState}
            />

            {/* Controls — top left */}
            <div style={{ position: "absolute", top: 12, left: 12, zIndex: 10 }}>
              <MapControls
                activeLayer={activeLayer}
                onLayerChange={handleLayerChange}
                agentCount={enrichedAgents.length}
                formCount={forms.length}
              />
            </div>

            {/* Fullscreen toggle — top right */}
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
              title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                zIndex: 10,
                width: 34,
                height: 34,
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                backgroundColor: "rgba(255,255,255,0.95)",
                backdropFilter: "blur(8px)",
                color: "#475569",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
                transition: "background-color 0.15s ease",
              }}
            >
              {isFullscreen ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="4 14 10 14 10 20" />
                  <polyline points="20 10 14 10 14 4" />
                  <line x1="14" y1="10" x2="21" y2="3" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              )}
            </button>

            {/* Bottom toolbar — metrics toggle + table toggle */}
            <div style={{
              position: "absolute",
              bottom: 12,
              left: 12,
              zIndex: 10,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              <button
                type="button"
                onClick={() => setShowMetrics(!showMetrics)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 14px",
                  backgroundColor: showMetrics ? campaign.color_primario : "#ffffff",
                  color: showMetrics ? "#ffffff" : "#334155",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  transition: "all 0.2s ease",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 3v18h18" />
                  <path d="M18 17V9" />
                  <path d="M13 17V5" />
                  <path d="M8 17v-3" />
                </svg>
                {showMetrics ? "Ocultar" : "Metricas"}
              </button>
              <button
                type="button"
                onClick={() => setShowTable(!showTable)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 14px",
                  backgroundColor: showTable ? campaign.color_primario : "#ffffff",
                  color: showTable ? "#ffffff" : "#334155",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  transition: "all 0.2s ease",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18" />
                  <path d="M3 15h18" />
                  <path d="M9 3v18" />
                </svg>
                {showTable ? "Cerrar tabla" : "Ver tabla"}
              </button>
            </div>
          </div>

          {/* Metrics panel — flex sibling below map, takes real space → triggers resize */}
          <div
            style={{
              height: showMetrics ? METRICS_H : 0,
              backgroundColor: "#ffffff",
              borderTop: showMetrics ? "1px solid #e2e8f0" : "none",
              overflow: "hidden",
              transition: "height 0.3s cubic-bezier(0.4,0,0.2,1)",
              flexShrink: 0,
            }}
          >
            {showMetrics && (
              <ActivityCharts
                forms={filteredForms}
                agents={filteredAgents}
                allForms={forms}
                allAgents={enrichedAgents}
                primaryColor={campaign.color_primario}
                secondaryColor={campaign.color_secundario}
                selectionLabel={selectionLabel}
              />
            )}
          </div>
        </div>

        {/* Data sidebar — right side, flex sibling → takes real space */}
        <div style={{
          width: showTable ? PANEL_W : 0,
          flexShrink: 0,
          transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)",
          overflow: "hidden",
          borderLeft: showTable ? "1px solid #e2e8f0" : "none",
          position: "relative",
        }}>
          <div style={{ width: PANEL_W, height: "100%", position: "absolute", top: 0, right: 0 }}>
            <DataPanel
              forms={filteredForms}
              selectedAgentName={enrichedAgents.find((a) => a.id === selectedAgentId)?.name ?? null}
              primaryColor={campaign.color_primario}
              open={showTable}
              onClose={() => setShowTable(false)}
              onFlyTo={(lng, lat) => mapHandleRef.current?.flyToPoint(lng, lat, 17)}
              campaignId={campaign.id}
              isAdmin={isAdmin}
              onFormsDeleted={handleFormsDeleted}
              agents={enrichedAgents}
              selectedAgentId={selectedAgentId}
              onSelectAgent={handleAgentListClick}
              onWhatsApp={handleWhatsApp}
              logEntries={logEntries}
              onLogEntryClick={handleLogEntryClick}
              onClearLog={handleClearLog}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========== Constants ========== */

/** Empty array — stable reference for when forms query hasn't loaded yet */
const EMPTY_FORMS: FormRecord[] = [];

/* ========== Full screen container (offset by collapsed sidebar 52px + tab bar 48px) ========== */

const SIDEBAR_COLLAPSED_WIDTH = 52;
const TAB_BAR_HEIGHT = 48;

const FULL_SCREEN: React.CSSProperties = {
  position: "fixed",
  top: TAB_BAR_HEIGHT,
  right: 0,
  bottom: 0,
  left: SIDEBAR_COLLAPSED_WIDTH,
  zIndex: 50,
  display: "flex",
  flexDirection: "column",
  backgroundColor: "#f8fafc",
  overflow: "hidden",
};

/** In native fullscreen the element covers the entire screen — no offsets */
const FULL_SCREEN_FS: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 50,
  display: "flex",
  flexDirection: "column",
  backgroundColor: "#f8fafc",
  overflow: "hidden",
};
