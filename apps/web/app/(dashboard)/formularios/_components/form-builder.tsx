"use client";

/**
 * GOBERNA — Formularios: Form Builder
 * 3-step wizard to create/edit form definitions.
 */

import type { CSSProperties } from "react";
import { useState } from "react";
import type { Campaign, FormField, FormDefinition } from "./types";
import { FIELD_TYPES, generateSlug } from "./types";
import { FieldPreview } from "./field-preview";
import { FieldEditor } from "./field-editor";
import { Button } from "../../../../lib/ui";

type FormBuilderProps = {
  campaigns: Campaign[];
  editForm: FormDefinition | null;
  saving: boolean;
  onSave: (payload: {
    campaign_id: string;
    name: string;
    slug: string;
    description?: string;
    schema: { version: string; fields: FormField[] };
    status: "draft" | "active";
  }) => void;
  onCancel: () => void;
};

type Step = 1 | 2 | 3;

const STEPS = [
  { num: 1, label: "Configuración" },
  { num: 2, label: "Campos" },
  { num: 3, label: "Revisar y guardar" },
];

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

const CARD: CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: 24,
  border: "1px solid var(--color-border)",
};

function FieldTypeIcon({ type }: { type: string }) {
  const icon = FIELD_TYPES.find((t) => t.value === type)?.icon ?? "□";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 26,
        height: 26,
        borderRadius: 6,
        background: "rgba(22,57,96,.08)",
        color: "var(--goberna-blue-900)",
        fontSize: 13,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {icon}
    </span>
  );
}

export function FormBuilder({ campaigns, editForm, saving, onSave, onCancel }: FormBuilderProps) {
  const [step, setStep] = useState<Step>(1);

  // Step 1 state
  const [campaignId, setCampaignId] = useState(editForm?.campaign_id ?? campaigns[0]?.id ?? "");
  const [formName, setFormName] = useState(editForm?.name ?? "");
  const [formSlug, setFormSlug] = useState(editForm?.slug ?? "");
  const [formDescription, setFormDescription] = useState(editForm?.description ?? "");
  const [formStatus, setFormStatus] = useState<"draft" | "active">(
    editForm?.status === "archived" ? "draft" : (editForm?.status ?? "draft")
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Step 2 state
  const [fields, setFields] = useState<FormField[]>(editForm?.schema.fields ?? []);
  const [editingField, setEditingField] = useState<FormField | null>(null);
  const [showFieldEditor, setShowFieldEditor] = useState(false);

  const handleNameChange = (name: string) => {
    setFormName(name);
    // Auto-gen slug only if user hasn't manually edited it
    if (!formSlug || formSlug === generateSlug(formName)) {
      setFormSlug(generateSlug(name));
    }
  };

  const openNewField = () => {
    setEditingField({
      id: `field_${Date.now()}`,
      type: "text",
      label: "",
      required: false,
    });
    setShowFieldEditor(true);
  };

  const openEditField = (field: FormField) => {
    setEditingField({ ...field });
    setShowFieldEditor(true);
  };

  const saveField = () => {
    if (!editingField) return;
    const existing = fields.findIndex((f) => f.id === editingField.id);
    if (existing >= 0) {
      setFields((prev) => prev.map((f, i) => (i === existing ? editingField : f)));
    } else {
      setFields((prev) => [...prev, editingField]);
    }
    setShowFieldEditor(false);
    setEditingField(null);
  };

  const deleteField = (id: string) => setFields((prev) => prev.filter((f) => f.id !== id));

  const moveField = (index: number, dir: "up" | "down") => {
    const next = [...fields];
    const target = dir === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setFields(next);
  };

  // Validation per step
  const step1Valid = !!campaignId && !!formName.trim() && !!formSlug.trim();
  const step2Valid = fields.length > 0;

  const checklistItems = [
    { label: "Campaña seleccionada", done: !!campaignId },
    { label: "Nombre del formulario", done: !!formName.trim() },
    { label: "Al menos 1 campo", done: step2Valid },
  ];
  const allValid = checklistItems.every((i) => i.done);

  const handleSave = () => {
    onSave({
      campaign_id: campaignId,
      name: formName,
      slug: formSlug,
      description: formDescription || undefined,
      schema: { version: "1.0", fields },
      status: formStatus,
    });
  };

  // ── Stepper ────────────────────────────────────────────────────────
  const Stepper = () => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        marginBottom: 28,
        background: "#fff",
        borderRadius: 12,
        padding: "16px 24px",
        border: "1px solid var(--color-border)",
      }}
    >
      {STEPS.map((s, i) => {
        const isActive = step === s.num;
        const isDone = step > s.num;
        return (
          <div key={s.num} style={{ display: "flex", alignItems: "center", flex: 1 }}>
            <button
              type="button"
              disabled={s.num > step && (s.num === 2 ? !step1Valid : !step1Valid || !step2Valid)}
              onClick={() => {
                if (s.num < step) setStep(s.num as Step);
                if (s.num === 2 && step1Valid) setStep(2);
                if (s.num === 3 && step1Valid && step2Valid) setStep(3);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "none",
                border: "none",
                cursor: isDone || (s.num === step) ? "pointer" : "default",
                padding: 0,
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 800,
                  background: isActive
                    ? "var(--goberna-blue-900)"
                    : isDone
                    ? "#22c55e"
                    : "var(--color-border)",
                  color: isActive || isDone ? "#fff" : "var(--color-text-tertiary)",
                  flexShrink: 0,
                  transition: "all .2s",
                }}
              >
                {isDone ? "✓" : s.num}
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive
                    ? "var(--goberna-blue-900)"
                    : isDone
                    ? "#22c55e"
                    : "var(--color-text-tertiary)",
                  whiteSpace: "nowrap",
                }}
              >
                {s.label}
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background: step > s.num ? "#22c55e" : "var(--color-border)",
                  margin: "0 12px",
                  transition: "background .2s",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  // ── Step 1: Configuración ──────────────────────────────────────────
  const Step1 = () => (
    <div style={CARD}>
      <h3 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700, color: "var(--goberna-blue-900)" }}>
        Información básica
      </h3>

      <div style={{ marginBottom: 16 }}>
        <label htmlFor="campaign-select" style={LABEL}>
          Campaña / Candidato *
        </label>
        <select
          id="campaign-select"
          value={campaignId}
          onChange={(e) => setCampaignId(e.target.value)}
          disabled={!!editForm}
          style={{ ...INPUT, background: editForm ? "var(--color-surface-hover)" : "#fff", cursor: editForm ? "not-allowed" : "pointer" }}
        >
          <option value="">Seleccionar campaña…</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} — {c.cargo}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label htmlFor="form-name" style={LABEL}>
          Nombre del formulario *
        </label>
        <input
          id="form-name"
          type="text"
          value={formName}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Ej: Encuesta puerta a puerta"
          style={INPUT}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label htmlFor="form-description" style={LABEL}>
          Descripción <span style={{ fontWeight: 400, color: "var(--color-text-tertiary)" }}>(opcional)</span>
        </label>
        <textarea
          id="form-description"
          value={formDescription}
          onChange={(e) => setFormDescription(e.target.value)}
          placeholder="Describe para qué sirve este formulario"
          rows={2}
          style={{ ...INPUT, resize: "vertical" }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <div
            onClick={() => setFormStatus(formStatus === "active" ? "draft" : "active")}
            style={{
              width: 44,
              height: 24,
              borderRadius: 12,
              background: formStatus === "active" ? "#22c55e" : "#cbd5e1",
              position: "relative",
              cursor: "pointer",
              transition: "background .2s",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                position: "absolute",
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "#fff",
                top: 3,
                left: formStatus === "active" ? 23 : 3,
                transition: "left .2s",
                boxShadow: "0 1px 4px rgba(0,0,0,.2)",
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>
              {formStatus === "active" ? "Activo" : "Borrador"}
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
              {formStatus === "active"
                ? "El formulario estará disponible para los agentes"
                : "El formulario no será visible hasta que lo actives"}
            </div>
          </div>
        </label>
      </div>

      {/* Advanced: Slug */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 13,
          color: "var(--color-text-tertiary)",
          padding: 0,
          marginBottom: showAdvanced ? 12 : 0,
        }}
      >
        {showAdvanced ? "▴" : "▾"} Opciones avanzadas
      </button>

      {showAdvanced && (
        <div style={{ marginTop: 8 }}>
          <label htmlFor="form-slug" style={LABEL}>
            Slug (URL interna)
          </label>
          <input
            id="form-slug"
            type="text"
            value={formSlug}
            onChange={(e) => setFormSlug(generateSlug(e.target.value))}
            placeholder="encuesta-puerta-a-puerta"
            style={{ ...INPUT, fontFamily: "monospace", fontSize: 13 }}
          />
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--color-text-tertiary)" }}>
            Identificador único generado automáticamente. Evita cambiarlo una vez creado.
          </p>
        </div>
      )}
    </div>
  );

  // ── Step 2: Campos ─────────────────────────────────────────────────
  const Step2 = () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20, alignItems: "start" }}>
      {/* Left: field list */}
      <div style={CARD}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--goberna-blue-900)" }}>
            Campos ({fields.length})
          </h3>
        </div>

        {fields.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "32px 16px",
              border: "2px dashed var(--color-border)",
              borderRadius: 10,
              color: "var(--color-text-tertiary)",
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
            <p style={{ margin: 0, fontSize: 14 }}>Agrega el primer campo</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
            {fields.map((field, index) => (
              <div
                key={field.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  background: "#fafafa",
                }}
              >
                <FieldTypeIcon type={field.type} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>
                    {field.label || <em style={{ color: "var(--color-text-tertiary)" }}>Sin etiqueta</em>}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                    {FIELD_TYPES.find((t) => t.value === field.type)?.label ?? field.type}
                    {field.required && " · Obligatorio"}
                  </div>
                </div>

                {/* Order controls */}
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => moveField(index, "up")}
                    style={{
                      width: 22,
                      height: 18,
                      border: "1px solid var(--color-border)",
                      borderRadius: 4,
                      background: "#fff",
                      cursor: index === 0 ? "not-allowed" : "pointer",
                      fontSize: 10,
                      color: index === 0 ? "#cbd5e1" : "var(--color-text-secondary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 0,
                    }}
                    aria-label="Subir campo"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    disabled={index === fields.length - 1}
                    onClick={() => moveField(index, "down")}
                    style={{
                      width: 22,
                      height: 18,
                      border: "1px solid var(--color-border)",
                      borderRadius: 4,
                      background: "#fff",
                      cursor: index === fields.length - 1 ? "not-allowed" : "pointer",
                      fontSize: 10,
                      color: index === fields.length - 1 ? "#cbd5e1" : "var(--color-text-secondary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 0,
                    }}
                    aria-label="Bajar campo"
                  >
                    ▼
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => openEditField(field)}
                  style={{
                    padding: "4px 10px",
                    border: "1px solid var(--color-border)",
                    borderRadius: 6,
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: 12,
                    color: "var(--color-text-secondary)",
                    fontWeight: 600,
                  }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => deleteField(field.id)}
                  title="Eliminar campo"
                  style={{
                    padding: "4px 8px",
                    border: "1px solid #fecaca",
                    borderRadius: 6,
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: 12,
                    color: "#dc2626",
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={openNewField}
          style={{
            width: "100%",
            padding: 12,
            border: "2px dashed var(--goberna-blue-900)",
            borderRadius: 8,
            background: "rgba(22,57,96,.03)",
            color: "var(--goberna-blue-900)",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          + Agregar campo
        </button>
      </div>

      {/* Right: live preview */}
      <div style={{ ...CARD, position: "sticky", top: 24 }}>
        <h4 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "var(--color-text-secondary)" }}>
          Vista previa (móvil)
        </h4>
        {fields.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", textAlign: "center", padding: "24px 0" }}>
            Agrega campos para ver la preview
          </p>
        ) : (
          <div
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              padding: 16,
              background: "#fafafa",
              display: "grid",
              gap: 16,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--goberna-blue-900)" }}>
              {formName || "Formulario sin nombre"}
            </div>
            {fields.map((f) => (
              <FieldPreview key={f.id} field={f} />
            ))}
            <div
              style={{
                padding: "12px 0",
                textAlign: "center",
                borderTop: "1px solid var(--color-border)",
                marginTop: 4,
              }}
            >
              <div
                style={{
                  display: "inline-block",
                  padding: "10px 28px",
                  background: "var(--goberna-blue-900)",
                  color: "#fff",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                Enviar
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── Step 3: Revisión ───────────────────────────────────────────────
  const campaignName = campaigns.find((c) => c.id === campaignId)?.name ?? "";

  const Step3 = () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20, alignItems: "start" }}>
      <div style={CARD}>
        <h3 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700, color: "var(--goberna-blue-900)" }}>
          Resumen del formulario
        </h3>

        {/* Checklist */}
        <div style={{ display: "grid", gap: 10, marginBottom: 24 }}>
          {checklistItems.map((item) => (
            <div
              key={item.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderRadius: 8,
                background: item.done ? "rgba(34,197,94,.06)" : "rgba(220,38,38,.04)",
                border: `1px solid ${item.done ? "#bbf7d0" : "#fecaca"}`,
              }}
            >
              <span style={{ fontSize: 16 }}>{item.done ? "✅" : "⚠️"}</span>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: item.done ? "#15803d" : "#dc2626",
                }}
              >
                {item.label}
              </span>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div style={{ display: "grid", gap: 12 }}>
          <Row label="Campaña" value={campaignName} />
          <Row label="Nombre" value={formName} />
          {formDescription && <Row label="Descripción" value={formDescription} />}
          <Row label="Estado" value={formStatus === "active" ? "Activo" : "Borrador"} />
          <Row label="Campos" value={`${fields.length} campos`} />
        </div>

        {/* Field types summary */}
        {fields.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)" }}>
              Campos definidos:
            </p>
            <div style={{ display: "grid", gap: 6 }}>
              {fields.map((f, i) => (
                <div
                  key={f.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 13,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  <span style={{ color: "var(--color-text-tertiary)", minWidth: 20 }}>{i + 1}.</span>
                  <FieldTypeIcon type={f.type} />
                  <span style={{ fontWeight: 600 }}>{f.label}</span>
                  {f.required && (
                    <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 600 }}>*</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: preview */}
      <div style={{ ...CARD, position: "sticky", top: 24 }}>
        <h4 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "var(--color-text-secondary)" }}>
          Vista previa (móvil)
        </h4>
        <div
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            padding: 16,
            background: "#fafafa",
            display: "grid",
            gap: 16,
            maxHeight: 400,
            overflowY: "auto",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--goberna-blue-900)" }}>
            {formName || "Formulario sin nombre"}
          </div>
          {fields.map((f) => (
            <FieldPreview key={f.id} field={f} />
          ))}
          <div style={{ padding: "10px 0", textAlign: "center", borderTop: "1px solid var(--color-border)" }}>
            <div
              style={{
                display: "inline-block",
                padding: "10px 28px",
                background: "var(--goberna-blue-900)",
                color: "#fff",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              Enviar
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Field editor slide-over */}
      {editingField && (
        <FieldEditor
          open={showFieldEditor}
          field={editingField}
          onClose={() => { setShowFieldEditor(false); setEditingField(null); }}
          onChange={setEditingField}
          onSave={saveField}
        />
      )}

      {/* Cancel / back header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            color: "var(--color-text-tertiary)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: 0,
          }}
        >
          ← Volver a la lista
        </button>
        <span style={{ color: "var(--color-border)" }}>|</span>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--goberna-blue-900)" }}>
          {editForm ? `Editando: ${editForm.name}` : "Nuevo formulario"}
        </h2>
      </div>

      <Stepper />

      {/* Step content */}
      {step === 1 && <Step1 />}
      {step === 2 && <Step2 />}
      {step === 3 && <Step3 />}

      {/* Navigation buttons */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 24,
          paddingTop: 20,
          borderTop: "1px solid var(--color-border)",
        }}
      >
        <div>
          {step > 1 && (
            <Button variant="secondary" onClick={() => setStep((step - 1) as Step)}>
              ← Anterior
            </Button>
          )}
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {step < 3 ? (
            <Button
              variant="primary"
              disabled={step === 1 ? !step1Valid : !step2Valid}
              onClick={() => setStep((step + 1) as Step)}
              style={{ background: "var(--goberna-blue-900)", color: "#fff" }}
            >
              Siguiente →
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={!allValid || saving}
              loading={saving}
              onClick={handleSave}
              style={{ background: "var(--goberna-blue-900)", color: "#fff" }}
            >
              {editForm ? "Actualizar formulario" : "Crear formulario"}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 12, fontSize: 14 }}>
      <span style={{ fontWeight: 600, color: "var(--color-text-secondary)", minWidth: 100 }}>{label}:</span>
      <span style={{ color: "var(--color-text-primary)" }}>{value}</span>
    </div>
  );
}
