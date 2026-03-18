import { memo } from "react";
import type { ValidationItem, ValidationStats } from "@/lib/services/validacion";
import type { VisualColumn } from "./constants";

interface StatsPanelProps {
  stats: ValidationStats;
  items: ValidationItem[];
  total: number;
  columnTotals: Record<VisualColumn, { count: number; isPartial: boolean }>;
}

export const StatsPanel = memo(function StatsPanel({
  stats,
  items,
  total,
  columnTotals,
}: StatsPanelProps) {
  // Totales reales del backend
  const processed = stats.contactado + stats.respondido + stats.invalido;
  const conversion = (stats.contactado + stats.respondido) > 0
    ? Math.round((stats.respondido / (stats.contactado + stats.respondido)) * 100)
    : 0;

  // Desglose de votos — calculado desde items en memoria
  // Si respondido no está todo cargado, los números son parciales (se indica con +)
  const respondidoLoaded = items.filter((i) => i.status === "respondido" || i.status === ("validado" as string)).length;
  const respondidoIsPartial = respondidoLoaded < stats.respondido;
  const voteDuro   = items.filter((i) => i.vote_class === "duro").length;
  const voteBlando = items.filter((i) => i.vote_class === "blando").length;
  const voteFlotante = items.filter((i) => i.vote_class === "flotante").length;

  // Top encuestadores — parcial si no están todos cargados
  const byEncuestador: Record<string, number> = {};
  for (const item of items) {
    const name = item.encuestador?.split(" ")[0] || "Desconocido";
    byEncuestador[name] = (byEncuestador[name] ?? 0) + 1;
  }
  const topEnc = Object.entries(byEncuestador)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="absolute top-full right-0 mt-2 z-50 w-80 bg-surface rounded-xl border border-border shadow-xl p-4 flex flex-col gap-3">
      {/* Totales reales del backend — siempre correctos */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-surface-hover p-2.5">
          <div className="text-[10px] text-text-tertiary font-medium">Procesados</div>
          <div className="text-lg font-black text-text-secondary">
            {processed}
            <span className="text-[11px] font-medium text-text-tertiary">/{total}</span>
          </div>
        </div>
        <div className="rounded-lg bg-surface-hover p-2.5">
          <div className="text-[10px] text-text-tertiary font-medium">Conversión</div>
          <div className="text-lg font-black text-cyan-600">{conversion}%</div>
        </div>
        <div className="rounded-lg bg-blue-50 p-2.5">
          <div className="text-[10px] text-blue-700 font-medium">Pendiente</div>
          <div className="text-lg font-black text-blue-700">{stats.pendiente}</div>
        </div>
        <div className="rounded-lg bg-sky-50 p-2.5">
          <div className="text-[10px] text-sky-700 font-medium">Contactado</div>
          <div className="text-lg font-black text-sky-600">{stats.contactado}</div>
        </div>
      </div>

      {/* Desglose de votos — desde items en memoria, puede ser parcial */}
      <div>
        <div className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mb-1.5">
          Respondidos — {stats.respondido} total
          {respondidoIsPartial && <span className="text-text-tertiary font-normal ml-1">(desglose parcial)</span>}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <div className="rounded-lg bg-emerald-50 p-2">
            <div className="text-[9px] text-emerald-700 font-medium">Voto Duro</div>
            <div className="text-base font-black text-emerald-700">
              {voteDuro}{respondidoIsPartial ? "+" : ""}
            </div>
          </div>
          <div className="rounded-lg bg-yellow-50 p-2">
            <div className="text-[9px] text-yellow-700 font-medium">Voto Blando</div>
            <div className="text-base font-black text-yellow-600">
              {voteBlando}{respondidoIsPartial ? "+" : ""}
            </div>
          </div>
          <div className="rounded-lg bg-violet-50 p-2">
            <div className="text-[9px] text-violet-700 font-medium">Flotante</div>
            <div className="text-base font-black text-violet-600">
              {voteFlotante}{respondidoIsPartial ? "+" : ""}
            </div>
          </div>
        </div>
      </div>

      {/* Top encuestadores */}
      {topEnc.length > 0 && (
        <div>
          <div className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mb-1.5">
            Top encuestadores
            {items.length < total && <span className="text-text-tertiary font-normal ml-1">(parcial)</span>}
          </div>
          {topEnc.map(([name, count]) => (
            <div key={name} className="flex items-center gap-2 py-0.5">
              <span className="text-[11px] text-text-secondary font-medium flex-1 truncate">{name}</span>
              <div className="h-1.5 rounded-full bg-surface-active w-16">
                <div
                  className="h-full rounded-full bg-indigo-400 transition-all"
                  style={{ width: `${Math.min((count / (topEnc[0]?.[1] ?? 1)) * 100, 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-text-tertiary tabular-nums w-4">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
