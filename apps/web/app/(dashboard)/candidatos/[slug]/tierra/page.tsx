"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

import type { FormRecord } from "@/lib/services";
import { useCampaignStats, useRecentForms, useAgentLocationsSnapshot, type AgentLocation } from "@/lib/hooks";

import {
  TierraHeader, MapControls, PipelineView, CampoOverlay,
  INITIAL_DRILL,
  type TierraMapHandle, type DrillState, type ActiveLayer, type LogEntry,
} from "./_components";
import type { TierraViewMode } from "./_components/tierra-header";
import { useAgentSSE } from "./_components/hooks/use-agent-sse";
import { usePipelineState } from "./_components/hooks/use-pipeline-state";
import { useEnrichedAgents } from "./_components/hooks/use-enriched-agents";
import { useDrillBounds } from "./_components/hooks/use-drill-bounds";
import { useActivityLog } from "./_components/hooks/use-activity-log";

/** Lazy-load TierraMap — keeps MapLibre GL out of the shared chunk */
const TierraMap = dynamic(
  () => import("./_components/tierra-map").then((m) => m.TierraMap),
  { ssr: false },
);

/* ========== Constants ========== */

const EMPTY_FORMS: FormRecord[] = [];

/* ========== Page ========== */

export default function TierraPage() {
  const params = useParams();
  const slug = params.slug as string;
  const mapHandleRef = useRef<TierraMapHandle | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);

  // ─── Data fetching ───
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useCampaignStats(slug);
  const campaignId = stats?.campaign.id;
  const { data: forms = EMPTY_FORMS } = useRecentForms(campaignId);
  const { data: initialLocations } = useAgentLocationsSnapshot(campaignId);

  // ─── Pipeline state (period filter, metrics, form filtering) ───
  const pipeline = usePipelineState(campaignId, forms);

  // ─── SSE: live agent locations ───
  const [locations, setLocations] = useState<AgentLocation[]>([]);
  const locationsMapRef = useRef<Map<string, AgentLocation>>(new Map());
  useEffect(() => {
    if (initialLocations?.length) {
      const map = new Map<string, AgentLocation>();
      for (const loc of initialLocations) map.set(loc.agent_id, loc);
      locationsMapRef.current = map;
      setLocations(initialLocations);
    }
  }, [initialLocations]);
  const ssePendingRef = useRef<Map<string, AgentLocation> | null>(null);
  const sseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSSEUpdate = useCallback((incoming: AgentLocation[]) => {
    if (!ssePendingRef.current) ssePendingRef.current = new Map();
    for (const loc of incoming) ssePendingRef.current.set(loc.agent_id, loc);
    if (sseTimerRef.current) return;
    sseTimerRef.current = setTimeout(() => {
      sseTimerRef.current = null;
      const pending = ssePendingRef.current;
      if (!pending || pending.size === 0) return;
      ssePendingRef.current = null;

      setBackgroundAgentIds((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const id of pending.keys()) {
          if (next.has(id)) { next.delete(id); changed = true; }
        }
        return changed ? next : prev;
      });

      const map = locationsMapRef.current;
      for (const [id, loc] of pending) map.set(id, loc);
      setLocations(Array.from(map.values()));
    }, 250);
  }, []);
  useEffect(() => () => { if (sseTimerRef.current) clearTimeout(sseTimerRef.current); }, []);

  // ─── SSE: agent offline / status ───
  const [sseEvents, setSseEvents] = useState<LogEntry[]>([]);
  const [backgroundAgentIds, setBackgroundAgentIds] = useState<Set<string>>(new Set());

  const handleAgentOffline = useCallback((payload: { agent_id: string; agent_name?: string; ts: string }) => {
    locationsMapRef.current.delete(payload.agent_id);
    setLocations((prev) => prev.filter((l) => l.agent_id !== payload.agent_id));
    const name = payload.agent_name ?? `Agente ${payload.agent_id.slice(0, 8)}`;
    setSseEvents((prev) => [{
      id: `sse-offline-${payload.agent_id}-${payload.ts}`, type: "agent_disconnected" as const,
      agentName: name, message: `${name} se desconecto`, timestamp: new Date(payload.ts), lat: null, lng: null,
    }, ...prev].slice(0, 30));
  }, []);

  const handleAgentStatus = useCallback((payload: { agent_id: string; status: string }) => {
    if (payload.status === "background") {
      setBackgroundAgentIds((prev) => { const next = new Set(prev); next.add(payload.agent_id); return next; });
    } else if (payload.status === "foreground") {
      setBackgroundAgentIds((prev) => { const next = new Set(prev); next.delete(payload.agent_id); return next; });
    }
  }, []);

  useAgentSSE(campaignId ?? null, handleSSEUpdate, handleAgentOffline, handleAgentStatus);

  // ─── UI state ───
  const [viewMode, setViewMode] = useState<TierraViewMode>("campo");
  const [activeLayer, setActiveLayer] = useState<ActiveLayer>("datos");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set());
  const [drillState, setDrillState] = useState<DrillState>(INITIAL_DRILL);

  const showTracking = activeLayer === "agentes";
  const showDatos = activeLayer === "datos";
  const showHeatmap = activeLayer === "densidad";

  // ─── Geo bounds & derived data ───
  const drillBounds = useDrillBounds(drillState);
  const { enrichedAgents, formPoints, connectedCount } =
    useEnrichedAgents(stats, locations, forms, selectedAgentId, selectedAgentIds, drillBounds, backgroundAgentIds);
  const enrichedAgentsRef = useRef(enrichedAgents);
  enrichedAgentsRef.current = enrichedAgents;

  const flyToPoint = useCallback((lng: number, lat: number, zoom: number) => { mapHandleRef.current?.flyToPoint(lng, lat, zoom); }, []);
  const { logEntries, handleLogEntryClick } = useActivityLog(forms, stats, flyToPoint, sseEvents);

  // ─── Handlers ───
  const handleLayerChange = useCallback((layer: ActiveLayer) => {
    setActiveLayer(layer);
    if (layer !== "agentes") { setSelectedAgentId(null); setSelectedAgentIds(new Set()); }
  }, []);

  const handleSelectAgent = useCallback((agentId: string | null) => {
    setSelectedAgentId(agentId);
    if (agentId) setActiveLayer("agentes");
  }, []);

  const handleAgentListClick = useCallback((agentId: string) => {
    setActiveLayer("agentes");
    setSelectedAgentId(agentId);
    setSelectedAgentIds((prev) => { const next = new Set(prev); if (next.has(agentId)) next.delete(agentId); else next.add(agentId); return next; });
    const agent = enrichedAgentsRef.current.find((a) => a.id === agentId);
    if (agent) mapHandleRef.current?.flyToPoint(agent.lng, agent.lat, 15);
  }, []);

  // ─── Loading / Error ───
  if (statsLoading) {
    return (
      <div className="fixed top-12 right-0 bottom-0 z-50 flex flex-col bg-slate-50 overflow-hidden transition-[left] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]" style={{ left: "var(--sidebar-current-width, 72px)" }}>
        <div className="flex flex-col items-center justify-center flex-1 gap-3 bg-slate-50">
          <div className="w-8 h-8 border-[3px] border-slate-200 border-t-blue-700 rounded-full animate-spin" />
          <span className="text-sm text-slate-500">Cargando campana...</span>
        </div>
      </div>
    );
  }
  if (statsError || !stats) {
    return (
      <div className="fixed top-12 right-0 bottom-0 z-50 flex flex-col bg-slate-50 overflow-hidden transition-[left] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]" style={{ left: "var(--sidebar-current-width, 72px)" }}>
        <div className="flex flex-col items-center justify-center flex-1 gap-3 bg-slate-50">
          <div className="text-lg font-semibold text-slate-800">No se pudo cargar</div>
          <div className="text-sm text-slate-500">{statsError instanceof Error ? statsError.message : "Candidato no encontrado"}</div>
          <button type="button" onClick={() => refetchStats()} className="mt-3 px-5 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-[13px] cursor-pointer hover:bg-slate-50">Reintentar</button>
        </div>
      </div>
    );
  }

  const { campaign } = stats;

  return (
    <div ref={shellRef} className="fixed z-50 flex flex-col bg-slate-50 overflow-hidden top-12 right-0 bottom-0 transition-[left] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]" style={{ left: "var(--sidebar-current-width, 72px)" }}>
      <TierraHeader stats={stats} agentCount={enrichedAgents.length} formCount={forms.length} connectedCount={connectedCount} viewMode={viewMode} onViewModeChange={setViewMode} pipelineTotals={pipeline.pipelineTotals} />

      {viewMode === "campo" ? (
        <div className="flex-1 min-h-0 relative">
          <TierraMap ref={mapHandleRef} campaignId={campaign.id} slug={slug} primaryColor={campaign.color_primario} agents={enrichedAgents} forms={formPoints} selectedAgentId={selectedAgentId} onSelectAgent={handleSelectAgent} showTracking={showTracking} showDatos={showDatos} showHeatmap={showHeatmap} drillState={drillState} onDrillChange={setDrillState} />
          <div className="absolute top-3 left-3 z-10">
            <MapControls activeLayer={activeLayer} onLayerChange={handleLayerChange} agentCount={enrichedAgents.length} formCount={forms.length} />
          </div>
          <CampoOverlay agents={enrichedAgents} connectedCount={connectedCount} logEntries={logEntries} formCount={forms.length} primaryColor={campaign.color_primario} onAgentClick={handleAgentListClick} onLogEntryClick={handleLogEntryClick} />
        </div>
      ) : (
        <PipelineView
          brigadistas={pipeline.brigadistaMetrics ?? []}
          prevBrigadistas={pipeline.prevBrigadistaMetrics ?? []}
          isLoading={pipeline.metricsLoading}
          isPending={pipeline.isPending}
          primaryColor={campaign.color_primario}
          secondaryColor={campaign.color_secundario}
          forms={pipeline.filteredForms}
          prevForms={pipeline.prevFilteredForms}
          agents={enrichedAgents}
          period={pipeline.period}
          onPeriodChange={pipeline.onPeriodChange}
          periodLabel={pipeline.periodLabel}
        />
      )}
    </div>
  );
}
