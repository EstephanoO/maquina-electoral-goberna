"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { ValidationItem } from "@/lib/services/validacion";

import {
  type VisualColumn,
  VOTE_BADGES,
  WhatsAppIcon,
  GripIcon,
  BanIcon,
  ChatIcon,
  fmtDateShort,
  fmtPhone,
  waLink,
} from "./constants";
import { ConfirmModal } from "./confirm-modal";
import { useToast } from "./toast";

/* ─── Tiny icons ─── */

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
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

/* ─── Types ─── */

type CardAction = {
  type: "status";
  status: "contactado" | "respondido" | "imposible" | "pendiente";
};

/* ─── Main component ─── */

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
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: { item, column },
    disabled: isUpdating,
  });

  const { toast } = useToast();
  const [confirmImposible, setConfirmImposible] = useState(false);
  const [pendingAction, setPendingAction] = useState<CardAction | null>(null);

  const style = {
    transform: CSS.Translate.toString(transform),
    borderLeftWidth: 3,
    borderLeftColor: columnColor,
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
        title="¿Marcar como Imposible?"
        description="Esta tarjeta pasará a la columna Imposible. Puedes devolverla a pendiente después."
        confirmLabel="Sí, marcar como Imposible"
        onConfirm={confirmImposibleAction}
        onCancel={() => { setConfirmImposible(false); setPendingAction(null); }}
      />

      <div
        ref={setNodeRef}
        style={style}
        aria-label={item.nombre || "Contacto"}
        {...(compact ? { ...listeners, ...attributes } : {})}
        className={`relative rounded-lg border border-slate-100 bg-white p-2.5 transition-all group ${isDragging ? "opacity-30 shadow-lg z-50 rotate-1" : "hover:shadow-sm"
          } ${isUpdating ? "opacity-50 pointer-events-none" : ""} ${compact ? "cursor-grab active:cursor-grabbing" : ""}`}
      >
        {/* Drag handle — hidden in compact mode (whole card is draggable) */}
        {!compact && (
          <div
            {...listeners}
            {...attributes}
            className="absolute top-2 right-2 w-5 h-5 rounded flex items-center justify-center cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Arrastrar"
          >
            <GripIcon />
          </div>
        )}

        {/* Name + vote badge */}
        <div className="flex items-center gap-1.5 pr-6">
          <span className="font-semibold text-[13px] text-slate-800 truncate leading-tight" title={item.nombre}>
            {item.nombre || "—"}
          </span>
          {voteBadge && (
            <span
              className="text-[8px] font-black px-1.5 py-0.5 rounded-full shrink-0 tracking-wide"
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
        <div className="flex items-center gap-2 mt-1">
          {isPendiente ? (
            <button
              type="button"
              onClick={() => {
                window.open(link, "_blank", "noopener,noreferrer");
                onWhatsAppClick(item);
              }}
              disabled={isUpdating}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-green-50 text-green-700 text-[11px] font-bold hover:bg-green-100 transition-colors cursor-pointer border-none disabled:opacity-40"
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
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-green-50 text-green-700 text-[11px] font-bold hover:bg-green-100 transition-colors no-underline"
            >
              <WhatsAppIcon />
              {phone}
            </a>
          )}
        </div>

        {/* Zona + claimed_by row */}
        {!compact && (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {item.zona && item.zona !== "Sin zona" && (
              <span className="flex items-center gap-1 text-[10px] text-slate-500 bg-slate-50 rounded-full px-1.5 py-0.5">
                <MapPinIcon />
                {item.zona}
              </span>
            )}
            {claimedInitials && (
              <span
                className="flex items-center gap-1 text-[10px] text-indigo-600 bg-indigo-50 rounded-full px-1.5 py-0.5"
                title={`Tomado por ${item.claimed_by_name}`}
              >
                <UserIcon />
                {item.claimed_by_name?.split(" ")[0]}
              </span>
            )}
          </div>
        )}

        {/* ── Action buttons ── */}
        {!compact && (
          <>
            {/* CONTACTADO: Respondió (big) + X imposible (small) */}
            {isContactado && (
              <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { onAction(item, { type: "status", status: "respondido" }); toast("Marcado como respondido", "success"); }}
                  disabled={isUpdating}
                  className="flex-1 py-1.5 rounded-lg border border-emerald-300 bg-white text-emerald-600 text-[11px] font-bold hover:bg-emerald-50 transition-colors cursor-pointer disabled:opacity-40"
                >
                  Respondió
                </button>
                <button
                  type="button"
                  onClick={() => requestImposible({ type: "status", status: "imposible" })}
                  disabled={isUpdating}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-red-200 bg-white text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors cursor-pointer disabled:opacity-40"
                  title="Marcar como imposible"
                  aria-label="Imposible"
                >
                  <BanIcon />
                </button>
              </div>
            )}

            {/* RESPONDIDO: imposible button */}
            {isRespondido && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => requestImposible({ type: "status", status: "imposible" })}
                  disabled={isUpdating}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 text-red-600 text-[10px] font-bold hover:bg-red-100 transition-colors cursor-pointer border-none disabled:opacity-40"
                >
                  <BanIcon />
                  Imposible
                </button>
              </div>
            )}

            {/* IMPOSIBLE: reabrir */}
            {isImposible && (
              <div className="mt-3 pt-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { onAction(item, { type: "status", status: "pendiente" }); toast("Devuelto a pendiente", "info"); }}
                  disabled={isUpdating}
                  className="w-full py-1.5 rounded-lg bg-slate-50 text-slate-600 text-[11px] font-semibold border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-40"
                >
                  Reabrir
                </button>
              </div>
            )}
          </>
        )}

        {/* Encuestador + date */}
        {!compact && (
          <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-slate-400">
            <span className="font-medium text-slate-500">
              {item.encuestador?.split(" ")[0] || "—"}
            </span>
            <span>{"·"}</span>
            <span>{fmtDateShort(item.created_at)}</span>
          </div>
        )}
      </div>
    </>
  );
}
