"use client";

import { useState, useMemo, useCallback } from "react";
import type { FormRecord } from "@/lib/services";
import { deleteFormsBatch } from "@/lib/services";
import { DatosEditModal } from "./datos-edit-modal";

/* ========== Types ========== */

type SortKey = "created_at" | "nombre" | "encuestador" | "zona";
type Props = {
  forms: FormRecord[];
  isLoading: boolean;
  primaryColor: string;
  campaignName: string;
  campaignId: string;
  userRole: string;
  onUpdateForm: (formId: string, campaignId: string, updates: Record<string, string>) => Promise<boolean>;
  onDeleteForm: (formId: string, campaignId: string) => Promise<boolean>;
  onFormsChanged: () => void;
};

const PAGE_SIZE = 25;
const EDITABLE_ROLES = new Set(["admin", "consultor", "candidato"]);

/* ========== CSV helpers ========== */

const CSV_HEADERS = ["Nombre", "Telefono", "Zona", "Encuestador", "Candidato Preferido", "Comentarios", "Latitud", "Longitud", "Fecha Registro", "Fecha Captura"] as const;

function esc(v: string | null | undefined): string { if (v == null) return ""; const s = String(v); return (s.includes(",") || s.includes('"') || s.includes("\n")) ? `"${s.replace(/"/g, '""')}"` : s; }
function fmtDate(iso: string): string { try { return new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return iso; } }

function buildCSV(forms: FormRecord[]): string {
  const rows = [CSV_HEADERS.join(",")];
  for (const f of forms) rows.push([esc(f.nombre), esc(f.telefono), esc(f.zona), esc(f.encuestador), esc(f.candidato_preferido), esc(f.comentarios), String(f.y ?? ""), String(f.x ?? ""), esc(fmtDate(f.created_at)), esc(f.fecha)].join(","));
  return "\uFEFF" + rows.join("\n");
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ========== Component ========== */

export function DatosView({ forms, isLoading, primaryColor, campaignName, campaignId, userRole, onUpdateForm, onDeleteForm, onFormsChanged }: Props) {
  const canEdit = EDITABLE_ROLES.has(userRole);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingForm, setEditingForm] = useState<FormRecord | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const filtered = useMemo(() => {
    let list = forms;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((f) => f.nombre.toLowerCase().includes(q) || f.telefono.includes(q) || f.encuestador.toLowerCase().includes(q) || f.zona.toLowerCase().includes(q) || (f.candidato_preferido && f.candidato_preferido.toLowerCase().includes(q)));
    }
    return [...list].sort((a, b) => { const cmp = String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? "")); return sortAsc ? cmp : -cmp; });
  }, [forms, search, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageSlice = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => { if (prev === key) { setSortAsc((a) => !a); return key; } setSortAsc(false); return key; });
  }, []);

  const arrow = (key: SortKey) => sortKey === key ? (sortAsc ? " \u2191" : " \u2193") : "";

  const handleDownload = useCallback(() => {
    const csv = buildCSV(filtered);
    const date = new Date().toISOString().split("T")[0];
    downloadCSV(csv, `datos_${campaignName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30)}_${date}.csv`);
  }, [filtered, campaignName]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedIds.size === pageSlice.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(pageSlice.map((f) => f.id)));
  }, [selectedIds.size, pageSlice]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ok = window.confirm(`Eliminar ${selectedIds.size} registro${selectedIds.size > 1 ? "s" : ""}?`);
    if (!ok) return;
    setBulkDeleting(true);
    await deleteFormsBatch(Array.from(selectedIds), campaignId);
    setSelectedIds(new Set());
    setBulkDeleting(false);
    onFormsChanged();
  }, [selectedIds, campaignId, onFormsChanged]);

  const handleSingleDelete = useCallback(async (f: FormRecord) => {
    const ok = window.confirm(`Eliminar "${f.nombre || "Sin nombre"}"?`);
    if (!ok) return;
    await onDeleteForm(f.id, campaignId);
    onFormsChanged();
  }, [campaignId, onDeleteForm, onFormsChanged]);

  const handleEditSave = useCallback(async (updates: Record<string, string>) => {
    if (!editingForm) return false;
    const ok = await onUpdateForm(editingForm.id, campaignId, updates);
    if (ok) onFormsChanged();
    return ok;
  }, [editingForm, campaignId, onUpdateForm, onFormsChanged]);

  if (isLoading) {
    return (<div className="flex items-center justify-center flex-1 gap-3"><div className="w-5 h-5 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" /><span className="text-sm text-slate-400 font-medium">Cargando datos...</span></div>);
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-200/80 shrink-0 flex-wrap">
        <div className="flex items-center gap-2 flex-1 py-1.5 px-3 rounded-lg bg-slate-50 border border-slate-200 focus-within:border-slate-300 transition-colors max-w-sm min-w-[200px]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true"><title>Buscar</title><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Buscar nombre, telefono, zona..." className="flex-1 border-none outline-none bg-transparent text-[13px] text-slate-700 placeholder:text-slate-400" />
          {search && <button type="button" onClick={() => { setSearch(""); setPage(0); }} className="w-5 h-5 rounded-full border-none bg-slate-200 text-slate-500 cursor-pointer text-[10px] flex items-center justify-center hover:bg-slate-300" aria-label="Limpiar">x</button>}
        </div>

        <span className="text-[11px] text-slate-400 tabular-nums font-semibold shrink-0">{filtered.length.toLocaleString()} registros</span>

        {/* Bulk actions (canEdit only) */}
        {canEdit && selectedIds.size > 0 && (
          <button type="button" onClick={handleBulkDelete} disabled={bulkDeleting} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-[12px] font-semibold cursor-pointer border-none bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><title>Eliminar</title><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            {bulkDeleting ? "Eliminando..." : `Eliminar ${selectedIds.size}`}
          </button>
        )}

        <div className="flex-1" />

        <button type="button" onClick={handleDownload} disabled={filtered.length === 0} className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-[12px] font-semibold cursor-pointer border-none transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90" style={{ backgroundColor: primaryColor }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><title>Descargar</title><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          CSV
        </button>
      </div>

      {/* ── Table header ── */}
      <div className="grid gap-2 px-4 py-2 border-b border-slate-200/80 bg-slate-50 shrink-0 items-center" style={{ gridTemplateColumns: canEdit ? "36px 1fr 110px 110px 130px 130px 100px 150px 70px" : "1fr 110px 110px 130px 130px 100px 150px" }}>
        {canEdit && (
          <input type="checkbox" checked={selectedIds.size > 0 && selectedIds.size === pageSlice.length} onChange={toggleAll} className="w-4 h-4 cursor-pointer accent-blue-600" aria-label="Seleccionar todo" />
        )}
        <SortBtn label="Nombre" sortKey="nombre" current={sortKey} arrow={arrow} onSort={handleSort} />
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 text-center">Telefono</span>
        <SortBtn label="Zona" sortKey="zona" current={sortKey} arrow={arrow} onSort={handleSort} align="center" />
        <SortBtn label="Encuestador" sortKey="encuestador" current={sortKey} arrow={arrow} onSort={handleSort} />
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Cand. Preferido</span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 text-center">Coords</span>
        <SortBtn label="Fecha" sortKey="created_at" current={sortKey} arrow={arrow} onSort={handleSort} align="right" />
        {canEdit && <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 text-center">Acciones</span>}
      </div>

      {/* ── Rows ── */}
      <div className="flex-1 overflow-y-auto">
        {pageSlice.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-16 text-center">
            <span className="text-[14px] font-bold text-slate-500">Sin registros</span>
            <span className="text-[12px] text-slate-400">{search ? "Intenta con otra busqueda" : "Los datos apareceran cuando los brigadistas capturen informacion"}</span>
          </div>
        ) : pageSlice.map((f, i) => (
          <div key={f.id} className={`grid gap-2 px-4 items-center min-h-[44px] border-b border-slate-100/80 transition-colors hover:bg-slate-50/80 ${selectedIds.has(f.id) ? "bg-blue-50/40" : i % 2 === 1 ? "bg-slate-50/40" : "bg-white"}`} style={{ gridTemplateColumns: canEdit ? "36px 1fr 110px 110px 130px 130px 100px 150px 70px" : "1fr 110px 110px 130px 130px 100px 150px" }}>
            {canEdit && <input type="checkbox" checked={selectedIds.has(f.id)} onChange={() => toggleSelect(f.id)} className="w-4 h-4 cursor-pointer accent-blue-600" aria-label={`Seleccionar ${f.nombre}`} />}
            <div className="min-w-0 py-1.5"><span className="text-[13px] font-semibold text-slate-800 truncate block">{f.nombre || "\u2014"}</span></div>
            <span className="text-[12px] text-slate-600 tabular-nums text-center font-mono">{f.telefono || "\u2014"}</span>
            <span className="text-[11px] text-slate-500 text-center truncate" title={f.zona}>{f.zona || "\u2014"}</span>
            <span className="text-[11px] text-slate-600 truncate" title={f.encuestador}>{f.encuestador || "\u2014"}</span>
            <span className="text-[11px] text-slate-500 truncate" title={f.candidato_preferido}>{f.candidato_preferido || "\u2014"}</span>
            <span className="text-[10px] text-slate-400 tabular-nums text-center font-mono">{f.y != null && f.x != null ? `${f.y.toFixed(2)}, ${f.x.toFixed(2)}` : "\u2014"}</span>
            <span className="text-[11px] text-slate-400 tabular-nums text-right">{fmtDate(f.created_at)}</span>
            {canEdit && (
              <div className="flex items-center justify-center gap-1">
                <button type="button" onClick={() => setEditingForm(f)} className="w-7 h-7 rounded-md border border-slate-200 bg-white text-slate-500 cursor-pointer flex items-center justify-center hover:bg-slate-50 hover:text-slate-700 transition-colors" title="Editar">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><title>Editar</title><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                </button>
                <button type="button" onClick={() => handleSingleDelete(f)} className="w-7 h-7 rounded-md border border-red-200 bg-white text-red-400 cursor-pointer flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-colors" title="Eliminar">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><title>Eliminar</title><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Pagination ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-200/80 bg-slate-50/80 shrink-0">
        <span className="text-[11px] text-slate-500 font-medium tabular-nums">
          {(safePage * PAGE_SIZE + 1).toLocaleString()}\u2013{Math.min((safePage + 1) * PAGE_SIZE, filtered.length).toLocaleString()} de {filtered.length.toLocaleString()}
        </span>
        <div className="flex items-center gap-1">
          <PagBtn onClick={() => setPage(0)} disabled={safePage === 0} label="Primera">{"\u00AB"}</PagBtn>
          <PagBtn onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} label="Anterior">{"\u2039"}</PagBtn>
          <span className="text-[11px] font-semibold text-slate-600 px-2 tabular-nums">{safePage + 1} / {totalPages}</span>
          <PagBtn onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1} label="Siguiente">{"\u203A"}</PagBtn>
          <PagBtn onClick={() => setPage(totalPages - 1)} disabled={safePage >= totalPages - 1} label="Ultima">{"\u00BB"}</PagBtn>
        </div>
      </div>

      {/* ── Edit modal ── */}
      {editingForm && <DatosEditModal form={editingForm} onSave={handleEditSave} onClose={() => setEditingForm(null)} />}
    </div>
  );
}

/* ========== Sub-components ========== */

function SortBtn({ label, sortKey, current, arrow, onSort, align }: { label: string; sortKey: SortKey; current: SortKey; arrow: (k: SortKey) => string; onSort: (k: SortKey) => void; align?: "center" | "right" }) {
  return (
    <button type="button" onClick={() => onSort(sortKey)} className={`text-[9px] font-bold uppercase tracking-wider cursor-pointer bg-transparent border-none transition-colors hover:text-slate-800 p-0 ${current === sortKey ? "text-slate-700" : "text-slate-400"} ${align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left"}`}>
      {label}{arrow(sortKey)}
    </button>
  );
}

function PagBtn({ onClick, disabled, label, children }: { onClick: () => void; disabled: boolean; label: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className="w-7 h-7 rounded-md border border-slate-200 bg-white text-slate-600 text-[13px] font-bold cursor-pointer flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
      {children}
    </button>
  );
}
