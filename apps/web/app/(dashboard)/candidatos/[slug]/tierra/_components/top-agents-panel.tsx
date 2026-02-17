"use client";

import type { TopAgent } from "@/lib/types";

type Props = {
  agents: TopAgent[];
  primaryColor: string;
  secondaryColor: string;
};

export function TopAgentsPanel({ agents, primaryColor, secondaryColor }: Props) {
  const maxCount = agents.length > 0 ? Math.max(...agents.map((a) => a.forms_count)) : 1;

  return (
    <div style={{ padding: 16, borderBottom: "1px solid #e2e8f0" }}>
      <h3
        style={{
          margin: "0 0 12px 0",
          fontSize: 12,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#334155",
        }}
      >
        Top agentes de campo
      </h3>

      {agents.length === 0 ? (
        <div style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: "16px 0" }}>
          Sin datos de agentes.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {agents.slice(0, 5).map((agent, index) => {
            const percentage = (agent.forms_count / maxCount) * 100;
            return (
              <div key={agent.id}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 13, color: "#0f172a", fontWeight: 500 }}>
                    {index + 1}. {agent.name}
                  </span>
                  <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>{agent.forms_count}</span>
                </div>
                <div
                  style={{
                    height: 6,
                    backgroundColor: "#e2e8f0",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${percentage}%`,
                      background: `linear-gradient(90deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
                      borderRadius: 3,
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
