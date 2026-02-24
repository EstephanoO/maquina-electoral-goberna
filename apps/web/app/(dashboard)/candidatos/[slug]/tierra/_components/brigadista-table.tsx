"use client";

import { useState, useMemo } from "react";
import type { CmsBrigadistaMetrics } from "@/lib/types";

/* ========== Types ========== */

type SortKey = "total_captures" | "contact_rate" | "response_rate";

type Props = {
  brigadistas: CmsBrigadistaMetrics[];
  primaryColor: string;
};

/* ========== Constants ========== */

const PIPELINE_COLORS = {
  nuevos: "#94a3b8",
  hablados: "#f59e0b",
  respondieron: "#10b981",
  archivados: "#cbd5e1",
} as const;

const MEDAL_COLORS = ["#f59e0b", "#94a3b8", "#cd7f32"] as const;

/* ========== Component ========== */

export function BrigadistaTable({ brigadistas, primaryColor }: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total_captures");
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = useMemo(() => {
    let list = brigadistas;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((b) => b.full_name.toLowerCase().includes(q) || b.email.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const diff = (a[sortKey] as number) - (b[sortKey] as number);
      return sortAsc ? diff : -diff;
    });
  }, [brigadistas, search, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const sortArrow = (key: SortKey) => sortKey === key ? (sortAsc ? " \u2191" : " \u2193") : "";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2 flex-1 py-1.5 px-3 rounded-lg border border-slate-200/80 bg-slate-50/60 focus-within:border-slate-300 focus-within:bg-white transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><title>Buscar</title><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar brigadista..."
            className="flex-1 border-none outline-none bg-transparent text-[13px] text-slate-700 placeholder:text-slate-300"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="w-5 h-5 rounded-full border-none bg-slate-200 text-slate-500 cursor-pointer text-[10px] flex items-center justify-center hover:bg-slate-300 transition-colors" aria-label="Limpiar">
              ✕
            </button>
          )}
        </div>
        <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
          {filtered.length} brigadista{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table header — 5 logical columns */}
      <div className="grid grid-cols-[28px_1fr_64px_120px_100px] gap-2 px-4 py-2 border-b border-slate-100 bg-slate-50/60 shrink-0 items-center">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 text-center">#</span>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Brigadista</span>
        <button type="button" onClick={() => handleSort("total_captures")} className="text-[9px] font-semibold uppercase tracking-wider text-center cursor-pointer bg-transparent border-none text-slate-500 hover:text-slate-700" title="Ordenar por capturas">
          Capt{sortArrow("total_captures")}
        </button>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 text-center">N / H / R</span>
        <div className="flex">
          <button type="button" onClick={() => handleSort("contact_rate")} className="flex-1 text-[9px] font-semibold uppercase tracking-wider text-center cursor-pointer bg-transparent border-none text-slate-400 hover:text-slate-600" title="Ordenar por % contacto">
            %C{sortArrow("contact_rate")}
          </button>
          <button type="button" onClick={() => handleSort("response_rate")} className="flex-1 text-[9px] font-semibold uppercase tracking-wider text-center cursor-pointer bg-transparent border-none text-slate-400 hover:text-slate-600" title="Ordenar por % respuesta">
            %R{sortArrow("response_rate")}
          </button>
        </div>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <span className="text-[13px] font-semibold text-slate-500">Sin brigadistas</span>
            <span className="text-xs text-slate-400">{search ? "Intenta con otra busqueda" : "Los brigadistas apareceran cuando capturen datos"}</span>
          </div>
        ) : (
          filtered.map((b, idx) => (
            <BrigadistaRow key={b.brigadista_id} brigadista={b} rank={idx + 1} primaryColor={primaryColor} isEven={idx % 2 === 1} />
          ))
        )}
      </div>
    </div>
  );
}

/* ========== Row ========== */

function BrigadistaRow({ brigadista: b, rank, primaryColor, isEven }: {
  brigadista: CmsBrigadistaMetrics; rank: number; primaryColor: string; isEven: boolean;
}) {
  const total = b.total_captures || 1;
  const contactPct = Math.round(b.contact_rate * 100);
  const responsePct = Math.round(b.response_rate * 100);
  const isMedal = rank <= 3;

  return (
    <div
      className={`grid grid-cols-[28px_1fr_64px_120px_100px] gap-2 px-4 items-center h-11 border-b border-slate-50 transition-colors hover:bg-slate-50/80 ${isEven ? "bg-slate-50/40" : ""}`}
      title={`${b.full_name} — ${b.email}`}
    >
      {/* Rank */}
      <div className="flex items-center justify-center">
        {isMedal ? (
          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: MEDAL_COLORS[rank - 1] }}>
            {rank}
          </span>
        ) : (
          <span className="text-[11px] font-medium text-slate-300 tabular-nums">{rank}</span>
        )}
      </div>

      {/* Name + mini stacked bar below */}
      <div className="min-w-0">
        <div className="text-[12px] font-semibold text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis leading-tight">
          {b.full_name}
        </div>
        <div className="flex h-1 rounded-full overflow-hidden mt-0.5 bg-slate-100">
          {b.nuevos > 0 && <div className="h-full" style={{ width: `${(b.nuevos / total) * 100}%`, backgroundColor: PIPELINE_COLORS.nuevos }} />}
          {b.hablados > 0 && <div className="h-full" style={{ width: `${(b.hablados / total) * 100}%`, backgroundColor: PIPELINE_COLORS.hablados }} />}
          {b.respondieron > 0 && <div className="h-full" style={{ width: `${(b.respondieron / total) * 100}%`, backgroundColor: PIPELINE_COLORS.respondieron }} />}
          {b.archivados > 0 && <div className="h-full" style={{ width: `${(b.archivados / total) * 100}%`, backgroundColor: PIPELINE_COLORS.archivados }} />}
        </div>
      </div>

      {/* Captures */}
      <div className="text-center text-[13px] font-bold tabular-nums" style={{ color: primaryColor }}>
        {b.total_captures}
      </div>

      {/* N / H / R — three values in one column */}
      <div className="flex items-center justify-center gap-1 text-[12px] tabular-nums">
        <span className="text-slate-400">{b.nuevos}</span>
        <span className="text-slate-200">/</span>
        <span className="text-amber-500 font-medium">{b.hablados}</span>
        <span className="text-slate-200">/</span>
        <span className="text-emerald-500 font-medium">{b.respondieron}</span>
      </div>

      {/* Rates */}
      <div className="flex items-center justify-center gap-2 text-[11px] font-semibold tabular-nums">
        <span style={{ color: contactPct > 0 ? primaryColor : undefined }} className={contactPct === 0 ? "text-slate-300" : ""}>
          {contactPct}%
        </span>
        <span className="text-slate-200">|</span>
        <span className={responsePct > 0 ? "text-emerald-500" : "text-slate-300"}>
          {responsePct}%
        </span>
      </div>
    </div>
  );
}
