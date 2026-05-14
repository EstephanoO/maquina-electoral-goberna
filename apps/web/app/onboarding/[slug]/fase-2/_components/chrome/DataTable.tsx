"use client";

import type { ReactNode } from "react";

/**
 * Tabla con header amber + cuerpo blanco/gris. Estilo PDF Goberna:
 * encabezados negros sobre amarillo, filas con borde delgado, primera
 * columna en bold navy.
 */
interface Column {
  key: string;
  label: string;
  /** Ancho relativo (fr) o fijo (px/%). */
  width?: string;
  align?: "left" | "center" | "right";
}

interface Props {
  columns: Column[];
  rows: Array<Record<string, ReactNode>>;
  /** Si true, primera columna en bold navy (como el PDF). */
  emphasizeFirst?: boolean;
  compact?: boolean;
}

export function DataTable({
  columns,
  rows,
  emphasizeFirst = true,
  compact = false,
}: Props) {
  const cellPad = compact ? "px-3 py-2" : "px-4 py-3";
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-amber-400 text-[#0a1f4a]">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`${cellPad} font-black uppercase tracking-wide text-xs sm:text-sm whitespace-nowrap`}
                style={{
                  textAlign: c.align ?? "left",
                  ...(c.width ? { width: c.width } : {}),
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}
            >
              {columns.map((c, ci) => (
                <td
                  key={c.key}
                  className={`${cellPad} border-t border-slate-200 align-top ${
                    emphasizeFirst && ci === 0
                      ? "font-bold text-[#0a1f4a]"
                      : "text-slate-700"
                  }`}
                  style={{ textAlign: c.align ?? "left" }}
                >
                  {row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
