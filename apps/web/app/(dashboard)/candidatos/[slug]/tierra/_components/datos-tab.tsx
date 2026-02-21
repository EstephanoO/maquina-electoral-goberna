"use client";

/* ========== Datos Tab — Form records table with search, filter, selection & delete ========== */

import { useRef, useState, useMemo, useCallback } from "react";
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

/* ========== Component ========== */

export function DatosTab({ forms, selectedAgentName, primaryColor, onFlyTo, campaignId, isAdmin, onFormsDeleted }: DatosTabProps) {
  const listRef = useRef<HTMLDivElement>(null);

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

  const prevCount = useRef(filteredForms.length);
  if (filteredForms.length !== prevCount.current) {
    prevCount.current = filteredForms.length;
    listRef.current?.scrollTo(0, 0);
  }

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
    const allIds = filteredForms.slice(0, 200).map((f) => f.id);
    setSelectedIds(new Set(allIds));
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Sub-header */}
      <div style={D.subHeader}>
        <div>
          <h3 style={D.title}>{selectedAgentName ? `Datos: ${selectedAgentName}` : "Registros"}</h3>
          <span style={{ ...D.count, color: primaryColor }}>
            {filteredForms.length} de {forms.length}
            {hasSelection && <span style={{ color: "#ef4444", marginLeft: 6 }}>• {selectedIds.size} sel.</span>}
          </span>
        </div>
      </div>

      {/* Selection toolbar (admin) */}
      {isAdmin && (
        <div style={D.selectionBar}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button type="button" onClick={hasSelection ? clearSelection : selectAll} style={D.selectBtn}>
              {hasSelection ? "Deseleccionar" : "Seleccionar todo"}
            </button>
            {hasSelection && <span style={{ fontSize: 12, color: "#64748b" }}>{selectedIds.size} sel.</span>}
          </div>
          {hasSelection && (
            <button type="button" onClick={handleDelete} disabled={isDeleting} style={{ ...D.deleteBtn, opacity: isDeleting ? 0.6 : 1, cursor: isDeleting ? "wait" : "pointer" }}>
              {isDeleting ? <span style={D.spinner} /> : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><title>Eliminar</title><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              )}
              Eliminar
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {deleteError && (
        <div style={D.errorBar}>
          <span>{deleteError}</span>
          <button type="button" onClick={() => setDeleteError(null)} style={D.errorClose}>&#10005;</button>
        </div>
      )}

      {/* Search */}
      <div style={D.searchContainer}>
        <div style={D.searchInputWrapper}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><title>Buscar</title><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nombre, teléfono, agente..." style={D.searchInput} />
          {search && <button type="button" onClick={() => setSearch("")} style={D.clearSearchBtn} aria-label="Limpiar búsqueda">&#10005;</button>}
        </div>
        <div style={D.filtersRow}>
          <select value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={D.filterSelect}>
            <option value="all">Todo el tiempo</option>
            <option value="today">Hoy</option>
            <option value="week">Esta semana</option>
            <option value="month">Este mes</option>
          </select>
          <select value={filterEncuestador} onChange={(e) => setFilterEncuestador(e.target.value)} style={D.filterSelect}>
            <option value="all">Todos los agentes</option>
            {encuestadores.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
          {hasActiveFilters && (
            <button type="button" onClick={clearFilters} style={{ ...D.clearFiltersBtn, color: primaryColor }}>Limpiar</button>
          )}
        </div>
      </div>

      {/* Table header */}
      <div style={D.tableHeader}>
        {isAdmin && <div style={{ ...D.thCell, width: 36 }} />}
        <div style={{ ...D.thCell, flex: 2 }}>Nombre</div>
        <div style={{ ...D.thCell, flex: 1.5 }}>Teléfono</div>
        <div style={{ ...D.thCell, flex: 1.5 }}>Agente</div>
        <div style={{ ...D.thCell, flex: 1, textAlign: "right" }}>Fecha</div>
      </div>

      {/* Content */}
      <div ref={listRef} style={D.list}>
        {filteredForms.length === 0 ? (
          <div style={D.empty}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><title>Sin datos</title><circle cx="12" cy="12" r="10" /><path d="M8 15h8" /><circle cx="9" cy="9" r="1" /><circle cx="15" cy="9" r="1" /></svg>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#64748b" }}>{hasActiveFilters ? "Sin resultados" : "Sin datos capturados"}</span>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>{hasActiveFilters ? "Intenta con otros filtros" : "Los datos aparecerán aquí"}</span>
            {hasActiveFilters && (
              <button type="button" onClick={clearFilters} style={{ ...D.emptyResetBtn, color: primaryColor, borderColor: `${primaryColor}30` }}>Limpiar filtros</button>
            )}
          </div>
        ) : (
          filteredForms.slice(0, 200).map((f, idx) => {
            const hasCoords = f.x && f.y;
            const isSelected = selectedIds.has(f.id);
            const date = new Date(f.created_at);
            return (
              <div key={f.id} onClick={() => handleCardClick(f)} onKeyDown={(e) => e.key === "Enter" && handleCardClick(f)} role="button" tabIndex={0} style={{ ...D.row, cursor: hasCoords && onFlyTo ? "pointer" : "default", backgroundColor: isSelected ? `${primaryColor}08` : idx % 2 === 0 ? "#ffffff" : "#fafbfc", borderLeft: isSelected ? `3px solid ${primaryColor}` : "3px solid transparent" }}>
                {isAdmin && (
                  <div style={{ ...D.cell, width: 36, justifyContent: "center" }} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={isSelected} onChange={() => {}} onClick={(e) => toggleSelect(f.id, e)} style={D.checkbox} />
                  </div>
                )}
                <div style={{ ...D.cell, flex: 2 }}>
                  <div style={D.nameCell}>
                    {hasCoords && onFlyTo && <span style={{ ...D.locIcon, color: primaryColor }}>📍</span>}
                    <span style={D.name}>{f.nombre || "Sin nombre"}</span>
                  </div>
                </div>
                <div style={{ ...D.cell, flex: 1.5 }}><span style={D.phone}>{f.telefono || "—"}</span></div>
                <div style={{ ...D.cell, flex: 1.5 }}><span style={D.agent}>{f.encuestador || "—"}</span></div>
                <div style={{ ...D.cell, flex: 1, justifyContent: "flex-end" }}>
                  <div style={D.dateCell}>
                    <span style={D.dateDay}>{date.toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}</span>
                    <span style={D.dateTime}>{date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div style={D.footer}>
        <span>{filteredForms.length > 200 ? `Mostrando 200 de ${filteredForms.length}` : `${filteredForms.length} registros`}</span>
        <span style={{ color: "#22c55e", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#22c55e" }} />
          Auto-refresh 5s
        </span>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ========== Styles ========== */

const D: Record<string, React.CSSProperties> = {
  subHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid #f1f5f9", flexShrink: 0 },
  title: { margin: 0, fontSize: 14, fontWeight: 700, color: "#1e293b", lineHeight: 1.2 },
  count: { fontSize: 12, fontWeight: 500, lineHeight: 1.2, display: "flex", alignItems: "center" },

  selectionBar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 16px", backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0", flexShrink: 0 },
  selectBtn: { fontSize: 12, fontWeight: 600, color: "#475569", backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 12px", cursor: "pointer" },
  deleteBtn: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#ffffff", backgroundColor: "#ef4444", border: "none", borderRadius: 6, padding: "6px 14px", cursor: "pointer", transition: "all 0.15s ease" },
  spinner: { width: 14, height: 14, border: "2px solid #ffffff40", borderTopColor: "#ffffff", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  errorBar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 16px", backgroundColor: "#fef2f2", borderBottom: "1px solid #fecaca", color: "#dc2626", fontSize: 12, fontWeight: 500, flexShrink: 0 },
  errorClose: { background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 14, padding: 4 },

  searchContainer: { padding: "10px 16px", borderBottom: "1px solid #f1f5f9", flexShrink: 0, display: "flex", flexDirection: "column" as const, gap: 8, backgroundColor: "#ffffff" },
  searchInputWrapper: { display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, border: "1px solid #e2e8f0", backgroundColor: "#f8fafc" },
  searchInput: { flex: 1, border: "none", outline: "none", backgroundColor: "transparent", fontSize: 13, color: "#334155" },
  clearSearchBtn: { width: 20, height: 20, borderRadius: 4, border: "none", backgroundColor: "#e2e8f0", color: "#64748b", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" },
  filtersRow: { display: "flex", gap: 8, alignItems: "center" },
  filterSelect: { flex: 1, fontSize: 12, color: "#475569", padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0", backgroundColor: "#ffffff", cursor: "pointer", outline: "none" },
  clearFiltersBtn: { fontSize: 12, fontWeight: 600, border: "none", backgroundColor: "transparent", cursor: "pointer", padding: "6px 10px", borderRadius: 6, whiteSpace: "nowrap" as const, flexShrink: 0 },

  tableHeader: { display: "flex", padding: "8px 16px", backgroundColor: "#f8fafc", borderBottom: "2px solid #e2e8f0", flexShrink: 0 },
  thCell: { fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: "0.05em", padding: "0 4px" },

  list: { flex: 1, overflowY: "auto" as const },
  empty: { display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 8, padding: 48, textAlign: "center" as const },
  emptyResetBtn: { fontSize: 12, fontWeight: 600, border: "1px solid", backgroundColor: "transparent", cursor: "pointer", padding: "8px 20px", borderRadius: 8, marginTop: 8 },

  row: { display: "flex", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid #f1f5f9", transition: "background 0.1s ease, border-left-color 0.1s ease" },
  cell: { display: "flex", alignItems: "center", padding: "0 4px", minWidth: 0 },
  checkbox: { width: 16, height: 16, cursor: "pointer", accentColor: "#2563eb" },
  nameCell: { display: "flex", alignItems: "center", gap: 6, minWidth: 0 },
  locIcon: { fontSize: 12, flexShrink: 0 },
  name: { fontSize: 13, fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  phone: { fontSize: 12, color: "#64748b", fontFamily: "monospace" },
  agent: { fontSize: 12, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  dateCell: { display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 1 },
  dateDay: { fontSize: 11, color: "#475569", fontWeight: 500 },
  dateTime: { fontSize: 10, color: "#94a3b8" },

  footer: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", fontSize: 11, color: "#64748b", borderTop: "1px solid #f1f5f9", flexShrink: 0, backgroundColor: "#fafbfc", fontWeight: 500 },
};
