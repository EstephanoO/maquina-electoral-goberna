"use client";

import { useCallback, useEffect, useRef } from "react";
import type { LogEntry } from "./types";

/* ========== Types ========== */

type Props = {
  open: boolean;
  onClose: () => void;
  entries: LogEntry[];
  onEntryClick: (entry: LogEntry) => void;
};

/* ========== Helpers ========== */

function formatTime(date: Date): string {
  return date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

/* ========== Grid template — shared between header and rows ========== */

const GRID_COLS = "minmax(0,2fr) minmax(0,2fr) minmax(0,1.2fr) 90px";

/* ========== Component ========== */

export function LogModal({ open, onClose, entries, onEntryClick }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  }, [onClose]);

  if (!open) return null;

  const formEntries = entries.filter((e) => e.type === "form_new");

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-[15px] font-bold text-slate-800">Registro de datos</h2>
            <span className="text-[12px] font-semibold tabular-nums text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-md">
              {formEntries.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer transition-colors"
            aria-label="Cerrar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* ── Table header ── */}
        <div className="grid items-center shrink-0 border-b border-slate-200 bg-slate-50 px-6 py-2.5 gap-3" style={{ gridTemplateColumns: GRID_COLS }}>
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Nombre</span>
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Encuestador</span>
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Zona</span>
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-right">Fecha</span>
        </div>

        {/* ── Table body ── */}
        <div className="flex-1 overflow-y-auto">
          {formEntries.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-slate-400">Sin registros</div>
          ) : (
            formEntries.map((entry, idx) => (
              <ModalRow key={entry.id} entry={entry} onEntryClick={onEntryClick} even={idx % 2 === 0} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ========== Row ========== */

function ModalRow({ entry, onEntryClick, even }: { entry: LogEntry; onEntryClick: (e: LogEntry) => void; even: boolean }) {
  const hasLoc = entry.lat != null && entry.lng != null;
  const ts = entry.timestamp;

  return (
    <div
      role={hasLoc ? "button" : undefined}
      tabIndex={hasLoc ? 0 : undefined}
      onClick={() => hasLoc && onEntryClick(entry)}
      onKeyDown={(e) => { if (hasLoc && (e.key === "Enter" || e.key === " ")) onEntryClick(entry); }}
      className={`grid items-center px-6 py-2.5 gap-3 border-b border-slate-50 transition-colors ${even ? "bg-white" : "bg-slate-50/40"} ${hasLoc ? "cursor-pointer hover:bg-blue-50/50" : ""}`}
      style={{ gridTemplateColumns: GRID_COLS }}
    >
      {/* Nombre + telefono */}
      <div className="min-w-0">
        <span className="text-[12px] font-semibold text-slate-800 block truncate">{entry.nombre || "—"}</span>
        {entry.telefono && (
          <span className="text-[10px] text-slate-400 tabular-nums block">{entry.telefono}</span>
        )}
      </div>

      {/* Encuestador */}
      <span className="text-[12px] text-slate-600 truncate">{entry.encuestador || "—"}</span>

      {/* Zona */}
      <span className="text-[11px] text-slate-500 truncate">{entry.zona || "—"}</span>

      {/* Fecha + hora */}
      <div className="text-right">
        <span className="text-[11px] text-slate-700 tabular-nums block">{formatTime(ts)}</span>
        <span className="text-[9px] text-slate-400 tabular-nums block">{formatDate(ts)}</span>
      </div>
    </div>
  );
}
