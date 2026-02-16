"use client";

import { useState, useEffect, useMemo } from "react";
import {
  getCandidateAgents,
  getCandidateOperadoras,
  type MockAgent,
  type MockOperadora,
} from "../../../lib/mock-data";

/* ═══════════════════════════════════════════════════════════════════════
   GOBERNA — Candidato: Mi Equipo (Agentes & Operadoras)
   ═══════════════════════════════════════════════════════════════════════ */

const MOCK_CAMPAIGN_ID = "cand-001";

type Tab = "agentes" | "operadoras";

const INJECTED_STYLES = `
@keyframes goberna-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

function injectStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("goberna-equipo-styles")) return;
  const el = document.createElement("style");
  el.id = "goberna-equipo-styles";
  el.textContent = INJECTED_STYLES;
  document.head.appendChild(el);
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date}, ${time}`;
}

// ── Stat Card ───────────────────────────────────────────────────────

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        animation: "goberna-fade-in .35s ease-out",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "var(--radius-md)",
          background: "var(--goberna-blue-50)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "var(--color-text-primary)",
            lineHeight: 1.1,
          }}
        >
          {value}
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--color-text-tertiary)",
            marginTop: 2,
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

// ── Status Badges ───────────────────────────────────────────────────

function AgentStatusBadge({ status }: { status: "online" | "offline" }) {
  const isOnline = status === "online";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        color: isOnline ? "var(--color-success)" : "var(--color-text-tertiary)",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: isOnline ? "var(--color-success)" : "var(--color-border-strong)",
          flexShrink: 0,
        }}
      />
      {isOnline ? "En linea" : "Desconectado"}
    </span>
  );
}

function OperadoraStatusBadge({ status }: { status: "active" | "inactive" }) {
  const isActive = status === "active";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        color: isActive ? "var(--color-success)" : "var(--color-text-tertiary)",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: isActive ? "var(--color-success)" : "var(--color-border-strong)",
          flexShrink: 0,
        }}
      />
      {isActive ? "Activa" : "Inactiva"}
    </span>
  );
}

// ── Icons (inline SVGs with <title>) ────────────────────────────────

function IconUsers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--goberna-blue-600)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <title>Usuarios</title>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconOnline() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <title>En linea</title>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function IconOffline() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <title>Desconectado</title>
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  );
}

function IconForms() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--goberna-gold-600)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <title>Formularios</title>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function IconActive() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <title>Activas</title>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconSubmissions() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--goberna-blue-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <title>Submissions procesados</title>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="9" y1="21" x2="9" y2="9" />
    </svg>
  );
}

function IconInvite() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <title>Invitar</title>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export default function EquipoPage() {
  const [tab, setTab] = useState<Tab>("agentes");

  useEffect(injectStyles, []);

  const agents: MockAgent[] = useMemo(() => getCandidateAgents(MOCK_CAMPAIGN_ID), []);
  const operadoras: MockOperadora[] = useMemo(() => getCandidateOperadoras(MOCK_CAMPAIGN_ID), []);

  // ── Agent stats ──
  const agentStats = useMemo(() => {
    const online = agents.filter((a) => a.status === "online").length;
    const offline = agents.length - online;
    const formsSent = agents.reduce((sum, a) => sum + a.forms_sent, 0);
    return { total: agents.length, online, offline, formsSent };
  }, [agents]);

  // ── Operadora stats ──
  const operadoraStats = useMemo(() => {
    const active = operadoras.filter((o) => o.status === "active").length;
    const submissionsProcessed = operadoras.reduce((sum, o) => sum + o.submissions_processed, 0);
    return { total: operadoras.length, active, submissionsProcessed };
  }, [operadoras]);

  const fontStack = "var(--font-montserrat), system-ui, sans-serif";

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: active ? 700 : 500,
    fontFamily: fontStack,
    color: active ? "var(--goberna-blue-900)" : "var(--color-text-tertiary)",
    background: "transparent",
    border: "none",
    borderBottom: active ? "2px solid var(--goberna-gold)" : "2px solid transparent",
    cursor: "pointer",
    transition: "all .15s ease",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  });

  const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "12px 16px",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--color-text-secondary)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    background: "var(--goberna-blue-50)",
    borderBottom: "1px solid var(--color-border)",
    whiteSpace: "nowrap",
  };

  const tdStyle: React.CSSProperties = {
    padding: "12px 16px",
    fontSize: 13,
    color: "var(--color-text-primary)",
    borderBottom: "1px solid var(--color-border)",
  };

  return (
    <div style={{ fontFamily: fontStack, animation: "goberna-fade-in .4s ease-out" }}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: "var(--color-text-primary)",
              margin: "0 0 4px",
            }}
          >
            Mi Equipo
          </h1>
          <p style={{ fontSize: 14, color: "var(--color-text-tertiary)", margin: 0 }}>
            Gestion de agentes de campo y operadoras de la campana.
          </p>
        </div>

        <button
          type="button"
          onClick={() => alert("Funcion disponible proximamente")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 20px",
            fontSize: 13,
            fontWeight: 700,
            fontFamily: fontStack,
            color: "var(--color-text-on-accent)",
            background: "var(--goberna-gold)",
            border: "none",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
            transition: "background .15s ease",
            boxShadow: "var(--shadow-sm)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--goberna-gold-500)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--goberna-gold)";
          }}
        >
          <IconInvite />
          Invitar
        </button>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "1px solid var(--color-border)",
          marginBottom: 20,
        }}
      >
        <button type="button" style={tabStyle(tab === "agentes")} onClick={() => setTab("agentes")}>
          Agentes de Campo
          <span
            style={{
              display: "inline-block",
              marginLeft: 8,
              padding: "2px 8px",
              fontSize: 11,
              fontWeight: 700,
              borderRadius: 10,
              background: tab === "agentes" ? "var(--goberna-blue-100)" : "var(--color-border)",
              color: tab === "agentes" ? "var(--goberna-blue-700)" : "var(--color-text-tertiary)",
              transition: "all .15s ease",
            }}
          >
            {agents.length}
          </span>
        </button>
        <button type="button" style={tabStyle(tab === "operadoras")} onClick={() => setTab("operadoras")}>
          Operadoras
          <span
            style={{
              display: "inline-block",
              marginLeft: 8,
              padding: "2px 8px",
              fontSize: 11,
              fontWeight: 700,
              borderRadius: 10,
              background: tab === "operadoras" ? "var(--goberna-blue-100)" : "var(--color-border)",
              color: tab === "operadoras" ? "var(--goberna-blue-700)" : "var(--color-text-tertiary)",
              transition: "all .15s ease",
            }}
          >
            {operadoras.length}
          </span>
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          Tab: Agentes de Campo
         ═══════════════════════════════════════════════════════════ */}
      {tab === "agentes" && (
        <div style={{ animation: "goberna-fade-in .3s ease-out" }}>
          {/* Stats row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              marginBottom: 20,
            }}
          >
            <StatCard label="Total Agentes" value={agentStats.total} icon={<IconUsers />} />
            <StatCard label="En Linea" value={agentStats.online} icon={<IconOnline />} />
            <StatCard label="Desconectados" value={agentStats.offline} icon={<IconOffline />} />
            <StatCard label="Forms Enviados" value={agentStats.formsSent} icon={<IconForms />} />
          </div>

          {/* Table */}
          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              overflow: "hidden",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Nombre</th>
                    <th style={thStyle}>Estado</th>
                    <th style={thStyle}>Ultima Actividad</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Forms Enviados</th>
                    <th style={thStyle}>Zona</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.length === 0 ? (
                    <tr>
                      <td
                        style={{ ...tdStyle, textAlign: "center", color: "var(--color-text-tertiary)", padding: "32px 16px" }}
                        colSpan={5}
                      >
                        No hay agentes asignados a esta campana.
                      </td>
                    </tr>
                  ) : (
                    agents.map((agent, idx) => (
                      <tr
                        key={agent.id}
                        style={{
                          background: idx % 2 === 0 ? "transparent" : "var(--goberna-blue-50)",
                          transition: "background .1s ease",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLTableRowElement).style.background = "var(--goberna-gold-100)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLTableRowElement).style.background =
                            idx % 2 === 0 ? "transparent" : "var(--goberna-blue-50)";
                        }}
                      >
                        <td style={tdStyle}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: "50%",
                                background: "var(--goberna-blue-100)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 13,
                                fontWeight: 700,
                                color: "var(--goberna-blue-600)",
                                flexShrink: 0,
                              }}
                            >
                              {agent.name.charAt(0)}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--color-text-primary)" }}>
                                {agent.name}
                              </div>
                              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                                {agent.email}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <AgentStatusBadge status={agent.status} />
                        </td>
                        <td style={{ ...tdStyle, fontSize: 12, color: "var(--color-text-secondary)" }}>
                          {formatDate(agent.last_activity)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                          {agent.forms_sent}
                        </td>
                        <td style={{ ...tdStyle, fontSize: 12, color: "var(--color-text-secondary)" }}>
                          {agent.zona}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          Tab: Operadoras
         ═══════════════════════════════════════════════════════════ */}
      {tab === "operadoras" && (
        <div style={{ animation: "goberna-fade-in .3s ease-out" }}>
          {/* Stats row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12,
              marginBottom: 20,
            }}
          >
            <StatCard label="Total Operadoras" value={operadoraStats.total} icon={<IconUsers />} />
            <StatCard label="Activas" value={operadoraStats.active} icon={<IconActive />} />
            <StatCard label="Submissions Procesados" value={operadoraStats.submissionsProcessed} icon={<IconSubmissions />} />
          </div>

          {/* Invite button row */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: 12,
            }}
          >
            <button
              type="button"
              onClick={() => alert("Funcion disponible proximamente")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: fontStack,
                color: "var(--goberna-blue-700)",
                background: "var(--goberna-blue-50)",
                border: "1px solid var(--goberna-blue-200)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                transition: "all .15s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--goberna-blue-100)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--goberna-blue-50)";
              }}
            >
              <IconInvite />
              Invitar Operadora
            </button>
          </div>

          {/* Table */}
          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              overflow: "hidden",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Nombre</th>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Estado</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Submissions Procesados</th>
                    <th style={thStyle}>Ultima Actividad</th>
                  </tr>
                </thead>
                <tbody>
                  {operadoras.length === 0 ? (
                    <tr>
                      <td
                        style={{ ...tdStyle, textAlign: "center", color: "var(--color-text-tertiary)", padding: "32px 16px" }}
                        colSpan={5}
                      >
                        No hay operadoras asignadas a esta campana.
                      </td>
                    </tr>
                  ) : (
                    operadoras.map((op, idx) => (
                      <tr
                        key={op.id}
                        style={{
                          background: idx % 2 === 0 ? "transparent" : "var(--goberna-blue-50)",
                          transition: "background .1s ease",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLTableRowElement).style.background = "var(--goberna-gold-100)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLTableRowElement).style.background =
                            idx % 2 === 0 ? "transparent" : "var(--goberna-blue-50)";
                        }}
                      >
                        <td style={tdStyle}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: "50%",
                                background: "var(--goberna-blue-100)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 13,
                                fontWeight: 700,
                                color: "var(--goberna-blue-600)",
                                flexShrink: 0,
                              }}
                            >
                              {op.name.charAt(0)}
                            </div>
                            <span style={{ fontWeight: 600, fontSize: 13, color: "var(--color-text-primary)" }}>
                              {op.name}
                            </span>
                          </div>
                        </td>
                        <td style={{ ...tdStyle, fontSize: 12, color: "var(--color-text-secondary)" }}>
                          {op.email}
                        </td>
                        <td style={tdStyle}>
                          <OperadoraStatusBadge status={op.status} />
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                          {op.submissions_processed}
                        </td>
                        <td style={{ ...tdStyle, fontSize: 12, color: "var(--color-text-secondary)" }}>
                          {formatDate(op.last_activity)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
