"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../lib/auth-context";
import { api } from "../../../lib/services/api";

/* ═══════════════════════════════════════════════════════════════════════
   GOBERNA — Equipo: Miembros de la Campana
   Admin ve todos los miembros de la campana activa y puede cambiar roles.
   Candidato/supervisor ve su equipo y puede gestionar agentes.
   ═══════════════════════════════════════════════════════════════════════ */

// ── Types ───────────────────────────────────────────────────────────

type Member = {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  user_status: string;
};

type PendingRequest = {
  id: string;
  user_id: string;
  campaign_id: string;
  status: string;
  full_name: string;
  email: string;
  created_at: string;
};

// ── Role mapping ────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  supervisor: "Candidato / Jefe",
  agent: "Agente de Campo",
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

function roleBadgeColor(role: string): { bg: string; color: string } {
  switch (role) {
    case "admin":
      return { bg: "var(--goberna-gold)", color: "var(--goberna-blue-950)" };
    case "supervisor":
      return { bg: "var(--goberna-blue-100)", color: "var(--goberna-blue-800)" };
    default:
      return { bg: "var(--color-border)", color: "var(--color-text-secondary)" };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

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

// ── Icons ───────────────────────────────────────────────────────────

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

function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <title>Aprobar</title>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <title>Rechazar</title>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
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
        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--color-text-primary)", lineHeight: 1.1 }}>
          {value}
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-tertiary)", marginTop: 2 }}>
          {label}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export default function EquipoPage() {
  const { user, activeCampaignId } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [resolvingRequest, setResolvingRequest] = useState<string | null>(null);

  const isAdmin = user?.role === "admin";
  const isSupervisor = user?.role === "supervisor";
  const canManage = isAdmin || isSupervisor;

  const fontStack = "var(--font-montserrat), system-ui, sans-serif";

  // ── Fetch members ──
  const fetchData = useCallback(async () => {
    if (!activeCampaignId) return;
    setLoading(true);
    setError(null);

    try {
      const [membersRes, pendingRes] = await Promise.all([
        api.get<{ members: Member[] }>(`/api/campaigns/${activeCampaignId}/members`, {
          campaignId: activeCampaignId,
        }),
        canManage
          ? api.get<{ pending_requests: PendingRequest[] }>("/api/access-requests/pending", {
              campaignId: activeCampaignId,
            })
          : Promise.resolve(null),
      ]);

      if (membersRes.ok && membersRes.data) {
        setMembers(membersRes.data.members);
      } else {
        setError(membersRes.error?.message ?? "Error cargando miembros");
      }

      if (pendingRes && pendingRes.ok && pendingRes.data) {
        // Filter pending requests to only show this campaign's requests
        const filtered = pendingRes.data.pending_requests.filter(
          (r) => r.campaign_id === activeCampaignId,
        );
        setPendingRequests(filtered);
      }
    } catch {
      setError("Error de conexion");
    } finally {
      setLoading(false);
    }
  }, [activeCampaignId, canManage]);

  useEffect(() => {
    injectStyles();
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Change role ──
  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!activeCampaignId) return;
    setUpdatingRole(userId);

    const res = await api.put(
      `/api/campaigns/${activeCampaignId}/members/${userId}/role`,
      { role: newRole },
      { campaignId: activeCampaignId },
    );

    if (res.ok) {
      setMembers((prev) =>
        prev.map((m) => (m.user_id === userId ? { ...m, role: newRole } : m)),
      );
    } else {
      alert(res.error?.message ?? "Error cambiando rol");
    }

    setUpdatingRole(null);
  };

  // ── Resolve access request ──
  const handleResolve = async (requestId: string, status: "approved" | "rejected", role = "agent") => {
    setResolvingRequest(requestId);

    const res = await api.put(`/api/access-requests/${requestId}`, {
      status,
      role,
    });

    if (res.ok) {
      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
      if (status === "approved") {
        // Refresh members list
        fetchData();
      }
    } else {
      alert(res.error?.message ?? "Error resolviendo solicitud");
    }

    setResolvingRequest(null);
  };

  // ── Stats ──
  const supervisors = members.filter((m) => m.role === "supervisor").length;
  const agents = members.filter((m) => m.role === "agent").length;

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

  if (!activeCampaignId) {
    return (
      <div style={{ fontFamily: fontStack, padding: "40px 0", textAlign: "center", color: "var(--color-text-tertiary)" }}>
        Selecciona una campana para ver su equipo.
      </div>
    );
  }

  return (
    <div style={{ fontFamily: fontStack, animation: "goberna-fade-in .4s ease-out" }}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--color-text-primary)", margin: "0 0 4px" }}>
          Equipo
        </h1>
        <p style={{ fontSize: 14, color: "var(--color-text-tertiary)", margin: 0 }}>
          Miembros de la campana. {canManage ? "Podes cambiar los roles de cada miembro." : ""}
        </p>
      </div>

      {/* ── Stats ───────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard label="Total Miembros" value={members.length} icon={<IconUsers />} />
        <StatCard
          label="Candidatos / Jefes"
          value={supervisors}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--goberna-gold-600)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <title>Candidatos</title>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          }
        />
        <StatCard
          label="Agentes de Campo"
          value={agents}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <title>Agentes</title>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        />
        {pendingRequests.length > 0 && (
          <StatCard
            label="Solicitudes Pendientes"
            value={pendingRequests.length}
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <title>Pendientes</title>
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            }
          />
        )}
      </div>

      {/* ── Pending Requests ────────────────────────────────────── */}
      {canManage && pendingRequests.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 12px" }}>
            Solicitudes de Acceso Pendientes
          </h2>
          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              overflow: "hidden",
            }}
          >
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  borderBottom: "1px solid var(--color-border)",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
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
                    {req.full_name?.charAt(0)?.toUpperCase() ?? "?"}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--color-text-primary)" }}>
                      {req.full_name}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                      {req.email} · {formatDate(req.created_at)}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {/* Approve as agente */}
                  <button
                    type="button"
                    disabled={resolvingRequest === req.id}
                    onClick={() => handleResolve(req.id, "approved", "agent")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "6px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: fontStack,
                      color: "#fff",
                      background: "var(--color-success)",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                      opacity: resolvingRequest === req.id ? 0.5 : 1,
                    }}
                    title="Aprobar como agente de campo"
                  >
                    <IconCheck /> Agente
                  </button>

                  {/* Approve as candidato/jefe (admin only) */}
                  {isAdmin && (
                    <button
                      type="button"
                      disabled={resolvingRequest === req.id}
                      onClick={() => handleResolve(req.id, "approved", "supervisor")}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "6px 12px",
                        fontSize: 11,
                        fontWeight: 600,
                        fontFamily: fontStack,
                        color: "var(--goberna-blue-950)",
                        background: "var(--goberna-gold)",
                        border: "none",
                        borderRadius: "var(--radius-sm)",
                        cursor: "pointer",
                        opacity: resolvingRequest === req.id ? 0.5 : 1,
                      }}
                      title="Aprobar como candidato/jefe de campana"
                    >
                      <IconCheck /> Candidato
                    </button>
                  )}

                  {/* Reject */}
                  <button
                    type="button"
                    disabled={resolvingRequest === req.id}
                    onClick={() => handleResolve(req.id, "rejected")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "6px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: fontStack,
                      color: "var(--color-error)",
                      background: "transparent",
                      border: "1px solid var(--color-error)",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                      opacity: resolvingRequest === req.id ? 0.5 : 1,
                    }}
                    title="Rechazar solicitud"
                  >
                    <IconX />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Members Table ───────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--color-text-tertiary)" }}>
          Cargando equipo...
        </div>
      ) : error ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--color-error)" }}>
          {error}
        </div>
      ) : (
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
                  <th style={thStyle}>Rol</th>
                  <th style={thStyle}>Estado</th>
                  {canManage && <th style={{ ...thStyle, textAlign: "center" }}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td
                      style={{ ...tdStyle, textAlign: "center", color: "var(--color-text-tertiary)", padding: "32px 16px" }}
                      colSpan={canManage ? 5 : 4}
                    >
                      No hay miembros en esta campana.
                    </td>
                  </tr>
                ) : (
                  members.map((member, idx) => {
                    const badge = roleBadgeColor(member.role);
                    const isSelf = member.user_id === user?.id;
                    const isDisabled = updatingRole === member.user_id || isSelf || member.role === "admin";

                    return (
                      <tr
                        key={member.user_id}
                        style={{
                          background: idx % 2 === 0 ? "transparent" : "var(--goberna-blue-50)",
                          transition: "background .1s ease",
                        }}
                      >
                        {/* Name */}
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
                              {member.full_name.charAt(0).toUpperCase()}
                            </div>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>
                              {member.full_name}
                              {isSelf && (
                                <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginLeft: 6 }}>(tu)</span>
                              )}
                            </span>
                          </div>
                        </td>

                        {/* Email */}
                        <td style={{ ...tdStyle, fontSize: 12, color: "var(--color-text-secondary)" }}>
                          {member.email}
                        </td>

                        {/* Role badge or selector */}
                        <td style={tdStyle}>
                          {canManage && !isDisabled ? (
                            <select
                              value={member.role}
                              onChange={(e) => handleRoleChange(member.user_id, e.target.value)}
                              disabled={updatingRole === member.user_id}
                              style={{
                                padding: "4px 8px",
                                fontSize: 12,
                                fontWeight: 600,
                                fontFamily: fontStack,
                                borderRadius: "var(--radius-sm)",
                                border: "1px solid var(--color-border)",
                                background: badge.bg,
                                color: badge.color,
                                cursor: "pointer",
                                opacity: updatingRole === member.user_id ? 0.5 : 1,
                              }}
                            >
                              <option value="agent">Agente de Campo</option>
                              <option value="supervisor">Candidato / Jefe</option>
                            </select>
                          ) : (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "3px 10px",
                                fontSize: 11,
                                fontWeight: 700,
                                borderRadius: "var(--radius-sm)",
                                background: badge.bg,
                                color: badge.color,
                                textTransform: "uppercase",
                                letterSpacing: "0.03em",
                              }}
                            >
                              {roleLabel(member.role)}
                            </span>
                          )}
                        </td>

                        {/* User status */}
                        <td style={tdStyle}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              color: member.user_status === "active" ? "var(--color-success)" : "var(--color-text-tertiary)",
                            }}
                          >
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: member.user_status === "active" ? "var(--color-success)" : "var(--color-border-strong)",
                                flexShrink: 0,
                              }}
                            />
                            {member.user_status === "active" ? "Activo" : member.user_status === "pending" ? "Pendiente" : "Suspendido"}
                          </span>
                        </td>

                        {/* Actions */}
                        {canManage && (
                          <td style={{ ...tdStyle, textAlign: "center" }}>
                            {!isSelf && member.role !== "admin" && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`Remover a ${member.full_name} de la campana?`)) {
                                    api.delete(`/api/campaigns/${activeCampaignId}/members/${member.user_id}`).then((res) => {
                                      if (res.ok) {
                                        setMembers((prev) => prev.filter((m) => m.user_id !== member.user_id));
                                      }
                                    });
                                  }
                                }}
                                style={{
                                  padding: "4px 10px",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  fontFamily: fontStack,
                                  color: "var(--color-error)",
                                  background: "transparent",
                                  border: "1px solid var(--color-error)",
                                  borderRadius: "var(--radius-sm)",
                                  cursor: "pointer",
                                }}
                              >
                                Remover
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
