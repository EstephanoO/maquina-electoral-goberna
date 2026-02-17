/**
 * GOBERNA — SlideOver Component
 * Slide-in panel from the right side.
 */

"use client";

import type { CSSProperties, ReactNode } from "react";
import { FONT_STACK } from "../constants";

type SlideOverProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
};

export function SlideOver({
  open,
  onClose,
  title,
  children,
  footer,
  width = 480,
}: SlideOverProps) {
  if (!open) return null;

  const overlayStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    display: "flex",
    justifyContent: "flex-end",
  };

  const backdropStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    background: "rgba(0,0,0,.45)",
    border: "none",
    cursor: "default",
    padding: 0,
  };

  const panelStyle: CSSProperties = {
    position: "relative",
    width,
    maxWidth: "92vw",
    height: "100%",
    background: "#fff",
    boxShadow: "-8px 0 32px rgba(0,0,0,.18)",
    display: "flex",
    flexDirection: "column",
    animation: "goberna-slide-in .3s ease-out",
  };

  const headerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 24px",
    borderBottom: "1px solid var(--color-border)",
    flexShrink: 0,
  };

  const titleStyle: CSSProperties = {
    fontSize: 18,
    fontWeight: 800,
    color: "var(--color-text-primary)",
    margin: 0,
    fontFamily: FONT_STACK,
  };

  const closeButtonStyle: CSSProperties = {
    width: 32,
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "none",
    border: "none",
    cursor: "pointer",
    borderRadius: "var(--radius-sm)",
    color: "var(--color-text-tertiary)",
  };

  const bodyStyle: CSSProperties = {
    flex: 1,
    overflowY: "auto",
    padding: 24,
  };

  const footerStyle: CSSProperties = {
    padding: "16px 24px",
    borderTop: "1px solid var(--color-border)",
    flexShrink: 0,
  };

  return (
    <div style={overlayStyle}>
      <button
        type="button"
        aria-label="Cerrar panel"
        style={backdropStyle}
        onClick={onClose}
      />
      <div style={panelStyle}>
        <div style={headerStyle}>
          <h2 style={titleStyle}>{title}</h2>
          <button type="button" onClick={onClose} style={closeButtonStyle}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <title>Cerrar</title>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div style={bodyStyle}>{children}</div>
        {footer && <div style={footerStyle}>{footer}</div>}
      </div>
    </div>
  );
}
