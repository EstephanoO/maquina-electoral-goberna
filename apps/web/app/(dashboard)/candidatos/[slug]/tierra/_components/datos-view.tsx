"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import type { FormRecord } from "@/lib/services";
import { deleteFormsBatch } from "@/lib/services";
import { formCoordsToLatLng } from "@/lib/utils";
import { DatosEditModal } from "./datos-edit-modal";
import type { PinnedTooltipData } from "./types";
import { buildCSV, downloadCSV, buildExcelAndDownload, fmtDate } from "./datos-export-helpers";
import { SearchIcon, DownloadIcon, TrashIcon, EditIcon, MapPinIcon, CopyIcon, FilterIcon, XIcon, ExcelIcon } from "./datos-icons";
import { SortBtn, PagBtn, ActionBtn } from "./datos-sub-components";

/* ========== Types ========== */

type SortKey = "created_at" | "nombre" | "encuestador";
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
  onFlyTo?: (lng: number, lat: number, tooltipData?: PinnedTooltipData) => void;
};

const PAGE_SIZE = 25;
const EDITABLE_ROLES = new Set(["admin", "consultor", "candidato"]);

/* ========== Shared select styles ========== */

const selectClass = "text-[11px] text-slate-700 pl-2.5 pr-7 py-[7px] rounded-lg border border-slate-200 bg-white cursor-pointer outline-none font-semibold appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_6px_center] bg-no-repeat hover:border-slate-300 focus:border-slate-400 transition-colors truncate";

/* ========== Component ========== */

export function DatosView({ forms, isLoading, primaryColor, campaignName, campaignId, userRole, onUpdateForm, onDeleteForm, onFormsChanged, onFlyTo }: Props) {
  const canEdit = EDITABLE_ROLES.has(userRole);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingForm, setEditingForm] = useState<FormRecord | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  // Optimistic removal: IDs eliminados exitosamente pero aun presentes en el array `forms`
  // (mientras el refetch de React Query no haya llegado todavia).
  const [optimisticDeletedIds, setOptimisticDeletedIds] = useState<Set<string>>(new Set());

  // Filters
  const [filterEncuestador, setFilterEncuestador] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // ── Derived filter options (cascading: dept → prov → dist) ──

  const encuestadorOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of forms) {
      const key = f.encuestador_id || f.encuestador;
      if (key && !map.has(key)) map.set(key, f.encuestador || key);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [forms]);

  const duplicatePhones = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of forms) {
      const phone = f.telefono?.trim();
      if (phone) counts.set(phone, (counts.get(phone) ?? 0) + 1);
    }
    const dupes = new Set<string>();
    for (const [phone, count] of counts) {
      if (count > 1) dupes.add(phone);
    }
    return dupes;
  }, [forms]);

  // Limpiar IDs optimisticamente eliminados cuando el refetch de React Query
  // ya no los incluye en `forms` (confirmacion de que la DB los removio).
  useEffect(() => {
    if (optimisticDeletedIds.size === 0) return;
    const formIds = new Set(forms.map((f) => f.id));
    const stillPresent = new Set<string>();
    for (const id of optimisticDeletedIds) {
      if (formIds.has(id)) stillPresent.add(id);
    }
    // Si el set cambio (algun ID ya no esta en forms), actualizamos
    if (stillPresent.size !== optimisticDeletedIds.size) {
      setOptimisticDeletedIds(stillPresent);
    }
  }, [forms, optimisticDeletedIds]);

  const activeFilterCount = [
    filterEncuestador !== "all",
    !!dateFrom,
    !!dateTo,
    showDuplicates,
  ].filter(Boolean).length;

  const hasActiveFilters = !!search || activeFilterCount > 0;

  const clearFilters = useCallback(() => {
    setSearch(""); setFilterEncuestador("all");
    setDateFrom(""); setDateTo(""); setShowDuplicates(false); setPage(0);
  }, []);

  // ── Filtering + sorting ──

  const filtered = useMemo(() => {
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : 0;
    const toMs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : 0;

    // Excluir registros eliminados optimisticamente (aun presentes en `forms` por el refetch pendiente)
    let list = optimisticDeletedIds.size > 0
      ? forms.filter((f) => !optimisticDeletedIds.has(f.id))
      : forms;
    if (showDuplicates) list = list.filter((f) => f.telefono?.trim() && duplicatePhones.has(f.telefono.trim()));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((f) =>
        f.nombre.toLowerCase().includes(q) || f.telefono.includes(q) ||
        f.encuestador.toLowerCase().includes(q) || f.zona.toLowerCase().includes(q) ||
        (f.candidato_preferido && f.candidato_preferido.toLowerCase().includes(q)));
    }
    if (filterEncuestador !== "all") list = list.filter((f) => (f.encuestador_id || f.encuestador) === filterEncuestador);
    if (fromMs) list = list.filter((f) => new Date(f.created_at).getTime() >= fromMs);
    if (toMs) list = list.filter((f) => new Date(f.created_at).getTime() <= toMs);
    return [...list].sort((a, b) => {
      const cmp = String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""));
      return sortAsc ? cmp : -cmp;
    });
  }, [forms, optimisticDeletedIds, search, sortKey, sortAsc, showDuplicates, duplicatePhones, filterEncuestador, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageSlice = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  // ── Handlers ──

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => { if (prev === key) { setSortAsc((a) => !a); return key; } setSortAsc(false); return key; });
  }, []);

  const arrow = (key: SortKey) => sortKey === key ? (sortAsc ? " \u2191" : " \u2193") : "";

  const handleDownloadCSV = useCallback(() => {
    const csv = buildCSV(filtered);
    const date = new Date().toISOString().split("T")[0];
    downloadCSV(csv, `datos_${campaignName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30)}_${date}.csv`);
  }, [filtered, campaignName]);

  const handleDownloadExcel = useCallback(async () => {
    if (exportingExcel || filtered.length === 0) return;
    setExportingExcel(true);
    try {
      await buildExcelAndDownload(filtered, campaignName, primaryColor);
    } finally {
      setExportingExcel(false);
    }
  }, [filtered, campaignName, primaryColor, exportingExcel]);

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
    const ids = Array.from(selectedIds);
    setBulkDeleting(true);
    setDeletingIds(new Set(ids));
    try {
      const res = await deleteFormsBatch(ids, campaignId);
      if (res.ok) {
        // Remocion optimista: ocultar filas de inmediato sin esperar el refetch
        setOptimisticDeletedIds((prev) => { const next = new Set(prev); for (const id of ids) next.add(id); return next; });
        setSelectedIds(new Set());
        onFormsChanged();
      }
    } finally { setBulkDeleting(false); setDeletingIds(new Set()); }
  }, [selectedIds, campaignId, onFormsChanged]);

  const handleSingleDelete = useCallback(async (f: FormRecord) => {
    if (deletingIds.has(f.id)) return;
    const ok = window.confirm(`Eliminar "${f.nombre || "Sin nombre"}"?`);
    if (!ok) return;
    setDeletingIds((prev) => new Set(prev).add(f.id));
    try {
      const deleted = await onDeleteForm(f.id, campaignId);
      if (deleted) {
        // Remocion optimista: ocultar la fila de inmediato sin esperar el refetch de React Query
        setOptimisticDeletedIds((prev) => new Set(prev).add(f.id));
      }
    } finally {
      setDeletingIds((prev) => { const next = new Set(prev); next.delete(f.id); return next; });
    }
  }, [campaignId, onDeleteForm, deletingIds]);

  const handleEditSave = useCallback(async (updates: Record<string, string>) => {
    if (!editingForm) return false;
    const ok = await onUpdateForm(editingForm.id, campaignId, updates);
    if (ok) onFormsChanged();
    return ok;
  }, [editingForm, campaignId, onUpdateForm, onFormsChanged]);

  // ── Grid columns ──
  const cols = canEdit
    ? "36px 1.2fr 100px 0.8fr 0.7fr 0.7fr 0.7fr 130px 84px"
    : "1.2fr 100px 0.8fr 0.7fr 0.7fr 0.7fr 130px 36px";

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="flex items-center justify-center flex-1 gap-3">
        <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
        <span className="text-sm text-slate-400 font-medium">Cargando datos...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-slate-200/80 shrink-0">
        {/* Search */}
        <div className="flex items-center gap-2 flex-1 py-[7px] px-3 rounded-lg bg-slate-50/80 border border-slate-200 focus-within:border-slate-400 focus-within:bg-white transition-all max-w-xs min-w-[180px]">
          <span className="text-slate-400 shrink-0"><SearchIcon /></span>
          <input
            type="text" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Buscar..."
            className="flex-1 border-none outline-none bg-transparent text-[13px] text-slate-700 placeholder:text-slate-400 font-medium"
          />
          {search && (
            <button type="button" onClick={() => { setSearch(""); setPage(0); }}
              className="w-5 h-5 rounded-full bg-slate-200/80 text-slate-500 cursor-pointer flex items-center justify-center hover:bg-slate-300 transition-colors border-none"
              aria-label="Limpiar"><XIcon /></button>
          )}
        </div>

        {/* Record count */}
        <span className="text-[11px] text-slate-400 tabular-nums font-semibold shrink-0 hidden sm:inline">
          {filtered.length.toLocaleString()} registros
        </span>

        {/* Filters toggle */}
        <button type="button" onClick={() => setShowFilters((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-[11px] font-semibold cursor-pointer border transition-colors shrink-0 ${
            showFilters || activeFilterCount > 0
              ? "border-slate-300 bg-slate-100 text-slate-700"
              : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:border-slate-300"
          }`}>
          <FilterIcon />
          Filtros
          {activeFilterCount > 0 && (
            <span className="text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: primaryColor }}>
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Duplicates */}
        <button type="button" onClick={() => { setShowDuplicates((v) => !v); setPage(0); }}
          className={`flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-[11px] font-semibold cursor-pointer border transition-colors shrink-0 ${
            showDuplicates
              ? "bg-amber-50 border-amber-300 text-amber-700"
              : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300"
          }`}>
          <CopyIcon />
          Duplicados
          {duplicatePhones.size > 0 && (
            <span className={`text-[9px] font-black min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center ${
              showDuplicates ? "bg-amber-200 text-amber-800" : "bg-slate-100 text-slate-500"
            }`}>{duplicatePhones.size}</span>
          )}
        </button>

        {/* Bulk delete */}
        {canEdit && selectedIds.size > 0 && (
          <button type="button" onClick={handleBulkDelete} disabled={bulkDeleting}
            className="flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-white text-[11px] font-bold cursor-pointer border-none bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors">
            <TrashIcon />
            {bulkDeleting ? "Eliminando..." : `Eliminar ${selectedIds.size}`}
          </button>
        )}

        {/* Clear filters */}
        {hasActiveFilters && (
          <button type="button" onClick={clearFilters}
            className="text-[11px] font-semibold border-none bg-transparent cursor-pointer px-2 py-1 rounded-md hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
            style={{ color: primaryColor }}>
            Limpiar
          </button>
        )}

        <div className="flex-1" />

        {/* Export buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button" onClick={handleDownloadExcel} disabled={filtered.length === 0 || exportingExcel}
            className="flex items-center gap-2 px-4 py-[7px] rounded-lg text-white text-[12px] font-bold cursor-pointer border-none transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 hover:shadow-md"
            style={{ backgroundColor: primaryColor }}>
            {exportingExcel ? (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <ExcelIcon />
            )}
            <span className="hidden sm:inline">Exportar</span> Excel
          </button>
          <button type="button" onClick={handleDownloadCSV} disabled={filtered.length === 0}
            className="flex items-center gap-2 px-3 py-[7px] rounded-lg text-[12px] font-bold cursor-pointer border border-slate-200 bg-white text-slate-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 hover:border-slate-300">
            <DownloadIcon />
            CSV
          </button>
        </div>
      </div>

      {/* ── Collapsible filters panel ── */}
      <div className={`grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${showFilters || activeFilterCount > 0 ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60 flex-wrap">
            {/* Agente */}
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 pl-0.5">Agente</span>
              <select value={filterEncuestador} onChange={(e) => { setFilterEncuestador(e.target.value); setPage(0); }}
                className={`${selectClass} min-w-[140px] max-w-[180px]`}>
                <option value="all">Todos</option>
                {encuestadorOptions.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
              </select>
            </div>

            {/* Separator */}
            <div className="w-px h-8 bg-slate-200 mx-1 shrink-0" />

            {/* Date range */}
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 pl-0.5">Desde</span>
              <input type="date" value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
                max={dateTo || undefined}
                className="text-[11px] text-slate-700 px-2.5 py-[7px] rounded-lg border border-slate-200 bg-white outline-none font-semibold cursor-pointer hover:border-slate-300 focus:border-slate-400 transition-colors" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 pl-0.5">Hasta</span>
              <input type="date" value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
                min={dateFrom || undefined}
                className="text-[11px] text-slate-700 px-2.5 py-[7px] rounded-lg border border-slate-200 bg-white outline-none font-semibold cursor-pointer hover:border-slate-300 focus:border-slate-400 transition-colors" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Table header ── */}
      <div className="grid gap-2 px-4 py-2 border-b border-slate-200/80 bg-slate-50/80 shrink-0 items-center"
        style={{ gridTemplateColumns: cols }}>
        {canEdit && (
          <input type="checkbox"
            checked={selectedIds.size > 0 && selectedIds.size === pageSlice.length}
            onChange={toggleAll}
            className="w-3.5 h-3.5 cursor-pointer accent-blue-600 rounded"
            aria-label="Seleccionar todo" />
        )}
        <SortBtn label="Nombre" sortKey="nombre" current={sortKey} arrow={arrow} onSort={handleSort} />
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 text-center">Telefono</span>
        <SortBtn label="Encuestador" sortKey="encuestador" current={sortKey} arrow={arrow} onSort={handleSort} />
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Departamento</span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Provincia</span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Distrito</span>
        <SortBtn label="Fecha" sortKey="created_at" current={sortKey} arrow={arrow} onSort={handleSort} align="right" />
        {canEdit ? <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 text-center">Acciones</span> : <span />}
      </div>

      {/* ── Rows ── */}
      <div className="flex-1 overflow-y-auto">
        {pageSlice.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 px-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
            </div>
            <div>
              <p className="text-[14px] font-bold text-slate-600">{hasActiveFilters ? "Sin resultados" : "Sin registros"}</p>
              <p className="text-[12px] text-slate-400 mt-0.5">{hasActiveFilters ? "Intenta con otros filtros o busqueda" : "Los datos apareceran cuando los brigadistas capturen informacion"}</p>
            </div>
            {hasActiveFilters && (
              <button type="button" onClick={clearFilters}
                className="text-[12px] font-bold border cursor-pointer px-5 py-2 rounded-lg transition-all hover:shadow-sm bg-white"
                style={{ color: primaryColor, borderColor: `${primaryColor}30` }}>
                Limpiar filtros
              </button>
            )}
          </div>
        ) : pageSlice.map((f, i) => {
          const coords = (f.x != null && f.y != null) ? formCoordsToLatLng(f.x, f.y, f.zona) : null;
          const isRowDeleting = deletingIds.has(f.id);
          const isSelected = selectedIds.has(f.id);

          return (
            <div key={f.id}
              className={`grid gap-2 px-4 items-center min-h-[46px] border-b transition-colors ${
                isRowDeleting ? "opacity-40 pointer-events-none" : ""
              } ${isSelected ? "bg-blue-50/50 border-blue-100" : i % 2 === 1 ? "bg-slate-50/30 border-slate-100/60" : "bg-white border-slate-100/60"
              } hover:bg-slate-50/80`}
              style={{ gridTemplateColumns: cols }}>
              {canEdit && (
                <input type="checkbox" checked={isSelected}
                  onChange={() => toggleSelect(f.id)} disabled={isRowDeleting}
                  className="w-3.5 h-3.5 cursor-pointer accent-blue-600 rounded"
                  aria-label={`Seleccionar ${f.nombre}`} />
              )}
              <div className="min-w-0 py-1.5">
                <span className="text-[13px] font-semibold text-slate-800 truncate block leading-tight">{f.nombre || "\u2014"}</span>
              </div>
              <span className="text-[12px] text-slate-500 tabular-nums text-center font-mono tracking-tight">{f.telefono || "\u2014"}</span>
              <span className="text-[11px] text-slate-500 truncate" title={f.encuestador}>{f.encuestador || "\u2014"}</span>
              <span className="text-[11px] text-slate-500 truncate" title={f.departamento}>{f.departamento || "\u2014"}</span>
              <span className="text-[11px] text-slate-500 truncate" title={f.provincia}>{f.provincia || "\u2014"}</span>
              <span className="text-[11px] text-slate-500 truncate" title={f.distrito}>{f.distrito || "\u2014"}</span>
              <span className="text-[11px] text-slate-400 tabular-nums text-right tracking-tight">{fmtDate(f.created_at)}</span>
              {canEdit ? (
                <div className="flex items-center justify-center gap-0.5">
                  {coords && onFlyTo && (
                    <ActionBtn onClick={() => onFlyTo(coords.lng, coords.lat, { lng: coords.lng, lat: coords.lat, nombre: f.nombre, telefono: f.telefono ?? "", encuestador: f.encuestador ?? "", created_at: f.created_at })} title="Ver en mapa" style={{ color: primaryColor }}>
                      <MapPinIcon />
                    </ActionBtn>
                  )}
                  <ActionBtn onClick={() => setEditingForm(f)} disabled={isRowDeleting} title="Editar">
                    <EditIcon />
                  </ActionBtn>
                  <ActionBtn onClick={() => handleSingleDelete(f)} disabled={isRowDeleting} title="Eliminar" variant="danger">
                    {isRowDeleting
                      ? <span className="w-3 h-3 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
                      : <TrashIcon />}
                  </ActionBtn>
                </div>
              ) : (
                <div className="flex items-center justify-center">
                  {coords && onFlyTo && (
                    <ActionBtn onClick={() => onFlyTo(coords.lng, coords.lat, { lng: coords.lng, lat: coords.lat, nombre: f.nombre, telefono: f.telefono ?? "", encuestador: f.encuestador ?? "", created_at: f.created_at })} title="Ver en mapa" style={{ color: primaryColor }}>
                      <MapPinIcon />
                    </ActionBtn>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Pagination ── */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-slate-200/80 bg-slate-50/60 shrink-0">
        <span className="text-[11px] text-slate-500 font-medium tabular-nums">
          {filtered.length > 0
            ? `${(safePage * PAGE_SIZE + 1).toLocaleString()}\u2013${Math.min((safePage + 1) * PAGE_SIZE, filtered.length).toLocaleString()} de ${filtered.length.toLocaleString()}`
            : "0 registros"
          }
        </span>
        <div className="flex items-center gap-0.5">
          <PagBtn onClick={() => setPage(0)} disabled={safePage === 0} label="Primera">{"\u00AB"}</PagBtn>
          <PagBtn onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} label="Anterior">{"\u2039"}</PagBtn>
          <span className="text-[11px] font-semibold text-slate-600 px-2.5 tabular-nums">{safePage + 1} / {totalPages}</span>
          <PagBtn onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1} label="Siguiente">{"\u203A"}</PagBtn>
          <PagBtn onClick={() => setPage(totalPages - 1)} disabled={safePage >= totalPages - 1} label="Ultima">{"\u00BB"}</PagBtn>
        </div>
      </div>

      {/* ── Edit modal ── */}
      {editingForm && <DatosEditModal form={editingForm} onSave={handleEditSave} onClose={() => setEditingForm(null)} />}
    </div>
  );
}


