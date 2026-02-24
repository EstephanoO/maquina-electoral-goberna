"use client";

import { useCallback, useEffect, useRef } from "react";
import type { LogEntry } from "./types";
import { timeAgo } from "./utils";

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

  const formEntries = entries.filter((e) => e.type === "form_new" || e.type === "form_submitted");

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
              {formEntries.length} registros
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
        <div className="grid shrink-0 border-b border-slate-100 bg-slate-50/80 px-6 py-2" style={{ gridTemplateColumns: "1fr 1fr 1fr 80px 44px" }}>
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Nombre</span>
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Encuestador</span>
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Zona</span>
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right">Hora</span>
          <span />
        </div>

        {/* ── Table body ── */}
        <div className="flex-1 overflow-y-auto">
          {formEntries.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-slate-400">Sin registros</div>
          ) : (
            formEntries.map((entry) => (
              <ModalRow key={entry.id} entry={entry} onEntryClick={onEntryClick} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ========== Row ========== */

function ModalRow({ entry, onEntryClick }: { entry: LogEntry; onEntryClick: (e: LogEntry) => void }) {
  const hasLoc = entry.lat != null && entry.lng != null;
  const ts = entry.timestamp;

  return (
    <button
      type="button"
      onClick={() => hasLoc && onEntryClick(entry)}
      className={`w-full grid items-center px-6 py-2 border-b border-slate-50 transition-colors text-left ${hasLoc ? "cursor-pointer hover:bg-blue-50/40" : "cursor-default"}`}
      style={{ gridTemplateColumns: "1fr 1fr 1fr 80px 44px" }}
    >
      {/* Nombre */}
      <div className="min-w-0 pr-2">
        <span className="text-[12px] font-semibold text-slate-800 truncate block">{entry.nombre || "—"}</span>
        {entry.telefono && (
          <span className="text-[10px] text-slate-400 tabular-nums truncate block">{entry.telefono}</span>
        )}
      </div>

      {/* Encuestador */}
      <span className="text-[12px] text-slate-600 truncate pr-2">{entry.encuestador || "—"}</span>

      {/* Zona */}
      <span className="text-[11px] text-slate-500 truncate pr-2">{entry.zona || "—"}</span>

      {/* Hora */}
      <div className="text-right pr-1">
        <span className="text-[11px] text-slate-600 tabular-nums block">{formatTime(ts)}</span>
        <span className="text-[9px] text-slate-400 tabular-nums block">{formatDate(ts)}</span>
      </div>

      {/* Location indicator */}
      <div className="flex justify-center">
        {hasLoc && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
        )}
      </div>
    </button>
  );
}
