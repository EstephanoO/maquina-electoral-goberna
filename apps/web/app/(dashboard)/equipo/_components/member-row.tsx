/**
 * GOBERNA — Member Row
 * Clean two-line member card: top = identity + role, bottom = contact actions.
 * Actions hidden behind hover/focus to reduce visual noise.
 */

"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { Avatar, IconPhone, IconWhatsApp, IconKey, IconTrash } from "../../../../lib/ui";
import {
  type Member,
  getRoleConfig,
  openWhatsApp,
} from "./role-config";
import { RoleBadge } from "./role-badge";
import { RoleSelector } from "./role-selector";

type MemberRowProps = {
  member: Member;
  isSelf: boolean;
  canManage: boolean;
  viewerRole: string;
  updatingRole: boolean;
  onRoleChange: (role: string) => void;
  onRemove: () => void;
  onResetPassword: () => void;
  allowedRoles: string[];
};

export function MemberRow({
  member,
  isSelf,
  canManage,
  viewerRole,
  updatingRole,
  onRoleChange,
  onRemove,
  onResetPassword,
  allowedRoles,
}: MemberRowProps) {
  const [hovered, setHovered] = useState(false);
  const config = getRoleConfig(member.role);
  const isProtected =
    member.role === "admin" ||
    isSelf ||
    (member.role === "consultor" && viewerRole !== "admin");

  const showActions = canManage && !isProtected && hovered;

  // Status
  const isActive = member.user_status === "active";
  const statusLabel = isActive ? "Activo" : member.user_status === "pending" ? "Pendiente" : "Inactivo";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 16px",
        borderBottom: "1px solid var(--color-border)",
        background: isSelf
          ? "var(--goberna-blue-50)"
          : hovered
            ? "rgba(0,0,0,0.015)"
            : "transparent",
        opacity: updatingRole ? 0.5 : 1,
        transition: "background 0.12s ease",
      }}
    >
      {/* Left: avatar with status dot */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <Avatar name={member.full_name} size={42} borderColor={config.borderColor} />
        <span
          title={statusLabel}
          style={{
            position: "absolute",
            bottom: 0,
            right: -1,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: isActive ? "var(--color-success)" : "var(--color-border-strong)",
            border: "2px solid var(--color-surface)",
            animation: isActive ? "goberna-pulse 2s infinite" : "none",
          }}
        />
      </div>

      {/* Center: name + phone */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Line 1: name + TÚ badge */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontWeight: 700,
          fontSize: 13,
          color: "var(--color-text-primary)",
          lineHeight: 1.3,
        }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {member.full_name}
          </span>
          {isSelf && (
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              color: "var(--goberna-blue-600)",
              background: "var(--goberna-blue-100)",
              padding: "1px 6px",
              borderRadius: 4,
              flexShrink: 0,
            }}>
              TÚ
            </span>
          )}
        </div>

        {/* Line 2: phone */}
        {member.phone && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 3,
          }}>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              color: "var(--color-text-tertiary)",
            }}>
              <IconPhone size={11} />
              {member.phone}
            </span>
            <button
              type="button"
              onClick={() => openWhatsApp(member.phone!)}
              title="Enviar WhatsApp"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 22,
                height: 22,
                borderRadius: 6,
                background: "#DCFCE7",
                border: "1px solid #BBF7D0",
                cursor: "pointer",
                flexShrink: 0,
                padding: 0,
              }}
            >
              <IconWhatsApp size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Right: role + actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {/* Actions (appear on hover) */}
        {canManage && !isProtected && (
          <div style={{
            display: "flex",
            gap: 4,
            opacity: hovered ? 1 : 0,
            transform: hovered ? "translateX(0)" : "translateX(6px)",
            transition: "opacity 0.15s ease, transform 0.15s ease",
            pointerEvents: hovered ? "auto" : "none",
          }}>
            <ActionButton
              icon={<IconKey size={13} />}
              title="Reiniciar contraseña"
              onClick={onResetPassword}
              variant="neutral"
            />
            <ActionButton
              icon={<IconTrash size={13} />}
              title="Remover del equipo"
              onClick={onRemove}
              variant="danger"
            />
          </div>
        )}

        {/* Role badge or selector */}
        {canManage && !isProtected ? (
          <RoleSelector
            value={member.role}
            onChange={onRoleChange}
            disabled={updatingRole}
            allowedRoles={allowedRoles}
          />
        ) : (
          <RoleBadge role={member.role} size="sm" />
        )}
      </div>
    </div>
  );
}

// ── Icon-only action button ─────────────────────────────────────────

function ActionButton({
  icon,
  title,
  onClick,
  variant,
}: {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  variant: "neutral" | "danger";
}) {
  const colors =
    variant === "danger"
      ? { color: "var(--color-error)", bg: "#FEF2F2", border: "#FECACA" }
      : { color: "var(--goberna-blue-600)", bg: "var(--goberna-blue-50)", border: "var(--goberna-blue-200)" };

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 30,
        height: 30,
        borderRadius: 7,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.color,
        cursor: "pointer",
        padding: 0,
        transition: "all 0.12s ease",
      }}
    >
      {icon}
    </button>
  );
}
