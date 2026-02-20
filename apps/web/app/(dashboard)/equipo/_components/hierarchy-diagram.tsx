/**
 * GOBERNA — Hierarchy Diagram
 * Visual representation of the organizational command structure.
 */

import type { CSSProperties } from "react";
import { Card } from "../../../../lib/ui";
import { IconChevronDown } from "../../../../lib/ui";
import { ROLES } from "./role-config";

export function HierarchyDiagram() {
  const sorted = Object.values(ROLES).sort((a, b) => b.level - a.level);

  const headerStyle: CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--color-text-primary)",
    marginBottom: 16,
    display: "flex",
    alignItems: "center",
    gap: 8,
  };

  return (
    <Card padding="lg">
      <div style={headerStyle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--goberna-blue-600)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
        Estructura de Mando

      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sorted.map((role, idx) => (
          <div key={role.key}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: role.color }}>
                  {role.label}
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1.3 }}>
                  {role.description}
                  {role.capacity && (
                    <span style={{ marginLeft: 6, fontWeight: 600, color: "var(--color-text-secondary)" }}>
                      {role.capacity}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {idx < sorted.length - 1 && (
              <div style={{ display: "flex", justifyContent: "center", padding: "2px 0", marginLeft: 18 }}>
                <IconChevronDown size={14} color="var(--color-border-strong)" />
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
