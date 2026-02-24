"use client";

import { useState, useMemo, useCallback } from "react";
import type { CmsBrigadistaMetrics } from "@/lib/types";
import type { EnrichedAgent, AgentStatus } from "./types";
import { STATUS_CFG } from "./constants";
import { getTimeAgo } from "./utils";

/* ========== Types ========== */

type Props = {
  agents: EnrichedAgent[];
  selectedAgentId: string | null;
  primaryColor: string;
  onSelectAgent: (agentId: string) => void;
  onWhatsApp?: (agent: EnrichedAgent) => void;
  /** Per-brigadista CMS metrics — matched by agent id */
  brigadistaMetrics?: CmsBrigadistaMetrics[];
};

/* ========== Constants ========== */

const PIPELINE_COLORS = {
  nuevos: "#94a3b8",
  hablados: "#f59e0b",
  respondieron: "#10b981",
} as const;

/* ========== Component ========== */

export function AgentsTab({ agents, selectedAgentId, primaryColor, onSelectAgent, onWhatsApp, brigadistaMetrics }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AgentStatus | "all">("all");

  // Index brigadista metrics by ID for O(1) lookup
  const metricsMap = useMemo(() => {
    const map = new Map<string, CmsBrigadistaMetrics>();
    if (brigadistaMetrics) {
      for (const m of brigadistaMetrics) map.set(m.brigadista_id, m);
    }
    return map;
  }, [brigadistaMetrics]);

  // Status counts
  const counts = useMemo(() => {
    const c = { connected: 0, idle: 0, inactive: 0 };
    for (const a of agents) c[a.status]++;
    return c;
  }, [agents]);

  // Filtered agents
  const filtered = useMemo(() => {
    return agents.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return a.name.toLowerCase().includes(q) || a.id.includes(q);
      }
      return true;
    });
  }, [agents, statusFilter, search]);

  const handleWhatsApp = useCallback((e: React.MouseEvent, agent: EnrichedAgent) => {
    e.stopPropagation();
    if (onWhatsApp) onWhatsApp(agent);
  }, [onWhatsApp]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Status filter pills */}
      <div className="flex gap-1.5 px-4 py-2.5 border-b border-slate-100 shrink-0">
        {(["connected", "idle", "inactive"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
            className="flex-1 flex flex-col items-center py-2 px-1.5 rounded-lg border cursor-pointer transition-all duration-150"
            style={{
              backgroundColor: statusFilter === s ? STATUS_CFG[s].color : "#f8fafc",
              color: statusFilter === s ? "#fff" : STATUS_CFG[s].color,
              borderColor: statusFilter === s ? STATUS_CFG[s].color : "#e2e8f0",
            }}
          >
            <span className="text-base font-bold">{counts[s]}</span>
            <span className="text-[9px] font-semibold tracking-wide">{STATUS_CFG[s].label}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2.5 py-2 px-3 rounded-lg border border-slate-200 bg-slate-50">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><title>Buscar</title><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar agente..."
            className="flex-1 border-none outline-none bg-transparent text-[13px] text-slate-700"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="w-5 h-5 rounded border-none bg-slate-200 text-slate-500 cursor-pointer text-[10px] flex items-center justify-center" aria-label="Limpiar">✕</button>
          )}
        </div>
      </div>

      {/* List header */}
      <div className="flex justify-between items-center px-4 py-2 border-b border-slate-100 shrink-0">
        <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Agentes ({filtered.length})</span>
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-green-500">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          LIVE
        </span>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><title>Sin agentes</title><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            <span className="text-[13px] font-semibold text-slate-500">Sin agentes</span>
            <span className="text-xs text-slate-400">
              {search || statusFilter !== "all" ? "Intenta con otros filtros" : "Los agentes apareceran aqui"}
            </span>
          </div>
        ) : (
          filtered.map((agent) => {
            const isSelected = selectedAgentId === agent.id;
            const cfg = STATUS_CFG[agent.status];
            const metrics = metricsMap.get(agent.id);
            return (
              <div
                key={agent.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectAgent(agent.id)}
                onKeyDown={(e) => e.key === "Enter" && onSelectAgent(agent.id)}
                className="w-full flex items-center justify-between py-2.5 px-3 mb-0.5 rounded-lg border-l-[3px] cursor-pointer transition-colors duration-100"
                style={{
                  backgroundColor: isSelected ? `${primaryColor}08` : "transparent",
                  borderLeftColor: cfg.color,
                }}
              >
                {/* Left: status + info + mini funnel */}
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis">{agent.name}</div>
                    <div className="text-[11px] flex items-center gap-1 mt-px">
                      <span className="font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-400 text-[11px]">{getTimeAgo(agent.lastSeen)}</span>
                    </div>
                    {/* Mini pipeline bar */}
                    {metrics && metrics.total_captures > 0 && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className="flex h-1 rounded-sm overflow-hidden flex-1 bg-slate-100">
                          {metrics.nuevos > 0 && <div className="h-full" style={{ width: `${(metrics.nuevos / metrics.total_captures) * 100}%`, backgroundColor: PIPELINE_COLORS.nuevos }} />}
                          {metrics.hablados > 0 && <div className="h-full" style={{ width: `${(metrics.hablados / metrics.total_captures) * 100}%`, backgroundColor: PIPELINE_COLORS.hablados }} />}
                          {metrics.respondieron > 0 && <div className="h-full" style={{ width: `${(metrics.respondieron / metrics.total_captures) * 100}%`, backgroundColor: PIPELINE_COLORS.respondieron }} />}
                        </div>
                        <span className="text-[9px] font-bold text-slate-400 shrink-0">{Math.round(metrics.contact_rate * 100)}%</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: forms count + WhatsApp */}
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <div
                    className="text-sm font-bold px-2 py-px rounded-md min-w-[28px] text-center"
                    style={{ color: primaryColor, backgroundColor: `${primaryColor}12` }}
                  >
                    {agent.forms_count}
                  </div>
                  {onWhatsApp && (
                    <button
                      type="button"
                      onClick={(e) => handleWhatsApp(e, agent)}
                      className="w-[30px] h-[30px] rounded-lg border border-slate-200 bg-green-50 cursor-pointer flex items-center justify-center transition-all duration-150 shrink-0 hover:bg-green-100"
                      title={`WhatsApp a ${agent.name}`}
                      aria-label={`WhatsApp a ${agent.name}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366"><title>WhatsApp</title><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
