"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { useAuth } from "@/lib/auth-context";
import {
  listValidations,
  updateValidationStatus,
  claimValidation,
  type ValidationItem,
  type ValidationStats,
  getValidationStats,
} from "@/lib/services/validacion";
import { ConfirmModal } from "./_components/confirm-modal";
import {
  COLUMNS,
  SearchIcon,
  toVisualColumn,
  toBackendStatus,
  voteClassForColumn,
  getAllowedTargets,
  type VisualColumn,
} from "./_components";
import { DroppableColumn } from "./_components/droppable-column";
import { DraggableCard } from "./_components/draggable-card";
import { DragOverlayCard } from "./_components/drag-overlay-card";
import { ToastProvider, useToast } from "./_components/toast";

/* ── Pagination config ── */
const PAGE_LIMIT = 100;

/* ── Stats expandable panel ── */
function StatsPanel({
  stats,
  items,
  total,
  columnTotals,
}: {
  stats: ValidationStats;
  items: ValidationItem[];
  total: number;
  columnTotals: Record<VisualColumn, { count: number; isPartial: boolean }>;
}) {
  // Totales reales del backend
  const processed = stats.contactado + stats.respondido + stats.invalido;
  const conversion = (stats.contactado + stats.respondido) > 0
    ? Math.round((stats.respondido / (stats.contactado + stats.respondido)) * 100)
    : 0;

  // Desglose de votos — calculado desde items en memoria
  // Si respondido no está todo cargado, los números son parciales (se indica con +)
  const respondidoLoaded = items.filter((i) => i.status === "respondido" || i.status === ("validado" as string)).length;
  const respondidoIsPartial = respondidoLoaded < stats.respondido;
  const voteDuro   = items.filter((i) => i.vote_class === "duro").length;
  const voteBlando = items.filter((i) => i.vote_class === "blando").length;
  const voteFlotante = items.filter((i) => i.vote_class === "flotante").length;

  // Top encuestadores — parcial si no están todos cargados
  const byEncuestador: Record<string, number> = {};
  for (const item of items) {
    const name = item.encuestador?.split(" ")[0] || "Desconocido";
    byEncuestador[name] = (byEncuestador[name] ?? 0) + 1;
  }
  const topEnc = Object.entries(byEncuestador)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="absolute top-full right-0 mt-2 z-50 w-80 bg-white rounded-xl border border-slate-200 shadow-xl p-4 flex flex-col gap-3">
      {/* Totales reales del backend — siempre correctos */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-slate-50 p-2.5">
          <div className="text-[10px] text-slate-400 font-medium">Procesados</div>
          <div className="text-lg font-black text-slate-700">
            {processed}
            <span className="text-[11px] font-medium text-slate-400">/{total}</span>
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 p-2.5">
          <div className="text-[10px] text-slate-400 font-medium">Conversión</div>
          <div className="text-lg font-black text-cyan-600">{conversion}%</div>
        </div>
        <div className="rounded-lg bg-blue-50 p-2.5">
          <div className="text-[10px] text-blue-700 font-medium">Pendiente</div>
          <div className="text-lg font-black text-blue-700">{stats.pendiente}</div>
        </div>
        <div className="rounded-lg bg-sky-50 p-2.5">
          <div className="text-[10px] text-sky-700 font-medium">Contactado</div>
          <div className="text-lg font-black text-sky-600">{stats.contactado}</div>
        </div>
      </div>

      {/* Desglose de votos — desde items en memoria, puede ser parcial */}
      <div>
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
          Respondidos — {stats.respondido} total
          {respondidoIsPartial && <span className="text-slate-300 font-normal ml-1">(desglose parcial)</span>}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <div className="rounded-lg bg-emerald-50 p-2">
            <div className="text-[9px] text-emerald-700 font-medium">Voto Duro</div>
            <div className="text-base font-black text-emerald-700">
              {voteDuro}{respondidoIsPartial ? "+" : ""}
            </div>
          </div>
          <div className="rounded-lg bg-yellow-50 p-2">
            <div className="text-[9px] text-yellow-700 font-medium">Voto Blando</div>
            <div className="text-base font-black text-yellow-600">
              {voteBlando}{respondidoIsPartial ? "+" : ""}
            </div>
          </div>
          <div className="rounded-lg bg-violet-50 p-2">
            <div className="text-[9px] text-violet-700 font-medium">Flotante</div>
            <div className="text-base font-black text-violet-600">
              {voteFlotante}{respondidoIsPartial ? "+" : ""}
            </div>
          </div>
        </div>
      </div>

      {/* Top encuestadores */}
      {topEnc.length > 0 && (
        <div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            Top encuestadores
            {items.length < total && <span className="text-slate-300 font-normal ml-1">(parcial)</span>}
          </div>
          {topEnc.map(([name, count]) => (
            <div key={name} className="flex items-center gap-2 py-0.5">
              <span className="text-[11px] text-slate-700 font-medium flex-1 truncate">{name}</span>
              <div className="h-1.5 rounded-full bg-slate-100 w-16">
                <div
                  className="h-full rounded-full bg-indigo-400 transition-all"
                  style={{ width: `${Math.min((count / (topEnc[0]?.[1] ?? 1)) * 100, 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400 tabular-nums w-4">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Filters ── */
function useFilters(items: ValidationItem[]) {
  const [search, setSearch] = useState("");
  const [filterZona, setFilterZona] = useState("");
  const [filterEnc, setFilterEnc] = useState("");

  const zonas = useMemo(() => {
    const s = new Set(items.map((i) => i.zona).filter(Boolean));
    return Array.from(s).sort();
  }, [items]);

  const encuestadores = useMemo(() => {
    const s = new Set(items.map((i) => i.encuestador?.split(" ")[0]).filter(Boolean));
    return Array.from(s).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items.filter((i) => {
      if (q && !i.nombre.toLowerCase().includes(q) && !i.telefono.includes(q) && !i.encuestador.toLowerCase().includes(q)) return false;
      if (filterZona && i.zona !== filterZona) return false;
      if (filterEnc && !i.encuestador.startsWith(filterEnc)) return false;
      return true;
    });
  }, [items, search, filterZona, filterEnc]);

  const hasFilters = !!search || !!filterZona || !!filterEnc;

  return { search, setSearch, filterZona, setFilterZona, filterEnc, setFilterEnc, zonas, encuestadores, filtered, hasFilters };
}

/* ── Inner board (needs toast context) ── */

function ValidacionBoard() {
  const params = useParams();
  const slug = params.slug as string;
  const { campaigns } = useAuth();
  const campaign = campaigns.find((c) => c.slug === slug);
  const campaignId = campaign?.id ?? "";
  const { toast } = useToast();

  const [items, setItems] = useState<ValidationItem[]>([]);
  const [stats, setStats] = useState<ValidationStats>({ pendiente: 0, contactado: 0, respondido: 0, invalido: 0 });
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<ValidationItem | null>(null);
  const [overColumn, setOverColumn] = useState<VisualColumn | null>(null);
  const [activeColumn, setActiveColumn] = useState<VisualColumn | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [collapsedCols, setCollapsedCols] = useState<Set<VisualColumn>>(new Set(["imposible"]));

  /* ── Ref to prevent fetchMore from overwriting optimistic updates ── */
  const pendingUpdateIds = useRef<Set<string>>(new Set());

  function toggleColCollapse(key: VisualColumn) {
    setCollapsedCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  /* ── Pending DnD invalido confirm ── */
  const [confirmDndInvalido, setConfirmDndInvalido] = useState<null | {
    item: ValidationItem;
    fromCol: VisualColumn;
    targetCol: VisualColumn;
  }>(null);

  /* ── Pagination ── */
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasMore = items.length < totalRecords;

  /* ── Filters ── */
  const {
    search, setSearch,
    filterZona, setFilterZona,
    filterEnc, setFilterEnc,
    zonas, encuestadores,
    filtered: filteredItems,
    hasFilters,
  } = useFilters(items);

  /* ── Fetch ── */
  const fetchData = useCallback(async () => {
    if (!campaignId) return;
    const [itemsRes, statsRes] = await Promise.all([
      listValidations(campaignId, undefined, 1, PAGE_LIMIT),
      getValidationStats(campaignId),
    ]);
    if (itemsRes.ok && itemsRes.data) {
      setItems(itemsRes.data.items);
      setTotalRecords(itemsRes.data.total);
      setCurrentPage(1);
    }
    if (statsRes.ok && statsRes.data) setStats(statsRes.data.stats);
    setLoading(false);
  }, [campaignId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchMore = useCallback(async () => {
    if (!campaignId || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = currentPage + 1;
    const res = await listValidations(campaignId, undefined, nextPage, PAGE_LIMIT);
    if (res.ok && res.data) {
      setItems((prev) => {
        const existingIds = new Set(prev.map((i) => i.id));
        const newItems = res.data!.items.filter((i) => !existingIds.has(i.id));
        return [...prev, ...newItems];
      });
      setTotalRecords(res.data.total);
      setCurrentPage(nextPage);
    }
    setLoadingMore(false);
  }, [campaignId, loadingMore, hasMore, currentPage]);

  /* ── DnD sensors ── */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  /* ── Resolve which column an item/droppable belongs to ── */
  const findColumnForId = useCallback((id: string | number): VisualColumn | null => {
    const colKey = COLUMNS.find((c) => c.key === id)?.key;
    if (colKey) return colKey;
    // It's a card ID — find which column it's in
    const item = items.find((i) => i.id === id);
    if (!item) return null;
    const st = item.status === ("validado" as string) ? "respondido" : item.status;
    return toVisualColumn(st, item.vote_class);
  }, [items]);

  /* ── DnD handlers ── */
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as { item: ValidationItem; column: VisualColumn } | undefined;
    if (data) {
      setActiveItem(data.item);
      setActiveColumn(data.column);
    }
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    if (!event.over) {
      setOverColumn(null);
      return;
    }
    // The over target could be a column or a card inside a column
    const overId = event.over.id as string;
    const col = findColumnForId(overId);
    setOverColumn(col);
  }, [findColumnForId]);

  const executeDrop = useCallback(async (
    item: ValidationItem,
    fromCol: VisualColumn,
    targetCol: VisualColumn,
  ) => {
    const newStatus = toBackendStatus(targetCol);
    const voteClass = voteClassForColumn(targetCol);

    setUpdatingId(item.id);
    pendingUpdateIds.current.add(item.id);

    // Optimistic update
    setItems((prev) => prev.map((i) =>
      i.id === item.id
        ? { ...i, status: newStatus as ValidationItem["status"], vote_class: voteClass ?? "" }
        : i
    ));

    if (fromCol === "pendiente" && targetCol === "contactado") {
      await claimValidation(item.id, campaignId);
      window.open(
        `https://wa.me/51${item.telefono.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola, ${item.nombre || ""}`)}`,
        "_blank", "noopener,noreferrer",
      );
    }

    const res = await updateValidationStatus(
      item.id, campaignId,
      newStatus as Parameters<typeof updateValidationStatus>[2],
      voteClass,
    );

    if (res.ok && res.data) {
      // Apply server response
      setItems((prev) => prev.map((i) =>
        i.id === item.id ? { ...i, ...res.data!.item } : i
      ));
      const statsRes = await getValidationStats(campaignId);
      if (statsRes.ok && statsRes.data) setStats(statsRes.data.stats);
      toast(`Movido a ${COLUMNS.find((c) => c.key === targetCol)?.label ?? targetCol}`, "success");
    } else {
      // Revert on failure
      setItems((prev) => prev.map((i) =>
        i.id === item.id
          ? { ...i, status: item.status, vote_class: item.vote_class }
          : i
      ));
      toast("Error al mover la tarjeta", "error");
    }

    pendingUpdateIds.current.delete(item.id);
    setUpdatingId(null);
  }, [campaignId, toast]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const dragItem = activeItem;
    const dragFromCol = activeColumn;

    setActiveItem(null);
    setActiveColumn(null);
    setOverColumn(null);

    if (!dragItem || !dragFromCol) return;

    const overId = event.over?.id as string | undefined;
    if (!overId) return;

    // Determine target column
    const targetCol = findColumnForId(overId);
    if (!targetCol || targetCol === dragFromCol) return;

    const allowed = getAllowedTargets(dragFromCol);
    if (!allowed.includes(targetCol)) return;

    // Confirm before moving to imposible
    if (targetCol === "imposible") {
      setConfirmDndInvalido({ item: dragItem, fromCol: dragFromCol, targetCol });
      return;
    }

    await executeDrop(dragItem, dragFromCol, targetCol);
  }, [activeItem, activeColumn, findColumnForId, executeDrop]);

  /* ── WhatsApp click ── */
  const handleWhatsAppClick = useCallback(async (item: ValidationItem) => {
    if (item.status !== "pendiente") return;
    setUpdatingId(item.id);
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "contactado" } : i));
    setStats((prev) => ({ ...prev, pendiente: Math.max(0, prev.pendiente - 1), contactado: prev.contactado + 1 }));
    await claimValidation(item.id, campaignId);
    const res = await updateValidationStatus(item.id, campaignId, "contactado");
    if (!res.ok) {
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "pendiente" } : i));
      setStats((prev) => ({ ...prev, pendiente: prev.pendiente + 1, contactado: Math.max(0, prev.contactado - 1) }));
      toast("Error al contactar", "error");
    }
    setUpdatingId(null);
  }, [campaignId, toast]);

  /* ── Card action handler ── */
  const handleCardAction = useCallback(async (
    item: ValidationItem,
    action: { type: "status"; status: string },
  ) => {
    setUpdatingId(item.id);
    if (action.type === "status") {
      const backendStatus = toBackendStatus(action.status as VisualColumn) as Parameters<typeof updateValidationStatus>[2];
      const voteClass = voteClassForColumn(action.status as VisualColumn);

      setItems((prev) => prev.map((i) =>
        i.id === item.id
          ? { ...i, status: backendStatus as ValidationItem["status"], vote_class: voteClass ?? i.vote_class }
          : i
      ));

      const res = await updateValidationStatus(item.id, campaignId, backendStatus, voteClass);
      if (res.ok && res.data) {
        setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, ...res.data!.item } : i));
        const statsRes = await getValidationStats(campaignId);
        if (statsRes.ok && statsRes.data) setStats(statsRes.data.stats);
      } else {
        setItems((prev) => prev.map((i) =>
          i.id === item.id
            ? { ...i, status: item.status, vote_class: item.vote_class }
            : i
        ));
        toast("Error al actualizar estado", "error");
      }
    }
    setUpdatingId(null);
  }, [campaignId, toast]);

  /* ── Group by visual column ── */
  const grouped = useMemo(() => {
    const groups: Record<VisualColumn, ValidationItem[]> = {
      pendiente: [], contactado: [], respondido: [],
      voto_blando: [], voto_duro: [], voto_flotante: [], imposible: [],
    };
    for (const item of filteredItems) {
      const st = item.status === ("validado" as string) ? "respondido" : item.status;
      const col = toVisualColumn(st, item.vote_class);
      groups[col]?.push(item);
    }
    return groups;
  }, [filteredItems]);

  /* ── Real totals per column ─────────────────────────────────────────
   * Para columnas con paginación, grouped[col].length solo refleja los
   * ítems cargados en memoria, no el total real.
   *
   * Fuente de verdad:
   *   pendiente  → stats.pendiente   (backend)
   *   contactado → stats.contactado  (backend)
   *   imposible  → stats.invalido    (backend, nombre diferente)
   *   respondido (total) → stats.respondido (backend)
   *
   * Para las subcolumnas de voto (blando/duro/flotante/respondido-sin-clase):
   * el backend no desglosa — calculamos la proporción sobre los ítems en
   * memoria y la proyectamos al total real de respondido.
   * Mientras no estén todos cargados mostramos el parcial + "+" indicando
   * que hay más.
   * ──────────────────────────────────────────────────────────────────── */
  const columnTotals = useMemo((): Record<VisualColumn, { count: number; isPartial: boolean }> => {
    const respondidoTotal = stats.respondido;
    const respondidoLoaded = grouped.respondido.length + grouped.voto_blando.length + grouped.voto_duro.length + grouped.voto_flotante.length;
    const respondidoIsPartial = respondidoLoaded < respondidoTotal;

    return {
      pendiente:     { count: stats.pendiente,           isPartial: false },
      contactado:    { count: stats.contactado,          isPartial: false },
      imposible:     { count: stats.invalido,            isPartial: false },
      // Subcolumnas de respondido: parciales hasta que todos los ítems estén cargados
      respondido:    { count: grouped.respondido.length,    isPartial: respondidoIsPartial },
      voto_blando:   { count: grouped.voto_blando.length,   isPartial: respondidoIsPartial },
      voto_duro:     { count: grouped.voto_duro.length,     isPartial: respondidoIsPartial },
      voto_flotante: { count: grouped.voto_flotante.length, isPartial: respondidoIsPartial },
    };
  }, [stats, grouped]);

  /* ── Blocked columns during drag ── */
  const blockedCols = useMemo((): Set<VisualColumn> => {
    if (!activeColumn) return new Set();
    const allowed = new Set(getAllowedTargets(activeColumn));
    allowed.add(activeColumn);
    return new Set(COLUMNS.map((c) => c.key).filter((k) => !allowed.has(k as VisualColumn))) as Set<VisualColumn>;
  }, [activeColumn]);

  const totalItems = items.length;
  const processed = stats.contactado + stats.respondido + stats.invalido;

  if (!campaign) return <div className="flex items-center justify-center h-64 text-slate-400">Campana no encontrada</div>;

  return (
    <>
      {/* DnD Imposible confirm */}
      <ConfirmModal
        open={confirmDndInvalido !== null}
        title="Mover a Imposible?"
        description="Esta tarjeta pasara a la columna Imposible. Puedes devolverla a pendiente despues."
        confirmLabel="Si, mover a Imposible"
        onConfirm={async () => {
          if (!confirmDndInvalido) return;
          setConfirmDndInvalido(null);
          await executeDrop(confirmDndInvalido.item, confirmDndInvalido.fromCol, "imposible");
        }}
        onCancel={() => setConfirmDndInvalido(null)}
      />

      <div className="flex flex-col h-[calc(100vh-48px)] bg-slate-50/50">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-200 shrink-0 flex-wrap gap-y-2">
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-slate-800">Validacion de Datos</h1>
            <p className="text-[11px] text-slate-400 mt-0.5">Arrastra las tarjetas entre columnas para clasificar</p>
          </div>

          {/* Filters */}
          {zonas.length > 1 && (
            <select
              value={filterZona}
              onChange={(e) => setFilterZona(e.target.value)}
              className="text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 outline-none focus:border-slate-400 cursor-pointer"
            >
              <option value="">Todas las zonas</option>
              {zonas.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          )}
          {encuestadores.length > 1 && (
            <select
              value={filterEnc}
              onChange={(e) => setFilterEnc(e.target.value)}
              className="text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 outline-none focus:border-slate-400 cursor-pointer"
            >
              <option value="">Todos los encuestadores</option>
              {encuestadores.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          )}
          {hasFilters && (
            <button
              type="button"
              onClick={() => { setSearch(""); setFilterZona(""); setFilterEnc(""); }}
              className="text-[10px] font-semibold text-indigo-600 hover:underline cursor-pointer border-none bg-transparent"
            >
              Limpiar filtros
            </button>
          )}

          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 focus-within:border-slate-400 focus-within:bg-white transition-all w-48">
            <SearchIcon />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nombre, tel..."
              className="flex-1 border-none outline-none bg-transparent text-sm text-slate-700 placeholder:text-slate-400"
            />
          </div>

          {/* Compact toggle */}
          <button
            type="button"
            onClick={() => setCompact((v: boolean) => !v)}
            title={compact ? "Vista detallada" : "Vista compacta"}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${compact
              ? "bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100"
              : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
              }`}
          >
            {compact ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
            )}
            {compact ? "Detallado" : "Compacto"}
          </button>

          {/* Stats counter + toggle */}
          <div className="relative flex items-center gap-2 shrink-0">
            <span className="text-xs text-slate-500 font-semibold tabular-nums">
              {totalItems}{hasMore ? `/${totalRecords}` : ""} registros
            </span>
            <button
              type="button"
              onClick={() => setStatsOpen((v: boolean) => !v)}
              className="text-xs text-slate-400 font-medium hover:text-slate-600 transition-colors border-none bg-transparent cursor-pointer tabular-nums"
              title="Ver estadisticas detalladas"
            >
              {totalRecords > 0 ? `${Math.round((processed / totalRecords) * 100)}%` : "0%"}
            </button>
            {statsOpen && (
              <StatsPanel stats={stats} items={items} total={totalRecords || totalItems} columnTotals={columnTotals} />
            )}
          </div>
        </div>

        {/* Stats mini-bar */}
        {!loading && (
          <div className="flex items-center gap-4 px-4 py-1.5 border-b border-slate-100 bg-white text-[11px] shrink-0">
            {COLUMNS.map((col) => {
              const total = columnTotals[col.key];
              return (
                <span key={col.key} className="flex items-center gap-1 font-semibold" style={{ color: col.accent }}>
                  <span style={{ color: col.accent }}>{col.icon()}</span>
                  <span className="text-slate-500 font-normal">{col.label}</span>
                  <span className="tabular-nums">
                    {total.count}{total.isPartial ? "+" : ""}
                  </span>
                </span>
              );
            })}
            <span className="ml-auto text-slate-400 tabular-nums">
              {totalRecords > 0
                ? `${Math.round(((stats.contactado + stats.respondido + stats.invalido) / totalRecords) * 100)}%`
                : "0%"}{" "}procesado
            </span>
          </div>
        )}

        {/* Board */}
        {loading ? (
          <div className="flex items-center justify-center flex-1 gap-3">
            <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
            <span className="text-sm text-slate-400 font-medium">Cargando datos...</span>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div
              className="flex-1 flex gap-3 px-4 py-3 overflow-x-auto min-h-0"
              onClick={() => setStatsOpen(false)}
              onKeyDown={(e) => { if (e.key === "Escape") setStatsOpen(false); }}
              role="presentation"
            >
              {COLUMNS.map((col) => {
                const total = columnTotals[col.key];
                return (
                  <DroppableColumn
                    key={col.key}
                    col={col}
                    items={grouped[col.key]}
                    isOver={overColumn === col.key}
                    isBlocked={activeColumn !== null && blockedCols.has(col.key)}
                    totalItems={total.count}
                    totalIsPartial={total.isPartial}
                    hasMoreGlobal={hasMore}
                    loadingMore={loadingMore}
                    collapsed={collapsedCols.has(col.key) || (activeColumn !== null && blockedCols.has(col.key))}
                    onToggleCollapse={() => toggleColCollapse(col.key)}
                    onLoadMore={fetchMore}
                    renderCard={(item) => (
                      <DraggableCard
                        key={item.id}
                        item={item}
                        column={col.key}
                        isUpdating={updatingId === item.id}
                        columnColor={col.accent}
                        compact={compact}
                        onWhatsAppClick={handleWhatsAppClick}
                        onAction={handleCardAction}
                      />
                    )}
                  />
                );
              })}
            </div>

            <DragOverlay
              dropAnimation={{
                duration: 200,
                easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
              }}
            >
              {activeItem ? (
                <DragOverlayCard item={activeItem} targetColumn={overColumn} />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </>
  );
}

/* ── Page root wraps board in ToastProvider ── */
export default function ValidacionPage() {
  return (
    <ToastProvider>
      <ValidacionBoard />
    </ToastProvider>
  );
}
