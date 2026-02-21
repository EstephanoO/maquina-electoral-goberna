"use client";

/* ========== DataPanel — Tabbed side panel (Datos / Agentes / Log) ========== */

import { useState } from "react";
import type { FormRecord } from "@/lib/services";
import type { EnrichedAgent, LogEntry } from "./types";
import { AgentsTab } from "./agents-tab";
import { LogTab } from "./log-tab";
import { DatosTab } from "./datos-tab";

/* ========== Types ========== */

export type PanelTab = "datos" | "agentes" | "log";

type Props = {
  forms: FormRecord[];
  selectedAgentName: string | null;
  primaryColor: string;
  open: boolean;
  onClose: () => void;
  onFlyTo?: (lng: number, lat: number) => void;
  campaignId: string;
  isAdmin?: boolean;
  onFormsDeleted?: () => void;
  agents: EnrichedAgent[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  onWhatsApp?: (agent: EnrichedAgent) => void;
  logEntries: LogEntry[];
  onLogEntryClick: (entry: LogEntry) => void;
  onClearLog?: () => void;
  routeAgentId?: string | null;
  onViewRoute?: (agentId: string) => void;
};

/* ========== Constants ========== */

const WIDTH = 420;

const TABS: { key: PanelTab; label: string; icon: string }[] = [
  { key: "datos", label: "Datos", icon: "table" },
  { key: "agentes", label: "Agentes", icon: "users" },
  { key: "log", label: "Log", icon: "activity" },
];

/* ========== Tab Icons ========== */

function TabIcon({ icon, size = 14 }: { icon: string; size?: number }) {
  const props = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (icon) {
    case "table":
      return <svg {...props}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /></svg>;
    case "users":
      return <svg {...props}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case "activity":
      return <svg {...props}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>;
    default:
      return null;
  }
}

/* ========== Component ========== */

export function DataPanel({
  forms, selectedAgentName, primaryColor, open, onClose, onFlyTo,
  campaignId, isAdmin = false, onFormsDeleted,
  agents, selectedAgentId, onSelectAgent, onWhatsApp,
  logEntries, onLogEntryClick, onClearLog,
  routeAgentId, onViewRoute,
}: Props) {
  const [activeTab, setActiveTab] = useState<PanelTab>("datos");

  return (
    <div style={{ width: WIDTH, height: "100%", backgroundColor: "#ffffff", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Tab bar + close button */}
      <div style={S.tabBar}>
        <div style={S.tabs}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            let badge: number | null = null;
            if (tab.key === "datos") badge = forms.length;
            if (tab.key === "agentes") badge = agents.length;
            if (tab.key === "log") badge = logEntries.length;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  ...S.tab,
                  color: isActive ? primaryColor : "#64748b",
                  borderBottomColor: isActive ? primaryColor : "transparent",
                  fontWeight: isActive ? 700 : 500,
                }}
              >
                <TabIcon icon={tab.icon} />
                <span>{tab.label}</span>
                {badge != null && badge > 0 && (
                  <span style={{
                    ...S.tabBadge,
                    backgroundColor: isActive ? `${primaryColor}14` : "#f1f5f9",
                    color: isActive ? primaryColor : "#94a3b8",
                  }}>
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button type="button" onClick={onClose} style={S.closeBtn} aria-label="Cerrar panel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><title>Cerrar</title><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {activeTab === "datos" && (
          <DatosTab forms={forms} selectedAgentName={selectedAgentName} primaryColor={primaryColor} onFlyTo={onFlyTo} campaignId={campaignId} isAdmin={isAdmin} onFormsDeleted={onFormsDeleted} />
        )}
        {activeTab === "agentes" && (
          <AgentsTab agents={agents} selectedAgentId={selectedAgentId} primaryColor={primaryColor} onSelectAgent={onSelectAgent} onWhatsApp={onWhatsApp} routeAgentId={routeAgentId} onViewRoute={onViewRoute} />
        )}
        {activeTab === "log" && (
          <LogTab entries={logEntries} onEntryClick={onLogEntryClick} onClearLog={onClearLog} primaryColor={primaryColor} />
        )}
      </div>
    </div>
  );
}

/* ========== Styles ========== */

const S: Record<string, React.CSSProperties> = {
  tabBar: { display: "flex", alignItems: "center", borderBottom: "1px solid #e2e8f0", flexShrink: 0, backgroundColor: "#ffffff" },
  tabs: { display: "flex", flex: 1, minWidth: 0 },
  tab: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px 8px", fontSize: 12, border: "none", borderBottom: "2px solid transparent", backgroundColor: "transparent", cursor: "pointer", transition: "all 0.15s ease", whiteSpace: "nowrap" as const },
  tabBadge: { fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10, minWidth: 20, textAlign: "center" as const },
  closeBtn: { width: 32, height: 32, borderRadius: 8, border: "1px solid #e2e8f0", backgroundColor: "#f8fafc", color: "#64748b", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, margin: "0 8px", transition: "all 0.15s ease" },
};
