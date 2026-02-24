"use client";

/* ========== Datos Tab — Form records table with search, filter, selection & delete ========== */
/* Virtualized row rendering: only visible rows + overscan are mounted in the DOM. */

import { useRef, useState, useMemo, useCallback, useEffect } from "react";
import type { FormRecord } from "@/lib/services";
import { deleteFormsBatch } from "@/lib/services";
import { formCoordsToLatLng } from "@/lib/utils";

/* ========== Types ========== */

export type DatosTabProps = {
  forms: FormRecord[];
  selectedAgentName: string | null;
  primaryColor: string;
  onFlyTo?: (lng: number, lat: number) => void;
  campaignId: string;
  isAdmin: boolean;
  onFormsDeleted?: () => void;
};

/* ========== Constants ========== */

const ROW_HEIGHT = 42;
const OVERSCAN = 8;

/* ========== Component ========== */

export function DatosTab({ forms, selectedAgentName, primaryColor, onFlyTo, campaignId, isAdmin, onFormsDeleted }: DatosTabProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(400);

  const [search, setSearch] = useState("");
  const [filterEncuestador, setFilterEncuestador] = useState<string>("all");
  const [filterDate, setFilterDate] = useState<string>("all");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const encuestadores = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of forms) {
      const key = f.encuestador_id || f.encuestador;
      if (key && !map.has(key)) map.set(key, f.encuestador || key);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [forms]);

  const filteredForms = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return forms.filter((f) => {
      if (search) {
        const q = search.toLowerCase();
        const match = (f.nombre || "").toLowerCase().includes(q) || (f.telefono || "").toLowerCase().includes(q) || (f.encuestador || "").toLowerCase().includes(q) || (f.candidato_preferido || "").toLowerCase().includes(q) || (f.comentarios || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      if (filterEncuestador !== "all") {
        const fKey = f.encuestador_id || f.encuestador;
        if (fKey !== filterEncuestador) return false;
      }
      if (filterDate !== "all") {
        const created = new Date(f.created_at);
        if (filterDate === "today" && created < startOfToday) return false;
        if (filterDate === "week" && created < startOfWeek) return false;
        if (filterDate === "month" && created < startOfMonth) return false;
      }
      return true;
    });
  }, [forms, search, filterEncuestador, filterDate]);

  // Reset scroll when filter changes
  const prevCount = useRef(filteredForms.length);
  if (filteredForms.length !== prevCount.current) {
    prevCount.current = filteredForms.length;
    scrollRef.current?.scrollTo(0, 0);
  }

  // Measure viewport height on mount + resize
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Scroll handler — batched via rAF to avoid layout thrashing
  const rafRef = useRef(0);
  const handleScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      setScrollTop(scrollRef.current?.scrollTop ?? 0);
    });
  }, []);

  // Windowed range
  const totalHeight = filteredForms.length * ROW_HEIGHT;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIdx = Math.min(filteredForms.length, Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + OVERSCAN);
  const visibleForms = filteredForms.slice(startIdx, endIdx);

  const handleCardClick = (f: FormRecord) => {
    if (!onFlyTo) return;
    const coords = formCoordsToLatLng(f.x, f.y, f.zona);
    if (coords) onFlyTo(coords.lng, coords.lat);
  };

  const toggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredForms.map((f) => f.id)));
  }, [filteredForms]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const confirmed = window.confirm(`¿Estás seguro de eliminar ${selectedIds.size} registro${selectedIds.size > 1 ? "s" : ""}? Esta acción no se puede deshacer.`);
    if (!confirmed) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const result = await deleteFormsBatch(Array.from(selectedIds), campaignId);
      if (result.ok) { setSelectedIds(new Set()); onFormsDeleted?.(); }
      else setDeleteError(result.error?.message || "Error al eliminar");
    } catch { setDeleteError("Error de conexión"); }
    finally { setIsDeleting(false); }
  }, [selectedIds, campaignId, onFormsDeleted]);

  const hasActiveFilters = search || filterEncuestador !== "all" || filterDate !== "all";
  const hasSelection = selectedIds.size > 0;
  const clearFilters = () => { setSearch(""); setFilterEncuestador("all"); setFilterDate("all"); };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-header */}
      <div className="flex justify-between items-center px-4 py-2.5 border-b border-slate-100 shrink-0">
        <div>
          <h3 className="m-0 text-sm font-bold text-slate-800 leading-tight">{selectedAgentName ? `Datos: ${selectedAgentName}` : "Registros"}</h3>
          <span className="text-xs font-medium leading-tight flex items-center" style={{ color: primaryColor }}>
            {filteredForms.length} de {forms.length}
            {hasSelection && <span className="text-red-500 ml-1.5">• {selectedIds.size} sel.</span>}
          </span>
        </div>
      </div>

      {/* Selection toolbar (admin) */}
      {isAdmin && (
        <div className="flex justify-between items-center px-4 py-2 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={hasSelection ? clearSelection : selectAll}
              className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-md px-3 py-[5px] cursor-pointer"
            >
              {hasSelection ? "Deseleccionar" : "Seleccionar todo"}
            </button>
            {hasSelection && <span className="text-xs text-slate-500">{selectedIds.size} sel.</span>}
          </div>
          {hasSelection && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-red-500 border-none rounded-md px-3.5 py-1.5 transition-all duration-150"
              style={{ opacity: isDeleting ? 0.6 : 1, cursor: isDeleting ? "wait" : "pointer" }}
            >
              {isDeleting ? <span className="w-3.5 h-3.5 border-2 border-white/25 border-t-white rounded-full animate-spin" /> : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><title>Eliminar</title><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              )}
              Eliminar
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {deleteError && (
        <div className="flex justify-between items-center px-4 py-2 bg-red-50 border-b border-red-200 text-red-600 text-xs font-medium shrink-0">
          <span>{deleteError}</span>
          <button type="button" onClick={() => setDeleteError(null)} className="bg-transparent border-none text-red-600 cursor-pointer text-sm p-1">&#10005;</button>
        </div>
      )}

      {/* Search + Filters */}
      <div className="px-4 py-2.5 border-b border-slate-100 shrink-0 flex flex-col gap-2 bg-white">
        <div className="flex items-center gap-2.5 py-2 px-3 rounded-lg border border-slate-200 bg-slate-50">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><title>Buscar</title><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nombre, teléfono, agente..." className="flex-1 border-none outline-none bg-transparent text-[13px] text-slate-700" />
          {search && <button type="button" onClick={() => setSearch("")} className="w-5 h-5 rounded border-none bg-slate-200 text-slate-500 cursor-pointer text-[10px] flex items-center justify-center" aria-label="Limpiar búsqueda">&#10005;</button>}
        </div>
        <div className="flex gap-2 items-center">
          <select value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="flex-1 text-xs text-slate-600 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white cursor-pointer outline-none">
            <option value="all">Todo el tiempo</option>
            <option value="today">Hoy</option>
            <option value="week">Esta semana</option>
            <option value="month">Este mes</option>
          </select>
          <select value={filterEncuestador} onChange={(e) => setFilterEncuestador(e.target.value)} className="flex-1 text-xs text-slate-600 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white cursor-pointer outline-none">
            <option value="all">Todos los agentes</option>
            {encuestadores.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
          {hasActiveFilters && (
            <button type="button" onClick={clearFilters} className="text-xs font-semibold border-none bg-transparent cursor-pointer px-2.5 py-1.5 rounded-md whitespace-nowrap shrink-0" style={{ color: primaryColor }}>Limpiar</button>
          )}
        </div>
      </div>

      {/* Table header */}
      <div className="flex px-4 py-2 bg-slate-50 border-b-2 border-slate-200 shrink-0">
        {isAdmin && <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1 w-9" />}
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1 flex-[2]">Nombre</div>
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1 flex-[1.5]">Teléfono</div>
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1 flex-[1.5]">Agente</div>
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1 flex-1 text-right">Fecha</div>
      </div>

      {/* ─── Virtualized content ─── */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        {filteredForms.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><title>Sin datos</title><circle cx="12" cy="12" r="10" /><path d="M8 15h8" /><circle cx="9" cy="9" r="1" /><circle cx="15" cy="9" r="1" /></svg>
            <span className="text-sm font-semibold text-slate-500">{hasActiveFilters ? "Sin resultados" : "Sin datos capturados"}</span>
            <span className="text-xs text-slate-400">{hasActiveFilters ? "Intenta con otros filtros" : "Los datos aparecerán aquí"}</span>
            {hasActiveFilters && (
              <button type="button" onClick={clearFilters} className="text-xs font-semibold border bg-transparent cursor-pointer px-5 py-2 rounded-lg mt-2" style={{ color: primaryColor, borderColor: `${primaryColor}30` }}>Limpiar filtros</button>
            )}
          </div>
        ) : (
          <div className="relative" style={{ height: totalHeight }}>
            {visibleForms.map((f, i) => {
              const absIdx = startIdx + i;
              const hasCoords = f.x && f.y;
              const isSelected = selectedIds.has(f.id);
              const date = new Date(f.created_at);
              return (
                <div
                  key={f.id}
                  onClick={() => handleCardClick(f)}
                  onKeyDown={(e) => e.key === "Enter" && handleCardClick(f)}
                  role="button"
                  tabIndex={0}
                  className="absolute left-0 right-0 flex items-center px-4 border-b border-slate-100 transition-colors duration-100 box-border"
                  style={{
                    top: absIdx * ROW_HEIGHT,
                    height: ROW_HEIGHT,
                    cursor: hasCoords && onFlyTo ? "pointer" : "default",
                    backgroundColor: isSelected ? `${primaryColor}08` : absIdx % 2 === 0 ? "#ffffff" : "#fafbfc",
                    borderLeft: isSelected ? `3px solid ${primaryColor}` : "3px solid transparent",
                  }}
                >
                  {isAdmin && (
                    <div className="flex items-center justify-center w-9 px-1" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={isSelected} onChange={() => {}} onClick={(e) => toggleSelect(f.id, e)} className="w-4 h-4 cursor-pointer accent-blue-600" />
                    </div>
                  )}
                  <div className="flex items-center px-1 flex-[2] min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {hasCoords && onFlyTo && <span className="text-xs shrink-0" style={{ color: primaryColor }}>📍</span>}
                      <span className="text-[13px] font-semibold text-slate-800 overflow-hidden text-ellipsis whitespace-nowrap">{f.nombre || "Sin nombre"}</span>
                    </div>
                  </div>
                  <div className="flex items-center px-1 flex-[1.5]"><span className="text-xs text-slate-500 font-mono">{f.telefono || "—"}</span></div>
                  <div className="flex items-center px-1 flex-[1.5]"><span className="text-xs text-slate-600 overflow-hidden text-ellipsis whitespace-nowrap">{f.encuestador || "—"}</span></div>
                  <div className="flex items-center justify-end px-1 flex-1">
                    <div className="flex flex-col items-end gap-px">
                      <span className="text-[11px] text-slate-600 font-medium">{date.toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}</span>
                      <span className="text-[10px] text-slate-400">{date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center px-4 py-2.5 text-[11px] text-slate-500 border-t border-slate-100 shrink-0 bg-slate-50/80 font-medium">
        <span>{filteredForms.length} registros</span>
        <span className="text-green-500 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          Auto-refresh 5s
        </span>
      </div>
    </div>
  );
}
