/**
 * GOBERNA — Spinner Component
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
    border: `2.5px solid ${color}`,
    borderTopColor: "transparent",
    borderRadius: "50%",
    animation: "goberna-spin .65s linear infinite",
    verticalAlign: "middle",
  };

  return <span style={style} aria-label="Cargando" />;
}
