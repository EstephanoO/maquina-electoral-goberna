"use client";

import { useAuth } from "../../lib/auth-context";

// ── Stat card ───────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        flex: "1 1 200px",
        background: "var(--color-surface)",
        borderRadius: "var(--radius-lg)",
        padding: "24px",
        boxShadow: "var(--shadow-sm)",
        border: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <span
        style={{
          fontSize: "13px",
          fontWeight: 500,
          color: "var(--color-text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "32px",
          fontWeight: 700,
          color: "var(--color-text-primary)",
          lineHeight: 1,
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export default function DashboardHomePage() {
  const { user, campaigns, activeCampaignId } = useAuth();
  const activeCampaign = campaigns.find((c) => c.id === activeCampaignId);

  return (
    <div style={{ maxWidth: "1100px" }}>
      {/* Welcome */}
      <h1
        style={{
          fontSize: "24px",
          fontWeight: 700,
          color: "var(--color-text-primary)",
          margin: "0 0 4px 0",
        }}
      >
        Bienvenido, {user?.full_name ?? "Usuario"}
      </h1>
      <p
        style={{
          fontSize: "14px",
          color: "var(--color-text-secondary)",
          margin: "0 0 28px 0",
        }}
      >
        Panel de control GOBERNA
      </p>

      {/* Active campaign card */}
      {activeCampaign && (
        <div
          style={{
            background: "var(--color-surface)",
            borderRadius: "var(--radius-lg)",
            padding: "20px 24px",
            marginBottom: "24px",
            boxShadow: "var(--shadow-sm)",
            border: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "var(--radius-md)",
              background: "var(--goberna-blue-900)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--goberna-gold)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <title>Campana activa</title>
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <div>
            <div
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--color-text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "1px",
                marginBottom: "2px",
              }}
            >
              Campana activa
            </div>
            <div
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "var(--color-text-primary)",
              }}
            >
              {activeCampaign.name}
            </div>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <StatCard label="Agentes Activos" value="--" />
        <StatCard label="Encuestas Hoy" value="--" />
        <StatCard label="Cobertura Territorial" value="--" />
        <StatCard label="Alertas" value="--" />
      </div>

      {/* Getting started card */}
      <div
        style={{
          background: "var(--color-surface)",
          borderRadius: "var(--radius-lg)",
          padding: "32px",
          boxShadow: "var(--shadow-sm)",
          border: "2px solid var(--goberna-gold-200)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            background: "var(--goberna-gold-100)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px auto",
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--goberna-gold-600)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <title>Seleccionar seccion</title>
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </div>
        <p
          style={{
            fontSize: "15px",
            fontWeight: 500,
            color: "var(--color-text-secondary)",
            margin: 0,
            lineHeight: 1.6,
          }}
        >
          Seleccione una seccion del menu para comenzar
        </p>
      </div>
    </div>
  );
}
