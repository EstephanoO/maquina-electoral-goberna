"use client";

import type { AgentFormsData } from "@/lib/types";

type Props = {
  data: AgentFormsData[];
  primaryColor: string;
  secondaryColor: string;
};

export function ProgressChart({ data, primaryColor, secondaryColor }: Props) {
  if (data.length === 0) {
    return (
      <div
        style={{
          height: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f8fafc",
          borderRadius: 12,
        }}
      >
        <span style={{ color: "#94a3b8", fontSize: 14 }}>Sin datos para mostrar</span>
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const barWidth = Math.min(60, Math.floor(800 / data.length) - 20);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16,
        backgroundColor: "#f8fafc",
        borderRadius: 12,
      }}
    >
      {/* Chart area */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 16,
          height: 180,
          paddingTop: 20,
        }}
      >
        {data.slice(0, 15).map((agent, index) => {
          const heightPercent = (agent.count / maxCount) * 100;
          return (
            <div
              key={agent.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              }}
            >
              {/* Value label */}
              <span style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>{agent.count}</span>

              {/* Bar */}
              <div
                style={{
                  width: barWidth,
                  height: `${Math.max(heightPercent, 5)}%`,
                  minHeight: 8,
                  background: `linear-gradient(180deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
                  borderRadius: "4px 4px 0 0",
                  transition: "height 0.3s ease",
                }}
              />

              {/* Name label */}
              <span
                style={{
                  fontSize: 10,
                  color: "#64748b",
                  textAlign: "center",
                  maxWidth: barWidth + 10,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={agent.name}
              >
                {agent.name.split(" ")[0]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div style={{ textAlign: "center", fontSize: 12, color: "#64748b" }}>
        {data.length} agentes · {data.reduce((sum, d) => sum + d.count, 0)} registros totales
      </div>
    </div>
  );
}
