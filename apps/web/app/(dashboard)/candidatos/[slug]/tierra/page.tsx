"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import type { FormRecord } from "@/lib/services";
import { useAuth } from "@/lib/auth-context";
import { useCampaignStats, useRecentForms, useAgentLocationsSnapshot, tierraKeys, type AgentLocation } from "@/lib/hooks";

import {
  TierraHeader, MapControls, DataPanel, KpiPanel, ActivityCharts,
  INITIAL_DRILL,
  type TierraMapHandle, type EnrichedAgent, type DrillState, type ActiveLayer,
} from "./_components";
import { useAgentSSE } from "./_components/hooks/use-agent-sse";
import { useFullscreen } from "./_components/hooks/use-fullscreen";
import { useEnrichedAgents } from "./_components/hooks/use-enriched-agents";
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

  // ─── SSE: live agent locations ───
  const [locations, setLocations] = useState<AgentLocation[]>([]);
  useEffect(() => { if (initialLocations?.length) setLocations(initialLocations); }, [initialLocations]);
  const handleSSEUpdate = useCallback((incoming: AgentLocation[]) => {
    setLocations((prev) => {
      const map = new Map(prev.map((l) => [l.agent_id, l]));
      for (const loc of incoming) map.set(loc.agent_id, loc);
      return Array.from(map.values());
    });
  }, []);
  useAgentSSE(campaignId ?? null, handleSSEUpdate);

  // ─── UI state ───
  const [activeLayer, setActiveLayer] = useState<ActiveLayer>("datos");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set());
  const [showTable, setShowTable] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);
  const [drillState, setDrillState] = useState<DrillState>(INITIAL_DRILL);

  const showTracking = activeLayer === "agentes";
  const showDatos = activeLayer === "datos";
  const showHeatmap = activeLayer === "densidad";

  // ─── Derived data ───
  const { enrichedAgents, formPoints, connectedCount, filteredForms, filteredAgents } =
    useEnrichedAgents(stats, locations, forms, selectedAgentId, selectedAgentIds);

  const enrichedAgentsRef = useRef(enrichedAgents);
  enrichedAgentsRef.current = enrichedAgents;

  const flyToPoint = useCallback((lng: number, lat: number, zoom: number) => {
    mapHandleRef.current?.flyToPoint(lng, lat, zoom);
  }, []);
  const { logEntries, handleClearLog, handleLogEntryClick } = useActivityLog(forms, stats, flyToPoint);

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
      <div style={S_SHELL}>
        <div style={S_CENTER}>
          <div style={{ width: 32, height: 32, border: "3px solid #e2e8f0", borderTopColor: "#1d4ed8", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: 14, color: "#64748b" }}>Cargando campana...</span>
          <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
        </div>
      </div>
    );
  }
  if (statsError || !stats) {
    return (
      <div style={S_SHELL}>
        <div style={S_CENTER}>
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
  const campaignMembership = campaigns.find((c) => c.id === campaign.id || c.slug === slug);
  const isAdmin = user?.role === "admin" || campaignMembership?.role === "admin" || campaignMembership?.role === "jefe_campana";
  const selectionLabel = selectedAgentIds.size > 0
    ? `${selectedAgentIds.size} agente${selectedAgentIds.size > 1 ? "s" : ""}`
    : selectedAgentId ? enrichedAgents.find((a) => a.id === selectedAgentId)?.name ?? "Agente" : null;

  return (
    <div ref={shellRef} style={isFullscreen ? S_SHELL_FS : S_SHELL}>
      <TierraHeader stats={stats} agentCount={enrichedAgents.length} formCount={forms.length} connectedCount={connectedCount} />

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Left column: map + metrics */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>
          <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
            <TierraMap ref={mapHandleRef} campaignId={campaign.id} slug={slug} primaryColor={campaign.color_primario} agents={enrichedAgents} forms={formPoints} selectedAgentId={selectedAgentId} onSelectAgent={handleSelectAgent} showTracking={showTracking} showDatos={showDatos} showHeatmap={showHeatmap} drillState={drillState} onDrillChange={setDrillState} />

            <div style={{ position: "absolute", top: 12, left: 12, zIndex: 10 }}>
              <MapControls activeLayer={activeLayer} onLayerChange={handleLayerChange} agentCount={enrichedAgents.length} formCount={forms.length} />
            </div>

            <FullscreenButton isFullscreen={isFullscreen} onToggle={toggleFullscreen} />
            <BottomToolbar showMetrics={showMetrics} showTable={showTable} onToggleMetrics={() => setShowMetrics(!showMetrics)} onToggleTable={() => setShowTable(!showTable)} color={campaign.color_primario} />
          </div>

          {/* Metrics panel */}
          <div style={{ height: showMetrics ? METRICS_H : 0, backgroundColor: "#ffffff", borderTop: showMetrics ? "1px solid #e2e8f0" : "none", overflow: "hidden", transition: "height 0.3s cubic-bezier(0.4,0,0.2,1)", flexShrink: 0 }}>
            {showMetrics && <ActivityCharts forms={filteredForms} agents={filteredAgents} allForms={forms} allAgents={enrichedAgents} primaryColor={campaign.color_primario} secondaryColor={campaign.color_secundario} selectionLabel={selectionLabel} />}
          </div>
        </div>

        {/* Data sidebar */}
        <div style={{ width: showTable ? PANEL_W : 0, flexShrink: 0, transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)", overflow: "hidden", borderLeft: showTable ? "1px solid #e2e8f0" : "none", position: "relative" }}>
          <div style={{ width: PANEL_W, height: "100%", position: "absolute", top: 0, right: 0 }}>
            <DataPanel forms={filteredForms} selectedAgentName={enrichedAgents.find((a) => a.id === selectedAgentId)?.name ?? null} primaryColor={campaign.color_primario} open={showTable} onClose={() => setShowTable(false)} onFlyTo={(lng, lat) => mapHandleRef.current?.flyToPoint(lng, lat, 17)} campaignId={campaign.id} isAdmin={isAdmin} onFormsDeleted={handleFormsDeleted} agents={enrichedAgents} selectedAgentId={selectedAgentId} onSelectAgent={handleAgentListClick} onWhatsApp={handleWhatsApp} logEntries={logEntries} onLogEntryClick={handleLogEntryClick} onClearLog={handleClearLog} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========== Small presentational sub-components ========== */

function FullscreenButton({ isFullscreen, onToggle }: { isFullscreen: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"} title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"} style={{ position: "absolute", top: 12, right: 12, zIndex: 10, width: 34, height: 34, borderRadius: 8, border: "1px solid #e2e8f0", backgroundColor: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)", color: "#475569", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 6px rgba(0,0,0,0.08)", transition: "background-color 0.15s ease" }}>
      {isFullscreen ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
      )}
    </button>
  );
}

function BottomToolbar({ showMetrics, showTable, onToggleMetrics, onToggleTable, color }: { showMetrics: boolean; showTable: boolean; onToggleMetrics: () => void; onToggleTable: () => void; color: string }) {
  const btnBase: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", transition: "all 0.2s ease" };
  return (
    <div style={{ position: "absolute", bottom: 12, left: 12, zIndex: 10, display: "flex", alignItems: "center", gap: 8 }}>
      <button type="button" onClick={onToggleMetrics} style={{ ...btnBase, backgroundColor: showMetrics ? color : "#ffffff", color: showMetrics ? "#ffffff" : "#334155" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg>
        {showMetrics ? "Ocultar" : "Metricas"}
      </button>
      <button type="button" onClick={onToggleTable} style={{ ...btnBase, backgroundColor: showTable ? color : "#ffffff", color: showTable ? "#ffffff" : "#334155" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /></svg>
        {showTable ? "Cerrar tabla" : "Ver tabla"}
      </button>
    </div>
  );
}

/* ========== Layout Styles ========== */

const SIDEBAR_W = 52;
const TAB_H = 48;

const S_SHELL: React.CSSProperties = {
  position: "fixed", top: TAB_H, right: 0, bottom: 0, left: SIDEBAR_W,
  zIndex: 50, display: "flex", flexDirection: "column", backgroundColor: "#f8fafc", overflow: "hidden",
};
const S_SHELL_FS: React.CSSProperties = {
  position: "fixed", inset: 0,
  zIndex: 50, display: "flex", flexDirection: "column", backgroundColor: "#f8fafc", overflow: "hidden",
};
const S_CENTER: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 12, backgroundColor: "#f8fafc",
};
