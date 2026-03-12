/**
 * GOBERNA — Role Selector
 * Custom dropdown for selecting user roles with visual previews.
 * Uses portal to escape overflow:hidden table parents.
 */

"use client";

import { useState, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../../../../lib/theme-context";
import { IconChevronDown, IconCheck } from "../../../../lib/ui";
import { ROLES, getRoleConfig } from "./role-config";
import { RoleBadge } from "./role-badge";

type RoleSelectorProps = {
  value: string;
  onChange: (role: string) => void;
  disabled?: boolean;
  allowedRoles: string[];
};

export function RoleSelector({ value, onChange, disabled, allowedRoles }: RoleSelectorProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const config = getRoleConfig(value);

  const availableRoles = Object.values(ROLES).filter((r) => allowedRoles.includes(r.key));

  const handleOpen = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const W = 280;
    const H = 36 + availableRoles.length * 80;
    const M = 6;
    const below = window.innerHeight - rect.bottom - M;
    const above = rect.top - M;
    const up = below < H && above > below;

    const horiz =
      rect.right + 8 > window.innerWidth - W
        ? { right: window.innerWidth - rect.right, left: "auto" as const }
        : { left: Math.max(8, rect.right - W), right: "auto" as const };

    setDropdownStyle(
      up
        ? { position: "fixed", bottom: window.innerHeight - rect.top + M, ...horiz, zIndex: 9999, width: W, maxHeight: Math.min(above - M, H), overflowY: "auto" }
        : { position: "fixed", top: rect.bottom + M, ...horiz, zIndex: 9999, width: W, maxHeight: Math.min(below - M, H), overflowY: "auto" },
    );
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  if (disabled || availableRoles.length <= 1) {
    return <RoleBadge role={value} uniform />;
  }

  const darkNeonMap: Record<string, string> = {
    consultor: "#c4b5fd",
    candidato: "#7dd3fc",
    agente_digital: "#e9d5ff",
  };

  const dropdown = open ? (
    <>
      <button
        type="button"
        aria-label="          Cerrar menú"
        style={{ position: "fixed", inset: 0, zIndex: 9998, background: "transparent", border: "none", cursor: "default" }}
        onClick={() => setOpen(false)}
      />
      <div style={{
        ...dropdownStyle,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
        overflow: "hidden",
        animation: "goberna-fade-in 0.15s ease-out",
        paddingBottom: 8,
      }}>
        <div style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--color-border)",
          fontSize: 10,
          fontWeight: 700,
          color: "var(--color-text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}>
          Seleccionar Rol
        </div>
        {availableRoles.sort((a, b) => b.level - a.level).map((role) => {
          const isSelected = value === role.key;
          return (
            <button
              key={role.key}
              type="button"
              onClick={() => { onChange(role.key); setOpen(false); }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "12px 14px",
                background: isSelected
                  ? (isDark ? "#1a2a40" : "var(--goberna-blue-50)")
                  : "transparent",
                border: "none",
                borderBottom: "1px solid var(--color-border)",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.1s ease",
              }}
            >
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: role.bgColor,
                border: `2px solid ${role.borderColor}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}>
                {role.icon({ size: 18, color: "#fff" })}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: isDark ? "#ffffff" : role.color, marginBottom: 2 }}>
                  {role.label}
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1.3 }}>
                  {role.description}
                  {role.capacity && (
                    <span style={{ display: "block", fontWeight: 600, marginTop: 2 }}>{role.capacity}</span>
                  )}
                </div>
              </div>
              {isSelected && <IconCheck size={14} color="var(--goberna-blue-600)" />}
            </button>
          );
        })}
      </div>
    </>
  ) : null;

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleOpen}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "6px 12px",
          minWidth: 118,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--color-text-primary)",
          transition: "all 0.15s ease",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {config.icon({ size: 14, color: isDark ? (darkNeonMap[value] ?? config.color) : config.color })}
          <span style={{ color: isDark ? "#ffffff" : "inherit" }}>{config.shortLabel}</span>
        </span>
        <IconChevronDown size={14} />
      </button>
      {typeof document !== "undefined" && dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
