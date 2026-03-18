"use client";

import { useCallback, useEffect, useRef } from "react";
import type { LogEntry } from "./types";
import { ModalRow } from "./log-modal-row";

/* ========== Types ========== */

type Props = {
  open: boolean;
  onClose: () => void;
  entries: LogEntry[];
  onEntryClick: (entry: LogEntry) => void;
  /** User role — only admin/consultor can edit/delete */
  userRole?: string;
  /** Called when a form entry is deleted */
  onDelete?: (formId: string, campaignId: string) => Promise<boolean>;
  /** Called when a form entry is updated */
  onUpdate?: (formId: string, campaignId: string, updates: Record<string, string>) => Promise<boolean>;
};

const CAN_EDIT_ROLES = new Set(["admin", "consultor"]);

function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}

/* ========== Component ========== */

export function LogModal({ open, onClose, entries, onEntryClick, userRole, onDelete, onUpdate }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const canEdit = CAN_EDIT_ROLES.has(userRole ?? "");

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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-[min(92vw,960px)] max-h-[min(88vh,720px)] flex flex-col overflow-hidden animate-[modal-in_0.2s_ease-out]">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" x2="8" y1="13" y2="13" />
                <line x1="16" x2="8" y1="17" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-slate-800">Registro de datos</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">{formEntries.length} registros capturados</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer transition-colors"
            aria-label="Cerrar"
          >
            <IconClose />
          </button>
        </div>

        {/* ── Table header ── */}
        <div className="grid items-center shrink-0 border-b border-slate-200 bg-slate-50/80 px-5 py-2 gap-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider"
          style={{ gridTemplateColumns: canEdit ? "minmax(0,2.5fr) minmax(0,2fr) minmax(0,1.2fr) 76px 64px" : "minmax(0,2.5fr) minmax(0,2fr) minmax(0,1.2fr) 76px" }}
        >
          <span>Nombre</span>
          <span>Encuestador</span>
          <span>Zona</span>
          <span className="text-right">Fecha</span>
          {canEdit && <span className="text-center">Acciones</span>}
        </div>

        {/* ── Table body ── */}
        <div className="flex-1 overflow-y-auto">
          {formEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <span className="text-sm text-slate-400">Sin registros</span>
            </div>
          ) : (
            formEntries.map((entry, idx) => (
              <ModalRow
                key={entry.id}
                entry={entry}
                onEntryClick={onEntryClick}
                even={idx % 2 === 0}
                canEdit={canEdit}
                onDelete={onDelete}
                onUpdate={onUpdate}
              />
            ))
          )}
        </div>
      </div>

      {/* Animation keyframe */}
      <style>{`
        @keyframes modal-in {
          from { opacity: 0; transform: scale(0.97) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}


