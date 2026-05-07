/**
 * GOBERNA — EditCandidateForm Component
 * Form for editing an existing candidate.
 */

"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import {
  TextInput,
  SelectInput,
  ColorPicker,
  PhotoUpload,
  Button,
  Alert,
} from "../../../../lib/ui";
import { CARGO_OPTIONS, DEFAULT_COLORS, FONT_STACK, isCargoCongresal, isCargoSubnacional, getMaxJurisdiccionLevel } from "../../../../lib/constants";
import { updateCampaign, uploadCandidatePhoto } from "../../../../lib/services";
import type { Campaign, JurisdiccionNivel } from "../../../../lib/types";
import { JurisdiccionSelector } from "./jurisdiccion-selector";

type FormState = {
  name: string;
  cargo: string;
  numero: string;
  partido: string;
  color_primario: string;
  color_secundario: string;
  status: "active" | "paused" | "archived";
};

const CARGO_SELECT_OPTIONS = CARGO_OPTIONS.map((c) => ({ value: c, label: c }));

const STATUS_OPTIONS = [
  { value: "active", label: "Activo" },
  { value: "paused", label: "Pausado" },
  { value: "archived", label: "Archivado" },
];

type EditCandidateFormProps = {
  candidate: Campaign;
  onSuccess: () => void;
  onCancel: () => void;
};

export function EditCandidateForm({ candidate, onSuccess, onCancel }: EditCandidateFormProps) {
  const [form, setForm] = useState<FormState>({
    name: candidate.name,
    cargo: candidate.cargo ?? "",
    numero: candidate.numero?.toString() ?? "",
    partido: candidate.partido ?? "",
    color_primario: candidate.config?.color_primario ?? DEFAULT_COLORS.primario,
    color_secundario: candidate.config?.color_secundario ?? DEFAULT_COLORS.secundario,
    status: candidate.status as "active" | "paused" | "archived",
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(candidate.foto_url ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [jurisdiccion, setJurisdiccion] = useState<{ nivel: JurisdiccionNivel | ""; code: string }>({
    nivel: candidate.jurisdiccion_nivel ?? "",
    code: candidate.jurisdiccion_code ?? "",
  });

  // Derive initial dep/prov codes for the cascading selector in edit mode
  const initialDepCode = candidate.jurisdiccion_code?.substring(0, 2) ?? "";
  const initialProvCode = candidate.jurisdiccion_code?.length === 6
    ? candidate.jurisdiccion_code.substring(0, 4)
    : candidate.jurisdiccion_code?.length === 4
      ? candidate.jurisdiccion_code
      : "";

  // Track changes
  useEffect(() => {
    const changed =
      form.name !== candidate.name ||
      form.cargo !== (candidate.cargo ?? "") ||
      form.numero !== (candidate.numero?.toString() ?? "") ||
      form.partido !== (candidate.partido ?? "") ||
      form.color_primario !== (candidate.config?.color_primario ?? DEFAULT_COLORS.primario) ||
      form.color_secundario !== (candidate.config?.color_secundario ?? DEFAULT_COLORS.secundario) ||
      form.status !== candidate.status ||
      jurisdiccion.nivel !== (candidate.jurisdiccion_nivel ?? "") ||
      jurisdiccion.code !== (candidate.jurisdiccion_code ?? "") ||
      photoFile !== null;
    setHasChanges(changed);
  }, [form, photoFile, candidate, jurisdiccion]);

  const showNumero = isCargoCongresal(form.cargo);
  const showPartido = isCargoSubnacional(form.cargo);
  const maxJurisdiccionLevel = getMaxJurisdiccionLevel(form.cargo);

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Clear fields that become hidden when cargo changes
      if (key === "cargo") {
        const cargo = value as string;
        if (!isCargoCongresal(cargo)) next.numero = "";
        if (!isCargoSubnacional(cargo)) next.partido = "";
        setJurisdiccion({ nivel: "", code: "" });
      }
      return next;
    });
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

    setSaving(true);
    setError("");

    try {
      let fotoUrl: string | undefined;

      // Upload new photo if provided
      if (photoFile) {
        const uploadRes = await uploadCandidatePhoto(photoFile, candidate.slug);
        if (!uploadRes.ok || !uploadRes.data?.upload?.path) {
          setError("Error al subir la foto.");
          setSaving(false);
          return;
        }
        fotoUrl = uploadRes.data.upload.path;
      }

      // Update campaign
      const result = await updateCampaign(candidate.id, {
        name: form.name.trim(),
        cargo: form.cargo || undefined,
        numero: form.numero ? parseInt(form.numero, 10) : undefined,
        partido: form.partido.trim() || undefined,
        foto_url: fotoUrl,
        status: form.status,
        jurisdiccion_nivel: jurisdiccion.nivel || undefined,
        jurisdiccion_code: jurisdiccion.code || undefined,
        config: {
          color_primario: form.color_primario,
          color_secundario: form.color_secundario,
        },
      });

      if (!result.ok) {
        setError(result.error?.message ?? "Error al actualizar el candidato.");
        setSaving(false);
        return;
      }

      onSuccess();
    } catch (err) {
      setError("Error inesperado. Intentá de nuevo.");
      setSaving(false);
    }
  }, [form, photoFile, candidate, onSuccess]);

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
            FOTO DEL CANDIDATO
          </span>
          <PhotoUpload
            value={photoFile}
            preview={photoPreview}
            onChange={handlePhotoChange}
            onError={setError}
            fallbackInitial={form.name ? form.name[0] : undefined}
            fallbackColor={form.color_primario}
          />
          {candidate.foto_url && !photoFile && (
            <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 6 }}>
              Foto actual: {candidate.foto_url.split("/").pop()}
            </p>
          )}
        </div>

        <TextInput
          id="ec-name"
          label="Nombre completo"
          value={form.name}
          onChange={(e) => updateField("name", e.target.value)}
          placeholder="Ej: Juan Carlos Ramírez"
        />

        <SelectInput
          id="ec-cargo"
          label="Cargo"
          value={form.cargo}
          onChange={(e) => updateField("cargo", e.target.value)}
          options={CARGO_SELECT_OPTIONS}
          placeholder="Seleccionar cargo…"
        />

        {showNumero && (
          <TextInput
            id="ec-numero"
            type="number"
            label="Número de candidatura"
            value={form.numero}
            onChange={(e) => updateField("numero", e.target.value)}
            placeholder="Ej: 7"
          />
        )}

        {showPartido && (
          <TextInput
            id="ec-partido"
            label="Nombre del partido"
            value={form.partido}
            onChange={(e) => updateField("partido", e.target.value)}
            placeholder="Ej: Partido Nacional"
          />
        )}

        {/* Jurisdiccion Selector — conditioned by cargo */}
        {maxJurisdiccionLevel && (
          <div style={{ marginBottom: 16 }}>
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
              JURISDICCION
            </span>
            <JurisdiccionSelector
              maxLevel={maxJurisdiccionLevel}
              value={jurisdiccion}
              onChange={setJurisdiccion}
              initialDepCode={initialDepCode}
              initialProvCode={initialProvCode}
            />
          </div>
        )}

        <SelectInput
          id="ec-status"
          label="Estado"
          value={form.status}
          onChange={(e) => updateField("status", e.target.value as FormState["status"])}
          options={STATUS_OPTIONS}
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
            COLORES DEL PARTIDO
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
            VISTA PREVIA
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

        {/* Slug (read-only) */}
        <div style={{ marginBottom: 24 }}>
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
            SLUG (NO EDITABLE)
          </span>
          <code
            style={{
              display: "block",
              padding: "10px 12px",
              background: "var(--color-background)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              fontSize: 13,
              color: "var(--color-text-tertiary)",
            }}
          >
            {candidate.slug}
          </code>
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
          loading={saving}
          disabled={!hasChanges || !form.name.trim()}
          onClick={handleSubmit}
        >
          {saving ? "Guardando..." : "Guardar Cambios"}
        </Button>
        <Button variant="ghost" size="md" fullWidth disabled={saving} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
