"use client";

import { useAuth } from "../../../lib/auth-context";
import { api } from "../../../lib/api-client";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useState, useEffect, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   GOBERNA — Admin: Candidatos & Solicitudes de Acceso
   ═══════════════════════════════════════════════════════════════════════ */

type CampaignRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  cargo: string | null;
  numero: number | null;
  partido: string | null;
  foto_url: string | null;
  user_count?: number;
};

type AccessRequestRow = {
  id: string;
  user_id: string;
  campaign_id: string;
  status: string;
  requested_at: string;
  resolved_at: string | null;
  note: string | null;
  user_email?: string;
  user_full_name?: string;
  campaign_name?: string;
  campaign_cargo?: string;
  campaign_numero?: number;
};

type Tab = "candidatos" | "solicitudes";

const INJECTED_STYLES = `
@keyframes goberna-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes goberna-spin {
  to { transform: rotate(360deg); }
}
`;

function injectStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("goberna-candidatos-styles")) return;
  const el = document.createElement("style");
  el.id = "goberna-candidatos-styles";
  el.textContent = INJECTED_STYLES;
  document.head.appendChild(el);
}

function Spinner({ size = 20, color = "var(--goberna-blue-500)" }: { size?: number; color?: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: `2.5px solid ${color}`,
        borderTopColor: "transparent",
        borderRadius: "50%",
        animation: "goberna-spin .65s linear infinite",
        verticalAlign: "middle",
      }}
    />
  );
}

// ── Status badge ────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; color: string; label: string }> = {
    pending: { bg: "var(--goberna-gold-100)", color: "var(--goberna-gold-600)", label: "Pendiente" },
    approved: { bg: "rgba(22,163,74,.08)", color: "var(--color-success)", label: "Aprobada" },
    rejected: { bg: "rgba(220,38,38,.08)", color: "var(--color-error)", label: "Rechazada" },
    active: { bg: "rgba(22,163,74,.08)", color: "var(--color-success)", label: "Activo" },
    paused: { bg: "var(--goberna-gold-100)", color: "var(--goberna-gold-600)", label: "Pausado" },
    archived: { bg: "rgba(148,163,184,.12)", color: "var(--color-text-tertiary)", label: "Archivado" },
  };

  const c = config[status] ?? config.pending;

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

// ── Resolve dialog (inline) ─────────────────────────────────────────

function ResolvePanel({
  request,
  onDone,
}: {
  request: AccessRequestRow;
  onDone: () => void;
}) {
  const [permTierra, setPermTierra] = useState(true);
  const [permDigital, setPermDigital] = useState(true);
  const [note, setNote] = useState("");
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");

  async function handleResolve(status: "approved" | "rejected") {
    setActing(true);
    setError("");

    try {
      const res = await api.put(`/api/access-requests/${request.id}`, {
        status,
        note: note.trim() || undefined,
        perm_tierra: permTierra,
        perm_digital: permDigital,
      });

      if (!res.ok) {
        setError(res.error?.message ?? "Error resolviendo solicitud.");
        return;
      }

      onDone();
    } catch {
      setError("Error de conexion.");
    } finally {
      setActing(false);
    }
  }

  const toggleStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--color-text-secondary)",
    fontFamily: "inherit",
    background: "none",
    border: "none",
    padding: 0,
  };

  return (
    <div
      style={{
        background: "var(--goberna-blue-50)",
        borderRadius: "var(--radius-md)",
        padding: "16px 20px",
        marginTop: 12,
        animation: "goberna-fade-in .3s ease-out",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 12 }}>
        Resolver solicitud de {request.user_full_name ?? request.user_email}
      </div>

      {/* Permission toggles */}
      <div style={{ display: "flex", gap: 20, marginBottom: 12 }}>
        <button
          type="button"
          style={toggleStyle}
          onClick={() => setPermTierra((v) => !v)}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              border: permTierra ? "none" : "2px solid var(--color-border-strong)",
              background: permTierra ? "var(--goberna-blue-600)" : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all .15s ease",
              flexShrink: 0,
            }}
          >
            {permTierra && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <title>Checked</title>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </span>
          Tierra (campo)
        </button>

        <button
          type="button"
          style={toggleStyle}
          onClick={() => setPermDigital((v) => !v)}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              border: permDigital ? "none" : "2px solid var(--color-border-strong)",
              background: permDigital ? "var(--goberna-blue-600)" : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all .15s ease",
              flexShrink: 0,
            }}
          >
            {permDigital && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <title>Checked</title>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </span>
          Digital (web/redes)
        </button>
      </div>

      {/* Note */}
      <textarea
        placeholder="Nota opcional..."
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{
          width: "100%",
          padding: "8px 12px",
          fontSize: 13,
          fontFamily: "inherit",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          background: "var(--color-surface)",
          resize: "vertical",
          minHeight: 48,
          outline: "none",
          marginBottom: 12,
        }}
      />

      {error && (
        <div style={{ fontSize: 12, color: "var(--color-error)", marginBottom: 8 }}>{error}</div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          disabled={acting}
          onClick={() => handleResolve("approved")}
          style={{
            padding: "8px 20px",
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "inherit",
            color: "#fff",
            background: acting ? "var(--goberna-blue-400)" : "var(--color-success)",
            border: "none",
            borderRadius: "var(--radius-sm)",
            cursor: acting ? "not-allowed" : "pointer",
            transition: "background .15s ease",
          }}
        >
          {acting ? "..." : "Aprobar"}
        </button>

        <button
          type="button"
          disabled={acting}
          onClick={() => handleResolve("rejected")}
          style={{
            padding: "8px 20px",
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "inherit",
            color: "#fff",
            background: acting ? "var(--goberna-blue-400)" : "var(--color-error)",
            border: "none",
            borderRadius: "var(--radius-sm)",
            cursor: acting ? "not-allowed" : "pointer",
            transition: "background .15s ease",
          }}
        >
          {acting ? "..." : "Rechazar"}
        </button>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export default function CandidatosPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("solicitudes");
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [requests, setRequests] = useState<AccessRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null);

  const isAdmin = user?.role === "admin";

  useEffect(injectStyles, []);

  // Non-admin redirect
  useEffect(() => {
    if (user && !isAdmin) {
      router.replace("/");
    }
  }, [user, isAdmin, router]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [campaignsRes, requestsRes] = await Promise.all([
        api.get<{ campaigns: CampaignRow[] }>("/api/campaigns"),
        api.get<{ access_requests: AccessRequestRow[] }>("/api/access-requests?status=pending"),
      ]);

      if (campaignsRes.ok && campaignsRes.data) {
        setCampaigns(campaignsRes.data.campaigns);
      }
      if (requestsRes.ok && requestsRes.data) {
        setRequests(requestsRes.data.access_requests);
      }
    } catch {
      // Silently fail — user sees empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchAll();
    }
  }, [isAdmin, fetchAll]);

  if (!isAdmin) return null;

  const fontStack = "var(--font-montserrat), system-ui, sans-serif";

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: active ? 700 : 500,
    fontFamily: fontStack,
    color: active ? "var(--goberna-blue-900)" : "var(--color-text-tertiary)",
    background: active ? "var(--color-surface)" : "transparent",
    border: "none",
    borderBottom: active ? "2px solid var(--goberna-gold)" : "2px solid transparent",
    cursor: "pointer",
    transition: "all .15s ease",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  });

  const pendingCount = requests.length;

  return (
    <div style={{ fontFamily: fontStack, animation: "goberna-fade-in .4s ease-out" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 800,
            color: "var(--color-text-primary)",
            margin: "0 0 4px",
          }}
        >
          Candidatos & Solicitudes
        </h1>
        <p style={{ fontSize: 14, color: "var(--color-text-tertiary)", margin: 0 }}>
          Gestione candidatos y apruebe solicitudes de acceso de usuarios.
        </p>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "1px solid var(--color-border)",
          marginBottom: 24,
        }}
      >
        <button type="button" style={tabStyle(tab === "solicitudes")} onClick={() => setTab("solicitudes")}>
          Solicitudes
          {pendingCount > 0 && (
            <span
              style={{
                display: "inline-block",
                marginLeft: 8,
                padding: "2px 8px",
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 10,
                background: "var(--color-error)",
                color: "#fff",
              }}
            >
              {pendingCount}
            </span>
          )}
        </button>
        <button type="button" style={tabStyle(tab === "candidatos")} onClick={() => setTab("candidatos")}>
          Candidatos
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ padding: "40px 0", textAlign: "center" }}>
          <Spinner size={28} />
        </div>
      )}

      {/* ── Tab: Solicitudes ────────────────────────────────────── */}
      {!loading && tab === "solicitudes" && (
        <div>
          {requests.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "48px 24px",
                color: "var(--color-text-tertiary)",
              }}
            >
              <svg
                width="48" height="48" viewBox="0 0 24 24" fill="none"
                stroke="var(--color-border-strong)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ marginBottom: 16, opacity: 0.5 }}
              >
                <title>Sin solicitudes</title>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <p style={{ fontSize: 15, fontWeight: 600 }}>No hay solicitudes pendientes</p>
              <p style={{ fontSize: 13 }}>Todas las solicitudes han sido procesadas.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {requests.map((req) => (
                <div
                  key={req.id}
                  style={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    padding: "16px 20px",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {/* User avatar */}
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: "50%",
                          background: "var(--goberna-blue-100)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 14,
                          fontWeight: 700,
                          color: "var(--goberna-blue-600)",
                          flexShrink: 0,
                        }}
                      >
                        {(req.user_full_name ?? req.user_email ?? "?").charAt(0).toUpperCase()}
                      </div>

                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>
                          {req.user_full_name ?? req.user_email}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                          {req.user_email} &middot; {req.campaign_name}
                          {req.campaign_numero ? ` #${req.campaign_numero}` : ""}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <StatusBadge status={req.status} />
                      {req.status === "pending" && (
                        <button
                          type="button"
                          onClick={() => setExpandedRequest(expandedRequest === req.id ? null : req.id)}
                          style={{
                            padding: "6px 14px",
                            fontSize: 12,
                            fontWeight: 600,
                            fontFamily: fontStack,
                            color: "var(--goberna-blue-700)",
                            background: "var(--goberna-blue-50)",
                            border: "1px solid var(--goberna-blue-200)",
                            borderRadius: "var(--radius-sm)",
                            cursor: "pointer",
                            transition: "all .15s ease",
                          }}
                        >
                          {expandedRequest === req.id ? "Cancelar" : "Resolver"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Time */}
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 8 }}>
                    Solicitado: {new Date(req.requested_at).toLocaleString("es-PE")}
                  </div>

                  {/* Resolve panel */}
                  {expandedRequest === req.id && (
                    <ResolvePanel
                      request={req}
                      onDone={() => {
                        setExpandedRequest(null);
                        fetchAll();
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Candidatos ─────────────────────────────────────── */}
      {!loading && tab === "candidatos" && (
        <div>
          {campaigns.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--color-text-tertiary)" }}>
              <p style={{ fontSize: 15, fontWeight: 600 }}>No hay candidatos registrados.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {campaigns.map((c) => (
                <div
                  key={c.id}
                  style={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    padding: "16px 20px",
                    boxShadow: "var(--shadow-sm)",
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                  }}
                >
                  {/* Photo */}
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      overflow: "hidden",
                      border: "2px solid var(--color-border)",
                      flexShrink: 0,
                      background: "var(--goberna-blue-100)",
                    }}
                  >
                    {c.foto_url ? (
                      <Image
                        src={c.foto_url}
                        alt={c.name}
                        width={48}
                        height={48}
                        style={{ objectFit: "cover", display: "block", width: "100%", height: "100%" }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 18,
                          fontWeight: 800,
                          color: "var(--goberna-blue-400)",
                        }}
                      >
                        {c.name.charAt(0)}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-primary)" }}>
                        {c.name}
                      </span>
                      {c.numero && (
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            padding: "1px 8px",
                            borderRadius: 10,
                            background: "var(--goberna-gold-100)",
                            color: "var(--goberna-gold-600)",
                          }}
                        >
                          #{c.numero}
                        </span>
                      )}
                      <StatusBadge status={c.status} />
                    </div>
                    <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 2 }}>
                      {c.cargo ?? ""}{c.cargo && c.partido ? " — " : ""}{c.partido ?? ""}
                      {c.user_count !== undefined && (
                        <span> &middot; {c.user_count} usuario{c.user_count !== 1 ? "s" : ""}</span>
                      )}
                    </div>
                  </div>

                  {/* Slug */}
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: "var(--color-text-tertiary)",
                      fontFamily: "monospace",
                      flexShrink: 0,
                    }}
                  >
                    {c.slug}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
