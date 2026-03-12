/**
 * GOBERNA — Role Badge
 * Visual badge for displaying user roles with icon and gradient.
 */

"use client";

import type { CSSProperties } from "react";
import { useTheme } from "../../../../lib/theme-context";
import { getRoleConfig } from "./role-config";

type RoleBadgeProps = {
  role: string;
  size?: "sm" | "md" | "lg";
  uniform?: boolean;
};

const SIZE_MAP: Record<string, { padding: string; fontSize: number; iconSize: number }> = {
  sm: { padding: "2px 8px", fontSize: 10, iconSize: 12 },
  md: { padding: "4px 12px", fontSize: 11, iconSize: 14 },
  lg: { padding: "6px 16px", fontSize: 12, iconSize: 16 },
};

export function RoleBadge({ role, size = "md", uniform = false }: RoleBadgeProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const config = getRoleConfig(role);
  const s = SIZE_MAP[size];

  const darkNeonMap: Record<string, { bg: string; border: string; color: string }> = {
    consultor: { bg: "linear-gradient(135deg, #9f7aea, #7c3aed)", border: "#a78bfa", color: "#f3e8ff" },
    candidato: { bg: "linear-gradient(135deg, #38bdf8, #2563eb)", border: "#60a5fa", color: "#e0f2fe" },
    agente_digital: { bg: "linear-gradient(135deg, #c084fc, #9333ea)", border: "#d8b4fe", color: "#f5d0fe" },
  };
  const neon = isDark ? darkNeonMap[role] : null;

  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: s.padding,
    fontSize: s.fontSize,
    fontWeight: 700,
    borderRadius: 6,
    background: neon?.bg ?? config.bgColor,
    color: neon?.color ?? "#fff",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
    whiteSpace: "nowrap",
    border: `1px solid ${neon?.border ?? config.borderColor}`,
    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
    minWidth: uniform ? 118 : undefined,
  };

  return (
    <span style={style}>
      {config.icon({ size: s.iconSize, color: "#fff" })}
      {config.shortLabel}
    </span>
  );
}
