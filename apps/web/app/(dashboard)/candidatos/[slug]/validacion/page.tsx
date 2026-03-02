"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
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
  openWhatsApp,
  type VisualColumn,
} from "./_components";
import { DroppableColumn } from "./_components/droppable-column";
import { DraggableCard } from "./_components/draggable-card";
import { DragOverlayCard } from "./_components/drag-overlay-card";

/* ── Pagination config ── */
const PAGE_LIMIT = 100;

/* ========== Page ========== */

export default function ValidacionPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { campaigns } = useAuth();
  const campaign = campaigns.find((c) => c.slug === slug);
  const campaignId = campaign?.id ?? "";

  const [items, setItems] = useState<ValidationItem[]>([]);
  const [stats, setStats] = useState<ValidationStats>({ pendiente: 0, contactado: 0, respondido: 0, invalido: 0 });
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeItem, setActiveItem] = useState<ValidationItem | null>(null);
  const [overColumn, setOverColumn] = useState<VisualColumn | null>(null);

  /* ── Pagination state ── */
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasMore = items.length < totalRecords;

  /* ── Fetch initial page ── */
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

  /* ── Fetch next page (appends to items) ── */
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

  /* ── DnD sensors (require 8px movement to start dragging) ── */
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  /* ── DnD handlers ── */
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as { item: ValidationItem; column: VisualColumn } | undefined;
    if (data) setActiveItem(data.item);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setOverColumn(event.over?.id as VisualColumn | null);
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveItem(null);
    setOverColumn(null);

    const data = event.active.data.current as { item: ValidationItem; column: VisualColumn } | undefined;
    const targetCol = event.over?.id as VisualColumn | undefined;
    if (!data || !targetCol || data.column === targetCol) return;

    // Validate the move is allowed
    const allowed = getAllowedTargets(data.column);
    if (!allowed.includes(targetCol)) return;

    const item = data.item;
    const newStatus = toBackendStatus(targetCol);
    const tags = defaultTagsForColumn(targetCol);

    setUpdatingId(item.id);

    // If moving from pendiente, claim first then open WhatsApp
    if (data.column === "pendiente" && targetCol === "contactado") {
      await claimValidation(item.id, campaignId);
      openWhatsApp(item.telefono, item.nombre);
    }

    const res = await updateValidationStatus(item.id, campaignId, newStatus as Parameters<typeof updateValidationStatus>[2], undefined, tags.length > 0 ? tags : undefined);
    if (res.ok && res.data) {
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, ...res.data!.item } : i));
      // Refresh stats
      const statsRes = await getValidationStats(campaignId);
      if (statsRes.ok && statsRes.data) setStats(statsRes.data.stats);
    }
    setUpdatingId(null);
  }, [campaignId]);

  /* ── WhatsApp click (pendiente only — claims lead but does NOT move to contactado) ── */
  /* The card moves to contactado ONLY when the extension detects a message was actually sent */
  const handleWhatsAppClick = useCallback(async (item: ValidationItem) => {
    if (item.status !== "pendiente") return;
    setUpdatingId(item.id);
    await claimValidation(item.id, campaignId);
    setUpdatingId(null);
  }, [campaignId]);

  /* ── Listen for messageSent events from the Chrome extension ── */
  /* Extension content.js on WA Web detects send → background.js → interceptor.js on dashboard → CustomEvent */
  useEffect(() => {
    function handleMessageSent(e: Event) {
      const detail = (e as CustomEvent<{ phone: string }>).detail;
      if (!detail?.phone) return;

      const sentPhone = detail.phone.replace(/\D/g, "");
      // Strip Peru country code for matching (51XXXXXXXXX → XXXXXXXXX)
      const sentLocal = sentPhone.length === 11 && sentPhone.startsWith("51")
        ? sentPhone.slice(2)
        : sentPhone;

      console.log("[Validacion] messageSent event received for phone:", sentLocal);

      // Find the matching pendiente item by phone number
      setItems((prev) => {
        const match = prev.find((i) => {
          if (i.status !== "pendiente") return false;
          const itemPhone = i.telefono.replace(/\D/g, "");
          return itemPhone === sentLocal || itemPhone === sentPhone;
        });

        if (!match) {
          console.log("[Validacion] No matching pendiente item for phone:", sentLocal);
          return prev;
        }

        console.log("[Validacion] Moving item to contactado:", match.id, match.nombre);

        // Optimistic UI update
        const updated = prev.map((i) =>
          i.id === match.id ? { ...i, status: "contactado" as const } : i,
        );

        // Fire the API call (non-blocking)
        updateValidationStatus(match.id, campaignId, "contactado").then((res) => {
          if (res.ok && res.data) {
            setItems((curr) =>
              curr.map((i) => (i.id === match.id ? { ...i, ...res.data!.item } : i)),
            );
          }
          // Refresh stats
          getValidationStats(campaignId).then((statsRes) => {
            if (statsRes.ok && statsRes.data) setStats(statsRes.data.stats);
          });
        });

        // Optimistic stats update
        setStats((s) => ({
          ...s,
          pendiente: Math.max(0, s.pendiente - 1),
          contactado: s.contactado + 1,
        }));

        return updated;
      });
    }

    window.addEventListener("goberna:messageSent", handleMessageSent);
    return () => window.removeEventListener("goberna:messageSent", handleMessageSent);
  }, [campaignId]);

  /* ── Card action handler (buttons + tag toggles) ── */
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
      }
    } else if (action.type === "tags") {
      // Update tags on a respondido item — status stays respondido, tags change
      const res = await updateValidationStatus(item.id, campaignId, "respondido", undefined, action.tags);
      if (res.ok && res.data) {
        setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, ...res.data!.item } : i));
      }
    }

    setUpdatingId(null);
  }, [campaignId]);

  /* ── Group items by visual column ── */
  const grouped = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = q
      ? items.filter((i) => i.nombre.toLowerCase().includes(q) || i.telefono.includes(q) || i.encuestador.toLowerCase().includes(q))
      : items;
    const groups: Record<VisualColumn, ValidationItem[]> = {
      pendiente: [], contactado: [], respondido: [], voto_blando: [], voto_duro: [], invalido: [],
    };
    for (const item of filtered) {
      const st = item.status === ("validado" as string) ? "respondido" : item.status;
      const col = toVisualColumn(st, item.vote_class);
      groups[col]?.push(item);
    }
    return groups;
  }, [items, search]);

  const totalItems = items.length;
  const processed = stats.contactado + stats.respondido + stats.invalido;

  if (!campaign) return <div className="flex items-center justify-center h-64 text-slate-400">{"Campaña no encontrada"}</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] bg-slate-50/50">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-200 shrink-0">
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-slate-800">{"Validación de Datos"}</h1>
          <p className="text-[11px] text-slate-400 mt-0.5">Arrastra las tarjetas entre columnas para clasificar</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 focus-within:border-slate-400 focus-within:bg-white transition-all w-56">
          <SearchIcon />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nombre, tel..."
            className="flex-1 border-none outline-none bg-transparent text-sm text-slate-700 placeholder:text-slate-400" />
        </div>
        <div className="text-xs text-slate-500 font-semibold tabular-nums shrink-0">
          {totalItems}{hasMore ? `/${totalRecords}` : ""} registros
        </div>
        {totalRecords > 0 && (
          <div className="text-xs text-slate-400 font-medium shrink-0">{Math.round((processed / totalRecords) * 100)}%</div>
        )}
      </div>

      {/* Board */}
      {loading ? (
        <div className="flex items-center justify-center flex-1 gap-3">
          <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
          <span className="text-sm text-slate-400 font-medium">Cargando datos...</span>
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          <div className="flex-1 flex gap-3 px-4 py-3 overflow-x-auto min-h-0">
            {COLUMNS.map((col) => (
              <DroppableColumn
                key={col.key}
                col={col}
                count={grouped[col.key].length}
                isOver={overColumn === col.key}
                totalItems={grouped[col.key].length}
                hasMoreGlobal={hasMore}
                loadingMore={loadingMore}
                onLoadMore={fetchMore}
              >
                {grouped[col.key].map((item) => (
                  <DraggableCard
                    key={item.id}
                    item={item}
                    column={col.key}
                    isUpdating={updatingId === item.id}
                    columnColor={col.accent}
                    onWhatsAppClick={handleWhatsAppClick}
                    onAction={handleCardAction}
                  />
                ))}
              </DroppableColumn>
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeItem ? <DragOverlayCard item={activeItem} /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
