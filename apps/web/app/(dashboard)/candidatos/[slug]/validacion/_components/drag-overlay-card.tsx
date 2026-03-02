"use client";

import type { ValidationItem } from "@/lib/services/validacion";
import { WhatsAppIcon, fmtPhone } from "./constants";

/** Lightweight card rendered inside DragOverlay — follows the cursor */
export function DragOverlayCard({ item }: { item: ValidationItem }) {
  const phone = fmtPhone(item.telefono);

  return (
    <div className="w-[220px] rounded-lg border border-slate-200 bg-white p-2.5 shadow-xl rotate-2 opacity-90 pointer-events-none"
      style={{ borderLeftWidth: 3, borderLeftColor: "#2563eb" }}>
      <div className="font-semibold text-[13px] text-slate-800 truncate">
        {item.nombre || "—"}
      </div>
      <div className="flex items-center gap-1.5 mt-1">
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-50 text-green-700 text-[11px] font-bold">
          <WhatsAppIcon />
          {phone}
        </span>
      </div>
    </div>
  );
}
