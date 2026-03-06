"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ColumnDef, VisualColumn } from "./constants";
import type { ValidationItem } from "@/lib/services/validacion";

const PAGE_SIZE = 20;

function SpinnerIcon() {
  return <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin opacity-40" />;
}

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="11" height="11" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
      className={`transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

const FLOW_HINTS: Partial<Record<VisualColumn, string>> = {
  contactado: "Arrastra desde Pendiente",
  respondido: "Arrastra desde Contactado",
  voto_blando: "Clasifica como Voto Blando",
  voto_duro: "Clasifica como Voto Duro",
  voto_flotante: "Clasifica como Voto Flotante",
  imposible: "Contactos no verificables",
};

export function DroppableColumn({
  col,
  items,
  isOver,
  isBlocked,
  totalItems,
  totalIsPartial = false,
  hasMoreGlobal,
  loadingMore,
  collapsed,
  onToggleCollapse,
  onLoadMore,
  renderCard,
}: {
  col: ColumnDef;
  items: ValidationItem[];
  isOver: boolean;
  isBlocked: boolean;
  totalItems: number;
  totalIsPartial?: boolean;
  hasMoreGlobal: boolean;
  loadingMore: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onLoadMore: () => void;
  renderCard: (item: ValidationItem) => ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: col.key });

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
  const visibleItems = items.slice(0, visibleCount);
  const hiddenCount = count - visibleCount;
  const showSentinel = visibleCount < count || (visibleCount >= count && hasMoreGlobal);

  const itemIds = visibleItems.map((i) => i.id);

  /* ── Collapsed view ── */
  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        role="button"
        tabIndex={0}
        onClick={onToggleCollapse}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onToggleCollapse(); }}
        className={`
          flex flex-col min-w-[40px] w-10 rounded-xl bg-white overflow-hidden
          transition-all duration-300 cursor-pointer select-none border
          ${isBlocked ? "opacity-20 border-slate-100" : "border-slate-200 hover:border-slate-300 hover:shadow-sm"}
        `}
        title={`Expandir ${col.label}`}
      >
        <div
          className="flex flex-col items-center gap-2 py-3 flex-1"
          style={{ borderLeft: `3px solid ${col.accent}`, background: col.bg }}
        >
          <span style={{ color: col.accent }}>{col.icon()}</span>
          <span
            className="text-[8px] font-bold uppercase tracking-widest flex-1"
            style={{ color: col.accent, writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            {col.label}
          </span>
          <span
            className="text-[10px] font-black rounded-full min-w-[20px] h-5 flex items-center justify-center px-1"
            style={{ background: `${col.accent}15`, color: col.accent }}
          >
            {totalItems}{totalIsPartial ? "+" : ""}
          </span>
        </div>
      </div>
    );
  }

  /* ── Auto-collapse empty non-essential columns ── */
  if (count === 0 && !isOver && col.key !== "pendiente" && col.key !== "imposible") {
    return (
      <div
        ref={setNodeRef}
        className={`
          flex flex-col min-w-[44px] w-11 rounded-xl bg-white overflow-hidden
          transition-all duration-300 border
          ${isBlocked ? "opacity-20 border-slate-100" : "border-slate-200 opacity-50 hover:opacity-70"}
        `}
        title={col.label}
      >
        <div
          className="flex flex-col items-center gap-1 py-3 flex-1"
          style={{ borderLeft: `3px solid ${col.accent}30`, background: col.bg }}
        >
          <span style={{ color: col.accent }} className="opacity-60">{col.icon()}</span>
          <span
            className="text-[8px] font-bold uppercase tracking-widest"
            style={{ color: col.accent, writingMode: "vertical-rl", transform: "rotate(180deg)", opacity: 0.6 }}
          >
            {col.label}
          </span>
          <span
            className="text-[8px] font-black rounded-full w-4 h-4 flex items-center justify-center mt-1"
            style={{ background: `${col.accent}10`, color: col.accent, opacity: 0.5 }}
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
      className={`
        flex flex-col min-w-[220px] w-full rounded-xl bg-white overflow-hidden
        transition-all duration-200 border
        ${isBlocked
          ? "opacity-30 saturate-0 border-slate-100 scale-[0.98]"
          : isOver
            ? "border-transparent shadow-lg scale-[1.01]"
            : "border-slate-200 hover:border-slate-300"
        }
      `}
      style={{
        boxShadow: isOver
          ? `0 0 0 2px ${col.accent}, 0 8px 24px ${col.accent}20`
          : undefined,
      }}
    >
      {/* Column header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b shrink-0"
        style={{ borderColor: `${col.accent}15`, background: col.bg }}
      >
        <span style={{ color: col.accent }}>{col.icon()}</span>
        <span className="text-[11px] font-bold uppercase tracking-wider flex-1" style={{ color: col.accent }}>
          {col.label}
        </span>
        <span
          className="text-[10px] font-black rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 shrink-0"
          style={{ background: `${col.accent}15`, color: col.accent }}
        >
          {totalItems}{totalIsPartial ? "+" : ""}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-black/5 transition-colors cursor-pointer border-none bg-transparent shrink-0"
          title="Colapsar columna"
          aria-label={`Colapsar ${col.label}`}
          style={{ color: col.accent }}
        >
          <CollapseIcon collapsed={false} />
        </button>
      </div>

      {/* Cards area */}
      <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-1.5 min-h-[60px]">
        {count === 0 ? (
          <div
            className={`
              flex flex-col items-center justify-center py-10 text-center gap-2 px-4
              transition-all duration-200
              ${isOver ? "scale-105" : ""}
            `}
          >
            {isOver ? (
              <>
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: `${col.accent}15`, color: col.accent }}
                >
                  {col.icon()}
                </div>
                <span className="text-[12px] font-bold" style={{ color: col.accent }}>
                  Soltar aqui
                </span>
              </>
            ) : (
              <>
                <span className="text-[11px] font-medium text-slate-300">Sin registros</span>
                {FLOW_HINTS[col.key] && (
                  <span className="text-[10px] leading-tight text-slate-300">
                    {FLOW_HINTS[col.key]}
                  </span>
                )}
              </>
            )}
          </div>
        ) : (
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            {visibleItems.map((item: ValidationItem) => renderCard(item))}
          </SortableContext>
        )}

        {showSentinel && (
          <div ref={sentinelRef} className="flex items-center justify-center gap-1.5 py-2">
            {loadingMore && visibleCount >= count ? (
              <>
                <SpinnerIcon />
                <span className="text-[10px] text-slate-400">Cargando...</span>
              </>
            ) : hiddenCount > 0 ? (
              <span className="text-[10px] text-slate-300">+{hiddenCount} mas</span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
