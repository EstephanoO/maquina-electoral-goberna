/**
 * GOBERNA — Tabs Component
 * Tab navigation with badges.
 */

import type { CSSProperties } from "react";
import { FONT_STACK } from "../constants";

type Tab = {
  id: string;
  label: string;
  badge?: number;
};

type TabsProps = {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
};

export function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  const containerStyle: CSSProperties = {
    display: "flex",
    gap: 4,
    borderBottom: "1px solid var(--color-border)",
    marginBottom: 24,
  };

  const getTabStyle = (active: boolean): CSSProperties => ({
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: active ? 700 : 500,
    fontFamily: FONT_STACK,
    color: active ? "var(--goberna-blue-900)" : "var(--color-text-tertiary)",
    background: active ? "var(--color-surface)" : "transparent",
    border: "none",
    borderBottom: active ? "2px solid var(--goberna-gold)" : "2px solid transparent",
    cursor: "pointer",
    transition: "all .15s ease",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    display: "flex",
    alignItems: "center",
    gap: 8,
  });

  const badgeStyle: CSSProperties = {
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 700,
    borderRadius: 10,
    background: "var(--color-error)",
    color: "#fff",
  };

  return (
    <div style={containerStyle}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          style={getTabStyle(activeTab === tab.id)}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.badge !== undefined && tab.badge > 0 && (
            <span style={badgeStyle}>{tab.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}
