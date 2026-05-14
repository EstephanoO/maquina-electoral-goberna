"use client";

import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Lista de bullets con check-circles amarillos — patrón "War Room
 * services" del PDF Goberna. Itera items y los renderiza con label
 * (bold) opcional + descripcion.
 */
interface Item {
  /** Label en bold (primera parte del bullet). */
  label?: string;
  /** Descripción / continuación normal. */
  text: ReactNode;
}

interface Props {
  items: Item[];
  /** Color del check. Default amber. */
  iconColor?: "amber" | "navy";
  compact?: boolean;
}

export function CheckList({
  items,
  iconColor = "amber",
  compact = false,
}: Props) {
  const iconCls =
    iconColor === "amber" ? "text-amber-500" : "text-[#0a1f4a]";
  const spacing = compact ? "space-y-2" : "space-y-3";
  return (
    <ul className={`${spacing} text-slate-700`}>
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-3 leading-snug">
          <CheckCircle2 className={`${iconCls} shrink-0 size-5 mt-0.5`} />
          <span>
            {it.label ? (
              <span className="font-bold text-[#0a1f4a]">{it.label}</span>
            ) : null}
            {it.label ? " " : ""}
            {it.text}
          </span>
        </li>
      ))}
    </ul>
  );
}
