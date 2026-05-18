"use client";
import type { TooltipData } from "./Tooltip";
import { useTooltip } from "./Tooltip";

interface Props {
  label: string;
  value: string;
  size?: "lg" | "sm";
  mono?: boolean;
  tip?: TooltipData;
}

export function StatMega({ label, value, size = "lg", mono, tip }: Props) {
  const tooltip = useTooltip();
  return (
    <div
      className={tip ? "cursor-help" : ""}
      onMouseEnter={tip ? (e) => tooltip.show(tip, e) : undefined}
      onMouseLeave={tip ? tooltip.hide : undefined}
    >
      <p className="text-[9px] uppercase tracking-widest text-white/30 font-semibold mb-1">
        {label}
      </p>
      <p
        className={`font-black text-white leading-none ${size === "lg" ? "text-3xl" : "text-lg"} ${mono ? "font-mono" : ""}`}
      >
        {value}
        {tip && (
          <span className="ml-1.5 text-[10px] text-amber-400/50 align-super">?</span>
        )}
      </p>
    </div>
  );
}
