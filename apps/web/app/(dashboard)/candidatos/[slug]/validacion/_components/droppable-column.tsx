"use client";

import { useDroppable } from "@dnd-kit/core";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ColumnDef } from "./constants";

const PAGE_SIZE = 20;

function SpinnerIcon() {
  return (
    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-40" />
  );
}

export function DroppableColumn({
  col,
  count,
  isOver,
  totalItems,
  hasMoreGlobal,
  loadingMore,
  onLoadMore,
  children,
}: {
  col: ColumnDef;
  /** Number of items currently rendered in this column (after client-side filtering) */
  count: number;
  isOver: boolean;
  /** Total items available across all pages (including unloaded) */
  totalItems: number;
  /** Whether the backend has more pages to fetch */
  hasMoreGlobal: boolean;
  /** Whether a global page fetch is in progress */
  loadingMore: boolean;
  /** Callback to trigger fetching the next page from the backend */
  onLoadMore: () => void;
  children: ReactNode[];
}) {
  const { setNodeRef } = useDroppable({ id: col.key });

  /* ── Per-column virtual window ── */
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset visible count when the column's item count drops (e.g. after search clears)
  useEffect(() => {
    if (count < visibleCount) setVisibleCount(Math.max(PAGE_SIZE, count));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  // Intersection Observer: reveal more cards or fetch next page
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;

        if (visibleCount < count) {
          // More items already loaded client-side → show them
          setVisibleCount((v) => Math.min(v + PAGE_SIZE, count));
        } else if (hasMoreGlobal && !loadingMore) {
          // Exhausted local items → ask parent to fetch next page
          onLoadMore();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleCount, count, hasMoreGlobal, loadingMore, onLoadMore]);

  const visibleChildren = (children as ReactNode[]).slice(0, visibleCount);
  const hiddenCount = count - visibleCount;
  const showSentinel = visibleCount < count || (visibleCount >= count && hasMoreGlobal);

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[220px] w-full rounded-xl border bg-white overflow-hidden transition-all duration-200 ${isOver ? "scale-[1.01] shadow-md" : "border-slate-200"
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
        <span
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: col.accent }}
        >
          {col.label}
        </span>
        <span
          className="ml-auto text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center"
          style={{ background: `${col.accent}15`, color: col.accent }}
        >
          {totalItems > 0 && totalItems !== count ? totalItems : count}
        </span>
      </div>

      {/* Cards area */}
      <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-1.5 min-h-[60px]">
        {count === 0 ? (
          <div
            className={`flex items-center justify-center py-8 text-[11px] transition-colors ${isOver ? "text-slate-500 font-medium" : "text-slate-300"
              }`}
          >
            {isOver ? "Soltar aquí" : "Sin registros"}
          </div>
        ) : (
          <>
            {visibleChildren}

            {/* Sentinel + load-more indicator */}
            {showSentinel && (
              <div ref={sentinelRef} className="flex items-center justify-center gap-1.5 py-2">
                {loadingMore && visibleCount >= count ? (
                  <>
                    <SpinnerIcon />
                    <span className="text-[10px] text-slate-400">Cargando más…</span>
                  </>
                ) : hiddenCount > 0 ? (
                  <span className="text-[10px] text-slate-400">
                    +{hiddenCount} más
                  </span>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
