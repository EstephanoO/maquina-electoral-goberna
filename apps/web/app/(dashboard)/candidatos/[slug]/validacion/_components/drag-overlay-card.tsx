"use client";

import type { ValidationItem } from "@/lib/services/validacion";
import { VOTE_BADGES, WhatsAppIcon, fmtPhone, type VisualColumn, COLUMNS } from "./constants";

/**
 * Card rendered in DragOverlay — follows the cursor with elevated visual treatment.
 * Matches the real card layout but with enhanced shadow + slight tilt.
 */
export function DragOverlayCard({
  item,
  targetColumn,
}: {
  item: ValidationItem;
  targetColumn?: VisualColumn | null;
}) {
  const phone = fmtPhone(item.telefono);
  const voteBadge = item.vote_class ? VOTE_BADGES[item.vote_class] : null;
  const colDef = targetColumn ? COLUMNS.find((c) => c.key === targetColumn) : null;
  const accentColor = colDef?.accent ?? "#64748b";

  return (
    <div
      className="w-[220px] rounded-lg bg-white pointer-events-none"
      style={{
        boxShadow: "0 12px 40px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.1)",
        transform: "rotate(2deg) scale(1.02)",
      }}
    >
      {/* Accent strip */}
      <div
        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full transition-colors duration-200"
        style={{ backgroundColor: accentColor }}
      />

      <div className="pl-3.5 pr-2.5 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-[13px] text-slate-800 truncate leading-tight">
            {item.nombre || "\u2014"}
          </span>
          {voteBadge && (
            <span
              className="text-[7px] font-black px-1.5 py-0.5 rounded-full shrink-0 tracking-wider uppercase"
              style={{ color: voteBadge.color, background: voteBadge.bg }}
            >
              {voteBadge.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-50/80 text-green-700 text-[11px] font-semibold">
            <WhatsAppIcon />
            {phone}
          </span>
        </div>
        {/* Target hint */}
        {colDef && (
          <div
            className="mt-2 pt-1.5 border-t border-slate-100/80 flex items-center gap-1 text-[10px] font-semibold"
            style={{ color: accentColor }}
          >
            <span style={{ color: accentColor }}>{colDef.icon()}</span>
            {colDef.label}
          </div>
        )}
      </div>
    </div>
  );
}
