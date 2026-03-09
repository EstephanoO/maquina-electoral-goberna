"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ValidationItem } from "@/lib/services/validacion";

import {
  type VisualColumn,
  VOTE_BADGES,
  WhatsAppIcon,
  GripIcon,
  BanIcon,
  fmtDateShort,
  fmtPhone,
  waLink,
} from "./constants";
import { ConfirmModal } from "./confirm-modal";
import { useToast } from "./toast";

/* ── Tiny icons ── */

function UndoIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

/* ── Types ── */

type CardAction = {
  type: "status";
  status: "contactado" | "respondido" | "imposible" | "pendiente";
};

/* ── Main component ── */

export function DraggableCard({
  item,
  column,
  isUpdating,
  columnColor,
  compact = false,
  onWhatsAppClick,
  onAction,
}: {
  item: ValidationItem;
  column: VisualColumn;
  isUpdating: boolean;
  columnColor: string;
  compact?: boolean;
  onWhatsAppClick: (item: ValidationItem) => void;
  onAction: (item: ValidationItem, action: CardAction) => Promise<void> | void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    data: { item, column },
    disabled: isUpdating,
  });

  const { toast } = useToast();
  const [confirmImposible, setConfirmImposible] = useState(false);
  const [pendingAction, setPendingAction] = useState<CardAction | null>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const phone = fmtPhone(item.telefono);
  const link = waLink(item.telefono, item.nombre);
  const isPendiente = column === "pendiente";
  const isContactado = column === "contactado";
  const isRespondido = column === "respondido" || column === "voto_blando" || column === "voto_duro" || column === "voto_flotante";
  const isImposible = column === "imposible";
  const voteBadge = isRespondido && item.vote_class ? VOTE_BADGES[item.vote_class] : null;

  /* ── Confirm before imposible ── */
  function requestImposible(action: CardAction) {
    setPendingAction(action);
    setConfirmImposible(true);
  }

  async function confirmImposibleAction() {
    if (pendingAction) await onAction(item, pendingAction);
    setConfirmImposible(false);
    setPendingAction(null);
  }

  /* ── Claimed by initials ── */
  const claimedInitials = item.claimed_by_name
    ? item.claimed_by_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : null;

  return (
    <>
      <ConfirmModal
        open={confirmImposible}
        title="Marcar como Imposible?"
        description="Esta tarjeta pasara a la columna Imposible. Puedes devolverla a pendiente despues."
        confirmLabel="Si, marcar como Imposible"
        onConfirm={confirmImposibleAction}
        onCancel={() => { setConfirmImposible(false); setPendingAction(null); }}
      />

      <div
        ref={setNodeRef}
        style={style}
        aria-label={item.nombre || "Contacto"}
        {...(compact ? { ...listeners, ...attributes } : {})}
        className={`
          relative rounded-lg bg-white
          transition-shadow duration-200
          group
          ${isDragging
            ? "opacity-0 scale-95"
            : "shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
          }
          ${isUpdating ? "opacity-50 pointer-events-none" : ""}
          ${compact ? "cursor-grab active:cursor-grabbing" : ""}
        `}
      >
        {/* Color accent strip */}
        <div
          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
          style={{ backgroundColor: columnColor }}
        />

        <div className="pl-3.5 pr-2.5 py-2.5">
          {/* Top row: name + drag handle */}
          <div className="flex items-start gap-1.5">
            <div className="flex-1 min-w-0">
              {/* Name + badges */}
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-[13px] text-slate-800 truncate leading-tight" title={item.nombre}>
                  {item.nombre || "\u2014"}
                </span>
                {voteBadge && (
                  <span
                    className="text-[7px] font-black px-1.5 py-0.5 rounded-full shrink-0 tracking-wider uppercase"
                    style={{ color: voteBadge.color, background: voteBadge.bg }}
                  >
                    {voteBadge.label}
                  </span>
                )}
                {item.notes && (
                  <span className="shrink-0 text-slate-400" title={item.notes}>
                    <NoteIcon />
                  </span>
                )}
              </div>

              {/* Phone + WhatsApp */}
              <div className="flex items-center gap-2 mt-1.5">
                {isPendiente ? (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(link, "_blank", "noopener,noreferrer");
                      onWhatsAppClick(item);
                    }}
                    disabled={isUpdating}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-green-50 text-green-700 text-[11px] font-bold hover:bg-green-100 active:bg-green-200 transition-colors cursor-pointer border-none disabled:opacity-40"
                    title="Contactar por WhatsApp (reclama el lead)"
                  >
                    <WhatsAppIcon />
                    {phone}
                  </button>
                ) : (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-green-50/80 text-green-700 text-[11px] font-semibold hover:bg-green-100 transition-colors no-underline"
                  >
                    <WhatsAppIcon />
                    {phone}
                  </a>
                )}
              </div>
            </div>

            {/* Drag handle */}
            {!compact && (
              <div
                {...listeners}
                {...attributes}
                className="
                  mt-0.5 w-6 h-6 rounded-md flex items-center justify-center shrink-0
                  cursor-grab active:cursor-grabbing
                  text-slate-300 hover:text-slate-500 hover:bg-slate-100
                  transition-colors duration-150
                  touch-none
                "
                title="Arrastrar"
              >
                <GripIcon />
              </div>
            )}
          </div>

          {/* Meta row: departamento + zona + claimed_by */}
          {!compact && (item.departamento || (item.zona && item.zona !== "Sin zona") || claimedInitials) && (
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {item.departamento && (
                <span className="flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 rounded px-1.5 py-0.5">
                  <MapPinIcon />
                  {item.departamento.charAt(0) + item.departamento.slice(1).toLowerCase()}
                </span>
              )}
              {item.zona && item.zona !== "Sin zona" && (
                <span className="flex items-center gap-0.5 text-[10px] text-slate-400 bg-slate-50 rounded px-1.5 py-0.5">
                  {item.zona}
                </span>
              )}
              {claimedInitials && (
                <span
                  className="flex items-center gap-0.5 text-[10px] text-indigo-500 bg-indigo-50 rounded px-1.5 py-0.5"
                  title={`Tomado por ${item.claimed_by_name}`}
                >
                  <UserIcon />
                  {item.claimed_by_name?.split(" ")[0]}
                </span>
              )}
            </div>
          )}

          {/* Action buttons */}
          {!compact && (
            <>
              {/* CONTACTADO: Respondio + Imposible */}
              {isContactado && (
                <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-slate-100/80">
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onAction(item, { type: "status", status: "respondido" }); toast("Marcado como respondido", "success"); }}
                    disabled={isUpdating}
                    className="flex-1 py-1.5 rounded-md bg-emerald-50 text-emerald-600 text-[11px] font-bold hover:bg-emerald-100 active:bg-emerald-200 transition-colors cursor-pointer border-none disabled:opacity-40"
                  >
                    Respondio
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); requestImposible({ type: "status", status: "imposible" }); }}
                    disabled={isUpdating}
                    className="w-7 h-7 flex items-center justify-center rounded-md bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors cursor-pointer border-none disabled:opacity-40"
                    title="Marcar como imposible"
                    aria-label="Imposible"
                  >
                    <BanIcon />
                  </button>
                </div>
              )}

              {/* RESPONDIDO: imposible button */}
              {isRespondido && (
                <div className="mt-2 pt-2 border-t border-slate-100/80">
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); requestImposible({ type: "status", status: "imposible" }); }}
                    disabled={isUpdating}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-red-400 text-[10px] font-semibold hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer border-none disabled:opacity-40"
                  >
                    <BanIcon />
                    Imposible
                  </button>
                </div>
              )}

              {/* IMPOSIBLE: reabrir */}
              {isImposible && (
                <div className="mt-2.5 pt-2 border-t border-slate-100/80">
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onAction(item, { type: "status", status: "pendiente" }); toast("Devuelto a pendiente", "info"); }}
                    disabled={isUpdating}
                    className="w-full py-1.5 rounded-md bg-slate-50 text-slate-500 text-[11px] font-semibold hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer border-none disabled:opacity-40 flex items-center justify-center gap-1"
                  >
                    <UndoIcon />
                    Reabrir
                  </button>
                </div>
              )}
            </>
          )}

          {/* Footer: encuestador + date */}
          {!compact && (
            <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-slate-400">
              <span className="font-medium text-slate-500 truncate">
                {item.encuestador?.split(" ")[0] || "\u2014"}
              </span>
              <span className="text-slate-300">{"\u00b7"}</span>
              <span>{fmtDateShort(item.created_at)}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
