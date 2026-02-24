"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import type { EnrichedAgent, LogEntry, AgentStatus } from "./types";
import { STATUS_CFG } from "./constants";
import {
  Glass, Kpi, CardHeader, AgentRow, RankingRow, LogRow, MoreBtn, SCROLL_MAX,
} from "./campo-overlay-parts";
import { LogModal } from "./log-modal";

/* ========== Types ========== */

type Props = {
  agents: EnrichedAgent[];
  connectedCount: number;
  logEntries: LogEntry[];
  formCount: number;
  primaryColor: string;
  selectedAgentId: string | null;
  onAgentClick: (agentId: string) => void;
  onLogEntryClick: (entry: LogEntry) => void;
};

/* ========== Constants ========== */

const PANEL_W = 300;
const LOG_COLLAPSED = 3;
const LOG_EXPANDED = 12;
const AGENTS_COLLAPSED = 4;
const RANKING_COLLAPSED = 5;
const RANKING_EXPANDED = 15;

/* ========== Component ========== */

export function CampoOverlay({
  agents, connectedCount, logEntries, formCount,
  primaryColor, selectedAgentId, onAgentClick, onLogEntryClick,
}: Props) {
  const [visible, setVisible] = useState(true);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [rankingOpen, setRankingOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const logListRef = useRef<HTMLDivElement>(null);
  const prevLogCount = useRef(logEntries.length);

  useEffect(() => {
    if (logEntries.length > prevLogCount.current && logListRef.current) {
      logListRef.current.scrollTop = 0;
    }
    prevLogCount.current = logEntries.length;
  }, [logEntries.length]);

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

  const visibleAgents = agentsOpen ? sortedAgents : sortedAgents.slice(0, AGENTS_COLLAPSED);
  const visibleRanking = rankingOpen ? rankedAgents.slice(0, RANKING_EXPANDED) : rankedAgents.slice(0, RANKING_COLLAPSED);

  // Inline log: only form entries (datos subidos)
  const formLogEntries = useMemo(() => logEntries.filter((e) => e.type === "form_new" || e.type === "form_submitted"), [logEntries]);
  const visibleLogs = logOpen ? formLogEntries.slice(0, LOG_EXPANDED) : formLogEntries.slice(0, LOG_COLLAPSED);

  const selectedAgent = selectedAgentId ? agents.find((a) => a.id === selectedAgentId) : null;

  return (
    <div
      className="absolute top-3 bottom-3 z-10 flex items-start transition-[right] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{ right: visible ? 12 : -(PANEL_W + 4) }}
    >
      {/* ─── Toggle tab ─── */}
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="shrink-0 mt-1 -mr-px w-7 h-14 rounded-l-xl flex items-center justify-center cursor-pointer shadow-lg transition-colors"
        style={{ background: "rgba(255,255,255,0.35)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
        title={visible ? "Ocultar panel" : "Mostrar panel"}
        aria-label={visible ? "Ocultar panel" : "Mostrar panel"}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform duration-300 ${visible ? "" : "rotate-180"}`}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {/* ─── Panel body ─── */}
      <div className="flex flex-col gap-2.5 overflow-y-auto overflow-x-hidden max-h-full" style={{ width: PANEL_W }}>
        {/* ═══ Active filter banner ═══ */}
        {selectedAgent && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-2xl shadow-sm"
            style={{ background: `${primaryColor}18`, border: `1px solid ${primaryColor}30` }}
          >
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: primaryColor }} />
            <span className="text-[11px] font-semibold text-slate-700 truncate flex-1">
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
          <Kpi dotColor="#22c55e" pulse value={connectedCount} label="En linea" />
          <Kpi color={primaryColor} value={formCount} label="Capturas" />
          <Kpi color="#64748b" value={agents.length} label="Agentes" sub={
            <span className="flex gap-1.5 mt-0.5">
              {(["connected", "idle", "inactive"] as const).map((s) => (
                <span key={s} className="flex items-center gap-0.5">
                  <span className="w-1 h-1 rounded-full" style={{ backgroundColor: STATUS_CFG[s].color }} />
                  <span className="text-[8px] tabular-nums opacity-70">{statusCounts[s]}</span>
                </span>
              ))}
            </span>
          } />
        </div>

        {/* ═══ Agents card ═══ */}
        <Glass>
          <CardHeader onClick={() => setAgentsOpen(!agentsOpen)} open={agentsOpen}>
            <span className="font-semibold text-[12px] text-slate-700">Agentes</span>
            <span className="ml-1.5 text-[11px] font-bold tabular-nums" style={{ color: primaryColor }}>{agents.length}</span>
            <span className="ml-auto mr-2 flex items-center gap-1 text-[9px] font-bold text-emerald-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE
            </span>
          </CardHeader>

          <div className={agentsOpen ? SCROLL_MAX : ""}>
            {visibleAgents.length === 0 ? (
              <p className="px-3 py-3 text-center text-[11px] text-slate-400/80">Sin agentes</p>
            ) : (
              visibleAgents.map((a) => (
                <AgentRow key={a.id} agent={a} primaryColor={primaryColor} selected={a.id === selectedAgentId} onClick={onAgentClick} />
              ))
            )}
          </div>

          {!agentsOpen && sortedAgents.length > AGENTS_COLLAPSED && (
            <MoreBtn count={sortedAgents.length - AGENTS_COLLAPSED} color={primaryColor} onClick={() => setAgentsOpen(true)} />
          )}
        </Glass>

        {/* ═══ Ranking card ═══ */}
        {rankedAgents.length > 0 && (
          <Glass>
            <CardHeader onClick={() => setRankingOpen(!rankingOpen)} open={rankingOpen}>
              <span className="font-semibold text-[12px] text-slate-700">Ranking</span>
              <span className="ml-1.5 text-[11px] font-bold tabular-nums" style={{ color: primaryColor }}>{rankedAgents.length}</span>
              <span className="ml-auto mr-2 text-[9px] font-bold text-amber-500">TOP</span>
            </CardHeader>

            <div className={rankingOpen ? SCROLL_MAX : ""}>
              {visibleRanking.map((a, idx) => (
                <RankingRow key={a.id} agent={a} rank={idx + 1} primaryColor={primaryColor} selected={a.id === selectedAgentId} onClick={onAgentClick} />
              ))}
            </div>

            {!rankingOpen && rankedAgents.length > RANKING_COLLAPSED && (
              <MoreBtn count={rankedAgents.length - RANKING_COLLAPSED} color={primaryColor} onClick={() => setRankingOpen(true)} />
            )}
          </Glass>
        )}

        {/* ═══ Log card — datos subidos ═══ */}
        <Glass>
          <div className="flex items-center">
            <CardHeader onClick={() => setLogOpen(!logOpen)} open={logOpen}>
              <span className="font-semibold text-[12px] text-slate-700">Datos</span>
              <span className="ml-1.5 text-[11px] font-bold tabular-nums mr-auto" style={{ color: primaryColor }}>{formLogEntries.length}</span>
            </CardHeader>
            <button
              type="button"
              onClick={() => setLogModalOpen(true)}
              className="shrink-0 mr-3 text-[9px] font-semibold uppercase tracking-wider cursor-pointer transition-colors hover:opacity-80"
              style={{ color: primaryColor }}
              title="Ver registro completo"
            >
              Ver todos
            </button>
          </div>

          <div ref={logListRef} className={logOpen ? "max-h-[340px] overflow-y-auto" : ""}>
            {visibleLogs.length === 0 ? (
              <p className="px-3 py-3 text-center text-[11px] text-slate-400/80 italic">Sin registros</p>
            ) : (
              visibleLogs.map((e) => (
                <LogRow key={e.id} entry={e} onLogEntryClick={onLogEntryClick} />
              ))
            )}
          </div>

          {!logOpen && formLogEntries.length > LOG_COLLAPSED && (
            <MoreBtn count={formLogEntries.length - LOG_COLLAPSED} color={primaryColor} onClick={() => setLogOpen(true)} />
          )}
        </Glass>
      </div>

      {/* ═══ Full log modal ═══ */}
      <LogModal
        open={logModalOpen}
        onClose={() => setLogModalOpen(false)}
        entries={logEntries}
        onEntryClick={(entry) => { setLogModalOpen(false); onLogEntryClick(entry); }}
      />
    </div>
  );
}
