/**
 * GOBERNA — Tabs Component v2
 * Tab navigation with badges and smooth active indicator.
 */

import type { CSSProperties } from "react";
import { FONT_STACK } from "../constants";

type Tab = {
  id: string;
  label: string;
  badge?: number;
  icon?: React.ReactNode;
};

type TabsProps = {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  size?: "sm" | "md";
};

export function Tabs({ tabs, activeTab, onChange, size = "md" }: TabsProps) {
  const containerStyle: CSSProperties = {
    display: "flex",
    gap: 0,
    borderBottom: "2px solid var(--color-border)",
    marginBottom: size === "sm" ? 16 : 24,
  };

  const getTabStyle = (active: boolean): CSSProperties => ({
    padding: size === "sm" ? "8px 14px" : "10px 20px",
    fontSize: size === "sm" ? 12 : 13,
    fontWeight: active ? 700 : 500,
    fontFamily: FONT_STACK,
    color: active ? "var(--goberna-blue-800)" : "var(--color-text-tertiary)",
    background: "transparent",
    border: "none",
    borderBottom: active ? "2px solid var(--goberna-gold)" : "2px solid transparent",
    marginBottom: -2,
    cursor: "pointer",
    transition: "color var(--duration-fast) ease, border-color var(--duration-fast) ease",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    display: "flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap" as const,
  });

  const badgeStyle = (active: boolean): CSSProperties => ({
    padding: "1px 7px",
    fontSize: 10,
    fontWeight: 700,
    borderRadius: "var(--radius-full)",
    background: active ? "var(--goberna-blue-800)" : "var(--color-text-tertiary)",
    color: "#fff",
    lineHeight: 1.5,
  });

  return (
    <div style={containerStyle} role="tablist">
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            style={getTabStyle(active)}
            onClick={() => onChange(tab.id)}
          >
            {tab.icon && <span style={{ display: "flex", alignItems: "center", opacity: active ? 1 : 0.6 }}>{tab.icon}</span>}
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span style={badgeStyle(active)}>{tab.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
