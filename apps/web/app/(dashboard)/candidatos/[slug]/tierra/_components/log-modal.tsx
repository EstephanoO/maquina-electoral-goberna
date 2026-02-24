"use client";

import { useCallback, useEffect, useRef } from "react";
import type { LogEntry } from "./types";
import { LOG_ICON_BG, LOG_ICON_LABEL } from "./constants";
import { timeAgo } from "./utils";

/* ========== Types ========== */

type Props = {
  open: boolean;
  onClose: () => void;
  entries: LogEntry[];
  onEntryClick: (entry: LogEntry) => void;
};

/* ========== Component ========== */

export function LogModal({ open, onClose, entries, onEntryClick }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Close on backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  }, [onClose]);

  if (!open) return null;

  const formEntries = entries.filter((e) => e.type === "form_new" || e.type === "form_submitted");
  const otherEntries = entries.filter((e) => e.type !== "form_new" && e.type !== "form_submitted");

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-slate-800">Registro de actividad</h2>
            <span className="text-[11px] font-semibold tabular-nums text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">{entries.length}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer transition-colors"
            aria-label="Cerrar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto">
          {/* Form submissions section */}
          {formEntries.length > 0 && (
            <div>
              <div className="sticky top-0 z-10 bg-slate-50 px-5 py-2 border-b border-slate-100">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  Registros de campo ({formEntries.length})
                </span>
              </div>
              {formEntries.map((entry) => (
                <ModalLogRow key={entry.id} entry={entry} onEntryClick={onEntryClick} />
              ))}
            </div>
          )}

          {/* Other events section */}
          {otherEntries.length > 0 && (
            <div>
              <div className="sticky top-0 z-10 bg-slate-50 px-5 py-2 border-b border-slate-100">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  Conexiones ({otherEntries.length})
                </span>
              </div>
              {otherEntries.map((entry) => (
                <ModalLogRow key={entry.id} entry={entry} onEntryClick={onEntryClick} />
              ))}
            </div>
          )}

          {entries.length === 0 && (
            <div className="flex items-center justify-center py-16 text-sm text-slate-400">Sin actividad registrada</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ========== Row ========== */

function ModalLogRow({ entry, onEntryClick }: { entry: LogEntry; onEntryClick: (e: LogEntry) => void }) {
  const hasLoc = entry.lat != null && entry.lng != null;
  const isForm = entry.type === "form_new" || entry.type === "form_submitted";

  return (
    <button
      type="button"
      onClick={() => hasLoc && onEntryClick(entry)}
      className={`w-full flex items-start gap-3 px-5 py-2.5 border-b border-slate-50 transition-colors text-left ${hasLoc ? "cursor-pointer hover:bg-blue-50/40" : "cursor-default"}`}
    >
      {/* Icon */}
      <span
        className="w-[26px] h-[26px] rounded-lg flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-sm mt-0.5"
        style={{ backgroundColor: LOG_ICON_BG[entry.type] }}
      >
        {LOG_ICON_LABEL[entry.type]}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-slate-800 truncate">{entry.agentName}</span>
          <span className="text-[11px] text-slate-500 truncate">{entry.message}</span>
        </div>

        {/* Enriched form data */}
        {isForm && (entry.nombre || entry.telefono || entry.zona) && (
          <div className="flex items-center gap-3 mt-0.5">
            {entry.nombre && (
              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                {entry.nombre}
              </span>
            )}
            {entry.telefono && (
              <span className="text-[10px] text-slate-500 flex items-center gap-1 tabular-nums">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                {entry.telefono}
              </span>
            )}
            {entry.zona && (
              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                {entry.zona}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Timestamp + location indicator */}
      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
        <span className="text-[10px] text-slate-400 tabular-nums">{timeAgo(entry.timestamp)}</span>
        {hasLoc && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
        )}
      </div>
    </button>
  );
}
