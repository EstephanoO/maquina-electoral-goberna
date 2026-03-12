/**
 * GOBERNA — Campaign Goals Calculator
 * Editable inputs: Meta de Datos, Brigadistas, Fecha limite.
 * Auto-calculated: Datos por brigadista al dia, Datos por dia total, Datos por brigadista total.
 */

"use client";

import { useState, useMemo, useEffect, type CSSProperties } from "react";
import { IconTarget, IconUsers, IconClock, IconBarChart, IconCompass } from "../../../../lib/ui";
import { FONT_STACK } from "../../../../lib/constants";

// ── Types ───────────────────────────────────────────────────────────

type CampaignGoalsProps = {
  /** Number of agentes de campo in this campaign */
  agentesCampoCount: number;
};

// ── Helpers ─────────────────────────────────────────────────────────

function calcDaysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T23:59:59");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(diff, 0);
}

function formatNumber(n: number): string {
  return n.toLocaleString("es-PE");
}

// ── Styles ──────────────────────────────────────────────────────────

const cardStyle: CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)",
  padding: "20px 24px",
  boxShadow: "var(--shadow-sm)",
  marginBottom: 24,
  fontFamily: FONT_STACK,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  fontSize: 16,
  fontWeight: 700,
  fontFamily: FONT_STACK,
  color: "var(--color-text-primary)",
  background: "var(--color-bg)",
  border: "1.5px solid var(--color-border)",
  borderRadius: 10,
  outline: "none",
  transition: "border-color 0.2s",
};

const labelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--color-text-tertiary)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 6,
  display: "block",
};

// ── Metric Card ─────────────────────────────────────────────────────

function MetricCard({
  icon,
  iconBg,
  iconBorder,
  label,
  value,
  suffix,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconBorder: string;
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        background: "var(--color-bg)",
        borderRadius: 12,
        border: "1px solid var(--color-border)",
        flex: "1 1 200px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: iconBg,
          border: `1.5px solid ${iconBorder}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "var(--color-text-primary)",
            lineHeight: 1.1,
            fontFamily: FONT_STACK,
          }}
        >
          {value}
          {suffix && (
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-tertiary)", marginLeft: 4 }}>
              {suffix}
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "var(--color-text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

// ── Progress Bar ────────────────────────────────────────────────────

function ProgressIndicator({ days, totalDays }: { days: number; totalDays: number }) {
  const pct = totalDays > 0 ? Math.max(0, Math.min(100, ((totalDays - days) / totalDays) * 100)) : 0;
  const color = days <= 7 ? "#dc2626" : days <= 14 ? "#f59e0b" : "#10b981";

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Progreso temporal
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>{Math.round(pct)}% del tiempo transcurrido</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "var(--color-border)", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            borderRadius: 4,
            background: `linear-gradient(90deg, ${color}, ${color}dd)`,
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
  );
}

// ── Main Export ──────────────────────────────────────────────────────

export function CampaignGoals({ agentesCampoCount }: CampaignGoalsProps) {
  // Config values
  const [metaDatos, setMetaDatos] = useState(200000);
  const [brigadistas, setBrigadistas] = useState(40);
  const [fechaLimite, setFechaLimite] = useState("2026-04-10");
  const [showEditModal, setShowEditModal] = useState(false);

  // Draft values for modal edit
  const [draftMetaDatos, setDraftMetaDatos] = useState(200000);
  const [draftBrigadistas, setDraftBrigadistas] = useState(40);
  const [draftFechaLimite, setDraftFechaLimite] = useState("2026-04-10");

  // Sync brigadistas from props when available
  useEffect(() => {
    if (agentesCampoCount > 0) {
      setBrigadistas(agentesCampoCount);
    }
  }, [agentesCampoCount]);

  // Calculations
  const dias = useMemo(() => calcDaysUntil(fechaLimite), [fechaLimite]);

  // Days from today to estimate total campaign span (for progress bar)
  const totalDaysFromStart = useMemo(() => {
    // Estimate: campaign started ~60 days before deadline (we use total dias as reference)
    return dias + Math.max(0, 60 - dias);
  }, [dias]);

  const datosPorBrigadistaAlDia = useMemo(() => {
    if (brigadistas <= 0 || dias <= 0) return 0;
    return Math.ceil(metaDatos / (brigadistas * dias));
  }, [metaDatos, brigadistas, dias]);

  const datosPorDiaTotal = useMemo(() => {
    if (dias <= 0) return 0;
    return Math.ceil(metaDatos / dias);
  }, [metaDatos, dias]);

  const datosPorBrigadistaTotal = useMemo(() => {
    if (brigadistas <= 0) return 0;
    return Math.ceil(metaDatos / brigadistas);
  }, [metaDatos, brigadistas]);

  const openEditModal = () => {
    setDraftMetaDatos(metaDatos);
    setDraftBrigadistas(brigadistas);
    setDraftFechaLimite(fechaLimite);
    setShowEditModal(true);
  };

  const saveEdits = () => {
    setMetaDatos(Math.max(0, draftMetaDatos));
    setBrigadistas(Math.max(1, draftBrigadistas));
    setFechaLimite(draftFechaLimite);
    setShowEditModal(false);
  };

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "linear-gradient(135deg, #10b981, #059669)",
            border: "1.5px solid #059669",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <IconTarget size={20} color="#fff" />
        </div>
        <div>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: "var(--color-text-primary)",
              margin: 0,
              letterSpacing: "0.02em",
              textTransform: "uppercase",
            }}
          >
            Metas de Recoleccion
          </h2>
          <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: 0 }}>
            Calculadora de objetivos para brigadistas de campo
          </p>
        </div>
        <button
          type="button"
          onClick={openEditModal}
          aria-label="Editar metas"
          title="Editar metas"
          style={{
            marginLeft: "auto",
            width: 34,
            height: 34,
            color: "var(--goberna-blue-600)",
            background: "var(--color-surface-alt)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
        </button>
      </div>

      <div style={{ marginBottom: 20 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: dias <= 7 ? "#dc2626" : "var(--color-text-tertiary)", display: "block", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {dias} {dias === 1 ? "dia" : "dias"} restantes para la fecha limite
        </span>
      </div>

      {/* Calculated Metrics */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <MetricCard
          icon={<IconCompass size={18} color="#fff" />}
          iconBg="linear-gradient(135deg, #64748b, #475569)"
          iconBorder="#475569"
          label="Datos / Brigadista / Dia"
          value={formatNumber(datosPorBrigadistaAlDia)}
        />
        <MetricCard
          icon={<IconBarChart size={18} color="#fff" />}
          iconBg="linear-gradient(135deg, #3b82f6, #1d4ed8)"
          iconBorder="#1d4ed8"
          label="Datos por Dia (Total)"
          value={formatNumber(datosPorDiaTotal)}
        />
        <MetricCard
          icon={<IconUsers size={18} color="#fff" />}
          iconBg="linear-gradient(135deg, #10b981, #059669)"
          iconBorder="#059669"
          label="Datos / Brigadista (Total)"
          value={formatNumber(datosPorBrigadistaTotal)}
        />
      </div>

      {/* Progress Bar */}
      <ProgressIndicator days={dias} totalDays={totalDaysFromStart} />

      {/* Summary Row */}
      <div
        style={{
          marginTop: 16,
          padding: "12px 16px",
          background: "rgba(16, 185, 129, 0.06)",
          border: "1px solid rgba(16, 185, 129, 0.2)",
          borderRadius: 10,
          fontSize: 12,
          color: "var(--color-text-secondary)",
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: "var(--color-text-primary)" }}>{formatNumber(brigadistas)}</strong> brigadistas deben recolectar{" "}
        <strong style={{ color: "var(--color-text-primary)" }}>{formatNumber(datosPorBrigadistaAlDia)}</strong> datos cada uno por dia durante{" "}
        <strong style={{ color: "var(--color-text-primary)" }}>{dias} dias</strong> para alcanzar la meta de{" "}
        <strong style={{ color: "#059669" }}>{formatNumber(metaDatos)}</strong> datos.
      </div>

      {showEditModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            padding: 16,
          }}
        >
          <div
            style={{
              width: "min(560px, 100%)",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 14,
              boxShadow: "var(--shadow-sm)",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "var(--color-text-primary)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                Editar metas
              </h3>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface-alt)",
                  color: "var(--color-text-secondary)",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
                aria-label="Cerrar"
              >
                x
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
              <div>
                <label htmlFor="goal-meta-datos" style={labelStyle}>Meta de Datos</label>
                <input
                  id="goal-meta-datos"
                  type="number"
                  min={0}
                  step={1000}
                  value={draftMetaDatos}
                  onChange={(e) => setDraftMetaDatos(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label htmlFor="goal-brigadistas" style={labelStyle}>Brigadistas (campo)</label>
                <input
                  id="goal-brigadistas"
                  type="number"
                  min={1}
                  value={draftBrigadistas}
                  onChange={(e) => setDraftBrigadistas(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  style={inputStyle}
                />
                {agentesCampoCount > 0 && draftBrigadistas !== agentesCampoCount && (
                  <button
                    type="button"
                    onClick={() => setDraftBrigadistas(agentesCampoCount)}
                    style={{
                      marginTop: 4,
                      fontSize: 10,
                      fontWeight: 600,
                      color: "var(--goberna-blue-600)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      textDecoration: "underline",
                    }}
                  >
                    Usar actual ({agentesCampoCount})
                  </button>
                )}
              </div>

              <div>
                <label htmlFor="goal-fecha-limite" style={labelStyle}>Fecha Limite</label>
                <input
                  id="goal-fecha-limite"
                  type="date"
                  value={draftFechaLimite}
                  onChange={(e) => setDraftFechaLimite(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface-alt)",
                  color: "var(--color-text-secondary)",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveEdits}
                style={{
                  padding: "7px 10px",
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid var(--color-border-strong)",
                  background: "var(--color-surface-active)",
                  color: "var(--color-text-primary)",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
