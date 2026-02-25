"use client";

import { useState, useEffect, useMemo } from "react";
import type { CmsContact, CmsOperatorNotes, CmsSignalFlags, CmsVoteTier } from "@/lib/services/cms";

const FONT = "var(--font-montserrat), system-ui, sans-serif";
const PANEL_WIDTH = 400;

type ContactNotesPanelProps = {
  contact: CmsContact;
  onSave: (id: string, notes: CmsOperatorNotes) => void;
  onClose: () => void;
  saving: boolean;
};

const LABEL_STYLE: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--color-text-tertiary)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 6,
};

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: 13,
  fontFamily: FONT,
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  outline: "none",
  boxSizing: "border-box",
};

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("es-PE", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
  } catch {
    return "—";
  }
}

// ── Status badge for panel header ─────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  nuevo: { label: "NUEVO", bg: "#dbeafe", color: "#1d4ed8" },
  hablado: { label: "HABLADO", bg: "#d1fae5", color: "#065f46" },
  respondieron: { label: "CONTESTÓ", bg: "#ede9fe", color: "#5b21b6" },
  archivado: { label: "ARCHIVADO", bg: "#f3f4f6", color: "#6b7280" },
};

type SignalKey = keyof CmsSignalFlags;

const SIGNAL_ITEMS: Array<{ key: SignalKey; label: string; points: number }> = [
  { key: "responde", label: "Responde", points: 10 },
  { key: "hace_pregunta", label: "Hace pregunta", points: 15 },
  { key: "pide_informacion", label: "Pide información", points: 20 },
  { key: "comparte_ubicacion", label: "Comparte ubicación", points: 25 },
  { key: "deja_en_visto", label: "Deja en visto", points: -15 },
  { key: "bloquea", label: "Bloquea", points: -40 },
];

const MAX_SIGNAL_SCORE = SIGNAL_ITEMS
  .filter((signal) => signal.points > 0)
  .reduce((sum, signal) => sum + signal.points, 0);

const VOTE_TIER_LABELS: Record<CmsVoteTier, string> = {
  contacto_basura: "Contacto basura",
  voto_blando: "Voto blando",
  voto_duro: "Voto duro",
};

const VOTE_TIER_COLORS: Record<CmsVoteTier, { color: string; bg: string }> = {
  contacto_basura: { color: "#b91c1c", bg: "#fee2e2" },
  voto_blando: { color: "#92400e", bg: "#fef3c7" },
  voto_duro: { color: "#166534", bg: "#dcfce7" },
};

function normalizeSignalFlags(flags?: CmsSignalFlags): Record<SignalKey, boolean> {
  return {
    responde: Boolean(flags?.responde),
    hace_pregunta: Boolean(flags?.hace_pregunta),
    pide_informacion: Boolean(flags?.pide_informacion),
    comparte_ubicacion: Boolean(flags?.comparte_ubicacion),
    deja_en_visto: Boolean(flags?.deja_en_visto),
    bloquea: Boolean(flags?.bloquea),
  };
}

function computeSignalScore(flags: Record<SignalKey, boolean>): number {
  return SIGNAL_ITEMS.reduce((sum, signal) => (
    flags[signal.key] ? sum + signal.points : sum
  ), 0);
}

function getVoteTier(score: number): CmsVoteTier {
  const clamped = Math.max(0, Math.min(MAX_SIGNAL_SCORE, score));
  const firstCut = MAX_SIGNAL_SCORE / 3;
  const secondCut = (MAX_SIGNAL_SCORE * 2) / 3;

  if (clamped < firstCut) return "contacto_basura";
  if (clamped < secondCut) return "voto_blando";
  return "voto_duro";
}

export function ContactNotesPanel({ contact, onSave, onClose, saving }: ContactNotesPanelProps) {
  const [localVotacion, setLocalVotacion] = useState(
    (contact.cms_operator_notes?.local_votacion as string) || "",
  );
  const [domicilio, setDomicilio] = useState(
    (contact.cms_operator_notes?.domicilio as string) || "",
  );
  const [comentarios, setComentarios] = useState(
    (contact.cms_operator_notes?.comentarios as string) || "",
  );
  const [signalFlags, setSignalFlags] = useState<Record<SignalKey, boolean>>(
    normalizeSignalFlags(contact.cms_operator_notes?.signal_flags),
  );

  // Re-sync local state when the contact prop changes (e.g. SSE update)
  useEffect(() => {
    setLocalVotacion((contact.cms_operator_notes?.local_votacion as string) || "");
    setDomicilio((contact.cms_operator_notes?.domicilio as string) || "");
    setComentarios((contact.cms_operator_notes?.comentarios as string) || "");
    setSignalFlags(normalizeSignalFlags(contact.cms_operator_notes?.signal_flags));
  }, [contact.id, contact.cms_operator_notes]);

  const nombre = contact.nombre || "Sin nombre";
  const isReadOnly = contact.cms_status === "archivado";
  const statusCfg = STATUS_LABELS[contact.cms_status] ?? STATUS_LABELS.nuevo;
  const rawSignalScore = useMemo(() => computeSignalScore(signalFlags), [signalFlags]);
  const progressScore = Math.max(0, Math.min(MAX_SIGNAL_SCORE, rawSignalScore));
  const progressPct = (progressScore / MAX_SIGNAL_SCORE) * 100;
  const voteTier = getVoteTier(progressScore);
  const tierBadge = VOTE_TIER_COLORS[voteTier];

  // Context info
  const contextItems: Array<{ label: string; value: string }> = [];
  if (contact.encuestador) contextItems.push({ label: "Entrevistador", value: contact.encuestador });
  if (contact.zona) contextItems.push({ label: "Zona / Ubicación", value: contact.zona });
  if (contact.candidato_preferido) contextItems.push({ label: "Candidato preferido", value: contact.candidato_preferido });
  contextItems.push({ label: "Agregado", value: formatDateTime(contact.created_at) });
  if (contact.cms_hablado_at) contextItems.push({ label: "Hablado", value: formatDateTime(contact.cms_hablado_at) });
  if (contact.cms_respondieron_at) contextItems.push({ label: "Contestó", value: formatDateTime(contact.cms_respondieron_at) });

  return (
    <div
      className="cms-notes-overlay"
      onClick={onClose}
    >
      <div
        className="cms-notes-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Ver o editar ${nombre}`}
        onClick={(event) => event.stopPropagation()}
        style={{
          display: "flex",
          flexDirection: "column",
          fontFamily: FONT,
        }}
      >
        <style>{`
          .cms-notes-overlay {
            position: fixed;
            inset: 0;
            z-index: 60;
            display: flex;
            justify-content: flex-end;
            align-items: stretch;
            background: transparent;
          }

          .cms-notes-panel {
            width: min(${PANEL_WIDTH}px, 100vw);
            height: 100dvh;
            background: var(--color-surface);
            border-left: 1px solid var(--color-border);
            box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18);
            animation: goberna-slide-in 0.2s ease-out;
          }

          @media (min-width: 1025px) {
            .cms-notes-overlay {
              background: transparent !important;
              backdrop-filter: none !important;
              -webkit-backdrop-filter: none !important;
            }

            .cms-notes-panel {
              margin: 8px 0;
              height: calc(100dvh - 16px);
              border-radius: 14px 0 0 14px;
            }
          }

          @keyframes goberna-slide-in {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }

          @keyframes goberna-slide-up {
            from { transform: translateY(28px); opacity: 0.92; }
            to { transform: translateY(0); opacity: 1; }
          }

          @media (max-width: 1024px) {
            .cms-notes-overlay {
              justify-content: center;
              align-items: flex-end;
              padding: 8px;
              background: rgba(15, 23, 42, 0.34);
              backdrop-filter: blur(1px);
              -webkit-backdrop-filter: blur(1px);
            }

            .cms-notes-panel {
              width: min(720px, 100%);
              height: min(90dvh, 820px);
              border-left: none;
              border: 1px solid var(--color-border);
              border-radius: 16px 16px 10px 10px;
              box-shadow: 0 -8px 34px rgba(15, 23, 42, 0.24);
              overflow: hidden;
              animation: goberna-slide-up 0.2s ease-out;
            }
          }

          @media (max-width: 640px) {
            .cms-notes-overlay {
              padding: 0;
            }

            .cms-notes-panel {
              width: 100%;
              height: 100dvh;
              border: none;
              border-radius: 0;
              box-shadow: none;
            }
          }
        `}</style>

        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {nombre}
              </div>
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 7px",
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  borderRadius: 4,
                  background: statusCfg.bg,
                  color: statusCfg.color,
                  flexShrink: 0,
                }}
              >
                {statusCfg.label}
              </span>
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#25D366",
                fontFamily: "monospace",
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {contact.telefono}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              background: "var(--color-surface)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round">
              <title>Cerrar</title>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
          {/* Context card */}
          {contextItems.length > 0 && (
            <div
              style={{
                marginBottom: 20,
                padding: 14,
                background: "var(--goberna-blue-50)",
                borderRadius: 8,
                border: "1px solid var(--goberna-blue-200, #bfdbfe)",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 800, color: "var(--goberna-blue-900)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Contexto del contacto
              </div>
              {contextItems.map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "4px 0",
                    borderBottom: "1px solid rgba(0,0,0,0.04)",
                  }}
                >
                  <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", fontWeight: 600 }}>
                    {item.label}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--color-text-primary)", fontWeight: 500, textAlign: "right", maxWidth: "58%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div
            style={{
              marginBottom: 20,
              padding: 14,
              background: "#f8fafc",
              borderRadius: 8,
              border: "1px solid #dbe5ef",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: "var(--color-text-tertiary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Clasificación de intención
              </div>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  color: tierBadge.color,
                  background: tierBadge.bg,
                  whiteSpace: "nowrap",
                }}
              >
                {VOTE_TIER_LABELS[voteTier]}
              </span>
            </div>

            <div
              style={{
                position: "relative",
                height: 36,
                borderRadius: 10,
                overflow: "hidden",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: `${progressPct}%`,
                  background: "linear-gradient(90deg, #f87171 0%, #f59e0b 52%, #22c55e 100%)",
                  transition: "width 220ms ease",
                }}
              />

              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                }}
              >
                {(["contacto_basura", "voto_blando", "voto_duro"] as CmsVoteTier[]).map((tier, idx) => (
                  <div
                    key={tier}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderLeft: idx === 0 ? "none" : "1px solid rgba(148, 163, 184, 0.35)",
                      fontSize: 10,
                      fontWeight: voteTier === tier ? 800 : 700,
                      color: voteTier === tier ? "#0f172a" : "#64748b",
                      background: voteTier === tier ? "rgba(255,255,255,0.2)" : "transparent",
                      letterSpacing: "0.01em",
                    }}
                  >
                    {VOTE_TIER_LABELS[tier]}
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                fontSize: 11,
                color: "var(--color-text-tertiary)",
                fontWeight: 600,
              }}
            >
              <span>
                Puntaje: {rawSignalScore >= 0 ? `+${rawSignalScore}` : rawSignalScore} / +{MAX_SIGNAL_SCORE}
              </span>
              <span>{Math.round(progressPct)}%</span>
            </div>

            <div
              style={{
                marginTop: 10,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 8,
              }}
            >
              {SIGNAL_ITEMS.map((signal) => {
                const checked = signalFlags[signal.key];
                const isPositive = signal.points > 0;
                return (
                  <label
                    key={signal.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      border: "1px solid #dbe5ef",
                      borderRadius: 8,
                      padding: "8px 10px",
                      background: checked
                        ? (isPositive ? "#ecfdf5" : "#fef2f2")
                        : "#ffffff",
                      cursor: isReadOnly ? "not-allowed" : "pointer",
                      opacity: isReadOnly ? 0.7 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isReadOnly}
                      onChange={() => {
                        setSignalFlags((prev) => ({
                          ...prev,
                          [signal.key]: !prev[signal.key],
                        }));
                      }}
                    />
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#1e293b",
                      }}
                    >
                      {signal.label}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: isPositive ? "#15803d" : "#b91c1c",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {signal.points > 0 ? `+${signal.points}` : signal.points}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Editable notes */}
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
            {isReadOnly ? "Notas del operador" : "Editar notas"}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="local_votacion" style={LABEL_STYLE}>
              Local de Votación
            </label>
            <input
              id="local_votacion"
              type="text"
              value={localVotacion}
              onChange={(e) => setLocalVotacion(e.target.value)}
              placeholder="Ej: IE San Juan"
              readOnly={isReadOnly}
              style={{ ...INPUT_STYLE, opacity: isReadOnly ? 0.6 : 1 }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="domicilio" style={LABEL_STYLE}>
              Domicilio
            </label>
            <input
              id="domicilio"
              type="text"
              value={domicilio}
              onChange={(e) => setDomicilio(e.target.value)}
              placeholder="Dirección del contacto"
              readOnly={isReadOnly}
              style={{ ...INPUT_STYLE, opacity: isReadOnly ? 0.6 : 1 }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="comentarios" style={LABEL_STYLE}>
              Comentarios
            </label>
            <textarea
              id="comentarios"
              value={comentarios}
              onChange={(e) => setComentarios(e.target.value)}
              placeholder="Notas sobre la conversación..."
              rows={4}
              readOnly={isReadOnly}
              style={{ ...INPUT_STYLE, resize: "vertical", opacity: isReadOnly ? 0.6 : 1 }}
            />
          </div>
        </div>

        {/* Footer */}
        {!isReadOnly && (
          <div style={{ padding: "14px 20px", borderTop: "1px solid var(--color-border)", display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: "10px",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: FONT,
                color: "var(--color-text-secondary)",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                onSave(contact.id, {
                  local_votacion: localVotacion,
                  domicilio,
                  comentarios,
                  signal_flags: signalFlags,
                  signal_score: rawSignalScore,
                  vote_tier: voteTier,
                })
              }
              style={{
                flex: 2,
                padding: "10px",
                fontSize: 13,
                fontWeight: 700,
                fontFamily: FONT,
                color: "#fff",
                background: saving ? "#93c5fd" : "var(--goberna-blue-900)",
                border: "none",
                borderRadius: 8,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
