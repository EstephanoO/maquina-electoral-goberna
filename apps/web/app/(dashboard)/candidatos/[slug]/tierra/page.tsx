"use client";

import { useParams } from "next/navigation";
import { useCallback } from "react";
import dynamic from "next/dynamic";
import { useCampaignStats, useRecentForms, useAgentLocationsSnapshot } from "@/lib/hooks";

import {
  TierraHeader, MapControls, PipelineView, DatosView, CampoOverlay,
} from "./_components";
import { QRWhatsAppButton } from "./_components/qr-whatsapp-modal";
import { DemoLeguaBanner } from "./_components/demo-legua-banner";
import { useAgentSSE } from "./_components/hooks/use-agent-sse";
import { usePipelineState } from "./_components/hooks/use-pipeline-state";
import { useEnrichedAgents } from "./_components/hooks/use-enriched-agents";
import { useSSELocations } from "./_components/hooks/use-sse-locations";
import { useDrillRegion } from "./_components/hooks/use-drill-bounds";
import {
  LEGUA_BOUNDS, EMPTY_FORMS, TIERRA_FULLSCREEN_CLASS, LEFT_PANEL_W,
} from "./tierra-constants";
import { useTierraState } from "./use-tierra-state";

/** Lazy-load TierraMap — keeps MapLibre GL out of the shared chunk */
const TierraMap = dynamic(
  () => import("./_components/tierra-map").then((m) => m.TierraMap),
  { ssr: false },
);

/* ========== Page ========== */

export default function TierraPage() {
  const params = useParams();
  const slug = params.slug as string;

  // ── Data fetching ──
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useCampaignStats(slug);
  const campaignId = stats?.campaign.id;
  const { data: forms = EMPTY_FORMS } = useRecentForms(campaignId);
  const { data: initialLocations } = useAgentLocationsSnapshot(campaignId);

  // ── WhatsApp channel URL save handler ──
  const handleWhatsappUrlSaved = useCallback(() => {
    void refetchStats();
  }, [refetchStats]);

  // ── Pipeline state (period filter, metrics, form filtering) ──
  const pipeline = usePipelineState(campaignId, forms);

  // ── SSE: live agent locations, offline events, background status ──
  const { locations, backgroundAgentIds, handleSSEUpdate, handleAgentOffline, handleAgentStatus } =
    useSSELocations(initialLocations);
  useAgentSSE(campaignId ?? null, handleSSEUpdate, handleAgentOffline, handleAgentStatus);

  // ── All UI state + handlers (must be called before useDrillRegion since it owns drillState) ──
  const state = useTierraState(slug, forms);
  const {
    user, mapHandleRef, formPointsRef, enrichedAgentsRef,
    isLeguaDemo, showLeguaBanner, setShowLeguaBanner,
    viewMode, setViewMode, activeLayer, datosVizMode, setDatosVizMode,
    heatmapRadius, setHeatmapRadius, heatmapOpacity, setHeatmapOpacity,
    mapTheme, setMapTheme, showControlsPanel, setShowControlsPanel,
    rightPanelCloseSignal, rightPanelOpenSignal, setIsRightPanelVisible,
    selectedAgentId, drillState, setDrillState, showRoutes, showTracking, showDatos,
    routeSurveyorCount,
    handleHeaderLogout, flyToFromDatos, handleLayerChange, handleRoutesToggle,
    handleSelectAgent, handleAgentListClick, handleMapDoubleClick,
    handleDeleteForm, handleUpdateForm, handleFormsChanged,
  } = state;

  // ── Derived data (depends on drillState from useTierraState) ──
  const drillRegion = useDrillRegion(drillState);
  const { enrichedAgents, formPoints, filteredAgents, filteredFormPoints, connectedCount } =
    useEnrichedAgents(stats, locations, forms, backgroundAgentIds, drillRegion);

  // Keep refs in sync for stable callbacks in useTierraState
  formPointsRef.current = formPoints;
  enrichedAgentsRef.current = enrichedAgents;

  const isFullscreen = true;
  const leftPanelWidth = LEFT_PANEL_W;

  // ── Loading / Error ──
  if (statsLoading) {
    return (
      <div
        className="fixed right-0 bottom-0 z-50 flex flex-col bg-slate-50 overflow-hidden"
        style={{ top: 0, left: 0 }}
      >
        {/* Skeleton header */}
        <div className="flex items-center justify-between h-14 sm:h-16 px-3 sm:px-5 border-b border-slate-200/80 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-200 animate-pulse" />
            <div className="hidden sm:flex flex-col gap-1.5">
              <div className="w-28 h-3.5 rounded bg-slate-200 animate-pulse" />
              <div className="w-20 h-2.5 rounded bg-slate-100 animate-pulse" />
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-slate-100 p-0.5">
            <div className="w-16 sm:w-20 h-7 rounded-full bg-slate-200 animate-pulse" />
            <div className="w-16 sm:w-20 h-7 rounded-full bg-slate-100" />
            <div className="w-16 sm:w-20 h-7 rounded-full bg-slate-100" />
          </div>
          <div className="hidden lg:flex gap-4">
            <div className="w-[172px] h-10 rounded bg-slate-100 animate-pulse" />
            <div className="w-[172px] h-10 rounded bg-slate-100 animate-pulse" />
          </div>
        </div>
        {/* Skeleton map area */}
        <div className="flex-1 relative bg-slate-100">
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-[3px] border-slate-200 border-t-blue-700 rounded-full animate-spin" />
            <span className="text-sm text-slate-500 font-medium">Cargando mapa de campana...</span>
          </div>
          {/* Shimmer overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-[shimmer_2s_infinite]" style={{ backgroundSize: "200% 100%" }} />
        </div>
        <style jsx>{`
          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
      </div>
    );
  }
  if (statsError || !stats) {
    return (
      <div
        className="fixed right-0 bottom-0 z-50 flex flex-col bg-slate-50 overflow-hidden"
        style={{ top: 0, left: 0 }}
      >
        <div className="flex flex-col items-center justify-center flex-1 gap-4 bg-slate-50 px-6">
          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div className="text-lg font-bold text-slate-800">No se pudo cargar la campana</div>
          <div className="text-sm text-slate-500 text-center max-w-xs">{statsError instanceof Error ? statsError.message : "Candidato no encontrado. Verifica la URL o intenta de nuevo."}</div>
          <button type="button" onClick={() => refetchStats()} className="mt-2 px-6 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-[13px] font-semibold cursor-pointer hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm">Reintentar</button>
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
          {showLeguaBanner && (
            <DemoLeguaBanner mapTheme={mapTheme} onDismiss={() => setShowLeguaBanner(false)} />
          )}
          <TierraMap
            ref={mapHandleRef}
            campaignId={campaign.id}
            slug={slug}
            primaryColor={campaign.color_primario}
            agents={enrichedAgents}
            forms={drillRegion ? filteredFormPoints : formPoints}
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
            formCount={drillRegion ? filteredFormPoints.length : stats.totals.forms_count}
            forms={drillRegion ? filteredFormPoints : formPoints}
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
            periodForms={pipeline.periodForms}
            agents={enrichedAgents}
            period={pipeline.period}
            onPeriodChange={pipeline.onPeriodChange}
            offset={pipeline.offset}
            onOffsetChange={pipeline.onOffsetChange}
            geoDrill={pipeline.geoDrill}
            onGeoDrillChange={pipeline.onGeoDrillChange}
            hasGeoFilter={pipeline.hasGeoFilter}
            periodLabel={pipeline.periodLabel}
            dateRanges={pipeline.dateRanges}
            totalDatos={pipeline.regionTotalDatos ?? stats.totals.forms_count}
            serverTotals={stats.totals}
            agentesCampoCount={enrichedAgents.length}
            metaDatos={stats.metas.datos}
            whatsappChannelUrl={campaign.whatsapp_channel_url}
            userRole={user?.role}
            onWhatsappUrlSaved={handleWhatsappUrlSaved}
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
          onFormsChanged={handleFormsChanged}
          onFlyTo={flyToFromDatos}
        />
      )}

      {/* Floating QR WhatsApp button — bottom-left, all views */}
      {campaign.whatsapp_channel_url && (
        <div className="fixed bottom-5 left-5 z-[55]">
          <QRWhatsAppButton
            campaignId={campaign.id}
            primaryColor={campaign.color_primario}
            secondaryColor={campaign.color_secundario}
            interviewerName={user?.full_name ?? ""}
            whatsappChannelUrl={campaign.whatsapp_channel_url}
          />
        </div>
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
