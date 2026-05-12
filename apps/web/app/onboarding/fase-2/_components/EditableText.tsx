"use client";

/**
 * Texto editable inline. Si `useEditing().editing===false` renderiza el
 * valor como texto plano. Si está activo, vuelve el span contentEditable
 * con borde discontinuo amber, blur dispara patchField via context.
 *
 * Soporta 3 tipos:
 *   - texto corto (default): single-line, Enter = blur
 *   - texto largo (`multiline`): preserva line-breaks
 *   - numérico (`numeric`): coerce a Number en el save
 */

import { useEffect, useRef } from "react";

import { useEditing } from "./EditingContext";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";

type Section = keyof ConsultorFormFase2;

interface Props {
  section: Section;
  field: string;
  value: string | number | undefined | null;
  /** Texto que se ve si el valor está vacío (en modo no-edit). */
  placeholder?: string;
  /** Multiline preserva line breaks; Enter inserta newline. */
  multiline?: boolean;
  /** Coerce a Number en el save. Si el input está vacío → undefined. */
  numeric?: boolean;
  /** Tailwind extra para el span. */
  className?: string;
  /** Estilo del placeholder cuando vacío en modo no-edit. */
  placeholderClassName?: string;
}

export function EditableText({
  section,
  field,
  value,
  placeholder = "[A completar]",
  multiline = false,
  numeric = false,
  className = "",
  placeholderClassName = "text-amber-400/60 italic",
}: Props) {
  const { editing, patchField } = useEditing();
  const ref = useRef<HTMLSpanElement>(null);
  const displayed =
    value !== undefined && value !== null && value !== "" ? String(value) : "";

  // Sincronizar el DOM con el valor entrante cuando no está focuseado.
  // Si lo hiciéramos siempre se rompería el cursor al editar.
  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if (el.textContent !== displayed) {
      el.textContent = displayed;
    }
  }, [editing, displayed]);

  // Modo lectura
  if (!editing) {
    if (!displayed) {
      return <span className={`${className} ${placeholderClassName}`}>{placeholder}</span>;
    }
    return <span className={className}>{displayed}</span>;
  }

  // Modo edición
  return (
    <span
      ref={ref}
      role="textbox"
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onBlur={(e) => {
        const text = (e.currentTarget.textContent ?? "").trim();
        if (text === displayed) return;
        if (numeric) {
          if (text.length === 0) {
            patchField(section, field, undefined);
            return;
          }
          const n = Number(text.replace(/[,\s]/g, ""));
          if (Number.isFinite(n)) {
            patchField(section, field, n);
          }
          return;
        }
        patchField(section, field, text);
      }}
      onKeyDown={(e) => {
        if (!multiline && e.key === "Enter") {
          e.preventDefault();
          (e.currentTarget as HTMLSpanElement).blur();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          // Restaurar valor original sin guardar
          if (ref.current) ref.current.textContent = displayed;
          (e.currentTarget as HTMLSpanElement).blur();
        }
      }}
      className={`${className} inline-block min-w-[2ch] outline-none rounded-sm border border-dashed border-amber-400/40 hover:border-amber-400/80 focus:border-amber-400 focus:bg-amber-400/10 px-1 py-0.5 transition-colors cursor-text whitespace-pre-wrap`}
      style={{
        // CSS empty-state placeholder
        ...(displayed.length === 0
          ? {
              minHeight: "1em",
            }
          : {}),
      }}
    >
      {displayed}
    </span>
  );
}
