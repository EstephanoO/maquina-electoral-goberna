"use client";

/**
 * GOBERNA — Formularios: Field Editor
 * SlideOver panel for adding/editing a form field.
 */

import type { CSSProperties } from "react";
import type { FormField, FieldType } from "./types";
import { FIELD_TYPES } from "./types";
import { SlideOver, Button } from "../../../../lib/ui";

type FieldEditorProps = {
  open: boolean;
  field: FormField;
  onClose: () => void;
  onChange: (field: FormField) => void;
  onSave: () => void;
};

const INPUT: CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  fontSize: 14,
  fontFamily: "inherit",
  background: "#fff",
  boxSizing: "border-box",
};

const LABEL: CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--color-text-secondary)",
  marginBottom: 6,
};

const FIELD_ROW: CSSProperties = {
  marginBottom: 18,
};

export function FieldEditor({ open, field, onClose, onChange, onSave }: FieldEditorProps) {
  const isNew = field.id.startsWith("field_");

  const update = (partial: Partial<FormField>) => onChange({ ...field, ...partial });

  const hasOptions = ["select", "radio", "checkbox"].includes(field.type);
  const hasValidation = ["text", "number", "textarea"].includes(field.type);

  const footer = (
    <div style={{ display: "flex", gap: 12 }}>
      <Button variant="secondary" fullWidth onClick={onClose}>
        Cancelar
      </Button>
      <Button
        variant="primary"
        fullWidth
        disabled={!field.label.trim()}
        onClick={onSave}
        style={{ background: "var(--goberna-blue-900)", color: "#fff" }}
      >
        {isNew ? "Agregar campo" : "Guardar cambios"}
      </Button>
    </div>
  );

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={isNew ? "Nuevo campo" : "Editar campo"}
      footer={footer}
      width={440}
    >
      {/* Type */}
      <div style={FIELD_ROW}>
        <label htmlFor="field-type" style={LABEL}>
          Tipo de campo *
        </label>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          {FIELD_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => update({ type: t.value as FieldType, options: undefined })}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: 8,
                border: `2px solid ${field.type === t.value ? "var(--goberna-blue-900)" : "var(--color-border)"}`,
                background: field.type === t.value ? "rgba(22,57,96,.06)" : "#fff",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: field.type === t.value ? 700 : 400,
                color: field.type === t.value ? "var(--goberna-blue-900)" : "var(--color-text-secondary)",
                textAlign: "left",
              }}
            >
              <span style={{ fontSize: 16, minWidth: 20, textAlign: "center" }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Label */}
      <div style={FIELD_ROW}>
        <label htmlFor="field-label" style={LABEL}>
          Etiqueta *
        </label>
        <input
          id="field-label"
          type="text"
          value={field.label}
          onChange={(e) => update({ label: e.target.value })}
          placeholder="Ej: Nombre completo"
          style={INPUT}
        />
      </div>

      {/* Placeholder */}
      {!["location", "photo", "date", "checkbox", "radio"].includes(field.type) && (
        <div style={FIELD_ROW}>
          <label htmlFor="field-placeholder" style={LABEL}>
            Texto de ejemplo (placeholder)
          </label>
          <input
            id="field-placeholder"
            type="text"
            value={field.placeholder || ""}
            onChange={(e) => update({ placeholder: e.target.value })}
            placeholder="Ej: Ingresa tu nombre"
            style={INPUT}
          />
        </div>
      )}

      {/* Help text */}
      <div style={FIELD_ROW}>
        <label htmlFor="field-help" style={LABEL}>
          Texto de ayuda
        </label>
        <input
          id="field-help"
          type="text"
          value={field.helpText || ""}
          onChange={(e) => update({ helpText: e.target.value })}
          placeholder="Información adicional para el usuario"
          style={INPUT}
        />
      </div>

      {/* Required */}
      <div style={{ ...FIELD_ROW, display: "flex", alignItems: "center", gap: 10 }}>
        <input
          id="field-required"
          type="checkbox"
          checked={field.required}
          onChange={(e) => update({ required: e.target.checked })}
          style={{ width: 16, height: 16, cursor: "pointer" }}
        />
        <label htmlFor="field-required" style={{ ...LABEL, marginBottom: 0, cursor: "pointer" }}>
          Campo obligatorio
        </label>
      </div>

      {/* Options (select / radio / checkbox) */}
      {hasOptions && (
        <div style={FIELD_ROW}>
          <p style={{ ...LABEL, marginBottom: 10 }}>Opciones *</p>
          <div style={{ display: "grid", gap: 8 }}>
            {(field.options || []).map((opt, idx) => (
              <div key={idx} style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={opt.label}
                  onChange={(e) => {
                    const opts = [...(field.options || [])];
                    opts[idx] = {
                      label: e.target.value,
                      value: e.target.value.toLowerCase().replace(/\s+/g, "_"),
                    };
                    update({ options: opts });
                  }}
                  placeholder={`Opción ${idx + 1}`}
                  style={{ ...INPUT, flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() =>
                    update({ options: (field.options || []).filter((_, i) => i !== idx) })
                  }
                  style={{
                    padding: "8px 12px",
                    border: "none",
                    borderRadius: 6,
                    background: "#fee2e2",
                    color: "#dc2626",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                update({ options: [...(field.options || []), { value: "", label: "" }] })
              }
              style={{
                padding: 10,
                border: "1px dashed var(--color-border)",
                borderRadius: 8,
                background: "transparent",
                color: "var(--goberna-blue-900)",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              + Agregar opción
            </button>
          </div>
        </div>
      )}

      {/* Validation (text / textarea) */}
      {hasValidation && field.type !== "number" && (
        <div style={FIELD_ROW}>
          <p style={{ ...LABEL, marginBottom: 10 }}>Longitud del texto</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label htmlFor="val-min" style={{ ...LABEL, fontWeight: 400, fontSize: 12 }}>
                Mínimo de caracteres
              </label>
              <input
                id="val-min"
                type="number"
                value={field.validation?.min ?? ""}
                onChange={(e) =>
                  update({
                    validation: {
                      ...field.validation,
                      min: e.target.value ? Number(e.target.value) : undefined,
                    },
                  })
                }
                placeholder="0"
                style={INPUT}
              />
            </div>
            <div>
              <label htmlFor="val-max" style={{ ...LABEL, fontWeight: 400, fontSize: 12 }}>
                Máximo de caracteres
              </label>
              <input
                id="val-max"
                type="number"
                value={field.validation?.max ?? ""}
                onChange={(e) =>
                  update({
                    validation: {
                      ...field.validation,
                      max: e.target.value ? Number(e.target.value) : undefined,
                    },
                  })
                }
                placeholder="∞"
                style={INPUT}
              />
            </div>
          </div>
        </div>
      )}

      {/* Validation for number */}
      {field.type === "number" && (
        <div style={FIELD_ROW}>
          <p style={{ ...LABEL, marginBottom: 10 }}>Rango de valor</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label htmlFor="num-min" style={{ ...LABEL, fontWeight: 400, fontSize: 12 }}>
                Mínimo
              </label>
              <input
                id="num-min"
                type="number"
                value={field.validation?.min ?? ""}
                onChange={(e) =>
                  update({
                    validation: {
                      ...field.validation,
                      min: e.target.value ? Number(e.target.value) : undefined,
                    },
                  })
                }
                style={INPUT}
              />
            </div>
            <div>
              <label htmlFor="num-max" style={{ ...LABEL, fontWeight: 400, fontSize: 12 }}>
                Máximo
              </label>
              <input
                id="num-max"
                type="number"
                value={field.validation?.max ?? ""}
                onChange={(e) =>
                  update({
                    validation: {
                      ...field.validation,
                      max: e.target.value ? Number(e.target.value) : undefined,
                    },
                  })
                }
                style={INPUT}
              />
            </div>
          </div>
        </div>
      )}
    </SlideOver>
  );
}
