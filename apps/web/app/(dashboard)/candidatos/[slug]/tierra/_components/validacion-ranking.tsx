"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ValidationBrigadistaStats } from "@/lib/services/validacion";
import { getValidationBrigadistaStats, getValidationStats } from "@/lib/services/validacion";
import { useTheme } from "@/lib/theme-context";
import { KpiCard, ChartIcon, UsersIcon, TrendIcon, ClockIcon } from "./kpi-cards";

/* ========== Types ========== */

type SortKey = "invalido" | "total" | "tasa_invalido" | "respondido" | "tasa_validado";

type Props = {
  campaignId: string;
  primaryColor: string;
};

/* ========== Component ========== */

export function ValidacionRanking({ campaignId, primaryColor }: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [brigadistas, setBrigadistas] = useState<ValidationBrigadistaStats[]>([]);
  const [globalStats, setGlobalStats] = useState<{ pendiente: number; contactado: number; respondido: number; invalido: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("invalido");
  const [sortAsc, setSortAsc] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const fetchData = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    const [brigRes, statsRes] = await Promise.all([
      getValidationBrigadistaStats(campaignId),
      getValidationStats(campaignId),
    ]);
    if (brigRes.ok && brigRes.data) setBrigadistas(brigRes.data.brigadistas);
    if (statsRes.ok && statsRes.data) setGlobalStats(statsRes.data.stats);
    setLoading(false);
  }, [campaignId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sorted = useMemo(() => {
    let list = brigadistas;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((b) => b.encuestador.toLowerCase().includes(q));
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
  const arrow = (key: SortKey) => sortKey === key ? (sortAsc ? " \u2191" : " \u2193") : "";

  // Summary stats
  const totalInvalidos = useMemo(() => brigadistas.reduce((s, b) => s + b.invalido, 0), [brigadistas]);
  const totalRespondidos = useMemo(() => brigadistas.reduce((s, b) => s + b.respondido, 0), [brigadistas]);
  const totalRegistros = useMemo(() => brigadistas.reduce((s, b) => s + b.total, 0), [brigadistas]);
  const brigWithInvalidos = useMemo(() => brigadistas.filter((b) => b.invalido > 0).length, [brigadistas]);

  if (loading) {
    return (
      <div className={`flex flex-col animate-pulse ${isDark ? "bg-[#090D15]" : "bg-white"}`}>
        <div className={`flex items-center gap-3 px-4 py-3 ${isDark ? "border-b border-[#2a303b]" : "border-b border-slate-100"}`}>
          <div className="h-4 w-48 bg-slate-100 rounded" />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={`vr-skel-${i}`} className="flex items-center gap-3 px-4 h-[44px] border-b border-slate-50">
            <div className="w-5 h-5 bg-slate-100 rounded-full" />
            <div className="flex-1 h-3 bg-slate-100 rounded" />
            <div className="w-16 h-3 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (brigadistas.length === 0) return null;

  return (
    <div className={`flex flex-col shrink-0 ${isDark ? "bg-[#090D15]" : "bg-white"}`}>
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`flex items-center gap-2 w-full px-4 py-2 text-left cursor-pointer border-none transition-colors ${isDark ? "bg-[#090D15] hover:bg-[#090D15] border-b border-[#2a303b]" : "bg-slate-50/60 hover:bg-slate-100/60 border-b border-slate-100"}`}
      >
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isDark ? "#cbd5e1" : "#64748b"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
          role="img" aria-label="Toggle"
        >
          <title>Toggle</title>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? "text-slate-300" : "text-slate-400"}`}>Validacion de Datos — Ranking Brigadistas</span>
        {totalInvalidos > 0 && (
          <span className="ml-auto text-[10px] font-bold text-red-500 tabular-nums">
            {totalInvalidos} imposible{totalInvalidos !== 1 ? "s" : ""}
          </span>
        )}
        {!expanded && (
          <span className="text-[9px] text-slate-400 ml-2">Mostrar</span>
        )}
      </button>

      {expanded && (
        <>
          {/* Global KPIs */}
            <div className={`grid grid-cols-4 gap-2 px-4 py-2.5 ${isDark ? "border-b border-[#2a303b]" : "border-b border-slate-100"}`}>
            <KpiCard label="Total Registros" value={globalStats ? (globalStats.pendiente + globalStats.contactado + globalStats.respondido + globalStats.invalido) : totalRegistros} color={isDark ? "#8fc3f5" : "#334155"} icon={<ChartIcon />} />
            <KpiCard label="Validados" value={globalStats?.respondido ?? totalRespondidos} color={isDark ? "#63e39d" : "#15803d"} icon={<TrendIcon />} />
            <KpiCard label="Imposibles" value={globalStats?.invalido ?? totalInvalidos} color={isDark ? "#ff8f88" : "#dc2626"} icon={<ClockIcon />} />
            <KpiCard label="Brigadistas c/ Imp." value={brigWithInvalidos} color={isDark ? "#facc15" : "#f59e0b"} icon={<UsersIcon />} />
          </div>

          {/* Toolbar */}
          <div className={`flex items-center gap-2 px-4 py-2 ${isDark ? "border-b border-[#2a303b] bg-[#090D15]" : "border-b border-slate-100 bg-white"}`}>
            <div className={`flex items-center gap-2 flex-1 py-1 px-2.5 rounded-lg transition-colors ${isDark ? "bg-[#090D15] border border-[#2a303b] focus-within:border-slate-600" : "bg-slate-50 border border-slate-200 focus-within:border-slate-300"}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar encuestador..."
                className={`flex-1 border-none outline-none bg-transparent text-[12px] ${isDark ? "text-slate-100 placeholder:text-slate-400" : "text-slate-700 placeholder:text-slate-400"}`}
              />
            </div>
            <span className={`text-[10px] shrink-0 tabular-nums font-semibold ${isDark ? "text-slate-400" : "text-slate-400"}`}>
              {sorted.length} encuestador{sorted.length !== 1 ? "es" : ""}
            </span>
          </div>

          {/* Table header */}
          <div className={`grid grid-cols-[32px_1fr_70px_70px_70px_70px_70px] gap-1 px-4 py-1.5 shrink-0 items-center ${isDark ? "border-b border-[#2a303b] bg-[#090D15]" : "border-b border-slate-200/80 bg-slate-50"}`}>
            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 text-center">#</span>
            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Encuestador</span>
            <SortBtn label="Total" sortKey="total" current={sortKey} asc={sortAsc} onClick={handleSort} arrow={arrow} />
            <SortBtn label="Validados" sortKey="respondido" current={sortKey} asc={sortAsc} onClick={handleSort} arrow={arrow} />
            <SortBtn label="Imposibles" sortKey="invalido" current={sortKey} asc={sortAsc} onClick={handleSort} arrow={arrow} />
            <SortBtn label="% Invalido" sortKey="tasa_invalido" current={sortKey} asc={sortAsc} onClick={handleSort} arrow={arrow} />
            <SortBtn label="% Validado" sortKey="tasa_validado" current={sortKey} asc={sortAsc} onClick={handleSort} arrow={arrow} />
          </div>

          {/* Rows */}
          <div className="hide-scrollbar max-h-[360px] overflow-y-auto">
            {sorted.length === 0 ? (
              <div className="flex items-center justify-center gap-2 p-8 text-center">
                <span className={`text-[12px] ${isDark ? "text-slate-400" : "text-slate-400"}`}>{search ? "Sin resultados" : "Sin datos de validacion"}</span>
              </div>
            ) : (
              sorted.map((b, idx) => (
                <RankingRow key={b.encuestador} b={b} rank={idx + 1} primaryColor={primaryColor} even={idx % 2 === 1} isDark={isDark} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ========== Sub-components ========== */

function SortBtn({ label, sortKey, current, asc, onClick, arrow }: {
  label: string; sortKey: SortKey; current: SortKey; asc: boolean;
  onClick: (k: SortKey) => void; arrow: (k: SortKey) => string;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      className={`text-[8px] font-bold uppercase tracking-wider text-center cursor-pointer bg-transparent border-none transition-colors whitespace-nowrap ${current === sortKey ? (isDark ? "text-slate-100" : "text-slate-800") : (isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-400 hover:text-slate-600")}`}
    >
      {label}{arrow(sortKey)}
    </button>
  );
}

const MEDAL = ["#f59e0b", "#94a3b8", "#cd7f32"] as const;

function RankingRow({ b, rank, primaryColor, even, isDark }: { b: ValidationBrigadistaStats; rank: number; primaryColor: string; even: boolean; isDark: boolean }) {
  const hasInvalidos = b.invalido > 0;
  const isMedal = rank <= 3 && b.invalido > 0;

  // Severity badge for tasa_invalido
  const severityColor = b.tasa_invalido >= 20 ? (isDark ? "#ff6b6b" : "#dc2626") : b.tasa_invalido >= 5 ? (isDark ? "#facc15" : "#f59e0b") : (isDark ? "#38d97a" : "#10b981");
  const severityBg = b.tasa_invalido >= 20 ? (isDark ? "rgba(255,107,107,0.18)" : "#dc262618") : b.tasa_invalido >= 5 ? (isDark ? "rgba(250,204,21,0.14)" : "#f59e0b18") : (isDark ? "rgba(56,217,122,0.18)" : "#10b98118");

  // Bar: proportion validated vs imposible out of processed
  const processed = b.contactado + b.respondido + b.invalido;
  const validPct = processed > 0 ? (b.respondido / processed) * 100 : 0;
  const invalidPct = processed > 0 ? (b.invalido / processed) * 100 : 0;

  return (
    <div
      className={`grid grid-cols-[32px_1fr_70px_70px_70px_70px_70px] gap-1 px-4 items-center min-h-[40px] transition-colors ${isDark ? "border-b border-[#2a303b] hover:bg-[#090D15]" : "border-b border-slate-50 hover:bg-slate-50/80"}`}
      style={{ backgroundColor: even ? (isDark ? "rgba(9,13,21,0.72)" : "rgba(248,250,252,0.5)") : (isDark ? "#090D15" : "#fff") }}
    >
      {/* Rank */}
      <div className="flex items-center justify-center">
        {isMedal ? (
          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-sm" style={{ backgroundColor: MEDAL[rank - 1] }}>
            {rank}
          </span>
        ) : (
          <span className={`text-[11px] font-bold tabular-nums ${isDark ? "text-slate-400" : "text-slate-300"}`}>{rank}</span>
        )}
      </div>

      {/* Name + mini progress bar */}
      <div className="min-w-0 py-1">
        <div className={`text-[12px] font-bold truncate leading-tight ${isDark ? "text-slate-100" : "text-slate-800"}`}>
          {b.encuestador}
        </div>
        {processed > 0 && (
            <div className={`flex h-1.5 rounded-full overflow-hidden mt-0.5 ${isDark ? "bg-[#090D15]" : "bg-slate-100"}`}>
            <div className="h-full rounded-l-full" style={{ width: `${validPct}%`, backgroundColor: isDark ? "#38d97a" : "#15803d" }} />
            <div className="h-full" style={{ width: `${invalidPct}%`, backgroundColor: isDark ? "#ff6b6b" : "#dc2626" }} />
          </div>
        )}
      </div>

      {/* Total */}
      <div className="text-center">
        <span className={`text-[12px] font-black tabular-nums ${isDark ? "text-slate-100" : "text-slate-700"}`}>{b.total.toLocaleString()}</span>
      </div>

      {/* Validados */}
      <div className="text-center">
        <span className="text-[12px] font-black tabular-nums text-emerald-600">{b.respondido.toLocaleString()}</span>
      </div>

      {/* Imposibles */}
      <div className="text-center">
          <span className={`text-[12px] font-black tabular-nums ${hasInvalidos ? (isDark ? "text-red-300" : "text-red-600") : "text-slate-300"}`}>
          {b.invalido > 0 ? b.invalido.toLocaleString() : "-"}
        </span>
      </div>

      {/* % Invalido */}
      <div className="flex items-center justify-center">
        {b.invalido > 0 ? (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full tabular-nums" style={{ backgroundColor: severityBg, color: severityColor }}>
            {b.tasa_invalido}%
          </span>
        ) : (
          <span className="text-[10px] text-slate-300">-</span>
        )}
      </div>

      {/* % Validado */}
      <div className="flex items-center justify-center">
        {b.respondido > 0 ? (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full tabular-nums" style={{ backgroundColor: isDark ? "rgba(56,217,122,0.18)" : "#15803d18", color: isDark ? "#38d97a" : "#15803d" }}>
            {b.tasa_validado}%
          </span>
        ) : (
          <span className="text-[10px] text-slate-300">-</span>
        )}
      </div>
    </div>
  );
}
