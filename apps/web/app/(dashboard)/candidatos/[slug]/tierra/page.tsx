"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import type { FormRecord } from "@/lib/services";
import { deleteForm, updateForm } from "@/lib/services";
import { useCampaignStats, useRecentForms, useAgentLocationsSnapshot } from "@/lib/hooks";
import { useAuth } from "@/lib/auth-context";

import {
  TierraHeader, MapControls, PipelineView, DatosView, CampoOverlay,
  INITIAL_DRILL,
  type TierraMapHandle, type DrillState, type ActiveLayer, type DatosVizMode, type MapTheme, type PinnedTooltipData,
} from "./_components";
import { DemoLeguaBanner } from "./_components/demo-legua-banner";
import { tierraKeys } from "@/lib/hooks";
import type { TierraViewMode } from "./_components/tierra-header";
import { useAgentSSE } from "./_components/hooks/use-agent-sse";
import { usePipelineState } from "./_components/hooks/use-pipeline-state";
import { useEnrichedAgents } from "./_components/hooks/use-enriched-agents";
import { useSSELocations } from "./_components/hooks/use-sse-locations";
import { useDrillBounds } from "./_components/hooks/use-drill-bounds";

/* ─── Demo: Carmen de la Legua (Callao) ─── */

/**
 * Slugs de campaña que activan la demo de Edwards Infante.
 * Agregá el slug real cuando se cree la campaña en el sistema.
 */
const LEGUA_DEMO_SLUGS = ["edwards-infante", "carmen-de-la-legua", "legua-demo"] as const;

/**
 * DrillState para Carmen de la Legua Reynoso.
 * Fuente: GET /api/geo/provincias/0701/distritos (DB producción, 2026-03-07)
 * Dep. Callao (07) → Prov. Callao (0701) → Dist. Carmen de la Legua (070103)
 */
const LEGUA_DRILL: DrillState = {
  level: 3,
  depCode: "07",
  depName: "CALLAO",
  provCode: "0701",
  provName: "CALLAO",
  distCode: "070103",
  distName: "Carmen de la Legua Reynoso",
  sector: null,
  sectorName: null,
};

/**
 * Bounds exactos de Carmen de la Legua Reynoso.
 * Fuente: GET /api/geo/provincias/0701/distritos — geometría PostGIS de producción.
 * [[minLng, minLat], [maxLng, maxLat]]
 */
const LEGUA_BOUNDS: [[number, number], [number, number]] = [
  [-77.09924822899995, -12.04841197199994],  // SW
  [-77.08161107999996, -12.036319686999946], // NE
];

/** Lazy-load TierraMap — keeps MapLibre GL out of the shared chunk */
const TierraMap = dynamic(
  () => import("./_components/tierra-map").then((m) => m.TierraMap),
  { ssr: false },
);

const EMPTY_FORMS: FormRecord[] = [];
const TIERRA_FULLSCREEN_CLASS = "tierra-fullscreen";
const LEFT_PANEL_W = 176;
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
  const router = useRouter();
  const slug = params.slug as string;
  const mapHandleRef = useRef<TierraMapHandle | null>(null);
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();

  const handleHeaderLogout = useCallback(async () => {
    await logout();
    router.replace("/login");
  }, [logout, router]);

  // ─── Demo: detectar si este slug es de la demo de Carmen de la Legua ───
  // Usamos `(arr as readonly string[]).includes(slug)` para evitar el narrowing
  // estricto de TS en tuples const sin perder la intención.
  const isLeguaDemo = (LEGUA_DEMO_SLUGS as readonly string[]).includes(slug);
  const [showLeguaBanner, setShowLeguaBanner] = useState(false);

  // ─── Data fetching ───
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useCampaignStats(slug);
  const campaignId = stats?.campaign.id;
  const { data: forms = EMPTY_FORMS } = useRecentForms(campaignId);
  const { data: initialLocations } = useAgentLocationsSnapshot(campaignId);

  // ─── Pipeline state (period filter, metrics, form filtering) ───
  const pipeline = usePipelineState(campaignId, forms);

  // ─── SSE: live agent locations, offline events, background status ───
  const { locations, backgroundAgentIds, handleSSEUpdate, handleAgentOffline, handleAgentStatus } =
    useSSELocations(initialLocations);
  useAgentSSE(campaignId ?? null, handleSSEUpdate, handleAgentOffline, handleAgentStatus);

  // ─── UI state ───
  const [viewMode, setViewMode] = useState<TierraViewMode>("campo");
  const [activeLayer, setActiveLayer] = useState<ActiveLayer>("datos");
  const [datosVizMode, setDatosVizMode] = useState<DatosVizMode>("points");
  const [heatmapRadius, setHeatmapRadius] = useState(26);
  const [heatmapOpacity, setHeatmapOpacity] = useState(0.88);
  const [mapTheme, setMapTheme] = useState<MapTheme>("voyager");
  const isFullscreen = true;
  const [showControlsPanel, setShowControlsPanel] = useState(false);
  const [rightPanelCloseSignal, setRightPanelCloseSignal] = useState(0);
  const [rightPanelOpenSignal, setRightPanelOpenSignal] = useState(0);
  const [isRightPanelVisible, setIsRightPanelVisible] = useState(false);

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [drillState, setDrillState] = useState<DrillState>(
    isLeguaDemo ? LEGUA_DRILL : INITIAL_DRILL,
  );
  const [showRoutes, setShowRoutes] = useState(false);

  const showTracking = activeLayer === "agentes";
  const showDatos = activeLayer === "datos";

  // ─── Demo: para los slugs de Legua, el drillState arranca ya en el distrito ───
  // No necesitamos polling ni handle. El mapa recibe lockedBounds como prop y
  // se encarga de todo internamente: initialViewState correcto + revalidador en onLoad.

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

  // ─── Geo drill filter ───
  const drillBounds = useDrillBounds(drillState);

  // ─── Derived data ───
  // enrichedAgents / formPoints = full dataset → always passed to TierraMap
  // filteredAgents / filteredFormPoints = geo-filtered by drill zone → used by panel/KPIs
  const { enrichedAgents, formPoints, filteredAgents, filteredFormPoints, connectedCount } =
    useEnrichedAgents(stats, locations, forms, backgroundAgentIds, drillBounds);
  const enrichedAgentsRef = useRef(enrichedAgents);
  enrichedAgentsRef.current = enrichedAgents;

  const flyToFromDatos = useCallback((lng: number, lat: number, tooltipData?: PinnedTooltipData) => {
    setViewMode("campo");
    setActiveLayer("datos");
    setTimeout(() => {
      mapHandleRef.current?.flyToPoint(lng, lat, 16);
      if (tooltipData) mapHandleRef.current?.showPinnedTooltip(tooltipData);
    }, 120);
  }, []);

  // ─── Handlers ───
  const handleLayerChange = useCallback((layer: ActiveLayer) => {
    setActiveLayer(layer);
    if (layer !== "agentes") { setSelectedAgentId(null); }
  }, []);

  const handleRoutesToggle = useCallback(() => {
    setShowRoutes((prev) => !prev);
  }, []);

  const handleSelectAgent = useCallback((agentId: string | null) => {
    if (agentId) {
      setActiveLayer("agentes");
      setDrillState(INITIAL_DRILL);
    }
    setSelectedAgentId(agentId);
  }, []);

  const handleAgentListClick = useCallback((agentId: string) => {
    setActiveLayer("agentes");
    setSelectedAgentId((prev) => {
      if (prev === agentId) return null;

      setDrillState(INITIAL_DRILL);

      const latestAgentForm = formPoints
        .filter((p) => p.agent_id === agentId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

      if (latestAgentForm) {
        mapHandleRef.current?.flyToPoint(latestAgentForm.lng, latestAgentForm.lat, 16, false);
        return agentId;
      }

      const agent = enrichedAgentsRef.current.find((a) => a.id === agentId);
      if (agent) {
        mapHandleRef.current?.flyToPoint(agent.lng, agent.lat, 15, false);
      }
      return agentId;
    });
  }, [formPoints]);

  const handleMapDoubleClick = useCallback(() => {
    if (!showControlsPanel && !isRightPanelVisible) {
      setShowControlsPanel(true);
      setRightPanelOpenSignal((prev) => prev + 1);
      return;
    }
    setShowControlsPanel(false);
    setRightPanelCloseSignal((prev) => prev + 1);
  }, [showControlsPanel, isRightPanelVisible]);

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
    document.body.classList.add(TIERRA_FULLSCREEN_CLASS);
    return () => {
      document.body.classList.remove(TIERRA_FULLSCREEN_CLASS);
    };
  }, []);

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
  const leftPanelWidth = LEFT_PANEL_W;

  return (
    <div
      className="fixed z-50 flex flex-col bg-slate-50 overflow-hidden right-0 bottom-0 transition-[left,top] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{ top: isFullscreen ? 0 : 48, left: isFullscreen ? 0 : "var(--sidebar-current-width, 72px)" }}
    >
      <TierraHeader
        stats={stats}
        mapTheme={mapTheme}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        userRole={user?.role}
        userName={user?.full_name}
        onLogout={handleHeaderLogout}
      />

      {viewMode === "campo" ? (
        <div className="flex-1 min-h-0 relative">
          {/* ── Demo overlay: Carmen de la Legua ── */}
          {showLeguaBanner && (
            <DemoLeguaBanner
              mapTheme={mapTheme}
              onDismiss={() => setShowLeguaBanner(false)}
            />
          )}

          <TierraMap
            ref={mapHandleRef}
            campaignId={campaign.id}
            slug={slug}
            primaryColor={campaign.color_primario}
            agents={enrichedAgents}
            forms={drillBounds ? filteredFormPoints : formPoints}
            selectedAgentId={selectedAgentId}
            onSelectAgent={handleSelectAgent}
            showTracking={showTracking}
            showDatos={showDatos}
            datosVizMode={datosVizMode}
            heatmapRadius={heatmapRadius}
            heatmapOpacity={heatmapOpacity}
            mapTheme={mapTheme}
            showRoutes={showRoutes}
            drillState={drillState}
            onDrillChange={setDrillState}
            onMapDoubleClick={handleMapDoubleClick}
            lockedBounds={isLeguaDemo ? LEGUA_BOUNDS : undefined}
          />
          <div
            className="absolute top-3 z-20 flex items-start transition-[left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{ left: showControlsPanel ? 12 : -(leftPanelWidth + 4) }}
          >
            <div style={{ width: leftPanelWidth }}>
              <MapControls activeLayer={activeLayer} onLayerChange={handleLayerChange} showRoutes={showRoutes} onRoutesToggle={handleRoutesToggle} datosVizMode={datosVizMode} onDatosVizModeChange={setDatosVizMode} heatmapRadius={heatmapRadius} heatmapOpacity={heatmapOpacity} onHeatmapRadiusChange={setHeatmapRadius} onHeatmapOpacityChange={setHeatmapOpacity} mapTheme={mapTheme} onMapThemeChange={setMapTheme} agentCount={enrichedAgents.length} formCount={stats.totals.forms_count} routeSurveyorCount={routeSurveyorCount} />
            </div>
            <button
              type="button"
              onClick={() => setShowControlsPanel((prev) => !prev)}
              aria-label={showControlsPanel ? "Ocultar controles" : "Mostrar controles"}
              className={`cursor-pointer -ml-0.5 mt-2 rounded-r-2xl border w-8 h-12 p-0 flex items-center justify-center shadow-lg transition-colors ${
                mapTheme === "dark"
                  ? "border-slate-600 bg-slate-900/85 text-slate-100 hover:bg-slate-800/90"
                  : "border-slate-200 bg-white/95 text-slate-700 hover:bg-slate-100/95"
              }`}
              title={showControlsPanel ? "Ocultar controles" : "Mostrar controles"}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform duration-300 ${showControlsPanel ? "" : "rotate-180"}`}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
          <CampoOverlay
            agents={filteredAgents}
            connectedCount={connectedCount}
            formCount={drillBounds ? filteredFormPoints.length : stats.totals.forms_count}
            primaryColor={campaign.color_primario}
            selectedAgentId={selectedAgentId}
            onAgentClick={handleAgentListClick}
            mapTheme={mapTheme}
            drillState={drillState}
            initialVisible={false}
            closeSignal={rightPanelCloseSignal}
            openSignal={rightPanelOpenSignal}
            onVisibilityChange={setIsRightPanelVisible}
          />
        </div>
      ) : viewMode === "pipeline" ? (
        <div className="flex-1 min-h-0 px-3 py-2 md:px-5 lg:px-7">
          <PipelineView
            campaignId={campaign.id}
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
        </div>
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
