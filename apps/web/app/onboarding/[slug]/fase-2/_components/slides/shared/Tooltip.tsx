"use client";
import { useEffect, useState } from "react";

export interface TooltipData {
  title?: string;
  body: string;
  fuente?: string;
}

let showFn: ((data: TooltipData, x: number, y: number) => void) | null = null;
let hideFn: (() => void) | null = null;

export function useTooltip() {
  return {
    show: (data: TooltipData, e: React.MouseEvent) => showFn?.(data, e.clientX, e.clientY),
    hide: () => hideFn?.(),
  };
}

export function TooltipProvider() {
  const [tooltip, setTooltip] = useState<(TooltipData & { x: number; y: number }) | null>(null);

  useEffect(() => {
    showFn = (data, x, y) => setTooltip({ ...data, x, y });
    hideFn = () => setTooltip(null);
    return () => {
      showFn = null;
      hideFn = null;
    };
  }, []);

  if (!tooltip) return null;

  return (
    <div
      className="fixed z-50 pointer-events-none max-w-[220px] bg-[#0d1b3e] border border-white/15 rounded-xl p-3 shadow-2xl backdrop-blur-sm"
      style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
    >
      {tooltip.title && (
        <p className="text-[9px] uppercase tracking-widest text-amber-400/70 font-bold mb-1">
          {tooltip.title}
        </p>
      )}
      <p className="text-[11px] text-white/80 leading-relaxed">{tooltip.body}</p>
      {tooltip.fuente && (
        <p className="text-[9px] text-white/30 mt-1.5 border-t border-white/10 pt-1.5">
          Fuente: {tooltip.fuente}
        </p>
      )}
    </div>
  );
}
