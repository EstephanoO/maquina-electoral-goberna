"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { deleteForm, updateForm, type FormRecord } from "@/lib/services";
import { useAuth } from "@/lib/auth-context";
import { tierraKeys } from "@/lib/hooks";

import {
  INITIAL_DRILL,
  type TierraMapHandle, type DrillState, type ActiveLayer, type DatosVizMode, type MapTheme, type PinnedTooltipData,
} from "./_components";
import type { TierraViewMode } from "./_components/tierra-header";
import type { FormPoint, EnrichedAgent } from "./_components/types";
import {
  LEGUA_DEMO_SLUGS, LEGUA_DRILL,
  TIERRA_FULLSCREEN_CLASS, TABBAR_THEME_VARS,
} from "./tierra-constants";

/* ========== Hook ========== */

export function useTierraState(slug: string, forms: FormRecord[]) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const mapHandleRef = useRef<TierraMapHandle | null>(null);
  /** Set by the page after useEnrichedAgents — keeps handleAgentListClick stable */
  const formPointsRef = useRef<FormPoint[]>([]);
  const enrichedAgentsRef = useRef<EnrichedAgent[]>([]);

  const isLeguaDemo = (LEGUA_DEMO_SLUGS as readonly string[]).includes(slug);
  const [showLeguaBanner, setShowLeguaBanner] = useState(false);

  // ── UI state ──
  const [viewMode, setViewMode] = useState<TierraViewMode>("campo");
  const [activeLayer, setActiveLayer] = useState<ActiveLayer>("datos");
  const [datosVizMode, setDatosVizMode] = useState<DatosVizMode>("points");
  const [heatmapRadius, setHeatmapRadius] = useState(26);
  const [heatmapOpacity, setHeatmapOpacity] = useState(0.88);
  const [mapTheme, setMapTheme] = useState<MapTheme>("voyager");
  const [showControlsPanel, setShowControlsPanel] = useState(false);
  const [rightPanelCloseSignal, setRightPanelCloseSignal] = useState(0);
  const [rightPanelOpenSignal, setRightPanelOpenSignal] = useState(0);
  const [isRightPanelVisible, setIsRightPanelVisible] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [drillState, setDrillState] = useState<DrillState>(isLeguaDemo ? LEGUA_DRILL : INITIAL_DRILL);
  const [showRoutes, setShowRoutes] = useState(false);

  const showTracking = activeLayer === "agentes";
  const showDatos = activeLayer === "datos";

  // ── Handlers ──
  const handleHeaderLogout = useCallback(async () => {
    await logout();
    router.replace("/login");
  }, [logout, router]);

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

  const flyToFromDatos = useCallback((lng: number, lat: number, tooltipData?: PinnedTooltipData) => {
    setViewMode("campo");
    setActiveLayer("datos");
    setTimeout(() => {
      mapHandleRef.current?.flyToPoint(lng, lat, 16);
      if (tooltipData) mapHandleRef.current?.showPinnedTooltip(tooltipData);
    }, 120);
  }, []);

  const handleLayerChange = useCallback((layer: ActiveLayer) => {
    setActiveLayer(layer);
    if (layer !== "agentes") setSelectedAgentId(null);
  }, []);

  const handleRoutesToggle = useCallback(() => setShowRoutes((prev) => !prev), []);

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

      const latestAgentForm = formPointsRef.current
        .filter((p) => p.agent_id === agentId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

      if (latestAgentForm) {
        mapHandleRef.current?.flyToPoint(latestAgentForm.lng, latestAgentForm.lat, 16, false);
        return agentId;
      }

      const agent = enrichedAgentsRef.current.find((a) => a.id === agentId);
      if (agent) mapHandleRef.current?.flyToPoint(agent.lng, agent.lat, 15, false);
      return agentId;
    });
  }, []);

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
    if (res.ok) { queryClient.invalidateQueries({ queryKey: tierraKeys.all }); return true; }
    return false;
  }, [queryClient]);

  const handleUpdateForm = useCallback(async (formId: string, cId: string, updates: Record<string, string>): Promise<boolean> => {
    const res = await updateForm(formId, cId, updates);
    if (res.ok) { queryClient.invalidateQueries({ queryKey: tierraKeys.all }); return true; }
    return false;
  }, [queryClient]);

  const handleFormsChanged = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: tierraKeys.all });
  }, [queryClient]);

  // ── Side effects ──
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

  useEffect(() => {
    document.body.classList.add(TIERRA_FULLSCREEN_CLASS);
    return () => document.body.classList.remove(TIERRA_FULLSCREEN_CLASS);
  }, []);

  useEffect(() => {
    return () => {
      const root = document.documentElement;
      for (const cssVar of TABBAR_THEME_VARS) root.style.removeProperty(cssVar);
      document.body.classList.remove(TIERRA_FULLSCREEN_CLASS);
    };
  }, []);

  return {
    user, mapHandleRef, formPointsRef, enrichedAgentsRef,
    isLeguaDemo, showLeguaBanner, setShowLeguaBanner,
    viewMode, setViewMode, activeLayer, datosVizMode, setDatosVizMode,
    heatmapRadius, setHeatmapRadius, heatmapOpacity, setHeatmapOpacity,
    mapTheme, setMapTheme, showControlsPanel, setShowControlsPanel,
    rightPanelCloseSignal, rightPanelOpenSignal, isRightPanelVisible, setIsRightPanelVisible,
    selectedAgentId, drillState, setDrillState, showRoutes, showTracking, showDatos,
    routeSurveyorCount,
    handleHeaderLogout, flyToFromDatos, handleLayerChange, handleRoutesToggle,
    handleSelectAgent, handleAgentListClick, handleMapDoubleClick,
    handleDeleteForm, handleUpdateForm, handleFormsChanged,
  };
}
