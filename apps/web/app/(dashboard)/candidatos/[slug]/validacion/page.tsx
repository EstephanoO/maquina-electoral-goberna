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
  type VisualColumn,
} from "./_components";
import { DroppableColumn } from "./_components/droppable-column";
import { DraggableCard } from "./_components/draggable-card";
import { DragOverlayCard } from "./_components/drag-overlay-card";

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

  /* ── Fetch ── */
  const fetchData = useCallback(async () => {
    if (!campaignId) return;
    const [itemsRes, statsRes] = await Promise.all([
      listValidations(campaignId),
      getValidationStats(campaignId),
    ]);
    if (itemsRes.ok && itemsRes.data) setItems(itemsRes.data.items);
    if (statsRes.ok && statsRes.data) setStats(statsRes.data.stats);
    setLoading(false);
  }, [campaignId]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
      window.open(
        `https://wa.me/51${item.telefono.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola, ${item.nombre || ""}`)}`,
        "_blank",
        "noopener,noreferrer",
      );
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

  /* ── WhatsApp click (pendiente only) ── */
  const handleWhatsAppClick = useCallback(async (item: ValidationItem) => {
    if (item.status !== "pendiente") return;
    setUpdatingId(item.id);
    await claimValidation(item.id, campaignId);
    const res = await updateValidationStatus(item.id, campaignId, "contactado");
    if (res.ok) {
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "contactado" } : i));
      setStats((prev) => ({ ...prev, pendiente: Math.max(0, prev.pendiente - 1), contactado: prev.contactado + 1 }));
    }
    setUpdatingId(null);
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
        <div className="text-xs text-slate-500 font-semibold tabular-nums shrink-0">{totalItems} registros</div>
        {totalItems > 0 && (
          <div className="text-xs text-slate-400 font-medium shrink-0">{Math.round((processed / totalItems) * 100)}%</div>
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
              <DroppableColumn key={col.key} col={col} count={grouped[col.key].length} isOver={overColumn === col.key}>
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
