"use client";

import { useEffect, useRef } from "react";
import type { LogEntry } from "./types";
import { LOG_ICON_BG, LOG_ICON_LABEL } from "./constants";
import { timeAgo } from "./utils";

/* ========== Types ========== */

type Props = {
  entries: LogEntry[];
  onEntryClick: (entry: LogEntry) => void;
  onClearLog?: () => void;
  primaryColor: string;
};

/* ========== Component ========== */

export function LogTab({ entries, onEntryClick, onClearLog, primaryColor }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(entries.length);

  // Auto-scroll to top when new entries arrive
  useEffect(() => {
    if (entries.length > prevCountRef.current && listRef.current) {
      listRef.current.scrollTop = 0;
    }
    prevCountRef.current = entries.length;
  }, [entries.length]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header row */}
      <div className="flex justify-between items-center px-4 py-2.5 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-[7px] h-[7px] rounded-full bg-teal-600" />
          <span className="text-xs font-bold text-slate-800 tracking-tight">Log Operativo</span>
          <span className="text-[11px] font-bold" style={{ color: primaryColor }}>{entries.length}</span>
        </div>
        {onClearLog && entries.length > 0 && (
          <button
            type="button"
            onClick={onClearLog}
            className="text-[11px] font-semibold text-red-500 bg-red-50 border border-red-200 rounded-md px-2.5 py-1 cursor-pointer transition-all duration-150 hover:bg-red-100"
            aria-label="Limpiar log"
            title="Limpiar log"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Entry list */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-2 py-1">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><title>Sin actividad</title><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            <span className="text-[13px] font-semibold text-slate-500">Sin actividad reciente</span>
            <span className="text-xs text-slate-400">Los eventos aparecerán aquí</span>
          </div>
        ) : (
          entries.map((entry) => {
            const hasLocation = entry.lat != null && entry.lng != null;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => hasLocation && onEntryClick(entry)}
                className={`w-full flex items-center gap-2.5 py-2 px-2.5 rounded-lg border-none bg-transparent text-left transition-colors duration-100 ${hasLocation ? "cursor-pointer hover:bg-slate-50" : "cursor-default"}`}
                title={hasLocation ? "Click para ver en mapa" : undefined}
              >
                {/* Icon */}
                <span
                  className="w-[26px] h-[26px] rounded-[7px] flex items-center justify-center text-white text-xs font-extrabold shrink-0"
                  style={{ backgroundColor: LOG_ICON_BG[entry.type] }}
                >
                  {LOG_ICON_LABEL[entry.type]}
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs leading-snug text-slate-700">
                    <span className="font-bold text-slate-800">{entry.agentName}</span>
                    {" "}
                    <span className="font-normal text-slate-500">{entry.message}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-px">{timeAgo(entry.timestamp)}</span>
                </div>

                {/* Location indicator */}
                {hasLocation && (
                  <span className="text-[8px] shrink-0 opacity-60" style={{ color: primaryColor }}>&#9679;</span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
