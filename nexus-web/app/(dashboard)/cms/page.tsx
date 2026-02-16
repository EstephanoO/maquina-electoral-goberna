"use client";

import { useState, useMemo } from "react";
import {
  getCandidateSubmissions,
  getCandidateAgents,
  getCandidateForms,
  type MockSubmission,
} from "../../../lib/mock-data";

/* ═══════════════════════════════════════════════════════════════════════════
   GOBERNA — CMS: Centro de Mensajes
   Submissions table + detail slide-over for operators/candidates.
   All data is MOCK — no API calls.
   ═══════════════════════════════════════════════════════════════════════════ */

const MOCK_CAMPAIGN_ID = "cand-001";

// ── Injected keyframes ──────────────────────────────────────────────

const INJECTED_STYLES = `
@keyframes goberna-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes goberna-slide-in {
  from { transform: translateX(100%); opacity: 0; }
  to   { transform: translateX(0); opacity: 1; }
}
@keyframes goberna-spin {
  to { transform: rotate(360deg); }
}
`;

// ── Status helpers ──────────────────────────────────────────────────

type SubmissionStatus = MockSubmission["status"];

const STATUS_CONFIG: Record<
  SubmissionStatus,
  { bg: string; color: string; label: string }
> = {
  nuevo: { bg: "#fef2f2", color: "#dc2626", label: "Nuevo" },
  revisado: { bg: "#fff7ed", color: "#d97706", label: "Revisado" },
  procesado: { bg: "#ecfdf5", color: "#16a34a", label: "Procesado" },
};

const STATUS_FILTERS: { value: SubmissionStatus | "todos"; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "nuevo", label: "Nuevos" },
  { value: "revisado", label: "Revisados" },
  { value: "procesado", label: "Procesados" },
];

// ── Date formatter ──────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const months = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
  ];
  const mon = months[d.getMonth()];
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${day} ${mon}, ${h}:${m}`;
}

// ── Format data key for display ─────────────────────────────────────

function formatKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(val: string | number | boolean): string {
  if (typeof val === "boolean") return val ? "Si" : "No";
  return String(val);
}

// ── StatusBadge ─────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SubmissionStatus }) {
  const c = STATUS_CONFIG[status];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        borderRadius: 20,
        background: c.bg,
        color: c.color,
      }}
    >
      {c.label}
    </span>
  );
}

// ── Shared style constants ──────────────────────────────────────────

const FONT_STACK = "var(--font-montserrat), system-ui, sans-serif";

// ── Main Page ───────────────────────────────────────────────────────

export default function CmsPage() {
  // Load mock data
  const initialSubmissions = useMemo(
    () => getCandidateSubmissions(MOCK_CAMPAIGN_ID),
    [],
  );
  const agents = useMemo(
    () => getCandidateAgents(MOCK_CAMPAIGN_ID),
    [],
  );
  const forms = useMemo(
    () => getCandidateForms(MOCK_CAMPAIGN_ID),
    [],
  );

  // Local mutable copy of submissions for status changes
  const [submissions, setSubmissions] = useState<MockSubmission[]>(initialSubmissions);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<SubmissionStatus | "todos">("todos");
  const [agentFilter, setAgentFilter] = useState<string>("");
  const [formFilter, setFormFilter] = useState<string>("");

  // Detail panel
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Note (mock, doesn't persist)
  const [noteText, setNoteText] = useState("");

  // ── Unique agent/form names for selects ───────────────────────────

  const uniqueAgents = useMemo(() => {
    const names = new Set(submissions.map((s) => s.agent_name));
    return Array.from(names).sort();
  }, [submissions]);

  const uniqueForms = useMemo(() => {
    const names = new Set(submissions.map((s) => s.form_name));
    return Array.from(names).sort();
  }, [submissions]);

  // ── Filtered submissions ──────────────────────────────────────────

  const filtered = useMemo(() => {
    return submissions.filter((s) => {
      if (statusFilter !== "todos" && s.status !== statusFilter) return false;
      if (agentFilter && s.agent_name !== agentFilter) return false;
      if (formFilter && s.form_name !== formFilter) return false;
      return true;
    });
  }, [submissions, statusFilter, agentFilter, formFilter]);

  // ── Stats ─────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = submissions.length;
    const nuevo = submissions.filter((s) => s.status === "nuevo").length;
    const revisado = submissions.filter((s) => s.status === "revisado").length;
    const procesado = submissions.filter((s) => s.status === "procesado").length;
    return { total, nuevo, revisado, procesado };
  }, [submissions]);

  // ── Selected submission ───────────────────────────────────────────

  const selected = useMemo(
    () => (selectedId ? submissions.find((s) => s.id === selectedId) ?? null : null),
    [selectedId, submissions],
  );

  // ── Actions ───────────────────────────────────────────────────────

  function updateStatus(id: string, newStatus: SubmissionStatus) {
    setSubmissions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: newStatus } : s)),
    );
  }

  function handleRowClick(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
    setNoteText("");
  }

  function closePanel() {
    setSelectedId(null);
    setNoteText("");
  }

  // ── Render ────────────────────────────────────────────────────────

  const panelOpen = selected !== null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: INJECTED_STYLES }} />
      <div
        style={{
          fontFamily: FONT_STACK,
          animation: "goberna-fade-in .4s ease-out",
        }}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={{ marginBottom: 24 }}>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: "var(--color-text-primary)",
              margin: "0 0 4px",
            }}
          >
            Centro de Mensajes
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--color-text-tertiary)",
              margin: 0,
            }}
          >
            Submissions recibidos de agentes de campo
          </p>
        </div>

        {/* ── Filter bar ─────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          {/* Status chips */}
          <div style={{ display: "flex", gap: 6 }}>
            {STATUS_FILTERS.map((sf) => {
              const isActive = statusFilter === sf.value;
              return (
                <button
                  type="button"
                  key={sf.value}
                  onClick={() => setStatusFilter(sf.value)}
                  style={{
                    padding: "6px 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: FONT_STACK,
                    border: isActive ? "none" : "1px solid var(--color-border)",
                    borderRadius: 20,
                    cursor: "pointer",
                    background: isActive
                      ? "var(--goberna-blue-900)"
                      : "var(--color-surface)",
                    color: isActive ? "#fff" : "var(--color-text-secondary)",
                    transition: "all .15s ease",
                  }}
                >
                  {sf.label}
                </button>
              );
            })}
          </div>

          {/* Agent select */}
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            style={{
              padding: "7px 12px",
              fontSize: 13,
              fontFamily: FONT_STACK,
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--color-surface)",
              color: "var(--color-text-secondary)",
              cursor: "pointer",
              minWidth: 180,
            }}
          >
            <option value="">Todos los agentes</option>
            {uniqueAgents.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          {/* Form select */}
          <select
            value={formFilter}
            onChange={(e) => setFormFilter(e.target.value)}
            style={{
              padding: "7px 12px",
              fontSize: 13,
              fontFamily: FONT_STACK,
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--color-surface)",
              color: "var(--color-text-secondary)",
              cursor: "pointer",
              minWidth: 200,
            }}
          >
            <option value="">Todos los formularios</option>
            {uniqueForms.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {/* ── Stats row ──────────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            marginBottom: 24,
          }}
        >
          {/* Total */}
          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "14px 18px",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--color-text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 4,
              }}
            >
              Total
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: "var(--color-text-primary)",
              }}
            >
              {stats.total}
            </div>
          </div>

          {/* Nuevos */}
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "var(--radius-md)",
              padding: "14px 18px",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#dc2626",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 4,
              }}
            >
              Nuevos
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: "#dc2626",
              }}
            >
              {stats.nuevo}
            </div>
          </div>

          {/* Revisados */}
          <div
            style={{
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              borderRadius: "var(--radius-md)",
              padding: "14px 18px",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#d97706",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 4,
              }}
            >
              Revisados
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: "#d97706",
              }}
            >
              {stats.revisado}
            </div>
          </div>

          {/* Procesados */}
          <div
            style={{
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              borderRadius: "var(--radius-md)",
              padding: "14px 18px",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#16a34a",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 4,
              }}
            >
              Procesados
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: "#16a34a",
              }}
            >
              {stats.procesado}
            </div>
          </div>
        </div>

        {/* ── Main: Table + Detail ───────────────────────────────── */}
        <div
          style={{
            display: "flex",
            gap: 0,
            alignItems: "flex-start",
          }}
        >
          {/* ── Table ──────────────────────────────────────────────── */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              overflow: "hidden",
              transition: "margin-right .3s ease",
              marginRight: panelOpen ? 16 : 0,
            }}
          >
            {/* Table header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "140px 1fr 1fr 140px 110px",
                padding: "12px 20px",
                borderBottom: "1px solid var(--color-border)",
                background: "var(--goberna-blue-50)",
              }}
            >
              {["Fecha", "Agente", "Formulario", "Zona", "Estado"].map(
                (label) => (
                  <div
                    key={label}
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--color-text-tertiary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {label}
                  </div>
                ),
              )}
            </div>

            {/* Table body */}
            {filtered.length === 0 ? (
              <div
                style={{
                  padding: "48px 24px",
                  textAlign: "center",
                  color: "var(--color-text-tertiary)",
                }}
              >
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-border-strong)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ marginBottom: 12, opacity: 0.5 }}
                >
                  <title>Sin resultados</title>
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>
                  Sin resultados
                </p>
                <p style={{ fontSize: 13, margin: 0 }}>
                  No hay submissions que coincidan con los filtros seleccionados.
                </p>
              </div>
            ) : (
              <div>
                {filtered.map((sub) => {
                  const isSelected = selectedId === sub.id;
                  return (
                    <div
                      key={sub.id}
                      onClick={() => handleRowClick(sub.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleRowClick(sub.id);
                        }
                      }}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "140px 1fr 1fr 140px 110px",
                        padding: "14px 20px",
                        borderBottom: "1px solid var(--color-border)",
                        cursor: "pointer",
                        background: isSelected
                          ? "var(--goberna-blue-50)"
                          : "var(--color-surface)",
                        transition: "background .12s ease",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          (e.currentTarget as HTMLDivElement).style.background =
                            "#f8fafc";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          (e.currentTarget as HTMLDivElement).style.background =
                            "var(--color-surface)";
                        }
                      }}
                    >
                      {/* Fecha */}
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {formatDate(sub.submitted_at)}
                      </div>

                      {/* Agente */}
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--color-text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {sub.agent_name}
                      </div>

                      {/* Formulario */}
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: "var(--color-text-secondary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {sub.form_name}
                      </div>

                      {/* Zona */}
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: "var(--color-text-tertiary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {sub.zona}
                      </div>

                      {/* Estado */}
                      <div>
                        <StatusBadge status={sub.status} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Table footer - count */}
            <div
              style={{
                padding: "10px 20px",
                fontSize: 12,
                color: "var(--color-text-tertiary)",
                borderTop: "1px solid var(--color-border)",
                background: "var(--goberna-blue-50)",
              }}
            >
              {filtered.length} de {submissions.length} submissions
            </div>
          </div>

          {/* ── Detail panel ───────────────────────────────────────── */}
          {panelOpen && selected && (
            <div
              style={{
                width: 400,
                flexShrink: 0,
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-lg)",
                animation: "goberna-slide-in .3s ease-out",
                overflow: "hidden",
                position: "sticky",
                top: 24,
              }}
            >
              {/* Panel header */}
              <div
                style={{
                  padding: "18px 20px 14px",
                  borderBottom: "1px solid var(--color-border)",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: "var(--color-text-primary)",
                      marginBottom: 6,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {selected.form_name}
                  </div>
                  <StatusBadge status={selected.status} />
                </div>

                {/* Close button */}
                <button
                  type="button"
                  onClick={closePanel}
                  style={{
                    width: 32,
                    height: 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--color-surface)",
                    cursor: "pointer",
                    flexShrink: 0,
                    transition: "background .12s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "#f1f5f9";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "var(--color-surface)";
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-text-secondary)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <title>Cerrar panel</title>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Panel body — scrollable */}
              <div
                style={{
                  padding: "18px 20px 20px",
                  maxHeight: "calc(100vh - 200px)",
                  overflowY: "auto",
                }}
              >
                {/* Agent info */}
                <div style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--color-text-tertiary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: 8,
                    }}
                  >
                    Informacion del agente
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 8,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--color-text-tertiary)",
                          marginBottom: 2,
                        }}
                      >
                        Agente
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--color-text-primary)",
                        }}
                      >
                        {selected.agent_name}
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--color-text-tertiary)",
                          marginBottom: 2,
                        }}
                      >
                        Zona
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--color-text-primary)",
                        }}
                      >
                        {selected.zona}
                      </div>
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--color-text-tertiary)",
                          marginBottom: 2,
                        }}
                      >
                        Fecha de envio
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--color-text-primary)",
                        }}
                      >
                        {formatDate(selected.submitted_at)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div
                  style={{
                    height: 1,
                    background: "var(--color-border)",
                    margin: "16px 0",
                  }}
                />

                {/* Datos del formulario */}
                <div style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--color-text-tertiary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: 10,
                    }}
                  >
                    Datos del formulario
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {Object.entries(selected.data).map(([key, val]) => (
                      <div
                        key={key}
                        style={{
                          padding: "8px 12px",
                          background: "#f8fafc",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--color-border)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--color-text-tertiary)",
                            marginBottom: 2,
                          }}
                        >
                          {formatKey(key)}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--color-text-primary)",
                            wordBreak: "break-word",
                          }}
                        >
                          {formatValue(val)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Location */}
                <div style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--color-text-tertiary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: 6,
                    }}
                  >
                    Ubicacion
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--color-text-tertiary)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <title>Ubicacion</title>
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span
                      style={{
                        fontSize: 12,
                        fontFamily: "monospace",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
                    </span>
                  </div>
                </div>

                {/* Divider */}
                <div
                  style={{
                    height: 1,
                    background: "var(--color-border)",
                    margin: "16px 0",
                  }}
                />

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  {selected.status === "nuevo" && (
                    <button
                      type="button"
                      onClick={() => updateStatus(selected.id, "revisado")}
                      style={{
                        flex: 1,
                        padding: "10px 16px",
                        fontSize: 13,
                        fontWeight: 700,
                        fontFamily: FONT_STACK,
                        color: "#fff",
                        background: "#d97706",
                        border: "none",
                        borderRadius: "var(--radius-sm)",
                        cursor: "pointer",
                        transition: "background .15s ease",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background =
                          "#b45309";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background =
                          "#d97706";
                      }}
                    >
                      Marcar como Revisado
                    </button>
                  )}
                  {selected.status === "revisado" && (
                    <button
                      type="button"
                      onClick={() => updateStatus(selected.id, "procesado")}
                      style={{
                        flex: 1,
                        padding: "10px 16px",
                        fontSize: 13,
                        fontWeight: 700,
                        fontFamily: FONT_STACK,
                        color: "#fff",
                        background: "#16a34a",
                        border: "none",
                        borderRadius: "var(--radius-sm)",
                        cursor: "pointer",
                        transition: "background .15s ease",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background =
                          "#15803d";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background =
                          "#16a34a";
                      }}
                    >
                      Marcar como Procesado
                    </button>
                  )}
                  {selected.status === "procesado" && (
                    <div
                      style={{
                        flex: 1,
                        padding: "10px 16px",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#16a34a",
                        background: "#ecfdf5",
                        border: "1px solid #a7f3d0",
                        borderRadius: "var(--radius-sm)",
                        textAlign: "center",
                      }}
                    >
                      Submission procesado
                    </div>
                  )}
                </div>

                {/* Note textarea */}
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--color-text-tertiary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: 6,
                    }}
                  >
                    Agregar nota
                  </div>
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Escribe una nota sobre este submission..."
                    rows={3}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: 13,
                      fontFamily: FONT_STACK,
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--color-surface)",
                      resize: "vertical",
                      outline: "none",
                      color: "var(--color-text-primary)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (noteText.trim()) {
                        setNoteText("");
                      }
                    }}
                    disabled={!noteText.trim()}
                    style={{
                      marginTop: 8,
                      padding: "8px 16px",
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: FONT_STACK,
                      color: noteText.trim() ? "#fff" : "var(--color-text-tertiary)",
                      background: noteText.trim()
                        ? "var(--goberna-blue-900)"
                        : "var(--color-border)",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      cursor: noteText.trim() ? "pointer" : "not-allowed",
                      transition: "all .15s ease",
                    }}
                  >
                    Guardar nota
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
