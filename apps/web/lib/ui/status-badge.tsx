/**
 * GOBERNA — StatusBadge Component
 * Display status with color-coded badge.
 */

import type { CSSProperties } from "react";
import { STATUS_CONFIG } from "../constants";
import type { StatusType } from "../types";

type StatusBadgeProps = {
  status: StatusType | string;
  size?: "sm" | "md";
};

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status as StatusType] ?? STATUS_CONFIG.pending;

  const style: CSSProperties = {
    display: "inline-block",
    padding: size === "sm" ? "2px 8px" : "3px 10px",
    fontSize: size === "sm" ? 10 : 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    borderRadius: 20,
    background: config.bg,
    color: config.color,
    whiteSpace: "nowrap",
  };

  return <span style={style}>{config.label}</span>;
}
