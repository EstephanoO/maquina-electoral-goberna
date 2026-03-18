"use client";

/**
 * SidebarUserPanel — avatar, name, role badge, logout button.
 * Extracted from layout.tsx.
 */

import { memo } from "react";
import { LogoutIcon } from "./icons";
import type { UIRole } from "./nav-config";

type SidebarUserPanelProps = {
  fullName: string | undefined;
  uiRole: UIRole;
  isAdmin: boolean;
  showLabel: boolean;
  onLogout: () => void;
};

export const SidebarUserPanel = memo(function SidebarUserPanel({
  fullName,
  uiRole,
  isAdmin,
  showLabel,
  onLogout,
}: SidebarUserPanelProps) {
  return (
    <div
      className="sidebar-user-panel"
      style={{
        padding: showLabel ? "12px 20px 14px" : "12px 0 14px",
        borderTop: "1px solid var(--sidebar-border)",
        display: "flex",
        alignItems: "center",
        flexDirection: showLabel ? "row" : "column",
        gap: 10,
        justifyContent: showLabel ? "flex-start" : "center",
      }}
    >
      {/* Avatar circle */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background:
            "linear-gradient(135deg, var(--goberna-blue-700), var(--goberna-blue-600))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 700,
          color: "#ffffff",
          flexShrink: 0,
          border: "2px solid rgba(255,255,255,0.1)",
        }}
      >
        {fullName?.charAt(0)?.toUpperCase() ?? "?"}
      </div>

      {showLabel && (
        <div className="sidebar-user-meta" style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "rgba(255,255,255,0.9)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: 1.3,
            }}
          >
            {fullName ?? "Usuario"}
          </div>
          <div
            className="sidebar-user-actions"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 3,
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                padding: "2px 6px",
                borderRadius: "var(--radius-xs)",
                background: isAdmin
                  ? "var(--goberna-gold)"
                  : "rgba(255,255,255,0.1)",
                color: isAdmin
                  ? "var(--goberna-blue-950)"
                  : "rgba(255,255,255,0.55)",
              }}
            >
              {uiRole}
            </span>
            <span className="sidebar-logout-slot">
              <button
                type="button"
                className="sidebar-logout-btn"
                onClick={onLogout}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,0.35)",
                  cursor: "pointer",
                  padding: 2,
                  display: "flex",
                  alignItems: "center",
                  transition: "color var(--duration-fast) ease",
                }}
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
              >
                <LogoutIcon />
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
});
