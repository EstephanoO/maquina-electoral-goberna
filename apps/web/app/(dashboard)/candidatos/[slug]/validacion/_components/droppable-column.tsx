"use client";

import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";
import type { ColumnDef } from "./constants";

export function DroppableColumn({
  col,
  count,
  isOver,
  children,
}: {
  col: ColumnDef;
  count: number;
  isOver: boolean;
  children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: col.key });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[220px] w-full rounded-xl border bg-white overflow-hidden transition-all duration-200 ${
        isOver ? "scale-[1.01] shadow-md" : "border-slate-200"
      }`}
      style={{ borderColor: isOver ? col.accent : undefined, boxShadow: isOver ? `0 0 0 2px ${col.accent}40` : undefined }}
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
          {count}
        </span>
      </div>
      {/* Cards area */}
      <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-1.5 min-h-[60px]">
        {count === 0 ? (
          <div className={`flex items-center justify-center py-8 text-[11px] transition-colors ${
            isOver ? "text-slate-500 font-medium" : "text-slate-300"
          }`}>
            {isOver ? "Soltar aquí" : "Sin registros"}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
