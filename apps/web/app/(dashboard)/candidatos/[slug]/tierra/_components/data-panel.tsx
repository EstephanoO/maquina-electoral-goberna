"use client";

import { useRef, useState, useMemo } from "react";
import type { FormRecord } from "@/lib/services";
import { formCoordsToLatLng } from "@/lib/utils";

/* ========== Types ========== */

type Props = {
  forms: FormRecord[];
  selectedAgentName: string | null;
  primaryColor: string;
  open: boolean;
  onClose: () => void;
  onFlyTo?: (lng: number, lat: number) => void;
};

/* ========== Constants ========== */

const WIDTH = 380;

/* ========== Component ========== */

export function DataPanel({ forms, selectedAgentName, primaryColor, open, onClose, onFlyTo }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  // Search & filters
  const [search, setSearch] = useState("");
  const [filterEncuestador, setFilterEncuestador] = useState<string>("all");
  const [filterDate, setFilterDate] = useState<string>("all"); // "all" | "today" | "week" | "month"

  // Unique encuestadores for filter dropdown
  const encuestadores = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of forms) {
      const key = f.encuestador_id || f.encuestador;
      if (key && !map.has(key)) map.set(key, f.encuestador || key);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [forms]);

  // Apply filters
  const filteredForms = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Sunday
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return forms.filter((f) => {
      // Text search
      if (search) {
        const q = search.toLowerCase();
        const match =
          (f.nombre || "").toLowerCase().includes(q) ||
          (f.telefono || "").toLowerCase().includes(q) ||
          (f.encuestador || "").toLowerCase().includes(q) ||
          (f.candidato_preferido || "").toLowerCase().includes(q) ||
          (f.comentarios || "").toLowerCase().includes(q);
        if (!match) return false;
      }

      // Encuestador filter
      if (filterEncuestador !== "all") {
        const fKey = f.encuestador_id || f.encuestador;
        if (fKey !== filterEncuestador) return false;
      }

      // Date filter
      if (filterDate !== "all") {
        const created = new Date(f.created_at);
        if (filterDate === "today" && created < startOfToday) return false;
        if (filterDate === "week" && created < startOfWeek) return false;
        if (filterDate === "month" && created < startOfMonth) return false;
      }

      return true;
    });
  }, [forms, search, filterEncuestador, filterDate]);

  // Scroll to top when filters change
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

  const hasActiveFilters = search || filterEncuestador !== "all" || filterDate !== "all";

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: WIDTH,
        transform: open ? "translateX(0)" : `translateX(${WIDTH}px)`,
        transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
        backgroundColor: "#ffffff",
        borderLeft: "1px solid #e2e8f0",
        boxShadow: open ? "-4px 0 20px rgba(0,0,0,0.08)" : "none",
        display: "flex",
        flexDirection: "column",
        zIndex: 15,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <div style={{ ...S.headerIcon, backgroundColor: `${primaryColor}14`, color: primaryColor }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><title>Datos</title><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div>
            <h3 style={S.title}>{selectedAgentName ? `Datos: ${selectedAgentName}` : "Registros"}</h3>
            <span style={{ ...S.count, color: primaryColor }}>{filteredForms.length} de {forms.length}</span>
          </div>
        </div>
        <button type="button" onClick={onClose} style={S.closeBtn} aria-label="Cerrar panel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><title>Cerrar</title><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Search bar */}
      <div style={S.searchContainer}>
        <div style={S.searchInputWrapper}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><title>Buscar</title><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nombre, telefono, agente..."
            style={S.searchInput}
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} style={S.clearBtn} aria-label="Limpiar busqueda">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><title>Limpiar</title><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>

        {/* Filters row */}
        <div style={S.filtersRow}>
          <select
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            style={S.filterSelect}
          >
            <option value="all">Todo el tiempo</option>
            <option value="today">Hoy</option>
            <option value="week">Esta semana</option>
            <option value="month">Este mes</option>
          </select>

          <select
            value={filterEncuestador}
            onChange={(e) => setFilterEncuestador(e.target.value)}
            style={S.filterSelect}
          >
            <option value="all">Todos los agentes</option>
            {encuestadores.map(([key, name]) => (
              <option key={key} value={key}>{name}</option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => { setSearch(""); setFilterEncuestador("all"); setFilterDate("all"); }}
              style={{ ...S.clearFiltersBtn, color: primaryColor }}
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div ref={listRef} style={S.list}>
        {filteredForms.length === 0 ? (
          <div style={S.empty}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><title>Sin datos</title><circle cx="12" cy="12" r="10"/><path d="M8 15h8"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="9" r="1"/></svg>
            <span>{hasActiveFilters ? "Sin resultados para los filtros" : "Sin datos capturados"}</span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => { setSearch(""); setFilterEncuestador("all"); setFilterDate("all"); }}
                style={{ ...S.emptyResetBtn, color: primaryColor, borderColor: `${primaryColor}30` }}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          filteredForms.slice(0, 200).map((f) => {
            const hasCoords = f.x && f.y;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => handleCardClick(f)}
                style={{
                  ...S.card,
                  cursor: hasCoords && onFlyTo ? "pointer" : "default",
                }}
                onMouseEnter={(e) => {
                  if (hasCoords && onFlyTo) {
                    e.currentTarget.style.backgroundColor = `${primaryColor}08`;
                    e.currentTarget.style.borderColor = `${primaryColor}30`;
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                  e.currentTarget.style.borderColor = "#f1f5f9";
                }}
              >
                {/* Row 1: Name + time */}
                <div style={S.cardTop}>
                  <div style={S.cardNameRow}>
                    {hasCoords && onFlyTo && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={primaryColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.6 }}><title>Ubicacion</title><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    )}
                    <span style={S.cardName}>{f.nombre || "Sin nombre"}</span>
                  </div>
                  <span style={S.cardTime}>
                    {new Date(f.created_at).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                {/* Row 2: details */}
                <div style={S.cardDetails}>
                  {f.telefono && (
                    <span style={S.cardTag}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><title>Tel</title><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                      {f.telefono}
                    </span>
                  )}
                  {f.encuestador && (
                    <span style={S.cardTag}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><title>Agente</title><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      {f.encuestador}
                    </span>
                  )}
                  {f.candidato_preferido && (
                    <span style={{ ...S.cardTag, backgroundColor: `${primaryColor}0a`, borderColor: `${primaryColor}20`, color: primaryColor }}>
                      {f.candidato_preferido}
                    </span>
                  )}
                </div>

                {/* Row 3: comments if any */}
                {f.comentarios && (
                  <div style={S.cardComment}>
                    {f.comentarios}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Footer count */}
      {filteredForms.length > 200 && (
        <div style={S.footer}>
          Mostrando 200 de {filteredForms.length} registros
        </div>
      )}
    </div>
  );
}

/* ========== Styles ========== */

const S: Record<string, React.CSSProperties> = {
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid #f1f5f9",
    flexShrink: 0,
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  title: { margin: 0, fontSize: 13, fontWeight: 700, color: "#1e293b", lineHeight: 1.2 },
  count: { fontSize: 11, fontWeight: 600, lineHeight: 1.2 },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    border: "1px solid #e2e8f0",
    backgroundColor: "#f8fafc",
    color: "#94a3b8",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  // Search & filters
  searchContainer: {
    padding: "8px 12px",
    borderBottom: "1px solid #f1f5f9",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  searchInputWrapper: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    backgroundColor: "#f8fafc",
    transition: "border-color 0.15s ease",
  },
  searchInput: {
    flex: 1,
    border: "none",
    outline: "none",
    backgroundColor: "transparent",
    fontSize: 12,
    color: "#334155",
    lineHeight: 1.4,
  },
  clearBtn: {
    width: 20,
    height: 20,
    borderRadius: 5,
    border: "none",
    backgroundColor: "#e2e8f0",
    color: "#64748b",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    padding: 0,
  },
  filtersRow: {
    display: "flex",
    gap: 6,
    alignItems: "center",
  },
  filterSelect: {
    flex: 1,
    fontSize: 11,
    color: "#475569",
    padding: "4px 6px",
    borderRadius: 6,
    border: "1px solid #e2e8f0",
    backgroundColor: "#f8fafc",
    cursor: "pointer",
    outline: "none",
    appearance: "auto" as const,
  },
  clearFiltersBtn: {
    fontSize: 11,
    fontWeight: 600,
    border: "none",
    backgroundColor: "transparent",
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: 6,
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  },

  // List
  list: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "8px 12px",
  },
  empty: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 48,
    color: "#94a3b8",
    fontSize: 13,
  },
  emptyResetBtn: {
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid",
    backgroundColor: "transparent",
    cursor: "pointer",
    padding: "6px 16px",
    borderRadius: 8,
    marginTop: 4,
  },

  // Cards
  card: {
    width: "100%",
    textAlign: "left" as const,
    padding: "10px 12px",
    marginBottom: 4,
    borderRadius: 8,
    border: "1px solid #f1f5f9",
    backgroundColor: "#ffffff",
    transition: "background 0.12s ease, border-color 0.12s ease",
    display: "block",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  cardNameRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    overflow: "hidden",
    minWidth: 0,
    flex: 1,
  },
  cardName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#1e293b",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  cardTime: {
    fontSize: 10,
    color: "#94a3b8",
    fontWeight: 500,
    flexShrink: 0,
    marginLeft: 8,
  },
  cardDetails: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
  },
  cardTag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    color: "#64748b",
    backgroundColor: "#f8fafc",
    padding: "2px 7px",
    borderRadius: 5,
    border: "1px solid #f1f5f9",
  },
  cardComment: {
    marginTop: 6,
    fontSize: 11,
    color: "#64748b",
    fontStyle: "italic" as const,
    lineHeight: 1.4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },

  footer: {
    padding: "8px 16px",
    fontSize: 10,
    color: "#94a3b8",
    textAlign: "center" as const,
    borderTop: "1px solid #f1f5f9",
    flexShrink: 0,
    fontWeight: 600,
    letterSpacing: "0.02em",
  },
};
