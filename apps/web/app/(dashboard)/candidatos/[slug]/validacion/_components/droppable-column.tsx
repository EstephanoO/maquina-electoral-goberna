"use client";

import { useDroppable } from "@dnd-kit/core";
import { useEffect, useRef, useState, useMemo, type ReactNode } from "react";
import type { ColumnDef, VisualColumn } from "./constants";
import type { ValidationItem } from "@/lib/services/validacion";

const PAGE_SIZE = 20;

/* ─── Helpers ─── */

function SpinnerIcon() {
  return <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-40" />;
}

type SortKey = "fecha" | "nombre" | "score";

const FLOW_HINTS: Partial<Record<VisualColumn, string>> = {
  contactado: "Arrastra desde Pendiente para iniciar contacto",
  respondido: "Arrastra desde Contactado cuando respondan",
  voto_blando: "Arrastra desde Respondido cuando califiquen",
  voto_duro: "Arrastra desde Respondido — votos seguros",
  invalido: "Arrastra contactos que no pudieron verificarse",
};

export function DroppableColumn({
  col,
  items,
  isOver,
  isBlocked,
  totalItems,
  hasMoreGlobal,
  loadingMore,
  onLoadMore,
  renderCard,
}: {
  col: ColumnDef;
  /** Full filtered items for this column */
  items: ValidationItem[];
  isOver: boolean;
  /** True when a drag is active and this column is NOT a valid drop target */
  isBlocked: boolean;
  totalItems: number;
  hasMoreGlobal: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  renderCard: (item: ValidationItem) => ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: col.key });

  /* ── Sort ── */
  const [sortKey, setSortKey] = useState<SortKey>("fecha");

  const sorted = useMemo(() => {
    const arr = [...items];
    if (sortKey === "nombre") arr.sort((a, b) => a.nombre.localeCompare(b.nombre));
    else if (sortKey === "score") arr.sort((a, b) => b.score - a.score);
    else arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return arr;
  }, [items, sortKey]);

  /* ── Per-column virtual window ── */
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (items.length < visibleCount) setVisibleCount(Math.max(PAGE_SIZE, items.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (visibleCount < items.length) {
          setVisibleCount((v: number) => Math.min(v + PAGE_SIZE, items.length));
        } else if (hasMoreGlobal && !loadingMore) {
          onLoadMore();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleCount, items.length, hasMoreGlobal, loadingMore, onLoadMore]);

  const count = items.length;
  const visibleItems = sorted.slice(0, visibleCount);
  const hiddenCount = count - visibleCount;
  const showSentinel = visibleCount < count || (visibleCount >= count && hasMoreGlobal);

  /* ── Collapse empty columns except pendiente/invalido ── */
  if (count === 0 && !isOver && col.key !== "pendiente" && col.key !== "invalido") {
    return (
      <div
        ref={setNodeRef}
        className={`flex flex-col min-w-[48px] w-12 rounded-xl border bg-white overflow-hidden transition-all duration-300 ${isBlocked ? "opacity-30" : "border-slate-200 opacity-60"
          }`}
        style={{ borderColor: isOver ? col.accent : undefined }}
        title={col.label}
      >
        <div
          className="flex flex-col items-center gap-1 py-3 flex-1 border-b"
          style={{ borderColor: `${col.accent}20`, background: col.bg }}
        >
          <span style={{ color: col.accent }}>{col.icon()}</span>
          <span
            className="text-[9px] font-bold uppercase tracking-widest"
            style={{ color: col.accent, writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            {col.label}
          </span>
          <span
            className="text-[8px] font-black rounded-full w-4 h-4 flex items-center justify-center mt-1"
            style={{ background: `${col.accent}15`, color: col.accent }}
          >
            0
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[220px] w-full rounded-xl border bg-white overflow-hidden transition-all duration-200 ${isBlocked
        ? "opacity-40 saturate-50"
        : isOver
          ? "scale-[1.01] shadow-md"
          : "border-slate-200"
        }`}
      style={{
        borderColor: isOver ? col.accent : undefined,
        boxShadow: isOver ? `0 0 0 2px ${col.accent}40` : undefined,
      }}
    >
      {/* Column header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 border-b shrink-0"
        style={{ borderColor: `${col.accent}20`, background: col.bg }}
      >
        <span style={{ color: col.accent }}>{col.icon()}</span>
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: col.accent }}>
          {col.label}
        </span>
        <span
          className="ml-auto text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center shrink-0"
          style={{ background: `${col.accent}15`, color: col.accent }}
        >
          {totalItems > 0 && totalItems !== count ? totalItems : count}
        </span>
      </div>

      {/* Sort controls */}
      {count > 1 && (
        <div className="flex gap-1 px-2 pt-1.5 pb-0.5 shrink-0">
          {(["fecha", "nombre", "score"] as SortKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setSortKey(k)}
              className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border transition-all cursor-pointer border-none ${sortKey === k
                ? "text-white"
                : "bg-slate-50 text-slate-400 hover:bg-slate-100"
                }`}
              style={sortKey === k ? { background: col.accent } : {}}
            >
              {k === "fecha" ? "Fecha" : k === "nombre" ? "Nombre" : "Puntaje"}
            </button>
          ))}
        </div>
      )}

      {/* Cards area */}
      <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-1.5 min-h-[60px]">
        {count === 0 ? (
          <div
            className={`flex flex-col items-center justify-center py-8 text-center gap-1.5 px-3 transition-colors ${isOver ? "text-slate-600" : "text-slate-300"
              }`}
          >
            {isOver ? (
              <span className="text-[12px] font-semibold text-slate-500">Soltar aquí</span>
            ) : (
              <>
                <span className="text-[11px] font-medium">Sin registros</span>
                {FLOW_HINTS[col.key] && (
                  <span className="text-[10px] leading-tight text-slate-400">
                    {FLOW_HINTS[col.key]}
                  </span>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            {visibleItems.map((item) => renderCard(item))}

            {showSentinel && (
              <div ref={sentinelRef} className="flex items-center justify-center gap-1.5 py-2">
                {loadingMore && visibleCount >= count ? (
                  <>
                    <SpinnerIcon />
                    <span className="text-[10px] text-slate-400">Cargando más…</span>
                  </>
                ) : hiddenCount > 0 ? (
                  <span className="text-[10px] text-slate-400">+{hiddenCount} más</span>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
