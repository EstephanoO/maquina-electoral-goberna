"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import type { EnrichedAgent, AgentStatus, MapTheme, DrillState } from "./types";
import { STATUS_CFG } from "./constants";
import {
  Glass, Kpi, CardHeader, AgentRow, RankingRow, MoreBtn, SCROLL_MAX,
} from "./campo-overlay-parts";

/* ========== Types ========== */

type Props = {
  agents: EnrichedAgent[];
  connectedCount: number;
  formCount: number;
  primaryColor: string;
  selectedAgentId: string | null;
  onAgentClick: (agentId: string) => void;
  mapTheme?: MapTheme;
  /** Current drill state — shows zone filter banner when level > 0 */
  drillState?: DrillState;
  initialVisible?: boolean;
  closeSignal?: number;
  openSignal?: number;
  onVisibilityChange?: (visible: boolean) => void;
};

/* ========== Constants ========== */

const PANEL_W = 300;
const TOGGLE_DEFAULT_TOP = 16;
const TOGGLE_HEIGHT = 48;
const AGENTS_COLLAPSED = 4;
const RANKING_COLLAPSED = 5;
const RANKING_EXPANDED = 15;

/* ========== Component ========== */

export function CampoOverlay({
  agents, connectedCount, formCount,
  primaryColor, selectedAgentId, onAgentClick,
  mapTheme = "dark", drillState,
  initialVisible = true,
  closeSignal = 0,
  openSignal = 0,
  onVisibilityChange,
}: Props) {
  const [visible, setVisible] = useState(initialVisible);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [rankingOpen, setRankingOpen] = useState(false);
  const panelBodyRef = useRef<HTMLDivElement | null>(null);
  const agentsSectionRef = useRef<HTMLDivElement | null>(null);
  const [toggleTopOffset, setToggleTopOffset] = useState(TOGGLE_DEFAULT_TOP);

  const sortedAgents = useMemo(() => {
    const order: Record<string, number> = { connected: 0, idle: 1, inactive: 2 };
    return [...agents].sort((a, b) => order[a.status] - order[b.status]);
  }, [agents]);

  const statusCounts = useMemo(() => {
    const c: Record<AgentStatus, number> = { connected: 0, idle: 0, inactive: 0 };
    for (const a of agents) c[a.status]++;
    return c;
  }, [agents]);

  const rankedAgents = useMemo(() => {
    return [...agents].filter((a) => a.forms_count > 0).sort((a, b) => b.forms_count - a.forms_count);
  }, [agents]);

  const visibleAgents = useMemo(() => {
    if (selectedAgentId) {
      return sortedAgents.filter((a) => a.id === selectedAgentId);
    }
    return agentsOpen ? sortedAgents : sortedAgents.slice(0, AGENTS_COLLAPSED);
  }, [sortedAgents, agentsOpen, selectedAgentId]);

  const visibleRanking = useMemo(() => {
    if (selectedAgentId) {
      return rankedAgents.filter((a) => a.id === selectedAgentId);
    }
    return rankingOpen ? rankedAgents.slice(0, RANKING_EXPANDED) : rankedAgents.slice(0, RANKING_COLLAPSED);
  }, [rankedAgents, rankingOpen, selectedAgentId]);

  const selectedAgent = selectedAgentId ? agents.find((a) => a.id === selectedAgentId) : null;
  const isDark = mapTheme === "dark";
  const accentColor = isDark ? "#60a5fa" : primaryColor;

  // Derive the active zone label from drillState (dep → prov → dist → sector)
  const activeZoneLabel = useMemo((): string | null => {
    if (!drillState || drillState.level === 0) return null;
    if (drillState.level >= 3 && drillState.distName) return drillState.distName;
    if (drillState.level >= 2 && drillState.provName) return drillState.provName;
    if (drillState.level >= 1 && drillState.depName) return drillState.depName;
    return null;
  }, [drillState]);

  const syncToggleToAgentsCenter = useCallback(() => {
    const panel = panelBodyRef.current;
    const agentsSection = agentsSectionRef.current;
    if (!panel || !agentsSection) return;

    const panelRect = panel.getBoundingClientRect();
    const agentsRect = agentsSection.getBoundingClientRect();
    const centerInPanel = agentsRect.top - panelRect.top + agentsRect.height / 2;
    const nextTop = Math.max(TOGGLE_DEFAULT_TOP, Math.round(centerInPanel - TOGGLE_HEIGHT / 2));
    setToggleTopOffset(nextTop);
  }, []);

  useEffect(() => {
    if (!selectedAgent && !activeZoneLabel) {
      setToggleTopOffset(TOGGLE_DEFAULT_TOP);
      return;
    }

    syncToggleToAgentsCenter();

    const panel = panelBodyRef.current;
    const agentsSection = agentsSectionRef.current;
    if (!panel || !agentsSection) return;

    const observer = new ResizeObserver(() => {
      syncToggleToAgentsCenter();
    });
    observer.observe(panel);
    observer.observe(agentsSection);

    window.addEventListener("resize", syncToggleToAgentsCenter);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncToggleToAgentsCenter);
    };
  }, [selectedAgent, activeZoneLabel, syncToggleToAgentsCenter]);

  useEffect(() => {
    if (closeSignal > 0) {
      setVisible(false);
    }
  }, [closeSignal]);

  useEffect(() => {
    if (openSignal > 0) {
      setVisible(true);
    }
  }, [openSignal]);

  useEffect(() => {
    onVisibilityChange?.(visible);
  }, [visible, onVisibilityChange]);

  return (
    <div
      className="absolute top-3 bottom-3 z-10 flex items-start transition-[right] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{ right: visible ? 12 : -(PANEL_W + 4) }}
    >
      {/* ─── Toggle tab ─── */}
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="shrink-0 -mr-0.5 w-8 h-12 rounded-l-2xl flex items-center justify-center cursor-pointer shadow-lg transition-colors"
        style={{
          marginTop: toggleTopOffset,
          background: isDark ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.35)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: isDark ? "1px solid rgba(148,163,184,0.26)" : "1px solid rgba(226,232,240,0.6)",
        }}
        title={visible ? "Ocultar panel" : "Mostrar panel"}
        aria-label={visible ? "Ocultar panel" : "Mostrar panel"}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isDark ? "#cbd5e1" : "#475569"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform duration-300 ${visible ? "" : "rotate-180"}`}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {/* ─── Panel body ─── */}
      <div ref={panelBodyRef} className="flex flex-col gap-2.5 overflow-y-auto overflow-x-hidden max-h-full" style={{ width: PANEL_W }}>

        {/* ═══ Zone drill banner — shown when user has drilled into a zone ═══ */}
        {activeZoneLabel && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-2xl shadow-sm"
            style={{
              background: isDark ? "rgba(2,6,23,0.82)" : "rgba(239,246,255,0.92)",
              border: isDark ? "1px solid rgba(96,165,250,0.35)" : "1px solid rgba(37,99,235,0.25)",
            }}
          >
            {/* Pin icon */}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span className={`text-[11px] font-semibold truncate flex-1 ${isDark ? "text-blue-200" : "text-blue-800"}`}>
              {activeZoneLabel}
            </span>
            <span className="text-[10px] font-bold tabular-nums" style={{ color: accentColor }}>
              {agents.length} ag · {formCount} datos
            </span>
          </div>
        )}

        {/* ═══ Active agent filter banner ═══ */}
        {selectedAgent && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-2xl shadow-sm"
            style={{
              background: isDark ? "rgba(15,23,42,0.74)" : `${primaryColor}18`,
              border: isDark ? "1px solid rgba(148,163,184,0.24)" : `1px solid ${primaryColor}30`,
            }}
          >
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: primaryColor }} />
            <span className={`text-[11px] font-semibold truncate flex-1 ${isDark ? "text-slate-200" : "text-slate-700"}`}>
              Puntos de <span style={{ color: primaryColor }}>{selectedAgent.name.split(" ")[0]}</span>
            </span>
            <span className="text-[10px] font-bold tabular-nums" style={{ color: primaryColor }}>{selectedAgent.forms_count}</span>
            <button
              type="button"
              onClick={() => onAgentClick(selectedAgentId!)}
              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] cursor-pointer transition-colors hover:bg-white/50"
              style={{ color: primaryColor }}
              aria-label="Limpiar filtro"
              title="Limpiar filtro"
            >
              ✕
            </button>
          </div>
        )}

        {/* ═══ KPI row ═══ */}
        <div className="flex gap-2">
          <Kpi mapTheme={mapTheme} dotColor="#22c55e" pulse value={connectedCount} label="En linea" />
          <Kpi mapTheme={mapTheme} color={accentColor} value={formCount} label="Capturas" />
          <Kpi mapTheme={mapTheme} color={isDark ? "#cbd5e1" : "#64748b"} value={agents.length} label="Agentes" sub={
            <span className="flex gap-1.5 mt-0.5">
              {(["connected", "idle", "inactive"] as const).map((s) => (
                <span key={s} className="flex items-center gap-0.5">
                  <span className="w-1 h-1 rounded-full" style={{ backgroundColor: STATUS_CFG[s].color }} />
                  <span className={`text-[8px] tabular-nums ${isDark ? "text-slate-200/85" : "opacity-70"}`}>{statusCounts[s]}</span>
                </span>
              ))}
            </span>
          } />
        </div>

        {/* ═══ Agents card ═══ */}
        <div ref={agentsSectionRef}>
          <Glass mapTheme={mapTheme}>
            <CardHeader onClick={() => setAgentsOpen(!agentsOpen)} open={agentsOpen} mapTheme={mapTheme}>
              <span className={`font-semibold text-[12px] ${isDark ? "text-slate-100" : "text-slate-700"}`}>Agentes</span>
              <span className="ml-1.5 text-[11px] font-bold tabular-nums" style={{ color: accentColor }}>{agents.length}</span>
              <span className="ml-auto mr-2 flex items-center gap-1 text-[9px] font-bold text-emerald-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                LIVE
              </span>
            </CardHeader>

            <div className={agentsOpen ? SCROLL_MAX : ""}>
              {visibleAgents.length === 0 ? (
                <p className={`px-3 py-3 text-center text-[11px] ${isDark ? "text-slate-400/90" : "text-slate-400/80"}`}>Sin agentes</p>
              ) : (
                visibleAgents.map((a) => (
                  <AgentRow key={a.id} mapTheme={mapTheme} agent={a} primaryColor={accentColor} selected={a.id === selectedAgentId} onClick={onAgentClick} />
                ))
              )}
            </div>

            {!selectedAgentId && !agentsOpen && sortedAgents.length > AGENTS_COLLAPSED && (
              <MoreBtn mapTheme={mapTheme} count={sortedAgents.length - AGENTS_COLLAPSED} color={accentColor} onClick={() => setAgentsOpen(true)} />
            )}
          </Glass>
        </div>

        {/* ═══ Ranking card ═══ */}
        {rankedAgents.length > 0 && (
          <Glass mapTheme={mapTheme}>
            <CardHeader onClick={() => setRankingOpen(!rankingOpen)} open={rankingOpen} mapTheme={mapTheme}>
              <span className={`font-semibold text-[12px] ${isDark ? "text-slate-100" : "text-slate-700"}`}>Ranking</span>
              <span className="ml-1.5 text-[11px] font-bold tabular-nums" style={{ color: accentColor }}>{rankedAgents.length}</span>
              <span className="ml-auto mr-2 text-[9px] font-bold text-amber-500">TOP</span>
            </CardHeader>

            <div className={rankingOpen ? SCROLL_MAX : ""}>
              {visibleRanking.map((a, idx) => (
                <RankingRow key={a.id} mapTheme={mapTheme} agent={a} rank={idx + 1} primaryColor={accentColor} selected={a.id === selectedAgentId} onClick={onAgentClick} />
              ))}
            </div>

            {!selectedAgentId && !rankingOpen && rankedAgents.length > RANKING_COLLAPSED && (
              <MoreBtn mapTheme={mapTheme} count={rankedAgents.length - RANKING_COLLAPSED} color={accentColor} onClick={() => setRankingOpen(true)} />
            )}
          </Glass>
        )}

      </div>
    </div>
  );
}
