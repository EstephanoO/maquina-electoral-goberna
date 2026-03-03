"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type TierraMapHandle, type DrillState, type ActiveLayer, type DatosVizMode, type MapTheme, type LogEntry, type PinnedTooltipData,
} from "./_components";
import { tierraKeys } from "@/lib/hooks";
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
const TIERRA_FULLSCREEN_CLASS = "tierra-fullscreen";
const TABBAR_THEME_VARS = [
  "--tierra-tabbar-bg",
  "--tierra-tabbar-border",
  "--tierra-tab-inactive-color",
  "--tierra-tab-active-color",
  "--tierra-tab-active-bg",
  "--tierra-tab-hover-bg",
  "--tierra-tab-indicator",
] as const;

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

  // ─── SSE: live agent locations, offline events, background status ───
  const { locations, sseEvents, backgroundAgentIds, handleSSEUpdate, handleAgentOffline, handleAgentStatus } =
    useSSELocations(initialLocations);
  useAgentSSE(campaignId ?? null, handleSSEUpdate, handleAgentOffline, handleAgentStatus);

  // ─── UI state ───
  const [viewMode, setViewMode] = useState<TierraViewMode>("campo");
  const [activeLayer, setActiveLayer] = useState<ActiveLayer>("datos");
  const [datosVizMode, setDatosVizMode] = useState<DatosVizMode>("points");
  const [heatmapRadius, setHeatmapRadius] = useState(26);
  const [heatmapOpacity, setHeatmapOpacity] = useState(0.88);
  const [mapTheme, setMapTheme] = useState<MapTheme>("dark");
  const [isFullscreen, setIsFullscreen] = useState(false);
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
    useEnrichedAgents(stats, locations, forms, selectedAgentId, selectedAgentIds, drillBounds, backgroundAgentIds);
  const enrichedAgentsRef = useRef(enrichedAgents);
  enrichedAgentsRef.current = enrichedAgents;

  const flyToPoint = useCallback((lng: number, lat: number, zoom: number) => { mapHandleRef.current?.flyToPoint(lng, lat, zoom); }, []);
  const flyToFromDatos = useCallback((lng: number, lat: number, tooltipData?: PinnedTooltipData) => {
    setViewMode("campo");
    setActiveLayer("datos");
    setTimeout(() => {
      mapHandleRef.current?.flyToPoint(lng, lat, 16);
      if (tooltipData) mapHandleRef.current?.showPinnedTooltip(tooltipData);
    }, 120);
  }, []);
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

  const handleDeleteForm = useCallback(async (formId: string, cId: string): Promise<boolean> => {
    const res = await deleteForm(formId, cId);
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: tierraKeys.all });
      return true;
    }
    return false;
  }, [queryClient]);

  const handleUpdateForm = useCallback(async (formId: string, cId: string, updates: Record<string, string>): Promise<boolean> => {
    const res = await updateForm(formId, cId, updates);
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: tierraKeys.all });
      return true;
    }
    return false;
  }, [queryClient]);

  const handleCameraNudge = useCallback((delta: {
    panX?: number;
    panY?: number;
    zoomDelta?: number;
    bearingDelta?: number;
    pitchDelta?: number;
  }) => {
    mapHandleRef.current?.nudgeCamera(delta);
  }, []);

  const handleCameraResetPosition = useCallback(() => {
    mapHandleRef.current?.resetCameraPosition();
  }, []);

  const handleCameraResetOrientation = useCallback(() => {
    mapHandleRef.current?.resetCameraOrientation();
  }, []);

  // Sync candidato slug tabbar theme (top white bar) with map theme while Tierra is mounted.
  useEffect(() => {
    const root = document.documentElement;
    const isDark = mapTheme === "dark";
    root.style.setProperty("--tierra-tabbar-bg", isDark ? "#020617" : "#ffffff");
    root.style.setProperty("--tierra-tabbar-border", isDark ? "#1e293b" : "#e2e8f0");
    root.style.setProperty("--tierra-tab-inactive-color", isDark ? "#94a3b8" : "#64748b");
    root.style.setProperty("--tierra-tab-active-color", isDark ? "#f8fafc" : "var(--goberna-blue-900)");
    root.style.setProperty("--tierra-tab-active-bg", isDark ? "rgba(30,41,59,0.72)" : "rgba(15,23,42,0.05)");
    root.style.setProperty("--tierra-tab-hover-bg", isDark ? "rgba(148,163,184,0.14)" : "rgba(15,23,42,0.04)");
    root.style.setProperty("--tierra-tab-indicator", isDark ? "#60a5fa" : "var(--goberna-blue-900)");
  }, [mapTheme]);

  // Fullscreen mode: hide global dashboard chrome (sidebar + top tabbar) while this page is visible.
  useEffect(() => {
    document.body.classList.toggle(TIERRA_FULLSCREEN_CLASS, isFullscreen);
    return () => {
      document.body.classList.remove(TIERRA_FULLSCREEN_CLASS);
    };
  }, [isFullscreen]);

  // Escape exits fullscreen.
  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen]);

  // Cleanup tabbar vars and fullscreen class when leaving Tierra route.
  useEffect(() => {
    return () => {
      const root = document.documentElement;
      for (const cssVar of TABBAR_THEME_VARS) root.style.removeProperty(cssVar);
      document.body.classList.remove(TIERRA_FULLSCREEN_CLASS);
    };
  }, []);

  // ─── Loading / Error ───
  if (statsLoading) {
    return (
      <div
        className="fixed right-0 bottom-0 z-50 flex flex-col bg-slate-50 overflow-hidden transition-[left,top] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ top: isFullscreen ? 0 : 48, left: isFullscreen ? 0 : "var(--sidebar-current-width, 72px)" }}
      >
        <div className="flex flex-col items-center justify-center flex-1 gap-3 bg-slate-50">
          <div className="w-8 h-8 border-[3px] border-slate-200 border-t-blue-700 rounded-full animate-spin" />
          <span className="text-sm text-slate-500">Cargando campaña...</span>
        </div>
      </div>
    );
  }
  if (statsError || !stats) {
    return (
      <div
        className="fixed right-0 bottom-0 z-50 flex flex-col bg-slate-50 overflow-hidden transition-[left,top] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ top: isFullscreen ? 0 : 48, left: isFullscreen ? 0 : "var(--sidebar-current-width, 72px)" }}
      >
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
    <div
      className="fixed z-50 flex flex-col bg-slate-50 overflow-hidden right-0 bottom-0 transition-[left,top] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{ top: isFullscreen ? 0 : 48, left: isFullscreen ? 0 : "var(--sidebar-current-width, 72px)" }}
    >
      <TierraHeader stats={stats} agentCount={enrichedAgents.length} formCount={stats.totals.forms_count} connectedCount={connectedCount} mapTheme={mapTheme} viewMode={viewMode} onViewModeChange={setViewMode} />

      {viewMode === "campo" ? (
        <div className="flex-1 min-h-0 relative">
          <TierraMap ref={mapHandleRef} campaignId={campaign.id} slug={slug} primaryColor={campaign.color_primario} agents={enrichedAgents} forms={formPoints} selectedAgentId={selectedAgentId} onSelectAgent={handleSelectAgent} showTracking={showTracking} showDatos={showDatos} datosVizMode={datosVizMode} heatmapRadius={heatmapRadius} heatmapOpacity={heatmapOpacity} mapTheme={mapTheme} showRoutes={showRoutes} drillState={drillState} onDrillChange={setDrillState} />
          <div className="absolute top-3 left-3 z-20 flex items-start gap-2">
            <button
              type="button"
              onClick={() => setIsFullscreen((prev) => !prev)}
              className={`cursor-pointer rounded-md border px-3 py-1.5 text-[11px] font-semibold flex items-center gap-2 backdrop-blur-sm transition-colors ${
                mapTheme === "dark"
                  ? "border-slate-600 bg-slate-900/85 text-slate-100 hover:bg-slate-800/90"
                  : "border-slate-200 bg-white/95 text-slate-700 hover:bg-slate-100/95"
              }`}
              title={isFullscreen ? "Salir de pantalla completa (Esc)" : "Pantalla completa"}
            >
              {isFullscreen ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="9 3 3 3 3 9" />
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="3 15 3 21 9 21" />
                  <polyline points="21 15 21 21 15 21" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              )}
              <span>{isFullscreen ? "Salir fullscreen" : "Pantalla completa"}</span>
            </button>
            <MapControls activeLayer={activeLayer} onLayerChange={handleLayerChange} showRoutes={showRoutes} onRoutesToggle={handleRoutesToggle} datosVizMode={datosVizMode} onDatosVizModeChange={setDatosVizMode} heatmapRadius={heatmapRadius} heatmapOpacity={heatmapOpacity} onHeatmapRadiusChange={setHeatmapRadius} onHeatmapOpacityChange={setHeatmapOpacity} mapTheme={mapTheme} onMapThemeChange={setMapTheme} agentCount={enrichedAgents.length} formCount={stats.totals.forms_count} routeSurveyorCount={routeSurveyorCount} />
          </div>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20">
            <CameraPanel
              mapTheme={mapTheme}
              onNudge={handleCameraNudge}
              onResetPosition={handleCameraResetPosition}
              onResetOrientation={handleCameraResetOrientation}
            />
          </div>
          <CampoOverlay agents={enrichedAgents} connectedCount={connectedCount} logEntries={logEntries} formCount={stats.totals.forms_count} primaryColor={campaign.color_primario} selectedAgentId={selectedAgentId} onAgentClick={handleAgentListClick} onLogEntryClick={handleLogEntryClick} userRole={user?.role} onDeleteForm={handleDeleteForm} onUpdateForm={handleUpdateForm} mapTheme={mapTheme} />
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
          onFormsChanged={() => { queryClient.invalidateQueries({ queryKey: tierraKeys.all }); }}
          onFlyTo={flyToFromDatos}
        />
      )}

      <style jsx global>{`
        body.${TIERRA_FULLSCREEN_CLASS} .dashboard-shell-sidebar,
        body.${TIERRA_FULLSCREEN_CLASS} .dashboard-sidebar-edge-zone,
        body.${TIERRA_FULLSCREEN_CLASS} .dashboard-mobile-menu-btn,
        body.${TIERRA_FULLSCREEN_CLASS} .candidato-tabbar-tierra {
          display: none !important;
        }
        body.${TIERRA_FULLSCREEN_CLASS} [data-dashboard-shell-root] {
          --sidebar-current-width: 0px !important;
        }
        body.${TIERRA_FULLSCREEN_CLASS} [data-dashboard-shell-root] .dashboard-shell-main {
          margin-left: 0 !important;
        }
      `}</style>
    </div>
  );
}

function CameraPanel({
  mapTheme,
  onNudge,
  onResetPosition,
  onResetOrientation,
}: {
  mapTheme: MapTheme;
  onNudge: (delta: { panX?: number; panY?: number; zoomDelta?: number; bearingDelta?: number; pitchDelta?: number }) => void;
  onResetPosition: () => void;
  onResetOrientation: () => void;
}) {
  const isDark = mapTheme === "dark";
  const shellClass = isDark
    ? "border-slate-600 bg-slate-950/88 text-slate-100"
    : "border-slate-200 bg-white/95 text-slate-700";
  const sectionLabelClass = isDark ? "text-slate-300" : "text-slate-500";

  return (
    <div className={`rounded-md border p-2 backdrop-blur-sm w-[172px] ${shellClass}`}>
      <div className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${sectionLabelClass}`}>Camara</div>

      <div className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${sectionLabelClass}`}>Posicion</div>
      <div className="grid grid-cols-3 gap-1 mb-2">
        <span />
        <CameraControlButton mapTheme={mapTheme} label="↑" title="Mover arriba" onClick={() => onNudge({ panY: -80 })} />
        <span />
        <CameraControlButton mapTheme={mapTheme} label="←" title="Mover izquierda" onClick={() => onNudge({ panX: -80 })} />
        <CameraControlButton mapTheme={mapTheme} label="Inicio" title="Volver a vista Perú" onClick={onResetPosition} />
        <CameraControlButton mapTheme={mapTheme} label="→" title="Mover derecha" onClick={() => onNudge({ panX: 80 })} />
        <span />
        <CameraControlButton mapTheme={mapTheme} label="↓" title="Mover abajo" onClick={() => onNudge({ panY: 80 })} />
        <span />
      </div>

      <div className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${sectionLabelClass}`}>Angulo</div>
      <div className="grid grid-cols-2 gap-1 mb-1">
        <CameraControlButton mapTheme={mapTheme} label="↺ Giro" title="Rotar izquierda" onClick={() => onNudge({ bearingDelta: -15 })} />
        <CameraControlButton mapTheme={mapTheme} label="Giro ↻" title="Rotar derecha" onClick={() => onNudge({ bearingDelta: 15 })} />
        <CameraControlButton mapTheme={mapTheme} label="Inclinar +" title="Aumentar inclinacion" onClick={() => onNudge({ pitchDelta: 8 })} />
        <CameraControlButton mapTheme={mapTheme} label="Inclinar -" title="Reducir inclinacion" onClick={() => onNudge({ pitchDelta: -8 })} />
        <CameraControlButton mapTheme={mapTheme} label="Zoom +" title="Acercar" onClick={() => onNudge({ zoomDelta: 0.5 })} />
        <CameraControlButton mapTheme={mapTheme} label="Zoom -" title="Alejar" onClick={() => onNudge({ zoomDelta: -0.5 })} />
      </div>

      <CameraControlButton mapTheme={mapTheme} label="Reset angulo" title="Norte arriba + vista plana" onClick={onResetOrientation} full />
    </div>
  );
}

function CameraControlButton({
  mapTheme,
  label,
  title,
  onClick,
  full = false,
}: {
  mapTheme: MapTheme;
  label: string;
  title: string;
  onClick: () => void;
  full?: boolean;
}) {
  const isDark = mapTheme === "dark";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`cursor-pointer rounded border px-2 py-1 text-[10px] font-semibold transition-colors ${
        full ? "w-full mt-1" : "w-full"
      } ${
        isDark
          ? "border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
          : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-white"
      }`}
    >
      {label}
    </button>
  );
}
