"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { ValidationItem } from "@/lib/services/validacion";
import { SCORING_TAGS, computeScore, classifyVote } from "@/lib/services/validacion";
import {
  type VisualColumn,
  VOTE_BADGES,
  WhatsAppIcon,
  GripIcon,
  BanIcon,
  ChatIcon,
  ClockIcon,
  fmtDateShort,
  fmtPhone,
  waLink,
} from "./constants";

/* ─── Tiny icons for buttons ─── */

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

/* ─── Types ─── */

type CardAction = {
  type: "status";
  status: "contactado" | "respondido" | "invalido" | "pendiente";
  tags?: string[];
} | {
  type: "tags";
  tags: string[];
};

export function DraggableCard({
  item,
  column,
  isUpdating,
  columnColor,
  onWhatsAppClick,
  onAction,
}: {
  item: ValidationItem;
  column: VisualColumn;
  isUpdating: boolean;
  columnColor: string;
  onWhatsAppClick: (item: ValidationItem) => void;
  onAction: (item: ValidationItem, action: CardAction) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: { item, column },
    disabled: isUpdating,
  });

  const [tagsOpen, setTagsOpen] = useState(false);

  const style = {
    transform: CSS.Translate.toString(transform),
    borderLeftWidth: 3,
    borderLeftColor: columnColor,
  };

  const phone = fmtPhone(item.telefono);
  const link = waLink(item.telefono, item.nombre);
  const isPendiente = column === "pendiente";
  const isContactado = column === "contactado";
  const isRespondido = column === "respondido" || column === "voto_blando" || column === "voto_duro";
  const isInvalido = column === "invalido";
  const voteBadge = isRespondido && item.vote_class ? VOTE_BADGES[item.vote_class] : null;

  /* ── Local tag state for optimistic toggle ── */
  const currentTags = item.tags ?? [];

  function handleTagToggle(tagKey: string) {
    const next = currentTags.includes(tagKey)
      ? currentTags.filter((t) => t !== tagKey)
      : [...currentTags, tagKey];
    onAction(item, { type: "tags", tags: next });
  }

  /* ── Score preview ── */
  const liveScore = computeScore(currentTags);
  const liveClass = classifyVote(liveScore);
  const classLabel = liveClass === "duro" ? "Voto Duro" : liveClass === "blando" ? "Voto Blando" : "Tibio";
  const classColor = liveClass === "duro" ? "#15803d" : liveClass === "blando" ? "#ca8a04" : "#64748b";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative rounded-lg border border-slate-100 bg-white p-2.5 transition-all group ${
        isDragging ? "opacity-30 shadow-lg z-50 rotate-1" : "hover:shadow-sm"
      } ${isUpdating ? "opacity-50 pointer-events-none" : ""}`}
    >
      {/* Drag handle */}
      <div
        {...listeners}
        {...attributes}
        className="absolute top-2 right-2 w-5 h-5 rounded flex items-center justify-center cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        title="Arrastrar"
      >
        <GripIcon />
      </div>

      {/* Name + vote badge */}
      <div className="flex items-center gap-1.5 pr-6">
        <span className="font-semibold text-[13px] text-slate-800 truncate leading-tight">
          {item.nombre || "\u2014"}
        </span>
        {voteBadge && (
          <span
            className="text-[8px] font-black px-1.5 py-0.5 rounded-full shrink-0 tracking-wide"
            style={{ color: voteBadge.color, background: voteBadge.bg }}
          >
            {voteBadge.label}
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

      {/* ── Action buttons (contextual per column) ── */}
      <div className="flex items-center gap-1.5 mt-2">
        {/* Contactado: "Respondio" + "Invalido" */}
        {isContactado && (
          <>
            <button
              type="button"
              onClick={() => onAction(item, { type: "status", status: "respondido", tags: ["respondio"] })}
              disabled={isUpdating}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-cyan-50 text-cyan-700 text-[10px] font-bold hover:bg-cyan-100 transition-colors cursor-pointer border-none disabled:opacity-40"
              title="Marcar como respondido"
            >
              <CheckIcon />
              {"Respondió"}
            </button>
            <button
              type="button"
              onClick={() => onAction(item, { type: "status", status: "invalido" })}
              disabled={isUpdating}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 text-red-600 text-[10px] font-bold hover:bg-red-100 transition-colors cursor-pointer border-none disabled:opacity-40"
              title="Marcar como inválido"
            >
              <BanIcon />
              {"Inválido"}
            </button>
          </>
        )}

        {/* Pendiente: "Invalido" button (besides the WA button above) */}
        {isPendiente && (
          <button
            type="button"
            onClick={() => onAction(item, { type: "status", status: "invalido" })}
            disabled={isUpdating}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 text-red-600 text-[10px] font-bold hover:bg-red-100 transition-colors cursor-pointer border-none disabled:opacity-40"
            title="Marcar como inválido"
          >
            <BanIcon />
            {"Inválido"}
          </button>
        )}

        {/* Respondido / Voto Blando / Voto Duro: "Invalido" button */}
        {isRespondido && (
          <button
            type="button"
            onClick={() => onAction(item, { type: "status", status: "invalido" })}
            disabled={isUpdating}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 text-red-600 text-[10px] font-bold hover:bg-red-100 transition-colors cursor-pointer border-none disabled:opacity-40"
            title="Marcar como inválido"
          >
            <BanIcon />
            {"Inválido"}
          </button>
        )}

        {/* Invalido: "Devolver" button */}
        {isInvalido && (
          <button
            type="button"
            onClick={() => onAction(item, { type: "status", status: "pendiente" })}
            disabled={isUpdating}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold hover:bg-slate-200 transition-colors cursor-pointer border-none disabled:opacity-40"
            title="Devolver a pendiente"
          >
            <UndoIcon />
            {"Devolver"}
          </button>
        )}
      </div>

      {/* ── Tag scoring panel (contactado + respondido columns) ── */}
      {(isContactado || isRespondido) && (
        <div className="mt-2">
          {/* Toggle button */}
          <button
            type="button"
            onClick={() => setTagsOpen(!tagsOpen)}
            className="flex items-center gap-1.5 w-full text-left px-1.5 py-1 rounded-md hover:bg-slate-50 transition-colors cursor-pointer border-none bg-transparent"
          >
            <ChevronDownIcon open={tagsOpen} />
            <span className="text-[10px] font-bold text-slate-500">Puntaje</span>
            {liveScore > 0 && (
              <span className="text-[10px] font-black ml-auto" style={{ color: classColor }}>
                {liveScore} pts {"·"} {classLabel}
              </span>
            )}
          </button>

          {/* Expandable tag grid */}
          {tagsOpen && (
            <div className="flex flex-wrap gap-1 mt-1.5 px-1">
              {SCORING_TAGS.map((tag) => {
                const active = currentTags.includes(tag.key);
                return (
                  <button
                    key={tag.key}
                    type="button"
                    onClick={() => handleTagToggle(tag.key)}
                    disabled={isUpdating}
                    className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border transition-all cursor-pointer disabled:opacity-40 ${
                      active
                        ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                        : "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-600"
                    }`}
                    title={`${tag.label} (+${tag.points})`}
                  >
                    {tag.label} +{tag.points}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tags display (collapsed view — show active tags when panel is closed) */}
      {(isContactado || isRespondido) && !tagsOpen && currentTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {currentTags.map((tagKey) => {
            const tagDef = SCORING_TAGS.find((t) => t.key === tagKey);
            return tagDef ? (
              <span
                key={tagKey}
                className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700"
              >
                {tagDef.label}
              </span>
            ) : null;
          })}
        </div>
      )}

      {/* Encuestador + date */}
      <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-slate-400">
        <span className="font-medium text-slate-500">
          {item.encuestador?.split(" ")[0] || "\u2014"}
        </span>
        <span>{"·"}</span>
        <span>{fmtDateShort(item.created_at)}</span>
      </div>
    </div>
  );
}
