"use client";

/**
 * EditableT — wrap cualquier string hardcoded del template para hacerlo
 * editable inline. Lee `consultor_form.text_overrides[k]`; si está vacío,
 * muestra `children` (default). En modo edit, contentEditable; al blur
 * persiste en text_overrides[k]. Si el user revierte al default exacto,
 * borra el override.
 *
 * Uso:
 *   <EditableT k="cover.title">GOBERNA</EditableT>
 *   <EditableT k="cover.subtitle" multiline>Consultoría política</EditableT>
 */

import { useEffect, useRef } from "react";

import { useEditing } from "./EditingContext";

interface Props {
  /** Key único — convención: "<slide>.<path>". Ej "cover.title", "capacidad.pilar_0.titulo" */
  k: string;
  /** Texto default (lo que se muestra si no hay override). */
  children: string;
  multiline?: boolean;
  className?: string;
}

export function EditableT({ k, children, multiline = false, className = "" }: Props) {
  const { editing, form, patchField } = useEditing();
  const overrides = (form?.text_overrides as Record<string, string> | undefined) ?? {};
  const override = overrides[k];
  const display = override ?? children;
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if (el.textContent !== display) {
      el.textContent = display;
    }
  }, [editing, display]);

  if (!editing) {
    return <span className={className}>{display}</span>;
  }

  return (
    <span
      ref={ref}
      role="textbox"
      contentEditable
      suppressContentEditableWarning
      data-edit-key={k}
      onBlur={(e) => {
        const text = (e.currentTarget.textContent ?? "").trim();
        if (text === display) return;
        // Si volvió al default exacto → borrar override (clean state).
        if (text === children) {
          patchField("text_overrides", k, undefined);
          return;
        }
        // Si vacío → borrar override (el slide muestra default otra vez).
        if (text.length === 0) {
          patchField("text_overrides", k, undefined);
          return;
        }
        patchField("text_overrides", k, text);
      }}
      onKeyDown={(e) => {
        if (!multiline && e.key === "Enter") {
          e.preventDefault();
          (e.currentTarget as HTMLSpanElement).blur();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          if (ref.current) ref.current.textContent = display;
          (e.currentTarget as HTMLSpanElement).blur();
        }
      }}
      className={`${className} inline outline-none rounded-sm border-2 border-dashed border-amber-400/70 bg-amber-400/[0.06] hover:border-amber-400 hover:bg-amber-400/15 focus:border-amber-400 focus:bg-amber-400/20 px-1.5 py-0.5 transition-colors cursor-text whitespace-pre-wrap`}
    >
      {display}
    </span>
  );
}
