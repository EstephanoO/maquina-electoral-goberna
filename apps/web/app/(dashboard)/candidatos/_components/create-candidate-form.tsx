/**
 * GOBERNA — CreateCandidateForm Component
 * Form for creating a new candidate.
 */

"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import {
  TextInput,
  SelectInput,
  ColorPicker,
  PhotoUpload,
  Button,
  Alert,
} from "../../../../lib/ui";
import { CARGO_OPTIONS, DEFAULT_COLORS, FONT_STACK } from "../../../../lib/constants";
import { slugify } from "../../../../lib/utils";
import { createCampaignWithPhoto } from "../../../../lib/services";

type FormState = {
  name: string;
  cargo: string;
  numero: string;
  partido: string;
  color_primario: string;
  color_secundario: string;
};

const INITIAL_STATE: FormState = {
  name: "",
  cargo: "",
  numero: "",
  partido: "",
  color_primario: DEFAULT_COLORS.primario,
  color_secundario: DEFAULT_COLORS.secundario,
};

const CARGO_SELECT_OPTIONS = CARGO_OPTIONS.map((c) => ({ value: c, label: c }));

type CreateCandidateFormProps = {
  onSuccess: () => void;
  onCancel: () => void;
};

export function CreateCandidateForm({ onSuccess, onCancel }: CreateCandidateFormProps) {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handlePhotoChange = useCallback((file: File | null, preview: string | null) => {
    setPhotoFile(file);
    setPhotoPreview(preview);
    setError("");
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!form.name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }

    setCreating(true);
    setError("");

    const slug = slugify(form.name);

    const result = await createCampaignWithPhoto(
      {
        name: form.name.trim(),
        slug,
        cargo: form.cargo || undefined,
        numero: form.numero ? parseInt(form.numero, 10) : undefined,
        partido: form.partido.trim() || undefined,
        config: {
          color_primario: form.color_primario,
          color_secundario: form.color_secundario,
        },
      },
      photoFile,
    );

    setCreating(false);

    if (!result.ok) {
      setError(result.error ?? "Error creando candidato.");
      return;
    }

    onSuccess();
  }, [form, photoFile, onSuccess]);

  const handleCancel = useCallback(() => {
    setForm(INITIAL_STATE);
    setPhotoFile(null);
    setPhotoPreview(null);
    setError("");
    onCancel();
  }, [onCancel]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Form Fields */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Photo Upload */}
        <div style={{ marginBottom: 20 }}>
          <span
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              marginBottom: 6,
              fontFamily: FONT_STACK,
            }}
          >
            Foto del Candidato
          </span>
          <PhotoUpload
            value={photoFile}
            preview={photoPreview}
            onChange={handlePhotoChange}
            onError={setError}
            fallbackInitial={form.name ? form.name[0] : undefined}
            fallbackColor={form.color_primario}
          />
        </div>

        <TextInput
          id="nc-name"
          label="Nombre completo"
          value={form.name}
          onChange={(e) => updateField("name", e.target.value)}
          placeholder="Ej: Juan Carlos Ramirez"
        />

        <SelectInput
          id="nc-cargo"
          label="Cargo"
          value={form.cargo}
          onChange={(e) => updateField("cargo", e.target.value)}
          options={CARGO_SELECT_OPTIONS}
          placeholder="Seleccionar cargo..."
        />

        <TextInput
          id="nc-numero"
          type="number"
          label="Numero de candidatura"
          value={form.numero}
          onChange={(e) => updateField("numero", e.target.value)}
          placeholder="Ej: 7"
        />

        <TextInput
          id="nc-partido"
          label="Nombre del partido"
          value={form.partido}
          onChange={(e) => updateField("partido", e.target.value)}
          placeholder="Ej: Partido Nacional"
        />

        {/* Colors */}
        <div style={{ marginBottom: 24 }}>
          <span
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              marginBottom: 8,
              fontFamily: FONT_STACK,
            }}
          >
            Colores del partido
          </span>
          <div style={{ display: "flex", gap: 20 }}>
            <ColorPicker
              label="Primario"
              value={form.color_primario}
              onChange={(e) => updateField("color_primario", e.target.value)}
            />
            <ColorPicker
              label="Secundario"
              value={form.color_secundario}
              onChange={(e) => updateField("color_secundario", e.target.value)}
            />
          </div>
        </div>

        {/* Preview Card */}
        <div style={{ marginBottom: 24 }}>
          <span
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              marginBottom: 10,
              fontFamily: FONT_STACK,
            }}
          >
            Vista previa
          </span>
          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "16px 20px",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                border: `2.5px solid ${form.color_primario}`,
                background: `${form.color_primario}15`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                fontWeight: 800,
                color: form.color_primario,
                flexShrink: 0,
                overflow: "hidden",
                position: "relative",
              }}
            >
              {photoPreview ? (
                <Image src={photoPreview} alt="Preview" fill style={{ objectFit: "cover" }} unoptimized />
              ) : form.name ? (
                form.name.charAt(0).toUpperCase()
              ) : (
                "?"
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-primary)" }}>
                  {form.name || "Nombre del candidato"}
                </span>
                {form.numero && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "1px 8px",
                      borderRadius: 10,
                      background: form.color_secundario,
                      color: form.color_primario,
                    }}
                  >
                    #{form.numero}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 2 }}>
                {form.cargo || "Cargo"} — {form.partido || "Partido"}
              </div>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && <Alert variant="error" message={error} onDismiss={() => setError("")} />}
      </div>

      {/* Actions */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          paddingTop: 16,
          borderTop: "1px solid var(--color-border)",
          marginTop: 16,
        }}
      >
        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={creating}
          disabled={!form.name.trim()}
          onClick={handleSubmit}
        >
          {creating ? "Creando..." : "Crear Candidato"}
        </Button>
        <Button variant="ghost" size="md" fullWidth disabled={creating} onClick={handleCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
