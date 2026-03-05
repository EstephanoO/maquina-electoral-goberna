/**
 * GOBERNA — InvitationsPanel
 * Shows existing invitation codes for a campaign and allows creating new ones.
 * Each invitation shows a copyable magic link:
 *   https://dashboard.grupogoberna.com/invite/{code}
 *
 * Only rendered for users who canManage (candidato+).
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, Button, IconLink, IconCopy, IconCheck, IconTrash, IconUserPlus, IconClock } from "../../../../lib/ui";
import { FONT_STACK } from "../../../../lib/constants";
import {
  type Invitation,
  listInvitations,
  createInvitation,
  revokeInvitation,
  buildInviteLink,
} from "../../../../lib/services/invitations";
import { ROLES } from "./role-config";

// ── Types ───────────────────────────────────────────────────────────

type InvitationsPanelProps = {
  campaignId: string;
};

// ── Helpers ─────────────────────────────────────────────────────────

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d < now) return "Vencido";
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

function isExpiredOrExhausted(inv: Invitation): boolean {
  if (new Date(inv.expires_at) < new Date()) return true;
  if (inv.used_count >= inv.max_uses) return true;
  return false;
}

// Roles that can be invited (no admin, no consultor — those have their own flows)
const INVITABLE_ROLES = ["agente_campo", "brigadista_zonal", "agente_digital"] as const;

// ── Component ────────────────────────────────────────────────────────

export function InvitationsPanel({ campaignId }: InvitationsPanelProps) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>("agente_campo");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Data fetching ────────────────────────────────────────────────

  const fetchInvitations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listInvitations(campaignId);
      if (res.ok && res.data) {
        // Sort: active first, then expired
        const sorted = [...res.data.invitations].sort((a, b) => {
          const aExp = isExpiredOrExhausted(a);
          const bExp = isExpiredOrExhausted(b);
          if (aExp !== bExp) return aExp ? 1 : -1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        setInvitations(sorted);
      } else {
        setError(res.error?.message ?? "Error cargando invitaciones");
      }
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  // ── Handlers ─────────────────────────────────────────────────────

  const handleCreate = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await createInvitation({
        campaign_id: campaignId,
        role: selectedRole,
        // omit max_uses and expires_in_hours → backend applies defaults (1 use, 72h)
      });
      if (res.ok && res.data) {
        setInvitations((prev) => [res.data!.invitation, ...prev]);
      } else {
        setError(res.error?.message ?? "Error creando invitación");
      }
    } catch {
      setError("Error de red al crear invitación");
    } finally {
      setCreating(false);
    }
  }, [campaignId, selectedRole]);

  const handleCopy = useCallback(async (inv: Invitation) => {
    const link = buildInviteLink(inv.code);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(inv.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback for non-secure contexts
      const el = document.createElement("textarea");
      el.value = link;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopiedId(inv.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }, []);

  const handleRevoke = useCallback(async (inv: Invitation) => {
    if (!confirm(`¿Revocar esta invitación (${ROLES[inv.role]?.shortLabel ?? inv.role})? El link dejará de funcionar.`)) return;
    setRevokingId(inv.id);
    try {
      const res = await revokeInvitation(inv.id);
      if (res.ok) {
        setInvitations((prev) => prev.filter((i) => i.id !== inv.id));
      } else {
        alert(res.error?.message ?? "Error revocando invitación");
      }
    } catch {
      alert("Error de red");
    } finally {
      setRevokingId(null);
    }
  }, []);

  // ── Render ───────────────────────────────────────────────────────

  return (
    <Card style={{ marginBottom: 0 }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "14px 16px",
        borderBottom: "1px solid var(--color-border)",
        background: "linear-gradient(135deg, #f0f4ff, #e8f0fe)",
        borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
      }}>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "var(--goberna-blue-600)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          <IconLink size={16} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--goberna-blue-900)", fontFamily: FONT_STACK }}>
            Links de Invitación
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", fontFamily: FONT_STACK, marginTop: 1 }}>
            Compartí el link por WhatsApp — el agente se registra directo en la app
          </div>
        </div>
      </div>

      {/* Create section */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 16px",
        borderBottom: "1px solid var(--color-border)",
        flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 200 }}>
          <label
            htmlFor="invite-role-select"
            style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", fontFamily: FONT_STACK, whiteSpace: "nowrap" }}
          >
            Rol:
          </label>
          <select
            id="invite-role-select"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            style={{
              flex: 1,
              padding: "5px 10px",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: FONT_STACK,
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              background: "var(--color-surface)",
              color: "var(--color-text-primary)",
              cursor: "pointer",
              outline: "none",
            }}
          >
            {INVITABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLES[role]?.label ?? role}
              </option>
            ))}
          </select>
        </div>

        <Button
          variant="primary"
          size="sm"
          loading={creating}
          icon={<IconUserPlus size={14} />}
          onClick={handleCreate}
        >
          Generar link
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          margin: "8px 16px",
          padding: "8px 12px",
          background: "#fef2f2",
          border: "1px solid #fecaca",
          borderRadius: 6,
          fontSize: 12,
          color: "var(--color-error)",
          fontFamily: FONT_STACK,
        }}>
          {error}
        </div>
      )}

      {/* Invitations list */}
      <div style={{ padding: "8px 0" }}>
        {loading ? (
          <div style={{ padding: "20px 16px", textAlign: "center", fontSize: 12, color: "var(--color-text-tertiary)", fontFamily: FONT_STACK }}>
            Cargando invitaciones...
          </div>
        ) : invitations.length === 0 ? (
          <div style={{
            padding: "24px 16px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}>
            <IconLink size={32} color="var(--color-border-strong)" />
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", fontFamily: FONT_STACK }}>
              Sin links generados
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", fontFamily: FONT_STACK }}>
              Generá un link y compartilo para que agentes se sumen directo.
            </div>
          </div>
        ) : (
          invitations.map((inv) => {
            const expired = isExpiredOrExhausted(inv);
            const isCopied = copiedId === inv.id;
            const isRevoking = revokingId === inv.id;
            const link = buildInviteLink(inv.code);
            const roleLabel = ROLES[inv.role]?.shortLabel ?? inv.role;
            const roleColor = ROLES[inv.role]?.color ?? "var(--color-text-secondary)";

            return (
              <div
                key={inv.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--color-border)",
                  opacity: expired ? 0.5 : 1,
                  flexWrap: "wrap",
                }}
              >
                {/* Role badge */}
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: FONT_STACK,
                  color: expired ? "var(--color-text-tertiary)" : roleColor,
                  background: expired ? "var(--color-border)" : `${roleColor}18`,
                  border: `1px solid ${expired ? "var(--color-border)" : `${roleColor}40`}`,
                  padding: "2px 8px",
                  borderRadius: 10,
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}>
                  {roleLabel}
                </span>

                {/* Link preview */}
                <span style={{
                  flex: 1,
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: expired ? "var(--color-text-tertiary)" : "var(--color-text-secondary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  minWidth: 0,
                }}>
                  {link}
                </span>

                {/* Uses + expiry */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 10,
                  color: "var(--color-text-tertiary)",
                  fontFamily: FONT_STACK,
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}>
                  <IconClock size={11} />
                  <span>{formatExpiry(inv.expires_at)}</span>
                  <span style={{ marginLeft: 4 }}>· {inv.used_count}/{inv.max_uses} usos</span>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {!expired && (
                    <button
                      type="button"
                      title={isCopied ? "¡Copiado!" : "Copiar link"}
                      onClick={() => handleCopy(inv)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "4px 10px",
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: FONT_STACK,
                        background: isCopied ? "#f0fdf4" : "var(--goberna-blue-50)",
                        color: isCopied ? "var(--color-success)" : "var(--goberna-blue-700)",
                        border: `1px solid ${isCopied ? "var(--color-success)" : "var(--goberna-blue-200)"}`,
                        borderRadius: 6,
                        cursor: "pointer",
                        transition: "all 0.15s",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isCopied ? (
                        <><IconCheck size={12} /> Copiado</>
                      ) : (
                        <><IconCopy size={12} /> Copiar</>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    title="Revocar invitación"
                    disabled={isRevoking}
                    onClick={() => handleRevoke(inv)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "4px 8px",
                      background: "transparent",
                      color: "var(--color-error)",
                      border: "1px solid transparent",
                      borderRadius: 6,
                      cursor: isRevoking ? "not-allowed" : "pointer",
                      opacity: isRevoking ? 0.5 : 1,
                    }}
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
