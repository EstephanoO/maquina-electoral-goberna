"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import type { FormRecord } from "@/lib/services";
import { deleteFormsBatch } from "@/lib/services";
import { formCoordsToLatLng } from "@/lib/utils";
import { useTheme } from "@/lib/theme-context";
import { DatosEditModal } from "./datos-edit-modal";
import type { PinnedTooltipData } from "./types";

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
const TABLE_BLUE = "#090D15";

/* ========== CSV helpers ========== */

const CSV_HEADERS = ["Nombre", "Telefono", "Zona", "Encuestador", "Candidato Preferido", "Comentarios", "Latitud", "Longitud", "Fecha Registro", "Fecha Captura"] as const;

function esc(v: string | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  return (s.includes(",") || s.includes('"') || s.includes("\n")) ? `"${s.replace(/"/g, '""')}"` : s;
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const day = d.getDate();
    const month = d.toLocaleString("es-PE", { month: "short" }).replace(".", "").toLowerCase();
    const year = d.getFullYear();
    const hour = String(d.getHours()).padStart(2, "0");
    const minute = String(d.getMinutes()).padStart(2, "0");
    const second = d.getSeconds();
    return `${day} de ${month} del ${year} a las ${hour}:${minute}:${second}`;
  }
  catch { return iso; }
}

const DEPARTAMENTO_BY_CODE: Record<string, string> = {
  "01": "AMAZONAS",
  "02": "ANCASH",
  "03": "APURIMAC",
  "04": "AREQUIPA",
  "05": "AYACUCHO",
  "06": "CAJAMARCA",
  "07": "CALLAO",
  "08": "CUSCO",
  "09": "HUANCAVELICA",
  "10": "HUANUCO",
  "11": "ICA",
  "12": "JUNIN",
  "13": "LA LIBERTAD",
  "14": "LAMBAYEQUE",
  "15": "LIMA",
  "16": "LORETO",
  "17": "MADRE DE DIOS",
  "18": "MOQUEGUA",
  "19": "PASCO",
  "20": "PIURA",
  "21": "PUNO",
  "22": "SAN MARTIN",
  "23": "TACNA",
  "24": "TUMBES",
  "25": "UCAYALI",
};

function getDepartamentoFromZona(zona: string): string {
  const raw = zona?.trim();
  if (!raw) return "-";
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 2) {
    const depCode = digits.slice(0, 2);
    const depName = DEPARTAMENTO_BY_CODE[depCode];
    if (depName) return depName;
  }
  const parts = raw.split(/[\-|/>,]/).map((p) => p.trim()).filter(Boolean);
  const first = (parts[0] || raw).replace(/\d+/g, "").trim();
  return first ? first.toUpperCase() : "-";
}

function buildCSV(forms: FormRecord[]): string {
  const rows = [CSV_HEADERS.join(",")];
  for (const f of forms) {
    rows.push([
      esc(f.nombre), esc(f.telefono), esc(f.zona),
      esc(f.encuestador), esc(f.candidato_preferido), esc(f.comentarios),
      String(f.y ?? ""), String(f.x ?? ""), esc(fmtDate(f.created_at)), esc(f.fecha),
    ].join(","));
  }
  return "\uFEFF" + rows.join("\n");
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ========== Inline icons ========== */

const SearchIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
const DownloadIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;
const TrashIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>;
const EditIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
const MapPinIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>;
const CopyIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="2" width="13" height="13" rx="2" /><path d="M5 8H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1" /></svg>;
const FilterIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>;
const XIcon = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;

/* ========== Shared select styles ========== */

const selectClass = "text-[11px] text-slate-700 pl-2.5 pr-7 py-[7px] rounded-lg border border-slate-200 bg-white cursor-pointer outline-none font-semibold appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_6px_center] bg-no-repeat hover:border-slate-300 focus:border-slate-400 transition-colors truncate";

/* ========== Component ========== */

export function DatosView({ forms, isLoading, campaignName, campaignId, userRole, onUpdateForm, onDeleteForm, onFormsChanged, onFlyTo }: Props) {
  const canEdit = EDITABLE_ROLES.has(userRole);
  const { theme } = useTheme();
  const isDark = theme === "dark";
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
    ? "36px 1.2fr 100px 0.95fr 0.95fr 130px 96px"
    : "1.2fr 100px 0.95fr 0.95fr 130px 42px";

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
    <div className={`flex flex-col flex-1 min-h-0 mx-4 my-3 rounded-2xl overflow-hidden ${isDark ? "bg-[#090D15]" : "bg-white"}`}>

      {/* ── Toolbar ── */}
      <div className={`flex items-center gap-2.5 px-4 py-2.5 border-b shrink-0 ${isDark ? "border-[#1d2f43] bg-[#090D15]" : "border-slate-200/80"}`}>
        {/* Search */}
        <div className={`flex items-center gap-2 flex-1 py-[7px] px-3 rounded-lg border transition-all max-w-xs min-w-[180px] ${isDark ? "bg-[#090D15] border-[#1d2f43] focus-within:border-[#223347]" : "bg-slate-50/80 border-slate-200 focus-within:border-slate-400 focus-within:bg-white"}`}>
          <span className={`${isDark ? "text-slate-500" : "text-slate-400"} shrink-0`}><SearchIcon /></span>
          <input
            type="text" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Buscar..."
            className={`flex-1 border-none outline-none bg-transparent text-[13px] font-medium ${isDark ? "text-slate-200 placeholder:text-slate-500" : "text-slate-700 placeholder:text-slate-400"}`}
          />
          {search && (
            <button type="button" onClick={() => { setSearch(""); setPage(0); }}
              className={`w-5 h-5 rounded-full cursor-pointer flex items-center justify-center transition-colors border-none ${isDark ? "bg-[#1d2f43] text-slate-300 hover:bg-[#223347]" : "bg-slate-200/80 text-slate-500 hover:bg-slate-300"}`}
              aria-label="Limpiar"><XIcon /></button>
          )}
        </div>

        {/* Record count */}
        <span className={`text-[11px] tabular-nums font-semibold shrink-0 hidden sm:inline ${isDark ? "text-slate-400" : "text-slate-400"}`}>
          {filtered.length.toLocaleString()} registros
        </span>

        {/* Filters toggle */}
        <button type="button" onClick={() => setShowFilters((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-[11px] font-semibold cursor-pointer border transition-colors shrink-0 ${
            showFilters || activeFilterCount > 0
              ? (isDark ? "border-[#223347] bg-[#090D15] text-slate-200" : "border-slate-300 bg-slate-100 text-slate-700")
              : (isDark ? "border-[#1d2f43] bg-[#090D15] text-slate-400 hover:border-[#223347]" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:border-slate-300")
          }`}>
          <FilterIcon />
          Filtros
          {activeFilterCount > 0 && (
            <span className="text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: TABLE_BLUE }}>
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Duplicates */}
        <button type="button" onClick={() => { setShowDuplicates((v) => !v); setPage(0); }}
          className={`flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-[11px] font-semibold cursor-pointer border transition-colors shrink-0 ${
            showDuplicates
              ? (isDark ? "bg-[#090D15] border-amber-400/40 text-amber-300" : "bg-amber-50 border-amber-300 text-amber-700")
              : (isDark ? "bg-[#090D15] border-[#1d2f43] text-slate-400 hover:border-[#223347]" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300")
          }`}>
          <CopyIcon />
          Duplicados
          {duplicatePhones.size > 0 && (
            <span className={`text-[9px] font-black min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center ${
              showDuplicates ? (isDark ? "bg-amber-400/20 text-amber-300" : "bg-amber-200 text-amber-800") : (isDark ? "bg-[#1d2f43] text-slate-300" : "bg-slate-100 text-slate-500")
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
            className={`text-[11px] font-semibold border-none bg-transparent cursor-pointer px-2 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 ${isDark ? "hover:bg-[#1d2f43] text-slate-300" : "hover:bg-slate-100 text-slate-600"}`}>
            Limpiar
          </button>
        )}

        <div className="flex-1" />

        {/* CSV download */}
        <button type="button" onClick={handleDownload} disabled={filtered.length === 0}
          className={`flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-[11px] font-semibold cursor-pointer border transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
            isDark
              ? "bg-[#090D15] border-[#223347] text-sky-300 hover:border-sky-400"
              : "bg-white border-blue-500 text-blue-600 hover:bg-blue-50 hover:border-blue-600"
          }`}>
          <DownloadIcon />
          <span className="hidden sm:inline">Exportar</span> CSV
        </button>
      </div>

      {/* ── Collapsible filters panel ── */}
      <div className={`grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${showFilters || activeFilterCount > 0 ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className={`flex items-center gap-2 px-4 py-2.5 border-b flex-wrap ${isDark ? "border-[#1d2f43] bg-[#090D15]" : "border-slate-100 bg-slate-50/60"}`}>
            {/* Agente */}
            <div className="flex flex-col gap-0.5">
              <span className={`text-[9px] font-bold uppercase tracking-wider pl-0.5 ${isDark ? "text-slate-400" : "text-slate-400"}`}>Agente</span>
              <select value={filterEncuestador} onChange={(e) => { setFilterEncuestador(e.target.value); setPage(0); }}
                className={`${isDark ? "text-[11px] text-slate-200 pl-2.5 pr-7 py-[7px] rounded-lg border border-[#1d2f43] bg-[#090D15] cursor-pointer outline-none font-semibold appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_6px_center] bg-no-repeat hover:border-[#223347] focus:border-[#223347] transition-colors truncate" : selectClass} min-w-[140px] max-w-[180px]`}>
                <option value="all">Todos</option>
                {encuestadorOptions.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
              </select>
            </div>

            {/* Separator */}
            <div className={`w-px h-8 mx-1 shrink-0 ${isDark ? "bg-[#1d2f43]" : "bg-slate-200"}`} />

            {/* Date range */}
            <div className="flex flex-col gap-0.5">
              <span className={`text-[9px] font-bold uppercase tracking-wider pl-0.5 ${isDark ? "text-slate-400" : "text-slate-400"}`}>Desde</span>
              <input type="date" value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
                max={dateTo || undefined}
                className={`text-[11px] px-2.5 py-[7px] rounded-lg border outline-none font-semibold cursor-pointer transition-colors ${isDark ? "text-slate-200 border-[#1d2f43] bg-[#090D15] hover:border-[#223347] focus:border-[#223347]" : "text-slate-700 border-slate-200 bg-white hover:border-slate-300 focus:border-slate-400"}`} />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className={`text-[9px] font-bold uppercase tracking-wider pl-0.5 ${isDark ? "text-slate-400" : "text-slate-400"}`}>Hasta</span>
              <input type="date" value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
                min={dateFrom || undefined}
                className={`text-[11px] px-2.5 py-[7px] rounded-lg border outline-none font-semibold cursor-pointer transition-colors ${isDark ? "text-slate-200 border-[#1d2f43] bg-[#090D15] hover:border-[#223347] focus:border-[#223347]" : "text-slate-700 border-slate-200 bg-white hover:border-slate-300 focus:border-slate-400"}`} />
            </div>
          </div>
        </div>
      </div>

      <div className={`px-3 pb-3 flex flex-col flex-1 min-h-0 rounded-xl overflow-hidden ${isDark ? "border border-[#1d2f43]" : "border border-slate-200"}`}>
      {/* ── Table header ── */}
      <div className={`grid gap-2 px-4 py-2 shrink-0 items-center ${isDark ? "bg-[#090D15] border-b border-[#1d2f43]" : "bg-slate-50/80"}`}
        style={{ gridTemplateColumns: cols }}>
        {canEdit && (
          <input type="checkbox"
            checked={selectedIds.size > 0 && selectedIds.size === pageSlice.length}
            onChange={toggleAll}
            className="w-3.5 h-3.5 cursor-pointer accent-slate-600 rounded"
            aria-label="Seleccionar todo" />
        )}
        <SortBtn label="Nombre" sortKey="nombre" current={sortKey} arrow={arrow} onSort={handleSort} isDark={isDark} />
        <span className={`text-[9px] font-bold uppercase tracking-wider text-center ${isDark ? "text-slate-300" : "text-slate-400"}`}>Telefono</span>
        <span className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? "text-slate-300" : "text-slate-400"}`}>Departamento</span>
        <SortBtn label="Encuestador" sortKey="encuestador" current={sortKey} arrow={arrow} onSort={handleSort} isDark={isDark} />
        <SortBtn label="Fecha" sortKey="created_at" current={sortKey} arrow={arrow} onSort={handleSort} align="right" isDark={isDark} />
        {canEdit ? <span className={`text-[9px] font-bold uppercase tracking-wider text-center ${isDark ? "text-slate-300" : "text-slate-400"}`}>Acciones</span> : <span />}
      </div>

      {/* ── Rows ── */}
      <div className="flex-1 overflow-y-auto">
        {pageSlice.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 px-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
            </div>
            <div>
              <p className="text-[14px] font-bold text-slate-600">{hasActiveFilters ? "Sin resultados" : "Sin registros"}</p>
              <p className="text-[12px] text-slate-400 mt-0.5">{hasActiveFilters ? "Intenta con otros filtros o busqueda" : "Los datos apareceran cuando los brigadistas capturen informacion"}</p>
            </div>
            {hasActiveFilters && (
              <button type="button" onClick={clearFilters}
                className="text-[12px] font-bold border cursor-pointer px-5 py-2 rounded-lg transition-all hover:shadow-sm bg-white text-slate-600 border-slate-200">
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
              } ${isDark
                ? (isSelected ? "bg-[#090D15] border-[#223347]" : i % 2 === 0 ? "bg-[#090D15] border-[#1a2a3d]" : "bg-[#090D15] border-[#1d2f43]")
                : (isSelected ? "bg-slate-100 border-slate-300" : i % 2 === 0 ? "bg-white border-slate-200" : "bg-slate-50 border-slate-200")
              }`}
              style={{ gridTemplateColumns: cols }}>
              {canEdit && (
                <input type="checkbox" checked={isSelected}
                  onChange={() => toggleSelect(f.id)} disabled={isRowDeleting}
                  className="w-3.5 h-3.5 cursor-pointer accent-slate-600 rounded"
                  aria-label={`Seleccionar ${f.nombre}`} />
              )}
              <div className="min-w-0 py-1.5">
                <span className={`text-[13px] font-semibold truncate block leading-tight ${isDark ? "text-slate-100" : "text-slate-800"}`}>{f.nombre || "\u2014"}</span>
              </div>
              <span className={`text-[12px] tabular-nums text-center font-mono tracking-tight ${isDark ? "text-slate-200" : "text-slate-600"}`}>{f.telefono || "\u2014"}</span>
              <span className={`text-[11px] truncate ${isDark ? "text-slate-300" : "text-slate-600"}`} title={getDepartamentoFromZona(f.zona)}>{getDepartamentoFromZona(f.zona)}</span>
              <span className={`text-[11px] truncate ${isDark ? "text-slate-300" : "text-slate-600"}`} title={f.encuestador}>{f.encuestador || "\u2014"}</span>
              <span className="text-[11px] text-slate-400 tabular-nums text-right tracking-tight">{fmtDate(f.created_at)}</span>
              {canEdit ? (
                <div className="flex items-center justify-center gap-1.5">
                  {coords && onFlyTo && (
                    <ActionBtn onClick={() => onFlyTo(coords.lng, coords.lat, { lng: coords.lng, lat: coords.lat, nombre: f.nombre, telefono: f.telefono ?? "", encuestador: f.encuestador ?? "", created_at: f.created_at })} title="Ver en mapa" variant="map" isDark={isDark}>
                      <MapPinIcon />
                    </ActionBtn>
                  )}
                  <ActionBtn onClick={() => setEditingForm(f)} disabled={isRowDeleting} title="Editar" variant="edit" isDark={isDark}>
                    <EditIcon />
                  </ActionBtn>
                  <ActionBtn onClick={() => handleSingleDelete(f)} disabled={isRowDeleting} title="Eliminar" variant="danger" isDark={isDark}>
                    {isRowDeleting
                      ? <span className="w-3 h-3 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
                      : <TrashIcon />}
                  </ActionBtn>
                </div>
              ) : (
                <div className="flex items-center justify-center">
                  {coords && onFlyTo && (
                    <ActionBtn onClick={() => onFlyTo(coords.lng, coords.lat, { lng: coords.lng, lat: coords.lat, nombre: f.nombre, telefono: f.telefono ?? "", encuestador: f.encuestador ?? "", created_at: f.created_at })} title="Ver en mapa" variant="map" isDark={isDark}>
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
      <div className={`flex items-center justify-between px-4 py-2 border-t shrink-0 ${isDark ? "border-[#1d2f43] bg-[#090D15]" : "border-slate-200 bg-slate-50/60"}`}>
        <span className={`text-[11px] font-medium tabular-nums ${isDark ? "text-slate-300" : "text-slate-500"}`}>
          {filtered.length > 0
            ? `${(safePage * PAGE_SIZE + 1).toLocaleString()}\u2013${Math.min((safePage + 1) * PAGE_SIZE, filtered.length).toLocaleString()} de ${filtered.length.toLocaleString()}`
            : "0 registros"
          }
        </span>
        <div className="flex items-center gap-0.5">
          <PagBtn onClick={() => setPage(0)} disabled={safePage === 0} label="Primera" isDark={isDark}>{"\u00AB"}</PagBtn>
          <PagBtn onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} label="Anterior" isDark={isDark}>{"\u2039"}</PagBtn>
          <span className={`text-[11px] font-semibold px-2.5 tabular-nums ${isDark ? "text-slate-200" : "text-slate-600"}`}>{safePage + 1} / {totalPages}</span>
          <PagBtn onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1} label="Siguiente" isDark={isDark}>{"\u203A"}</PagBtn>
          <PagBtn onClick={() => setPage(totalPages - 1)} disabled={safePage >= totalPages - 1} label="Ultima" isDark={isDark}>{"\u00BB"}</PagBtn>
        </div>
      </div>

      </div>

      {/* ── Edit modal ── */}
      {editingForm && <DatosEditModal form={editingForm} onSave={handleEditSave} onClose={() => setEditingForm(null)} />}
    </div>
  );
}

/* ========== Sub-components ========== */

function SortBtn({ label, sortKey, current, arrow, onSort, align, isDark = false }: { label: string; sortKey: SortKey; current: SortKey; arrow: (k: SortKey) => string; onSort: (k: SortKey) => void; align?: "center" | "right"; isDark?: boolean }) {
  return (
    <button type="button" onClick={() => onSort(sortKey)}
      className={`text-[9px] font-bold uppercase tracking-wider cursor-pointer bg-transparent border-none transition-colors hover:text-slate-700 p-0 ${
        current === sortKey ? (isDark ? "text-slate-100" : "text-slate-700") : (isDark ? "text-slate-300" : "text-slate-400")
      } ${align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left"}`}>
      {label}{arrow(sortKey)}
    </button>
  );
}

function PagBtn({ onClick, disabled, label, children, isDark = false }: { onClick: () => void; disabled: boolean; label: string; children: React.ReactNode; isDark?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={`w-7 h-7 rounded-lg border text-[13px] font-bold cursor-pointer flex items-center justify-center disabled:opacity-25 disabled:cursor-not-allowed transition-colors ${isDark ? "border-[#223347] bg-[#090D15] text-slate-300 hover:bg-[#090D15] hover:text-slate-100" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}>
      {children}
    </button>
  );
}

function ActionBtn({ onClick, disabled, title, children, variant, style, isDark = false }: {
  onClick: () => void; disabled?: boolean; title: string; children: React.ReactNode;
  variant?: "danger" | "map" | "edit"; style?: React.CSSProperties; isDark?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} style={style}
      className={`w-7 h-7 rounded-lg border cursor-pointer flex items-center justify-center transition-colors disabled:opacity-25 ${
        variant === "danger"
          ? isDark
            ? "border-[#223347] bg-[#090D15] text-rose-300 hover:bg-[#090D15] hover:text-rose-200"
            : "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700"
          : variant === "map"
            ? isDark
              ? "border-[#223347] bg-[#090D15] text-sky-400 hover:bg-[#090D15] hover:text-sky-300"
              : "border-sky-200 bg-sky-50 text-sky-600 hover:bg-sky-100 hover:text-sky-700"
            : variant === "edit"
              ? isDark
                ? "border-[#223347] bg-[#090D15] text-amber-300 hover:bg-[#090D15] hover:text-amber-200"
                : "border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100 hover:text-amber-700"
              : "border-slate-200/80 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-700"
      }`}>
      {children}
    </button>
  );
}
