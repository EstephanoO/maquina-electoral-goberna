"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LogEntry } from "./types";

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

/* ========== Helpers ========== */

function formatTime(date: Date): string {
  return date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

const CAN_EDIT_ROLES = new Set(["admin", "consultor"]);

/* ========== Icons ========== */

function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}

function IconPin() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function Spinner() {
  return <div className="w-3.5 h-3.5 border-[2px] border-current/30 border-t-current rounded-full animate-spin" />;
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

/* ========== Row ========== */

type RowProps = {
  entry: LogEntry;
  onEntryClick: (e: LogEntry) => void;
  even: boolean;
  canEdit: boolean;
  onDelete?: (formId: string, campaignId: string) => Promise<boolean>;
  onUpdate?: (formId: string, campaignId: string, updates: Record<string, string>) => Promise<boolean>;
};

function ModalRow({ entry, onEntryClick, even, canEdit, onDelete, onUpdate }: RowProps) {
  const hasLoc = entry.lat != null && entry.lng != null;
  const ts = entry.timestamp;

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editNombre, setEditNombre] = useState(entry.nombre ?? "");
  const [editTelefono, setEditTelefono] = useState(entry.telefono ?? "");
  const [editZona, setEditZona] = useState(entry.zona ?? "");

  // Action states
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const startEdit = useCallback(() => {
    setEditNombre(entry.nombre ?? "");
    setEditTelefono(entry.telefono ?? "");
    setEditZona(entry.zona ?? "");
    setEditing(true);
    setConfirmDelete(false);
  }, [entry.nombre, entry.telefono, entry.zona]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!entry.formId || !entry.campaignId || !onUpdate) return;
    const updates: Record<string, string> = {};
    if (editNombre.trim() !== (entry.nombre ?? "")) updates.nombre = editNombre.trim();
    if (editTelefono.trim() !== (entry.telefono ?? "")) updates.telefono = editTelefono.trim();
    if (editZona.trim() !== (entry.zona ?? "")) updates.zona = editZona.trim();

    if (Object.keys(updates).length === 0) { setEditing(false); return; }

    setSaving(true);
    const ok = await onUpdate(entry.formId, entry.campaignId, updates);
    setSaving(false);
    if (ok) setEditing(false);
  }, [entry.formId, entry.campaignId, entry.nombre, entry.telefono, entry.zona, editNombre, editTelefono, editZona, onUpdate]);

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    if (!entry.formId || !entry.campaignId || !onDelete) return;
    setSaving(true);
    const ok = await onDelete(entry.formId, entry.campaignId);
    setSaving(false);
    if (ok) setDeleted(true);
    setConfirmDelete(false);
  }, [confirmDelete, entry.formId, entry.campaignId, onDelete]);

  const handleDeleteBlur = useCallback(() => {
    setTimeout(() => setConfirmDelete(false), 200);
  }, []);

  // Handle Enter/Escape in edit mode
  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); saveEdit(); }
    if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
  }, [saveEdit, cancelEdit]);

  if (deleted) return null;

  const gridCols = canEdit
    ? "minmax(0,2.5fr) minmax(0,2fr) minmax(0,1.2fr) 76px 64px"
    : "minmax(0,2.5fr) minmax(0,2fr) minmax(0,1.2fr) 76px";

  /* ─── Edit mode ─── */
  if (editing) {
    return (
      <div
        className="grid items-center px-5 py-2 gap-2 border-b border-blue-100 bg-blue-50/40"
        style={{ gridTemplateColumns: gridCols }}
      >
        {/* Nombre + telefono */}
        <div className="flex flex-col gap-1 min-w-0">
          <input
            type="text"
            value={editNombre}
            onChange={(e) => setEditNombre(e.target.value)}
            onKeyDown={handleEditKeyDown}
            className="text-[12px] font-semibold text-slate-800 bg-white border border-blue-200 rounded-md px-2 py-1 outline-none focus:border-blue-400 w-full"
            placeholder="Nombre"
            autoFocus
          />
          <input
            type="text"
            value={editTelefono}
            onChange={(e) => setEditTelefono(e.target.value)}
            onKeyDown={handleEditKeyDown}
            className="text-[11px] text-slate-500 bg-white border border-blue-200 rounded-md px-2 py-0.5 outline-none focus:border-blue-400 w-full tabular-nums"
            placeholder="Telefono"
          />
        </div>

        {/* Encuestador (read-only) */}
        <span className="text-[12px] text-slate-400 italic break-words">{entry.encuestador || "—"}</span>

        {/* Zona */}
        <input
          type="text"
          value={editZona}
          onChange={(e) => setEditZona(e.target.value)}
          onKeyDown={handleEditKeyDown}
          className="text-[11px] text-slate-600 bg-white border border-blue-200 rounded-md px-2 py-1 outline-none focus:border-blue-400 w-full"
          placeholder="Zona"
        />

        {/* Fecha (read-only) */}
        <div className="text-right">
          <span className="text-[11px] text-slate-400 tabular-nums">{formatTime(ts)}</span>
        </div>

        {/* Save / Cancel */}
        <div className="flex justify-center gap-1">
          <button
            type="button"
            onClick={saveEdit}
            disabled={saving}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-emerald-600 bg-emerald-50 hover:bg-emerald-100 cursor-pointer transition-colors disabled:opacity-50"
            title="Guardar"
          >
            {saving ? <Spinner /> : <IconCheck />}
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 cursor-pointer transition-colors"
            title="Cancelar"
          >
            <IconX />
          </button>
        </div>
      </div>
    );
  }

  /* ─── Normal mode ─── */
  return (
    <div
      role={hasLoc ? "button" : undefined}
      tabIndex={hasLoc ? 0 : undefined}
      onClick={() => hasLoc && onEntryClick(entry)}
      onKeyDown={(e) => { if (hasLoc && (e.key === "Enter" || e.key === " ")) onEntryClick(entry); }}
      className={`group grid items-center px-5 py-2.5 gap-2 border-b border-slate-100/80 transition-colors ${even ? "bg-white" : "bg-slate-50/30"} ${hasLoc ? "cursor-pointer hover:bg-blue-50/40" : ""}`}
      style={{ gridTemplateColumns: gridCols }}
    >
      {/* Nombre + telefono */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-semibold text-slate-800 break-words leading-snug">{entry.nombre || "—"}</span>
          {hasLoc && (
            <span className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <IconPin />
            </span>
          )}
        </div>
        {entry.telefono && (
          <span className="text-[10px] text-slate-400 tabular-nums block mt-0.5">{entry.telefono}</span>
        )}
      </div>

      {/* Encuestador */}
      <span className="text-[12px] text-slate-600 break-words leading-snug">{entry.encuestador || "—"}</span>

      {/* Zona */}
      <span className="text-[11px] text-slate-500 break-words leading-snug">{entry.zona || "—"}</span>

      {/* Fecha */}
      <div className="text-right">
        <span className="text-[11px] text-slate-700 tabular-nums block">{formatTime(ts)}</span>
        <span className="text-[9px] text-slate-400 tabular-nums block">{formatDate(ts)}</span>
      </div>

      {/* Actions */}
      {canEdit && (
        <div className="flex justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          {entry.formId ? (
            <>
              <button
                type="button"
                onClick={startEdit}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer transition-colors"
                title="Editar"
              >
                <IconEdit />
              </button>
              <button
                type="button"
                onClick={handleDelete}
                onBlur={handleDeleteBlur}
                disabled={saving}
                className={`w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-all ${
                  confirmDelete
                    ? "bg-red-100 text-red-600 hover:bg-red-200"
                    : "text-slate-400 hover:text-red-500 hover:bg-red-50"
                } ${saving ? "opacity-50 pointer-events-none" : ""}`}
                title={confirmDelete ? "Confirmar eliminar" : "Eliminar"}
              >
                {saving ? <Spinner /> : <IconTrash />}
              </button>
            </>
          ) : (
            <span className="w-[60px]" />
          )}
        </div>
      )}
    </div>
  );
}
