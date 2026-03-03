/**
 * GOBERNA — Spinner Component v2
 * Loading indicator with customizable size and color.
 */

import type { CSSProperties } from "react";

type SpinnerProps = {
  size?: number;
  color?: string;
  className?: string;
};

export function Spinner({ size = 20, color = "var(--goberna-blue-500)" }: SpinnerProps) {
  const style: CSSProperties = {
    display: "inline-block",
    width: size,
    height: size,
    border: `${Math.max(2, size * 0.12)}px solid ${color}`,
    borderTopColor: "transparent",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
    verticalAlign: "middle",
    flexShrink: 0,
  };

  return <span style={style} role="status" aria-label="Cargando" />;
}
