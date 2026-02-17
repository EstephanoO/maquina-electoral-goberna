/**
 * GOBERNA — Card Component
 * Basic card container with consistent styling.
 */

import type { CSSProperties, ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  padding?: "sm" | "md" | "lg";
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
};

const PADDING_MAP = {
  sm: "12px 16px",
  md: "16px 20px",
  lg: "20px 24px",
};

export function Card({ children, padding = "md", onClick, hoverable }: CardProps) {
  const style: CSSProperties = {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    padding: PADDING_MAP[padding],
    boxShadow: "var(--shadow-sm)",
    cursor: onClick || hoverable ? "pointer" : undefined,
    transition: hoverable ? "box-shadow 0.15s ease, border-color 0.15s ease" : undefined,
  };

  return (
    <div style={style} onClick={onClick}>
      {children}
    </div>
  );
}
