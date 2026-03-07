/**
 * GOBERNA — Consultor Campaign Assignment Modal
 * Admin-only modal for assigning campaigns to consultant users.
 */

"use client";

import { Avatar, Button, IconCheck, IconBarChart } from "../../../../lib/ui";
import type { Campaign } from "./role-config";

type ConsultorModalProps = {
  name: string;
  campaigns: Campaign[];
  selectedCampaigns: Set<string>;
  onToggleCampaign: (campaignId: string) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
};

export function ConsultorModal({
  name,
  campaigns,
  selectedCampaigns,
  onToggleCampaign,
  onSave,
  onClose,
  saving,
}: ConsultorModalProps) {
  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar modal"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.5)",
          zIndex: 1200,
          animation: "goberna-fade-in 0.15s ease-out",
          border: "none",
          cursor: "default",
        }}
        onClick={onClose}
      />

      {/* Modal */}
      <div style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "90%",
        maxWidth: 500,
        maxHeight: "80vh",
        background: "var(--color-surface)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        zIndex: 1201,
        overflow: "hidden",
        animation: "goberna-fade-in 0.2s ease-out",
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 24px",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div>
            <div style={{
              fontSize: 16,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              <IconBarChart size={18} color="var(--goberna-blue-600)" />
              Asignar Campañas a Consultor
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 4 }}>
              {name}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "none",
              background: "var(--goberna-blue-50)",
              cursor: "pointer",
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-text-secondary)",
            }}
          >
            &times;
          </button>
        </div>

        {/* Campaign List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 16 }}>
            Selecciona las campañas que este consultor podrá gestionar. El consultor tendrá acceso
            completo a los datos y miembros de las campañas seleccionadas.
          </div>

          {campaigns.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--color-text-tertiary)" }}>
              Cargando campañas...
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {campaigns.map((c) => {
                const sel = selectedCampaigns.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onToggleCampaign(c.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 16px",
                      background: sel ? "var(--goberna-blue-50)" : "var(--color-surface)",
                      border: `2px solid ${sel ? "var(--goberna-blue-400)" : "var(--color-border)"}`,
                      borderRadius: 10,
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      border: `2px solid ${sel ? "var(--goberna-blue-600)" : "var(--color-border-strong)"}`,
                      background: sel ? "var(--goberna-blue-600)" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      {sel && <IconCheck size={12} color="#fff" />}
                    </div>

                    <Avatar
                      name={c.name}
                      imageUrl={c.foto_url}
                      size={40}
                      borderColor={sel ? "var(--goberna-blue-400)" : "var(--color-border)"}
                    />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "var(--color-text-primary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}>
                        {c.name}
                      </div>
                      {(c.cargo || c.partido) && (
                        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>
                          {[c.cargo, c.partido].filter(Boolean).join(" \u2022 ")}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 24px",
          borderTop: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}>
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
            {selectedCampaigns.size} campaña{selectedCampaigns.size !== 1 ? "s" : ""} seleccionada{selectedCampaigns.size !== 1 ? "s" : ""}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Button variant="secondary" size="md" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={onSave}
              disabled={saving || selectedCampaigns.size === 0}
              loading={saving}
            >
              Guardar Asignaciones
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
