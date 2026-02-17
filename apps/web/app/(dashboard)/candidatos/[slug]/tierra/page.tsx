"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

import { getCampaignStats, getRecentForms, api, type FormRecord } from "@/lib/services";
import type { CampaignStats } from "@/lib/types";
import { formCoordsToLatLng } from "@/lib/utils";

import {
  TierraMap,
  TierraHeader,
  ActivityLog,
  MapControls,
  MapLegend,
  DataPanel,
  KpiPanel,
  ZoneBreadcrumb,
  INITIAL_DRILL,
  type TierraMapHandle,
  type EnrichedAgent,
  type AgentStatus,
  type LogEntry,
  type DrillState,
  type DrillLevel,
} from "./_components";

/* ========== Types ========== */

type AgentLocation = { agent_id: string; agent_name?: string; ts: string; lat: number; lng: number };

/* ========== Constants ========== */

const TWO_MIN = 2 * 60_000;
const TEN_MIN = 10 * 60_000;

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

/* ========== Page ========== */

export default function TierraPage() {
  const params = useParams();
  const slug = params.slug as string;
  const mapHandleRef = useRef<TierraMapHandle | null>(null);

  // Data
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [locations, setLocations] = useState<AgentLocation[]>([]);
  const [forms, setForms] = useState<FormRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI — tracking OFF by default, datos ON
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [showTracking, setShowTracking] = useState(false);
  const [showDatos, setShowDatos] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [logCollapsed, setLogCollapsed] = useState(false);

  // Drill-down state for geographic navigation
  const [drillState, setDrillState] = useState<DrillState>(INITIAL_DRILL);

  const handleBreadcrumbNavigate = useCallback((level: DrillLevel) => {
    const newState = { ...drillState, level };
    if (level < 4) { newState.sector = null; newState.sectorName = null; }
    if (level < 3) { newState.distCode = null; newState.distName = null; }
    if (level < 2) { newState.provCode = null; newState.provName = null; }
    if (level < 1) { newState.depCode = null; newState.depName = null; }
    setDrillState(newState);
  }, [drillState]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    const res = await getCampaignStats(slug, "day");
    if (res.ok && res.data) { setStats(res.data); setError(null); }
    else setError(res.error?.message ?? "Error cargando datos");
    setLoading(false);
  }, [slug]);

  // Fetch forms
  const fetchForms = useCallback(async () => {
    if (!stats) return;
    const res = await getRecentForms(stats.campaign.id, 200);
    if (res.ok && res.data?.forms) setForms(res.data.forms);
  }, [stats]);

  // Initial load
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Forms polling (15s) + initial
  useEffect(() => {
    if (!stats) return;
    fetchForms();
    const id = setInterval(fetchForms, 15000);
    return () => clearInterval(id);
  }, [stats, fetchForms]);

  // SSE for locations
  const handleSSEUpdate = useCallback((incoming: AgentLocation[]) => {
    setLocations((prev) => {
      const map = new Map(prev.map((l) => [l.agent_id, l]));
      for (const loc of incoming) map.set(loc.agent_id, loc);
      return Array.from(map.values());
    });
  }, []);

  useAgentSSE(stats?.campaign.id ?? null, handleSSEUpdate);

  // Also do initial fetch for locations
  useEffect(() => {
    if (!stats) return;
    api.get<{ agents: AgentLocation[] }>("/api/agents/live", { campaignId: stats.campaign.id })
      .then((res) => { if (res.ok && res.data?.agents) setLocations(res.data.agents); });
  }, [stats]);

  // Enrich agents
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

  // Filtered forms for table
  const filteredForms = useMemo(() => {
    if (!selectedAgentId) return forms;
    return forms.filter((f) => f.agent_id === selectedAgentId || f.encuestador_id === selectedAgentId);
  }, [forms, selectedAgentId]);

  // ─── Activity log entries ─────────────────────────────────
  const logEntries = useMemo((): LogEntry[] => {
    // Build from recent forms (the freshest data we have)
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

    // Add recent events from stats
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

    // Sort newest first
    entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return entries.slice(0, 60);
  }, [forms, stats]);

  // Handle log entry click → fly to point
  const handleLogEntryClick = useCallback((entry: LogEntry) => {
    if (entry.lat != null && entry.lng != null) {
      mapHandleRef.current?.flyToPoint(entry.lng, entry.lat, 17);
    }
  }, []);

  // ─── Loading / Error ──────────────────────────────────────

  if (loading) {
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

  if (error || !stats) {
    return (
      <div style={FULL_SCREEN}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 12, backgroundColor: "#f8fafc" }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#1e293b" }}>No se pudo cargar</div>
          <div style={{ fontSize: 14, color: "#64748b" }}>{error ?? "Candidato no encontrado"}</div>
          <button type="button" onClick={fetchStats} style={{ marginTop: 12, padding: "8px 20px", borderRadius: 8, border: "1px solid #e2e8f0", backgroundColor: "#ffffff", color: "#334155", fontSize: 13, cursor: "pointer" }}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const { campaign } = stats;

  return (
    <div style={FULL_SCREEN}>
      {/* ── Header ── */}
      <TierraHeader
        stats={stats}
        agentCount={enrichedAgents.length}
        formCount={forms.length}
        connectedCount={connectedCount}
      />

      {/* ── Map + overlays ── */}
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <TierraMap
          ref={mapHandleRef}
          campaignId={campaign.id}
          slug={slug}
          primaryColor={campaign.color_primario}
          agents={enrichedAgents}
          forms={formPoints}
          selectedAgentId={selectedAgentId}
          onSelectAgent={setSelectedAgentId}
          showTracking={showTracking}
          showDatos={showDatos}
          showHeatmap={showHeatmap}
          drillState={drillState}
          onDrillChange={setDrillState}
        />

        {/* Zone breadcrumb — top center */}
        {drillState.level > 0 && (
          <div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 10 }}>
            <ZoneBreadcrumb state={drillState} onNavigate={handleBreadcrumbNavigate} primaryColor={campaign.color_primario} />
          </div>
        )}

        {/* Controls — top left */}
        <div style={{ position: "absolute", top: 16, left: 16, zIndex: 10 }}>
          <MapControls
            showTracking={showTracking}
            showDatos={showDatos}
            showHeatmap={showHeatmap}
            showTable={showTable}
            onToggleTracking={() => setShowTracking(!showTracking)}
            onToggleDatos={() => setShowDatos(!showDatos)}
            onToggleHeatmap={() => setShowHeatmap(!showHeatmap)}
            onToggleTable={() => setShowTable(!showTable)}
            agentCount={enrichedAgents.length}
            formCount={forms.length}
            primaryColor={campaign.color_primario}
          />
        </div>

        {/* Activity log — top right (shift left when data panel is open) */}
        <div style={{ position: "absolute", top: 16, right: showTable ? 396 : 16, zIndex: 10, transition: "right 0.25s cubic-bezier(0.4,0,0.2,1)" }}>
          <ActivityLog
            entries={logEntries}
            onEntryClick={handleLogEntryClick}
            primaryColor={campaign.color_primario}
            collapsed={logCollapsed}
            onToggleCollapse={() => setLogCollapsed(!logCollapsed)}
          />
        </div>

        {/* Legend — bottom right (shift left when data panel is open) */}
        <div style={{ position: "absolute", bottom: 24, right: showTable ? 396 : 16, zIndex: 10, transition: "right 0.25s cubic-bezier(0.4,0,0.2,1)" }}>
          <MapLegend showTracking={showTracking} showDatos={showDatos} showHeatmap={showHeatmap} />
        </div>

        {/* Data sidebar — right side */}
        <DataPanel
          forms={filteredForms}
          selectedAgentName={enrichedAgents.find((a) => a.id === selectedAgentId)?.name ?? null}
          primaryColor={campaign.color_primario}
          open={showTable}
          onClose={() => setShowTable(false)}
        />
      </div>
    </div>
  );
}

/* ========== Full screen container (offset by collapsed sidebar 52px) ========== */

const SIDEBAR_COLLAPSED_WIDTH = 52;

const FULL_SCREEN: React.CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  left: SIDEBAR_COLLAPSED_WIDTH,
  zIndex: 50,
  display: "flex",
  flexDirection: "column",
  backgroundColor: "#f8fafc",
  overflow: "hidden",
};
