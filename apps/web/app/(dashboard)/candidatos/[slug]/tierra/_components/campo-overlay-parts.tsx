"use client";

import type { EnrichedAgent, LogEntry, AgentStatus, MapTheme } from "./types";
import { STATUS_CFG, LOG_ICON_BG, LOG_ICON_LABEL } from "./constants";
import { timeAgo, getTimeAgo } from "./utils";

/* ========== Constants ========== */

export const MEDAL_COLORS = ["#f59e0b", "#94a3b8", "#cd7f32"] as const;
export const SCROLL_MAX = "max-h-[240px] overflow-y-auto";

/* ========== Primitives ========== */

export function Glass({ children, mapTheme = "voyager" }: { children: React.ReactNode; mapTheme?: MapTheme }) {
  const isDark = mapTheme === "dark";
  return (
    <div
      className="rounded-2xl overflow-hidden border"
      style={{
        background: isDark ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.38)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderColor: isDark ? "rgba(148,163,184,0.25)" : "rgba(226,232,240,0.7)",
        boxShadow: isDark ? "0 8px 32px rgba(2,6,23,0.45)" : "0 2px 24px rgba(0,0,0,0.08)",
      }}
    >
      {children}
    </div>
  );
}

export function Kpi({ value, label, color, dotColor, pulse, sub, mapTheme = "voyager" }: {
  value: number; label: string; color?: string; dotColor?: string; pulse?: boolean; sub?: React.ReactNode; mapTheme?: MapTheme;
}) {
  const isDark = mapTheme === "dark";
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-2xl border"
      style={{
        background: isDark ? "rgba(15,23,42,0.74)" : "rgba(255,255,255,0.38)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderColor: isDark ? "rgba(148,163,184,0.24)" : "rgba(226,232,240,0.75)",
        boxShadow: isDark ? "0 6px 20px rgba(2,6,23,0.4)" : "0 2px 16px rgba(0,0,0,0.06)",
      }}
    >
      <div className="flex items-center gap-1.5">
        {dotColor && <span className={`w-2 h-2 rounded-full ${pulse ? "animate-pulse" : ""}`} style={{ backgroundColor: dotColor }} />}
        <span className="text-xl font-extrabold tabular-nums leading-none" style={{ color: color ?? (isDark ? "#f8fafc" : "#1e293b") }}>{value}</span>
      </div>
      <span className={`text-[9px] font-semibold uppercase tracking-wider ${isDark ? "text-slate-300/90" : "text-slate-500/80"}`}>{label}</span>
      {sub}
    </div>
  );
}

export function CardHeader({ children, onClick, open, mapTheme = "voyager" }: { children: React.ReactNode; onClick: () => void; open: boolean; mapTheme?: MapTheme }) {
  const isDark = mapTheme === "dark";
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center px-3 py-2 cursor-pointer">
      {children}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isDark ? "#cbd5e1" : "#94a3b8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}

export function AgentRow({ agent, primaryColor, selected, onClick, mapTheme = "voyager" }: { agent: EnrichedAgent; primaryColor: string; selected: boolean; onClick: (id: string) => void; mapTheme?: MapTheme }) {
  const cfg = STATUS_CFG[agent.status];
  const isDark = mapTheme === "dark";
  const rowBg = selected
    ? (isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.5)")
    : "transparent";
  return (
    <button
      type="button"
      onClick={() => onClick(agent.id)}
      className="w-full flex items-center gap-2.5 px-3 py-[5px] transition-colors cursor-pointer text-left"
      style={{ backgroundColor: rowBg }}
      title={`${agent.name} — ${cfg.label}`}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.backgroundColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.3)"; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.backgroundColor = "transparent"; }}
    >
      <span className={`w-[7px] h-[7px] rounded-full shrink-0 ring-2 ${isDark ? "ring-slate-900/30" : "ring-white/50"}`} style={{ backgroundColor: cfg.color }} />
      <span className={`text-[12px] font-medium truncate flex-1 ${selected ? (isDark ? "text-slate-100 font-semibold" : "text-slate-900 font-semibold") : (isDark ? "text-slate-200/95" : "text-slate-800/90")}`}>{agent.name}</span>
      <span className={`text-[10px] tabular-nums shrink-0 ${isDark ? "text-slate-300/80" : "text-slate-400/80"}`}>{getTimeAgo(agent.lastSeen)}</span>
      <span className="text-[11px] font-bold tabular-nums min-w-[22px] text-right shrink-0" style={{ color: primaryColor }}>{agent.forms_count}</span>
      {selected && <span className="w-1 h-4 rounded-full shrink-0" style={{ backgroundColor: primaryColor }} />}
    </button>
  );
}

export function RankingRow({ agent, rank, primaryColor, selected, onClick, mapTheme = "voyager" }: { agent: EnrichedAgent; rank: number; primaryColor: string; selected: boolean; onClick: (id: string) => void; mapTheme?: MapTheme }) {
  const isMedal = rank <= 3;
  const isDark = mapTheme === "dark";
  const rowBg = selected
    ? (isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.5)")
    : "transparent";
  const firstName = agent.name.split(" ")[0];
  const displayName = firstName.length > 14 ? `${firstName.slice(0, 13)}…` : firstName;

  return (
    <button
      type="button"
      onClick={() => onClick(agent.id)}
      className="w-full flex items-center gap-2 px-3 py-[5px] transition-colors cursor-pointer text-left"
      style={{ backgroundColor: rowBg }}
      title={`#${rank} ${agent.name} — ${agent.forms_count} registros`}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.backgroundColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.3)"; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.backgroundColor = "transparent"; }}
    >
      {isMedal ? (
        <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{ backgroundColor: MEDAL_COLORS[rank - 1] }}>
          {rank}
        </span>
      ) : (
        <span className={`w-[18px] text-center text-[10px] font-medium tabular-nums shrink-0 ${isDark ? "text-slate-300/85" : "text-slate-400/80"}`}>{rank}</span>
      )}
      <span className={`text-[11px] font-medium truncate flex-1 ${selected ? (isDark ? "text-slate-100 font-semibold" : "text-slate-900 font-semibold") : (isDark ? "text-slate-200/95" : "text-slate-800/90")}`}>{displayName}</span>
      <span className="text-[11px] font-extrabold tabular-nums shrink-0" style={{ color: primaryColor }}>{agent.forms_count}</span>
      {selected && <span className="w-1 h-4 rounded-full shrink-0" style={{ backgroundColor: primaryColor }} />}
    </button>
  );
}

export function LogRow({ entry, onLogEntryClick, mapTheme = "voyager" }: { entry: LogEntry; onLogEntryClick: (e: LogEntry) => void; mapTheme?: MapTheme }) {
  const hasLoc = entry.lat != null && entry.lng != null;
  const isDark = mapTheme === "dark";
  const hoverBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.3)";
  return (
    <button
      type="button"
      onClick={() => hasLoc && onLogEntryClick(entry)}
      className="w-full flex items-center gap-2 px-3 py-[5px] transition-colors text-left"
      style={{ cursor: hasLoc ? "pointer" : "default" }}
      onMouseEnter={(e) => { if (hasLoc) e.currentTarget.style.backgroundColor = hoverBg; }}
      onMouseLeave={(e) => { if (hasLoc) e.currentTarget.style.backgroundColor = "transparent"; }}
    >
      <span className="w-[22px] h-[22px] rounded-md flex items-center justify-center text-white text-[9px] font-bold shrink-0 shadow-sm" style={{ backgroundColor: LOG_ICON_BG[entry.type] }}>
        {LOG_ICON_LABEL[entry.type]}
      </span>
      <div className="flex-1 min-w-0">
        <span className={`text-[11px] truncate block ${isDark ? "text-slate-200/95" : "text-slate-700/90"}`}>
          <span className="font-semibold">{entry.agentName}</span>
          <span className={isDark ? "text-slate-400/90" : "text-slate-500/80"}> {entry.message}</span>
        </span>
      </div>
      <span className={`text-[9px] tabular-nums shrink-0 ${isDark ? "text-slate-400/80" : "text-slate-400/70"}`}>{timeAgo(entry.timestamp)}</span>
    </button>
  );
}

export function MoreBtn({ count, color, onClick, mapTheme = "voyager" }: { count: number; color: string; onClick: () => void; mapTheme?: MapTheme }) {
  const hoverBg = mapTheme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.2)";
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full py-1.5 text-[10px] font-semibold text-center cursor-pointer transition-colors rounded-b-2xl"
      style={{ color }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = hoverBg; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
    >
      +{count} mas
    </button>
  );
}
