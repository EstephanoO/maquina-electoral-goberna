"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import type { FormRecord } from "@/lib/services";
import { deleteForm, updateForm } from "@/lib/services";
import { useCampaignStats, useRecentForms, useAgentLocationsSnapshot } from "@/lib/hooks";
import { useAuth } from "@/lib/auth-context";

import {
  TierraHeader, MapControls, PipelineView, DatosView, CampoOverlay,
  INITIAL_DRILL,
  type TierraMapHandle, type DrillState, type ActiveLayer, type LogEntry,
} from "./_components";
import type { TierraViewMode } from "./_components/tierra-header";
import { useAgentSSE } from "./_components/hooks/use-agent-sse";
import { usePipelineState } from "./_components/hooks/use-pipeline-state";
import { useEnrichedAgents } from "./_components/hooks/use-enriched-agents";
import { useDrillBounds } from "./_components/hooks/use-drill-bounds";
import { useActivityLog } from "./_components/hooks/use-activity-log";
import { useSSELocations } from "./_components/hooks/use-sse-locations";

/** Lazy-load TierraMap — keeps MapLibre GL out of the shared chunk */
const TierraMap = dynamic(
  () => import("./_components/tierra-map").then((m) => m.TierraMap),
  { ssr: false },
);

const EMPTY_FORMS: FormRecord[] = [];

/* ========== Page ========== */

export default function TierraPage() {
  const params = useParams();
  const slug = params.slug as string;
  const mapHandleRef = useRef<TierraMapHandle | null>(null);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ─── Data fetching ───
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useCampaignStats(slug);
  const campaignId = stats?.campaign.id;
  const { data: forms = EMPTY_FORMS } = useRecentForms(campaignId);
  const { data: initialLocations } = useAgentLocationsSnapshot(campaignId);

  // ─── Pipeline state (period filter, metrics, form filtering) ───
  const pipeline = usePipelineState(campaignId, forms);

  // ─── SSE: live agent locations, offline events, idle events, background status, session presence ───
  const { locations, sseEvents, backgroundAgentIds, idleAgentIds, onlineAgentIds, handleSSEUpdate, handleSnapshotOnlineIds, handleAgentOffline, handleAgentOnline, handleAgentIdle, handleAgentStatus } =
    useSSELocations(initialLocations);
  useAgentSSE(campaignId ?? null, handleSSEUpdate, handleAgentOffline, handleAgentStatus, handleAgentIdle, handleAgentOnline, handleSnapshotOnlineIds);

  // ─── UI state ───
  const [viewMode, setViewMode] = useState<TierraViewMode>("campo");
  const [activeLayer, setActiveLayer] = useState<ActiveLayer>("datos");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set());
  const [drillState, setDrillState] = useState<DrillState>(INITIAL_DRILL);
  const [showRoutes, setShowRoutes] = useState(false);

  const showTracking = activeLayer === "agentes";
  const showDatos = activeLayer === "datos" || selectedAgentId !== null;

  // ─── Count unique surveyors with routes (2+ geolocated forms) ───
  const routeSurveyorCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of forms) {
      if (f.encuestador && f.x && f.y) {
        counts.set(f.encuestador, (counts.get(f.encuestador) ?? 0) + 1);
      }
    }
    let n = 0;
    for (const c of counts.values()) if (c >= 2) n++;
    return n;
  }, [forms]);

  // ─── Geo bounds & derived data ───
  const drillBounds = useDrillBounds(drillState);
  const { enrichedAgents, formPoints, connectedCount } =
    useEnrichedAgents(stats, locations, forms, selectedAgentId, selectedAgentIds, drillBounds, backgroundAgentIds, idleAgentIds, onlineAgentIds, campaignId);
  const enrichedAgentsRef = useRef(enrichedAgents);
  enrichedAgentsRef.current = enrichedAgents;

  const flyToPoint = useCallback((lng: number, lat: number, zoom: number) => { mapHandleRef.current?.flyToPoint(lng, lat, zoom); }, []);
  const flyToFromDatos = useCallback((lng: number, lat: number) => { setViewMode("campo"); setTimeout(() => mapHandleRef.current?.flyToPoint(lng, lat, 16), 120); }, []);
  const { logEntries, handleLogEntryClick } = useActivityLog(forms, stats, flyToPoint, sseEvents);

  // ─── Handlers ───
  const handleLayerChange = useCallback((layer: ActiveLayer) => {
    setActiveLayer(layer);
    if (layer !== "agentes") { setSelectedAgentId(null); setSelectedAgentIds(new Set()); }
  }, []);

  const handleRoutesToggle = useCallback(() => {
    setShowRoutes((prev) => !prev);
  }, []);

  const handleSelectAgent = useCallback((agentId: string | null) => {
    setSelectedAgentId(agentId);
  }, []);

  const handleAgentListClick = useCallback((agentId: string) => {
    setSelectedAgentId((prev) => {
      if (prev === agentId) return null;
      const agent = enrichedAgentsRef.current.find((a) => a.id === agentId);
      if (agent) mapHandleRef.current?.flyToPoint(agent.lng, agent.lat, 15);
      return agentId;
    });
  }, []);

  const handleDeleteForm = useCallback(async (formId: string, campaignId: string): Promise<boolean> => {
    const res = await deleteForm(formId, campaignId);
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ["recent-forms"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-stats"] });
      return true;
    }
    return false;
  }, [queryClient]);

  const handleUpdateForm = useCallback(async (formId: string, campaignId: string, updates: Record<string, string>): Promise<boolean> => {
    const res = await updateForm(formId, campaignId, updates);
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ["recent-forms"] });
      return true;
    }
    return false;
  }, [queryClient]);

  // ─── Loading / Error ───
  if (statsLoading) {
    return (
      <div className="fixed top-12 right-0 bottom-0 z-50 flex flex-col bg-slate-50 overflow-hidden transition-[left] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]" style={{ left: "var(--sidebar-current-width, 72px)" }}>
        <div className="flex flex-col items-center justify-center flex-1 gap-3 bg-slate-50">
          <div className="w-8 h-8 border-[3px] border-slate-200 border-t-blue-700 rounded-full animate-spin" />
          <span className="text-sm text-slate-500">Cargando campaña...</span>
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
    <div className="fixed z-50 flex flex-col bg-slate-50 overflow-hidden top-12 right-0 bottom-0 transition-[left] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]" style={{ left: "var(--sidebar-current-width, 72px)" }}>
      <TierraHeader stats={stats} agentCount={enrichedAgents.length} formCount={stats.totals.forms_count} connectedCount={connectedCount} viewMode={viewMode} onViewModeChange={setViewMode} />

      {viewMode === "campo" ? (
        <div className="flex-1 min-h-0 relative">
          <TierraMap ref={mapHandleRef} campaignId={campaign.id} slug={slug} primaryColor={campaign.color_primario} agents={enrichedAgents} forms={formPoints} selectedAgentId={selectedAgentId} onSelectAgent={handleSelectAgent} showTracking={showTracking} showDatos={showDatos} showRoutes={showRoutes} drillState={drillState} onDrillChange={setDrillState} />
          <div className="absolute top-3 left-3 z-10">
            <MapControls activeLayer={activeLayer} onLayerChange={handleLayerChange} showRoutes={showRoutes} onRoutesToggle={handleRoutesToggle} agentCount={enrichedAgents.length} formCount={stats.totals.forms_count} routeSurveyorCount={routeSurveyorCount} />
          </div>
          <CampoOverlay agents={enrichedAgents} connectedCount={connectedCount} logEntries={logEntries} formCount={stats.totals.forms_count} primaryColor={campaign.color_primario} selectedAgentId={selectedAgentId} onAgentClick={handleAgentListClick} onLogEntryClick={handleLogEntryClick} userRole={user?.role} onDeleteForm={handleDeleteForm} onUpdateForm={handleUpdateForm} />
        </div>
      ) : viewMode === "pipeline" ? (
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
          offset={pipeline.offset}
          onOffsetChange={pipeline.onOffsetChange}
          periodLabel={pipeline.periodLabel}
          dateRanges={pipeline.dateRanges}
          totalDatos={stats.totals.forms_count}
          serverTotals={stats.totals}
          agentesCampoCount={enrichedAgents.length}
          metaDatos={stats.metas.datos}
        />
      ) : (
        <DatosView
          forms={forms}
          isLoading={!forms.length && statsLoading}
          primaryColor={campaign.color_primario}
          campaignName={campaign.name}
          campaignId={campaign.id}
          userRole={user?.role ?? "agente"}
          onUpdateForm={handleUpdateForm}
          onDeleteForm={handleDeleteForm}
          onFormsChanged={() => { queryClient.invalidateQueries({ queryKey: ["recent-forms"] }); queryClient.invalidateQueries({ queryKey: ["campaign-stats"] }); }}
          onFlyTo={flyToFromDatos}
        />
      )}
    </div>
  );
}
