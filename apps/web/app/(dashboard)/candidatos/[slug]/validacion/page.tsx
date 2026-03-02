"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
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
import {
  COLUMNS,
  SearchIcon,
  toVisualColumn,
  toBackendStatus,
  defaultTagsForColumn,
  getAllowedTargets,
  type VisualColumn,
} from "./_components";
import { DroppableColumn } from "./_components/droppable-column";
import { DraggableCard } from "./_components/draggable-card";
import { DragOverlayCard } from "./_components/drag-overlay-card";
import { ToastProvider, useToast } from "./_components/toast";
import { ConfirmModal } from "./_components/confirm-modal";

/* ── Pagination config ── */
const PAGE_LIMIT = 100;


/* ── Stats expandable panel ── */
function StatsPanel({ stats, items, total }: { stats: ValidationStats; items: ValidationItem[]; total: number }) {
  const processed = stats.contactado + stats.respondido + stats.invalido;
  const conversion = stats.contactado > 0 ? Math.round((stats.respondido / (stats.contactado + stats.respondido)) * 100) : 0;

  // Top encuestadores
  const byEncuestador: Record<string, number> = {};
  for (const item of items) {
    const name = item.encuestador?.split(" ")[0] || "Desconocido";
    byEncuestador[name] = (byEncuestador[name] ?? 0) + 1;
  }
  const topEnc = Object.entries(byEncuestador)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Vote distribution (from items in memory)
  const voteDuro = items.filter((i) => i.vote_class === "duro").length;
  const voteBlando = items.filter((i) => i.vote_class === "blando").length;
  const voteTibio = items.filter((i) => i.status === "respondido" && i.vote_class !== "duro" && i.vote_class !== "blando").length;

  return (
    <div className="absolute top-full right-0 mt-2 z-50 w-80 bg-white rounded-xl border border-slate-200 shadow-xl p-4 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-slate-50 p-2.5">
          <div className="text-[10px] text-slate-400 font-medium">Procesados</div>
          <div className="text-lg font-black text-slate-700">{processed}<span className="text-[11px] font-medium text-slate-400">/{total}</span></div>
        </div>
        <div className="rounded-lg bg-slate-50 p-2.5">
          <div className="text-[10px] text-slate-400 font-medium">Conversión</div>
          <div className="text-lg font-black text-cyan-600">{conversion}%</div>
        </div>
        <div className="rounded-lg bg-emerald-50 p-2.5">
          <div className="text-[10px] text-emerald-700 font-medium">Voto Duro</div>
          <div className="text-lg font-black text-emerald-700">{voteDuro}</div>
        </div>
        <div className="rounded-lg bg-yellow-50 p-2.5">
          <div className="text-[10px] text-yellow-700 font-medium">Voto Blando</div>
          <div className="text-lg font-black text-yellow-600">{voteBlando}</div>
        </div>
      </div>
      {topEnc.length > 0 && (
        <div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Top encuestadores</div>
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

  /* ── Pending DnD inválido confirm ── */
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
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  /* ── DnD handlers ── */
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as { item: ValidationItem; column: VisualColumn } | undefined;
    if (data) { setActiveItem(data.item); setActiveColumn(data.column); }
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setOverColumn(event.over?.id as VisualColumn | null);
  }, []);

  const executeDrop = useCallback(async (
    item: ValidationItem,
    fromCol: VisualColumn,
    targetCol: VisualColumn,
  ) => {
    const newStatus = toBackendStatus(targetCol);
    const tags = defaultTagsForColumn(targetCol);

    setUpdatingId(item.id);
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
      undefined,
      tags.length > 0 ? tags : undefined,
    );
    if (res.ok && res.data) {
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, ...res.data!.item } : i));
      const statsRes = await getValidationStats(campaignId);
      if (statsRes.ok && statsRes.data) setStats(statsRes.data.stats);
      toast(`Movido a ${COLUMNS.find((c) => c.key === targetCol)?.label ?? targetCol}`, "success");
    } else {
      toast("Error al mover la tarjeta", "error");
    }
    setUpdatingId(null);
  }, [campaignId, toast]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveItem(null);
    setActiveColumn(null);
    setOverColumn(null);

    const data = event.active.data.current as { item: ValidationItem; column: VisualColumn } | undefined;
    const targetCol = event.over?.id as VisualColumn | undefined;
    if (!data || !targetCol || data.column === targetCol) return;

    const allowed = getAllowedTargets(data.column);
    if (!allowed.includes(targetCol)) return;

    // Confirm before moving to invalido
    if (targetCol === "invalido") {
      setConfirmDndInvalido({ item: data.item, fromCol: data.column, targetCol });
      return;
    }

    await executeDrop(data.item, data.column, targetCol);
  }, [executeDrop]);

  /* ── WhatsApp click ── */
  const handleWhatsAppClick = useCallback(async (item: ValidationItem) => {
    if (item.status !== "pendiente") return;
    setUpdatingId(item.id);
    // Optimistic update
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "contactado" } : i));
    setStats((prev) => ({ ...prev, pendiente: Math.max(0, prev.pendiente - 1), contactado: prev.contactado + 1 }));
    await claimValidation(item.id, campaignId);
    const res = await updateValidationStatus(item.id, campaignId, "contactado");
    if (!res.ok) {
      // Revert on failure
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "pendiente" } : i));
      setStats((prev) => ({ ...prev, pendiente: prev.pendiente + 1, contactado: Math.max(0, prev.contactado - 1) }));
      toast("Error al contactar", "error");
    }
    setUpdatingId(null);
  }, [campaignId, toast]);

  /* ── Card action handler ── */
  const handleCardAction = useCallback(async (
    item: ValidationItem,
    action: { type: "status"; status: string; tags?: string[] } | { type: "tags"; tags: string[] },
  ) => {
    setUpdatingId(item.id);
    if (action.type === "status") {
      const newStatus = action.status as Parameters<typeof updateValidationStatus>[2];
      const res = await updateValidationStatus(item.id, campaignId, newStatus, undefined, action.tags);
      if (res.ok && res.data) {
        setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, ...res.data!.item } : i));
        const statsRes = await getValidationStats(campaignId);
        if (statsRes.ok && statsRes.data) setStats(statsRes.data.stats);
      } else {
        toast("Error al actualizar estado", "error");
      }
    } else {
      const res = await updateValidationStatus(item.id, campaignId, "respondido", undefined, action.tags);
      if (res.ok && res.data) {
        setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, ...res.data!.item } : i));
      } else {
        toast("Error al guardar etiquetas", "error");
      }
    }
    setUpdatingId(null);
  }, [campaignId, toast]);

  /* ── Group by visual column ── */
  const grouped = useMemo(() => {
    const groups: Record<VisualColumn, ValidationItem[]> = {
      pendiente: [], contactado: [], respondido: [], voto_blando: [], voto_duro: [], invalido: [],
    };
    for (const item of filteredItems) {
      const st = item.status === ("validado" as string) ? "respondido" : item.status;
      const col = toVisualColumn(st, item.vote_class);
      groups[col]?.push(item);
    }
    return groups;
  }, [filteredItems]);

  /* ── Blocked columns during drag ── */
  const blockedCols = useMemo((): Set<VisualColumn> => {
    if (!activeColumn) return new Set();
    const allowed = new Set(getAllowedTargets(activeColumn));
    allowed.add(activeColumn); // own column never blocked
    return new Set(COLUMNS.map((c) => c.key).filter((k) => !allowed.has(k as VisualColumn))) as Set<VisualColumn>;
  }, [activeColumn]);

  const totalItems = items.length;
  const processed = stats.contactado + stats.respondido + stats.invalido;

  if (!campaign) return <div className="flex items-center justify-center h-64 text-slate-400">{"Campaña no encontrada"}</div>;

  return (
    <>
      {/* DnD Inválido confirm */}
      <ConfirmModal
        open={confirmDndInvalido !== null}
        title="¿Mover a Inválido?"
        description="Esta tarjeta pasará a la columna Inválido. Puedes devolverla a pendiente después."
        confirmLabel="Sí, mover a Inválido"
        onConfirm={async () => {
          if (!confirmDndInvalido) return;
          setConfirmDndInvalido(null);
          await executeDrop(confirmDndInvalido.item, confirmDndInvalido.fromCol, "invalido");
        }}
        onCancel={() => setConfirmDndInvalido(null)}
      />

      <div className="flex flex-col h-[calc(100vh-48px)] bg-slate-50/50">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-200 shrink-0 flex-wrap gap-y-2">
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-slate-800">{"Validación de Datos"}</h1>
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

          {/* Stats counter + toggle */}
          <div className="relative flex items-center gap-2 shrink-0">
            <span className="text-xs text-slate-500 font-semibold tabular-nums">
              {totalItems}{hasMore ? `/${totalRecords}` : ""} registros
            </span>
            <button
              type="button"
              onClick={() => setStatsOpen((v: boolean) => !v)}
              className="text-xs text-slate-400 font-medium hover:text-slate-600 transition-colors border-none bg-transparent cursor-pointer tabular-nums"
              title="Ver estadísticas detalladas"
            >
              {totalRecords > 0 ? `${Math.round((processed / totalRecords) * 100)}%` : "0%"}
            </button>
            {statsOpen && (
              <StatsPanel stats={stats} items={items} total={totalRecords || totalItems} />
            )}
          </div>
        </div>

        {/* Board */}
        {loading ? (
          <div className="flex items-center justify-center flex-1 gap-3">
            <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
            <span className="text-sm text-slate-400 font-medium">Cargando datos...</span>
          </div>
        ) : (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
            <div className="flex-1 flex gap-3 px-4 py-3 overflow-x-auto min-h-0" onClick={() => setStatsOpen(false)}>
              {COLUMNS.map((col) => (
                <DroppableColumn
                  key={col.key}
                  col={col}
                  items={grouped[col.key]}
                  isOver={overColumn === col.key}
                  isBlocked={activeColumn !== null && blockedCols.has(col.key)}
                  totalItems={grouped[col.key].length}
                  hasMoreGlobal={hasMore}
                  loadingMore={loadingMore}
                  onLoadMore={fetchMore}
                  renderCard={(item) => (
                    <DraggableCard
                      key={item.id}
                      item={item}
                      column={col.key}
                      isUpdating={updatingId === item.id}
                      columnColor={col.accent}
                      onWhatsAppClick={handleWhatsAppClick}
                      onAction={handleCardAction}
                    />
                  )}
                />
              ))}
            </div>
            <DragOverlay dropAnimation={null}>
              {activeItem ? <DragOverlayCard item={activeItem} /> : null}
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
