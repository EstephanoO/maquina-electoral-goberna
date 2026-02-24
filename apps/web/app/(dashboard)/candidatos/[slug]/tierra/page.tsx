"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import type { FormRecord } from "@/lib/services";
import { useAuth } from "@/lib/auth-context";
import { useCampaignStats, useRecentForms, useAgentLocationsSnapshot, useBrigadistaMetrics, tierraKeys, type AgentLocation } from "@/lib/hooks";

import {
  TierraHeader, MapControls, DataPanel, ActivityCharts, PipelineView,
  INITIAL_DRILL,
  type TierraMapHandle, type EnrichedAgent, type DrillState, type ActiveLayer, type LogEntry,
} from "./_components";
import type { TierraViewMode } from "./_components/tierra-header";
import { useAgentSSE } from "./_components/hooks/use-agent-sse";
import { useFullscreen } from "./_components/hooks/use-fullscreen";
import { useEnrichedAgents } from "./_components/hooks/use-enriched-agents";
import { useDrillBounds } from "./_components/hooks/use-drill-bounds";
import { useActivityLog } from "./_components/hooks/use-activity-log";

/** Lazy-load TierraMap — keeps MapLibre GL out of the shared chunk */
const TierraMap = dynamic(
  () => import("./_components/tierra-map").then((m) => m.TierraMap),
  { ssr: false },
);

/* ========== Constants ========== */

const PANEL_W = 420;
const METRICS_H = 280;
const EMPTY_FORMS: FormRecord[] = [];

/* ========== Page ========== */

export default function TierraPage() {
  const params = useParams();
  const slug = params.slug as string;
  const mapHandleRef = useRef<TierraMapHandle | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const { user, campaigns } = useAuth();
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(shellRef);
  const queryClient = useQueryClient();

  // ─── Data fetching ───
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useCampaignStats(slug);
  const campaignId = stats?.campaign.id;
  const { data: forms = EMPTY_FORMS } = useRecentForms(campaignId);
  const { data: initialLocations } = useAgentLocationsSnapshot(campaignId);
  const { data: brigadistaMetrics, isLoading: metricsLoading } = useBrigadistaMetrics(campaignId);

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

  // ─── SSE: agent offline ───
  const [sseEvents, setSseEvents] = useState<LogEntry[]>([]);
  const [backgroundAgentIds, setBackgroundAgentIds] = useState<Set<string>>(new Set());

  const handleAgentOffline = useCallback((payload: { agent_id: string; agent_name?: string; ts: string }) => {
    locationsMapRef.current.delete(payload.agent_id);
    setLocations((prev) => prev.filter((l) => l.agent_id !== payload.agent_id));
    const name = payload.agent_name ?? `Agente ${payload.agent_id.slice(0, 8)}`;
    setSseEvents((prev) => [{
      id: `sse-offline-${payload.agent_id}-${payload.ts}`,
      type: "agent_disconnected" as const,
      agentName: name,
      message: `${name} se desconecto`,
      timestamp: new Date(payload.ts),
      lat: null,
      lng: null,
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
  const [showTable, setShowTable] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);
  const [drillState, setDrillState] = useState<DrillState>(INITIAL_DRILL);

  const showTracking = activeLayer === "agentes";
  const showDatos = activeLayer === "datos";
  const showHeatmap = activeLayer === "densidad";

  // ─── Geo bounds for current drill level ───
  const drillBounds = useDrillBounds(drillState);

  // ─── Derived data ───
  const { enrichedAgents, formPoints, connectedCount, filteredForms, filteredAgents } =
    useEnrichedAgents(stats, locations, forms, selectedAgentId, selectedAgentIds, drillBounds, backgroundAgentIds);

  const enrichedAgentsRef = useRef(enrichedAgents);
  enrichedAgentsRef.current = enrichedAgents;

  // ─── Pipeline totals for header KPIs ───
  const pipelineTotals = useMemo(() => {
    if (!brigadistaMetrics?.length) return undefined;
    const totals = brigadistaMetrics.reduce(
      (acc, b) => ({
        captures: acc.captures + b.total_captures,
        contacted: acc.contacted + b.hablados + b.respondieron,
        responded: acc.responded + b.respondieron,
      }),
      { captures: 0, contacted: 0, responded: 0 },
    );
    return {
      ...totals,
      contactRate: totals.captures > 0 ? Math.round((totals.contacted / totals.captures) * 100) : 0,
    };
  }, [brigadistaMetrics]);

  const flyToPoint = useCallback((lng: number, lat: number, zoom: number) => {
    mapHandleRef.current?.flyToPoint(lng, lat, zoom);
  }, []);
  const { logEntries, handleClearLog, handleLogEntryClick } = useActivityLog(forms, stats, flyToPoint, sseEvents);

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
    setSelectedAgentIds((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId); else next.add(agentId);
      return next;
    });
    const agent = enrichedAgentsRef.current.find((a) => a.id === agentId);
    if (agent) mapHandleRef.current?.flyToPoint(agent.lng, agent.lat, 15);
  }, []);

  const handleWhatsApp = useCallback((agent: EnrichedAgent) => {
    window.open(`https://wa.me/?text=Hola ${encodeURIComponent(agent.name)}`, "_blank");
  }, []);

  const handleFormsDeleted = useCallback(() => {
    if (campaignId) queryClient.invalidateQueries({ queryKey: tierraKeys.forms(campaignId) });
  }, [queryClient, campaignId]);

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
          <button type="button" onClick={() => refetchStats()} className="mt-3 px-5 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-[13px] cursor-pointer hover:bg-slate-50">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const { campaign } = stats;
  const campaignMembership = campaigns.find((c) => c.id === campaign.id || c.slug === slug);
  const isAdmin = user?.role === "admin" || campaignMembership?.role === "admin" || campaignMembership?.role === "jefe_campana";
  const selectionLabel = selectedAgentIds.size > 0
    ? `${selectedAgentIds.size} agente${selectedAgentIds.size > 1 ? "s" : ""}`
    : selectedAgentId ? enrichedAgents.find((a) => a.id === selectedAgentId)?.name ?? "Agente" : null;

  return (
    <div
      ref={shellRef}
      className={`fixed z-50 flex flex-col bg-slate-50 overflow-hidden ${isFullscreen ? "inset-0" : "top-12 right-0 bottom-0 transition-[left] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"}`}
      style={isFullscreen ? undefined : { left: "var(--sidebar-current-width, 72px)" }}
    >
      <TierraHeader stats={stats} agentCount={enrichedAgents.length} formCount={forms.length} connectedCount={connectedCount} viewMode={viewMode} onViewModeChange={setViewMode} pipelineTotals={pipelineTotals} />

      {viewMode === "campo" ? (
        /* ═══ Vista Campo ═══ */
        <div className="flex flex-1 min-h-0">
          <div className="flex flex-col flex-1 min-w-0 relative">
            <div className="flex-1 relative min-h-0">
              <TierraMap ref={mapHandleRef} campaignId={campaign.id} slug={slug} primaryColor={campaign.color_primario} agents={enrichedAgents} forms={formPoints} selectedAgentId={selectedAgentId} onSelectAgent={handleSelectAgent} showTracking={showTracking} showDatos={showDatos} showHeatmap={showHeatmap} drillState={drillState} onDrillChange={setDrillState} />

              <div className="absolute top-3 left-3 z-10">
                <MapControls activeLayer={activeLayer} onLayerChange={handleLayerChange} agentCount={enrichedAgents.length} formCount={forms.length} />
              </div>

              <FullscreenButton isFullscreen={isFullscreen} onToggle={toggleFullscreen} />
              <BottomToolbar showMetrics={showMetrics} showTable={showTable} onToggleMetrics={() => setShowMetrics(!showMetrics)} onToggleTable={() => setShowTable(!showTable)} color={campaign.color_primario} />
            </div>

            {/* Metrics panel — always mounted, GPU transform slide */}
            <div
              className="bg-white border-t border-slate-200 overflow-hidden shrink-0 transition-[transform,margin-bottom] duration-250 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-transform"
              style={{
                height: METRICS_H,
                transform: showMetrics ? "translateY(0)" : `translateY(${METRICS_H}px)`,
                marginBottom: showMetrics ? 0 : -METRICS_H,
              }}
            >
              <ActivityCharts forms={filteredForms} agents={filteredAgents} allForms={forms} allAgents={enrichedAgents} primaryColor={campaign.color_primario} secondaryColor={campaign.color_secundario} selectionLabel={selectionLabel} />
            </div>
          </div>

          {/* Data sidebar — always mounted, GPU transform slide */}
          <div
            className="shrink-0 overflow-hidden border-l border-slate-200 relative transition-[transform,margin-left] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-transform"
            style={{
              width: PANEL_W,
              transform: showTable ? "translateX(0)" : `translateX(${PANEL_W}px)`,
              marginLeft: showTable ? 0 : -PANEL_W,
            }}
          >
            <DataPanel forms={filteredForms} selectedAgentName={enrichedAgents.find((a) => a.id === selectedAgentId)?.name ?? null} primaryColor={campaign.color_primario} open={showTable} onClose={() => setShowTable(false)} onFlyTo={(lng, lat) => mapHandleRef.current?.flyToPoint(lng, lat, 17)} campaignId={campaign.id} isAdmin={isAdmin} onFormsDeleted={handleFormsDeleted} agents={enrichedAgents} selectedAgentId={selectedAgentId} onSelectAgent={handleAgentListClick} onWhatsApp={handleWhatsApp} logEntries={logEntries} onLogEntryClick={handleLogEntryClick} onClearLog={handleClearLog} brigadistaMetrics={brigadistaMetrics} />
          </div>
        </div>
      ) : (
        /* ═══ Vista Pipeline ═══ */
        <PipelineView brigadistas={brigadistaMetrics ?? []} isLoading={metricsLoading} primaryColor={campaign.color_primario} />
      )}
    </div>
  );
}

/* ========== Small presentational sub-components ========== */

function FullscreenButton({ isFullscreen, onToggle }: { isFullscreen: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
      title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
      className="absolute top-3 right-3 z-10 w-[34px] h-[34px] rounded-lg border border-slate-200 bg-white/95 backdrop-blur-sm text-slate-600 cursor-pointer flex items-center justify-center shadow-sm transition-colors duration-150 hover:bg-slate-50"
    >
      {isFullscreen ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
      )}
    </button>
  );
}

function BottomToolbar({ showMetrics, showTable, onToggleMetrics, onToggleTable, color }: { showMetrics: boolean; showTable: boolean; onToggleMetrics: () => void; onToggleTable: () => void; color: string }) {
  return (
    <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2">
      <button
        type="button"
        onClick={onToggleMetrics}
        className="flex items-center gap-2 px-3.5 py-2 border border-slate-200 rounded-lg text-xs font-semibold cursor-pointer shadow-sm transition-all duration-200"
        style={{
          backgroundColor: showMetrics ? color : "#ffffff",
          color: showMetrics ? "#ffffff" : "#334155",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg>
        {showMetrics ? "Ocultar" : "Metricas"}
      </button>
      <button
        type="button"
        onClick={onToggleTable}
        className="flex items-center gap-2 px-3.5 py-2 border border-slate-200 rounded-lg text-xs font-semibold cursor-pointer shadow-sm transition-all duration-200"
        style={{
          backgroundColor: showTable ? color : "#ffffff",
          color: showTable ? "#ffffff" : "#334155",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /></svg>
        {showTable ? "Cerrar tabla" : "Ver tabla"}
      </button>
    </div>
  );
}
