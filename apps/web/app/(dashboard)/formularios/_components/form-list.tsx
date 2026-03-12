"use client";

/**
 * GOBERNA — Formularios: Form List
 * Shows all form definitions for a campaign with actions.
 */

import type { CSSProperties } from "react";
import type { FormDefinition, Campaign } from "./types";
import { FIELD_TYPES } from "./types";
import { Button } from "../../../../lib/ui";

type FormListProps = {
  forms: FormDefinition[];
  campaigns: Campaign[];
  loading: boolean;
  selectedCampaign: string;
  onSelectCampaign: (id: string) => void;
  onEdit: (form: FormDefinition) => void;
  onDelete: (formId: string) => void;
  onToggleStatus: (form: FormDefinition) => void;
  onCreateNew: () => void;
};

const STATUS_STYLE: Record<string, CSSProperties> = {
  active: { background: "#dcfce7", color: "#15803d" },
  draft: { background: "var(--color-surface-active)", color: "var(--color-text-secondary)" },
  archived: { background: "var(--color-surface-active)", color: "var(--color-text-tertiary)" },
};

const STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  draft: "Borrador",
  archived: "Archivado",
};

function getFieldTypeIcon(type: string): string {
  return FIELD_TYPES.find((t) => t.value === type)?.icon ?? "□";
}

export function FormList({
  forms,
  campaigns,
  loading,
  selectedCampaign,
  onSelectCampaign,
  onEdit,
  onDelete,
  onToggleStatus,
  onCreateNew,
}: FormListProps) {
  return (
    <div>
      {/* Campaign filter */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label
            htmlFor="campaign-filter"
            style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}
          >
            Campaña:
          </label>
          <select
            id="campaign-filter"
            value={selectedCampaign}
            onChange={(e) => onSelectCampaign(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              fontSize: 14,
              background: "#fff",
              cursor: "pointer",
              minWidth: 240,
            }}
          >
            <option value="">Todas las campañas</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <Button
            variant="primary"
            size="md"
            onClick={onCreateNew}
            style={{ background: "var(--goberna-blue-900)", color: "#fff" }}
          >
            + Nuevo formulario
          </Button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--color-text-tertiary)" }}>
          Cargando formularios…
        </div>
      ) : forms.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 24px",
            background: "#fff",
            borderRadius: 12,
            border: "2px dashed var(--color-border)",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <p style={{ color: "var(--color-text-secondary)", marginBottom: 16, fontSize: 15 }}>
            No hay formularios aún
          </p>
          <Button
            variant="primary"
            onClick={onCreateNew}
            style={{ background: "var(--goberna-blue-900)", color: "#fff" }}
          >
            Crear primer formulario
          </Button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {forms.map((form) => (
            <div
              key={form.id}
              style={{
                background: "#fff",
                borderRadius: 12,
                padding: "16px 20px",
                border: "1px solid var(--color-border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 16,
                animation: "goberna-fade-in .25s ease-out",
              }}
            >
              {/* Info */}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "3px 10px",
                      borderRadius: 20,
                      ...STATUS_STYLE[form.status],
                    }}
                  >
                    {STATUS_LABEL[form.status]}
                  </span>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 15,
                      fontWeight: 700,
                      color: "var(--goberna-blue-900)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {form.name}
                  </h3>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  {form.campaign_name && (
                    <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                      {form.campaign_name}
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                    {form.schema?.fields?.length ?? 0} campos
                  </span>
                  {/* Field type chips */}
                  <div style={{ display: "flex", gap: 4 }}>
                    {Array.from(new Set(form.schema?.fields?.map((f) => f.type) ?? [])).map((type) => (
                      <span
                        key={type}
                        title={type}
                        style={{
                          fontSize: 12,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: "var(--color-surface-active)",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {getFieldTypeIcon(type)}
                      </span>
                    ))}
                  </div>
                </div>
                {form.description && (
                  <p
                    style={{
                      margin: "6px 0 0",
                      fontSize: 13,
                      color: "var(--color-text-secondary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {form.description}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => onToggleStatus(form)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--color-border)",
                    background: "#fff",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    color: form.status === "active" ? "#92400e" : "#166534",
                  }}
                >
                  {form.status === "active" ? "Pausar" : "Activar"}
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(form)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 6,
                    border: "none",
                    background: "var(--goberna-blue-900)",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(form.id)}
                  title="Eliminar formulario"
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #fecaca",
                    background: "#fff",
                    color: "#dc2626",
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
