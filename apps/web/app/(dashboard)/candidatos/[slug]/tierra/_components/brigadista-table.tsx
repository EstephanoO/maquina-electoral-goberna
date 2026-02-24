"use client";

import { useState, useMemo } from "react";
import type { CmsBrigadistaMetrics } from "@/lib/types";

/* ========== Types ========== */

type SortKey = "total_captures" | "contact_rate" | "response_rate" | "nuevos" | "hablados" | "respondieron";

type Props = {
  brigadistas: CmsBrigadistaMetrics[];
  primaryColor: string;
};

/* ========== Constants ========== */

const PIPELINE_COLORS = {
  nuevos: "#94a3b8",     // slate-400
  hablados: "#f59e0b",   // amber-400
  respondieron: "#10b981", // emerald-500
  archivados: "#cbd5e1",  // slate-300
} as const;

/* ========== Component ========== */

export function BrigadistaTable({ brigadistas, primaryColor }: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total_captures");
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = useMemo(() => {
    let list = brigadistas;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((b) =>
        b.full_name.toLowerCase().includes(q) || b.email.toLowerCase().includes(q),
      );
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

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return "↕";
    return sortAsc ? "↑" : "↓";
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2 flex-1 py-2 px-3 rounded-lg border border-slate-200 bg-slate-50">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><title>Buscar</title><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar brigadista..."
            className="flex-1 border-none outline-none bg-transparent text-[13px] text-slate-700"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="w-5 h-5 rounded border-none bg-slate-200 text-slate-500 cursor-pointer text-[10px] flex items-center justify-center" aria-label="Limpiar">✕</button>
          )}
        </div>
        <span className="text-[11px] text-slate-400 shrink-0">{filtered.length} brigadista{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[1fr_70px_70px_70px_70px_70px_60px] gap-1 px-4 py-2 border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 shrink-0">
        <span>Brigadista</span>
        <SortButton label="Capt" sortKey="total_captures" current={sortKey} icon={sortIcon("total_captures")} onClick={handleSort} />
        <SortButton label="Nuevos" sortKey="nuevos" current={sortKey} icon={sortIcon("nuevos")} onClick={handleSort} />
        <SortButton label="Habl" sortKey="hablados" current={sortKey} icon={sortIcon("hablados")} onClick={handleSort} />
        <SortButton label="Resp" sortKey="respondieron" current={sortKey} icon={sortIcon("respondieron")} onClick={handleSort} />
        <SortButton label="C.Rate" sortKey="contact_rate" current={sortKey} icon={sortIcon("contact_rate")} onClick={handleSort} />
        <SortButton label="R.Rate" sortKey="response_rate" current={sortKey} icon={sortIcon("response_rate")} onClick={handleSort} />
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <span className="text-[13px] font-semibold text-slate-500">Sin brigadistas</span>
            <span className="text-xs text-slate-400">{search ? "Intenta con otra busqueda" : "Los brigadistas apareceran cuando capturen datos"}</span>
          </div>
        ) : (
          filtered.map((b) => (
            <BrigadistaRow key={b.brigadista_id} brigadista={b} primaryColor={primaryColor} />
          ))
        )}
      </div>
    </div>
  );
}

/* ========== Sub-components ========== */

function SortButton({ label, sortKey, current, icon, onClick }: { label: string; sortKey: SortKey; current: SortKey; icon: string; onClick: (key: SortKey) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      className={`text-center cursor-pointer bg-transparent border-none text-[10px] font-bold uppercase tracking-wider transition-colors ${current === sortKey ? "text-slate-800" : "text-slate-500"}`}
    >
      {label} {icon}
    </button>
  );
}

function BrigadistaRow({ brigadista: b, primaryColor }: { brigadista: CmsBrigadistaMetrics; primaryColor: string }) {
  const total = b.total_captures || 1; // avoid /0

  return (
    <div className="grid grid-cols-[1fr_70px_70px_70px_70px_70px_60px] gap-1 px-4 py-2.5 border-b border-slate-100 items-center hover:bg-slate-50 transition-colors">
      {/* Name + mini pipeline bar */}
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis">{b.full_name}</div>
        {/* Mini stacked bar */}
        <div className="flex h-1.5 rounded-sm overflow-hidden mt-1 bg-slate-100">
          {b.nuevos > 0 && (
            <div className="h-full transition-[width] duration-300" style={{ width: `${(b.nuevos / total) * 100}%`, backgroundColor: PIPELINE_COLORS.nuevos }} />
          )}
          {b.hablados > 0 && (
            <div className="h-full transition-[width] duration-300" style={{ width: `${(b.hablados / total) * 100}%`, backgroundColor: PIPELINE_COLORS.hablados }} />
          )}
          {b.respondieron > 0 && (
            <div className="h-full transition-[width] duration-300" style={{ width: `${(b.respondieron / total) * 100}%`, backgroundColor: PIPELINE_COLORS.respondieron }} />
          )}
          {b.archivados > 0 && (
            <div className="h-full transition-[width] duration-300" style={{ width: `${(b.archivados / total) * 100}%`, backgroundColor: PIPELINE_COLORS.archivados }} />
          )}
        </div>
      </div>

      {/* Numeric columns */}
      <div className="text-center text-sm font-bold" style={{ color: primaryColor }}>{b.total_captures}</div>
      <div className="text-center text-sm text-slate-500">{b.nuevos}</div>
      <div className="text-center text-sm font-medium text-amber-500">{b.hablados}</div>
      <div className="text-center text-sm font-medium text-emerald-500">{b.respondieron}</div>
      <div className="text-center text-sm font-bold" style={{ color: primaryColor }}>{Math.round(b.contact_rate * 100)}%</div>
      <div className="text-center text-sm font-medium text-emerald-600">{Math.round(b.response_rate * 100)}%</div>
    </div>
  );
}
