"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import type { EnrichedAgent, LogEntry, AgentStatus } from "./types";
import { STATUS_CFG, LOG_ICON_BG, LOG_ICON_LABEL } from "./constants";
import { timeAgo, getTimeAgo } from "./utils";

/* ========== Types ========== */

type Props = {
  agents: EnrichedAgent[];
  connectedCount: number;
  logEntries: LogEntry[];
  formCount: number;
  primaryColor: string;
  onAgentClick: (agentId: string) => void;
  onLogEntryClick: (entry: LogEntry) => void;
};

/* ========== Constants ========== */

const PANEL_W = 300;
const LOG_COLLAPSED = 3;
const LOG_EXPANDED = 12;
const AGENTS_COLLAPSED = 4;

/* ========== Component ========== */

export function CampoOverlay({
  agents,
  connectedCount,
  logEntries,
  formCount,
  primaryColor,
  onAgentClick,
  onLogEntryClick,
}: Props) {
  const [visible, setVisible] = useState(true);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
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

  const visibleAgents = agentsOpen ? sortedAgents : sortedAgents.slice(0, AGENTS_COLLAPSED);
  const visibleLogs = logOpen ? logEntries.slice(0, LOG_EXPANDED) : logEntries.slice(0, LOG_COLLAPSED);

  return (
    <div
      className="absolute top-3 bottom-3 z-10 flex items-start transition-[right] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{ right: visible ? 12 : -(PANEL_W + 4) }}
    >
      {/* ─── Toggle tab (attached to panel left edge) ─── */}
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="shrink-0 mt-1 -mr-px w-7 h-14 rounded-l-xl flex items-center justify-center cursor-pointer shadow-lg transition-colors"
        style={{
          background: "rgba(255,255,255,0.35)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
        title={visible ? "Ocultar panel" : "Mostrar panel"}
        aria-label={visible ? "Ocultar panel" : "Mostrar panel"}
      >
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          className={`transition-transform duration-300 ${visible ? "" : "rotate-180"}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {/* ─── Panel body ─── */}
      <div
        className="flex flex-col gap-2.5 overflow-y-auto overflow-x-hidden max-h-full"
        style={{ width: PANEL_W }}
      >
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

          {visibleAgents.length === 0 ? (
            <p className="px-3 py-3 text-center text-[11px] text-slate-400/80">Sin agentes</p>
          ) : (
            visibleAgents.map((a) => (
              <AgentRow key={a.id} agent={a} primaryColor={primaryColor} onClick={onAgentClick} />
            ))
          )}

          {!agentsOpen && sortedAgents.length > AGENTS_COLLAPSED && (
            <MoreBtn count={sortedAgents.length - AGENTS_COLLAPSED} color={primaryColor} onClick={() => setAgentsOpen(true)} />
          )}
        </Glass>

        {/* ═══ Log card ═══ */}
        <Glass>
          <CardHeader onClick={() => setLogOpen(!logOpen)} open={logOpen}>
            <span className="font-semibold text-[12px] text-slate-700">Log</span>
            <span className="ml-1.5 text-[11px] font-bold tabular-nums" style={{ color: primaryColor }}>{logEntries.length}</span>
          </CardHeader>

          <div ref={logListRef} className={logOpen ? "max-h-[340px] overflow-y-auto" : ""}>
            {visibleLogs.length === 0 ? (
              <p className="px-3 py-3 text-center text-[11px] text-slate-400/80 italic">Sin actividad</p>
            ) : (
              visibleLogs.map((e) => (
                <LogRow key={e.id} entry={e} onLogEntryClick={onLogEntryClick} />
              ))
            )}
          </div>

          {!logOpen && logEntries.length > LOG_COLLAPSED && (
            <MoreBtn count={logEntries.length - LOG_COLLAPSED} color={primaryColor} onClick={() => setLogOpen(true)} />
          )}
        </Glass>
      </div>
    </div>
  );
}

/* ========== Sub-components ========== */

function Glass({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl shadow-[0_2px_24px_rgba(0,0,0,0.08)] overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.38)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      {children}
    </div>
  );
}

function Kpi({ value, label, color, dotColor, pulse, sub }: {
  value: number; label: string; color?: string; dotColor?: string; pulse?: boolean; sub?: React.ReactNode;
}) {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.06)]"
      style={{
        background: "rgba(255,255,255,0.38)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      <div className="flex items-center gap-1.5">
        {dotColor && <span className={`w-2 h-2 rounded-full ${pulse ? "animate-pulse" : ""}`} style={{ backgroundColor: dotColor }} />}
        <span className="text-xl font-extrabold tabular-nums leading-none" style={{ color: color ?? "#1e293b" }}>{value}</span>
      </div>
      <span className="text-[9px] font-semibold text-slate-500/80 uppercase tracking-wider">{label}</span>
      {sub}
    </div>
  );
}

function CardHeader({ children, onClick, open }: { children: React.ReactNode; onClick: () => void; open: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center px-3 py-2 cursor-pointer"
    >
      {children}
      <svg
        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}

function AgentRow({ agent, primaryColor, onClick }: { agent: EnrichedAgent; primaryColor: string; onClick: (id: string) => void }) {
  const cfg = STATUS_CFG[agent.status];
  return (
    <button
      type="button"
      onClick={() => onClick(agent.id)}
      className="w-full flex items-center gap-2.5 px-3 py-[5px] transition-colors hover:bg-white/30 cursor-pointer text-left"
      title={`${agent.name} — ${cfg.label}`}
    >
      <span className="w-[7px] h-[7px] rounded-full shrink-0 ring-2 ring-white/50" style={{ backgroundColor: cfg.color }} />
      <span className="text-[12px] font-medium text-slate-800/90 truncate flex-1">{agent.name}</span>
      <span className="text-[10px] text-slate-400/80 tabular-nums shrink-0">{getTimeAgo(agent.lastSeen)}</span>
      <span className="text-[11px] font-bold tabular-nums min-w-[22px] text-right shrink-0" style={{ color: primaryColor }}>{agent.forms_count}</span>
    </button>
  );
}

function LogRow({ entry, onLogEntryClick }: { entry: LogEntry; onLogEntryClick: (e: LogEntry) => void }) {
  const hasLoc = entry.lat != null && entry.lng != null;
  return (
    <button
      type="button"
      onClick={() => hasLoc && onLogEntryClick(entry)}
      className={`w-full flex items-center gap-2 px-3 py-[5px] transition-colors text-left ${hasLoc ? "cursor-pointer hover:bg-white/30" : "cursor-default"}`}
    >
      <span
        className="w-[22px] h-[22px] rounded-md flex items-center justify-center text-white text-[9px] font-bold shrink-0 shadow-sm"
        style={{ backgroundColor: LOG_ICON_BG[entry.type] }}
      >
        {LOG_ICON_LABEL[entry.type]}
      </span>
      <div className="flex-1 min-w-0">
        <span className="text-[11px] text-slate-700/90 truncate block">
          <span className="font-semibold">{entry.agentName}</span>
          <span className="text-slate-500/80"> {entry.message}</span>
        </span>
      </div>
      <span className="text-[9px] text-slate-400/70 tabular-nums shrink-0">{timeAgo(entry.timestamp)}</span>
    </button>
  );
}

function MoreBtn({ count, color, onClick }: { count: number; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full py-1.5 text-[10px] font-semibold text-center cursor-pointer transition-colors hover:bg-white/20 rounded-b-2xl"
      style={{ color }}
    >
      +{count} mas
    </button>
  );
}
