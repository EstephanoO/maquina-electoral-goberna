"use client";

import type { EnrichedAgent, LogEntry, AgentStatus } from "./types";
import { STATUS_CFG, LOG_ICON_BG, LOG_ICON_LABEL } from "./constants";
import { timeAgo, getTimeAgo } from "./utils";

/* ========== Constants ========== */

export const MEDAL_COLORS = ["#f59e0b", "#94a3b8", "#cd7f32"] as const;
export const SCROLL_MAX = "max-h-[240px] overflow-y-auto";

/* ========== Primitives ========== */

export function Glass({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl shadow-[0_2px_24px_rgba(0,0,0,0.08)] overflow-hidden"
      style={{ background: "rgba(255,255,255,0.38)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
    >
      {children}
    </div>
  );
}

export function Kpi({ value, label, color, dotColor, pulse, sub }: {
  value: number; label: string; color?: string; dotColor?: string; pulse?: boolean; sub?: React.ReactNode;
}) {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.06)]"
      style={{ background: "rgba(255,255,255,0.38)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
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

export function CardHeader({ children, onClick, open }: { children: React.ReactNode; onClick: () => void; open: boolean }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center px-3 py-2 cursor-pointer">
      {children}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}

export function AgentRow({ agent, primaryColor, selected, onClick }: { agent: EnrichedAgent; primaryColor: string; selected: boolean; onClick: (id: string) => void }) {
  const cfg = STATUS_CFG[agent.status];
  return (
    <button
      type="button"
      onClick={() => onClick(agent.id)}
      className={`w-full flex items-center gap-2.5 px-3 py-[5px] transition-colors cursor-pointer text-left ${selected ? "bg-white/50" : "hover:bg-white/30"}`}
      title={`${agent.name} — ${cfg.label}`}
    >
      <span className="w-[7px] h-[7px] rounded-full shrink-0 ring-2 ring-white/50" style={{ backgroundColor: cfg.color }} />
      <span className={`text-[12px] font-medium truncate flex-1 ${selected ? "text-slate-900 font-semibold" : "text-slate-800/90"}`}>{agent.name}</span>
      <span className="text-[10px] text-slate-400/80 tabular-nums shrink-0">{getTimeAgo(agent.lastSeen)}</span>
      <span className="text-[11px] font-bold tabular-nums min-w-[22px] text-right shrink-0" style={{ color: primaryColor }}>{agent.forms_count}</span>
      {selected && <span className="w-1 h-4 rounded-full shrink-0" style={{ backgroundColor: primaryColor }} />}
    </button>
  );
}

export function RankingRow({ agent, rank, primaryColor, selected, onClick }: { agent: EnrichedAgent; rank: number; primaryColor: string; selected: boolean; onClick: (id: string) => void }) {
  const isMedal = rank <= 3;
  const firstName = agent.name.split(" ")[0];
  const displayName = firstName.length > 14 ? `${firstName.slice(0, 13)}…` : firstName;

  return (
    <button
      type="button"
      onClick={() => onClick(agent.id)}
      className={`w-full flex items-center gap-2 px-3 py-[5px] transition-colors cursor-pointer text-left ${selected ? "bg-white/50" : "hover:bg-white/30"}`}
      title={`#${rank} ${agent.name} — ${agent.forms_count} registros`}
    >
      {isMedal ? (
        <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{ backgroundColor: MEDAL_COLORS[rank - 1] }}>
          {rank}
        </span>
      ) : (
        <span className="w-[18px] text-center text-[10px] font-medium text-slate-400/80 tabular-nums shrink-0">{rank}</span>
      )}
      <span className={`text-[11px] font-medium truncate flex-1 ${selected ? "text-slate-900 font-semibold" : "text-slate-800/90"}`}>{displayName}</span>
      <span className="text-[11px] font-extrabold tabular-nums shrink-0" style={{ color: primaryColor }}>{agent.forms_count}</span>
      {selected && <span className="w-1 h-4 rounded-full shrink-0" style={{ backgroundColor: primaryColor }} />}
    </button>
  );
}

export function LogRow({ entry, onLogEntryClick }: { entry: LogEntry; onLogEntryClick: (e: LogEntry) => void }) {
  const hasLoc = entry.lat != null && entry.lng != null;
  return (
    <button
      type="button"
      onClick={() => hasLoc && onLogEntryClick(entry)}
      className={`w-full flex items-center gap-2 px-3 py-[5px] transition-colors text-left ${hasLoc ? "cursor-pointer hover:bg-white/30" : "cursor-default"}`}
    >
      <span className="w-[22px] h-[22px] rounded-md flex items-center justify-center text-white text-[9px] font-bold shrink-0 shadow-sm" style={{ backgroundColor: LOG_ICON_BG[entry.type] }}>
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

export function MoreBtn({ count, color, onClick }: { count: number; color: string; onClick: () => void }) {
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
