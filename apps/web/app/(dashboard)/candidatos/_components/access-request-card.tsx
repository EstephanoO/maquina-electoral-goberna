/**
 * GOBERNA — AccessRequestCard Component
 * Display a single access request with resolve panel.
 * Supports hierarchical role assignment.
 */

"use client";

import { useState } from "react";
import { Avatar, StatusBadge, Button, Alert } from "../../../../lib/ui";
import { FONT_STACK } from "../../../../lib/constants";
import { formatDateTime } from "../../../../lib/utils";
import { resolveAccessRequest } from "../../../../lib/services";
import type { AccessRequest } from "../../../../lib/types";

// ── Role Configuration ──────────────────────────────────────────────

type RoleOption = {
  key: string;
  backendKey: string;
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  description: string;
};

const ROLE_OPTIONS: RoleOption[] = [
  {
    key: "agent",
    backendKey: "agente_campo",
    label: "Agente de Campo",
    icon: "🚶",
    color: "#475569",
    bgColor: "#f1f5f9",
    description: "Operador territorial, sube formularios",
  },
  {
    key: "capitan",
    backendKey: "brigadista_zonal",
    label: "Capitan de Brigada",
    icon: "🎖️",
    color: "#7c3aed",
    bgColor: "#f3e8ff",
    description: "Lidera 5-10 agentes de campo",
  },
  {
    key: "director",
    backendKey: "brigadista_zonal", // Temporary - uses same backend role
    label: "Director Regional",
    icon: "🗺️",
    color: "#047857",
    bgColor: "#ecfdf5",
    description: "Coordina capitanes en su region",
  },
  {
    key: "candidato",
    backendKey: "supervisor",
    label: "Candidato / Jefe",
    icon: "👔",
    color: "#1e40af",
    bgColor: "#dbeafe",
    description: "Control total de la campana",
  },
];

type AccessRequestCardProps = {
  request: AccessRequest;
  onResolved: () => void;
};

export function AccessRequestCard({ request, onResolved }: AccessRequestCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [permTierra, setPermTierra] = useState(true);
  const [permDigital, setPermDigital] = useState(true);
  const [selectedRole, setSelectedRole] = useState<string>("agent");
  const [note, setNote] = useState("");
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");

  const handleResolve = async (status: "approved" | "rejected") => {
    setActing(true);
    setError("");

    const roleOption = ROLE_OPTIONS.find(r => r.key === selectedRole) ?? ROLE_OPTIONS[0];

    const res = await resolveAccessRequest(request.id, {
      status,
      note: note.trim() || undefined,
      perm_tierra: permTierra,
      perm_digital: permDigital,
      role: roleOption.backendKey as "agente_campo" | "supervisor" | "brigadista_zonal",
    });

    setActing(false);

    if (!res.ok) {
      setError(res.error?.message ?? "Error resolviendo solicitud.");
      return;
    }

    onResolved();
  };

  const displayName = request.user_full_name ?? request.user_email ?? "Usuario";

  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: "16px 20px",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Header Row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar name={displayName} size={36} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>
              {displayName}
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
              {request.user_email} &middot; {request.campaign_name}
              {request.campaign_numero ? ` #${request.campaign_numero}` : ""}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatusBadge status={request.status} />
          {request.status === "pending" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Cancelar" : "Resolver"}
            </Button>
          )}
        </div>
      </div>

      {/* Time */}
      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 8 }}>
        Solicitado: {formatDateTime(request.requested_at)}
      </div>

      {/* Resolve Panel */}
      {expanded && (
        <div
          style={{
            background: "var(--goberna-blue-50)",
            borderRadius: "var(--radius-md)",
            padding: "16px 20px",
            marginTop: 12,
            animation: "goberna-fade-in .3s ease-out",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              marginBottom: 12,
            }}
          >
            Resolver solicitud de {displayName}
          </div>

          {/* Role Selection */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-tertiary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Asignar Rol en Jerarquia
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
              {ROLE_OPTIONS.map((role) => (
                <RoleOptionCard
                  key={role.key}
                  role={role}
                  selected={selectedRole === role.key}
                  onSelect={() => setSelectedRole(role.key)}
                />
              ))}
            </div>
          </div>

          {/* Permission toggles */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-tertiary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Permisos de Modulo
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <PermissionToggle
                label="Agente Territorial"
                description="Campo, mapas y tracking"
                checked={permTierra}
                onChange={setPermTierra}
                icon="🗺️"
              />
              <PermissionToggle
                label="Agente Digital"
                description="Redes sociales y web"
                checked={permDigital}
                onChange={setPermDigital}
                icon="💻"
              />
            </div>
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
              boxSizing: "border-box",
            }}
          />

          {error && <Alert variant="error" message={error} onDismiss={() => setError("")} />}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, marginTop: error ? 12 : 0 }}>
            <Button
              variant="primary"
              size="md"
              loading={acting}
              onClick={() => handleResolve("approved")}
              style={{ background: "var(--color-success)" }}
            >
              Aprobar
            </Button>
            <Button
              variant="danger"
              size="md"
              loading={acting}
              onClick={() => handleResolve("rejected")}
            >
              Rechazar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Role Option Card ────────────────────────────────────────────────

function RoleOptionCard({
  role,
  selected,
  onSelect,
}: {
  role: RoleOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "12px 14px",
        background: selected ? role.bgColor : "var(--color-surface)",
        border: selected ? `2px solid ${role.color}` : "1px solid var(--color-border)",
        borderRadius: 10,
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.15s ease",
        fontFamily: FONT_STACK,
      }}
    >
      <div style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        background: selected ? role.color : role.bgColor,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 18,
        flexShrink: 0,
        transition: "all 0.15s ease",
      }}>
        {role.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12,
          fontWeight: 700,
          color: selected ? role.color : "var(--color-text-primary)",
          marginBottom: 2,
        }}>
          {role.label}
        </div>
        <div style={{
          fontSize: 10,
          color: "var(--color-text-tertiary)",
          lineHeight: 1.3,
        }}>
          {role.description}
        </div>
      </div>
      {selected && (
        <div style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: role.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      )}
    </button>
  );
}

// ── Permission Toggle ──────────────────────────────────────────────

function PermissionToggle({
  label,
  description,
  checked,
  onChange,
  icon,
  highlight,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  icon?: string;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        cursor: "pointer",
        fontFamily: FONT_STACK,
        background: checked 
          ? highlight 
            ? "linear-gradient(135deg, var(--goberna-blue-50), var(--goberna-blue-100))" 
            : "var(--color-surface)"
          : "transparent",
        border: checked 
          ? highlight 
            ? "1px solid var(--goberna-blue-300)" 
            : "1px solid var(--goberna-blue-200)"
          : "1px solid var(--color-border)",
        borderRadius: 8,
        padding: "10px 14px",
        textAlign: "left",
        transition: "all .15s ease",
        flex: highlight ? "1 1 100%" : "1 1 180px",
        minWidth: 180,
      }}
    >
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          border: checked ? "none" : "2px solid var(--color-border-strong)",
          background: checked 
            ? highlight 
              ? "var(--goberna-blue-700)" 
              : "var(--goberna-blue-600)" 
            : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all .15s ease",
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        {checked && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: 6, 
          fontSize: 13, 
          fontWeight: 600, 
          color: checked ? "var(--goberna-blue-700)" : "var(--color-text-primary)",
          marginBottom: description ? 2 : 0,
        }}>
          {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
          {label}
        </div>
        {description && (
          <div style={{ 
            fontSize: 11, 
            color: "var(--color-text-tertiary)", 
            lineHeight: 1.4,
          }}>
            {description}
          </div>
        )}
      </div>
    </button>
  );
}
