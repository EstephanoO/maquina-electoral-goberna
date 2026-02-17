"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/services";

type AgentLocation = {
  agent_id: string;
  ts: string;
  lat: number;
  lng: number;
};

type Props = {
  campaignId: string;
  primaryColor: string;
};

const TWO_MINUTES = 2 * 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;

function getAgentStatus(ts: string, now: number): "connected" | "idle" | "inactive" {
  const lastSeenMs = new Date(ts).getTime();
  const age = now - lastSeenMs;

  if (age < TWO_MINUTES) return "connected";
  if (age < TEN_MINUTES) return "idle";
  return "inactive";
}

export function AgentsStatusPanel({ campaignId, primaryColor }: Props) {
  const [agents, setAgents] = useState<AgentLocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await api.get<{ agents: AgentLocation[] }>("/api/agents/live", {
          campaignId,
        });
        if (res.ok && res.data?.agents) {
          setAgents(res.data.agents);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };

    fetchAgents();
    const interval = setInterval(fetchAgents, 10000);
    return () => clearInterval(interval);
  }, [campaignId]);

  const now = Date.now();
  const connected = agents.filter((a) => getAgentStatus(a.ts, now) === "connected").length;
  const idle = agents.filter((a) => getAgentStatus(a.ts, now) === "idle").length;
  const inactive = agents.filter((a) => getAgentStatus(a.ts, now) === "inactive").length;

  const statuses = [
    { label: "Conectado", count: connected, color: primaryColor },
    { label: "Activo sin movimiento", count: idle, color: "#eab308" },
    { label: "Inactivo", count: inactive, color: "#94a3b8" },
  ];

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
        Agentes de campo
      </h3>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
        {statuses.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: s.color,
              }}
            />
            <span style={{ fontSize: 11, color: "#64748b" }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Status display */}
      {loading ? (
        <div style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: "12px 0" }}>
          Cargando...
        </div>
      ) : agents.length === 0 ? (
        <div style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: "12px 0" }}>
          Sin tracking activo.
        </div>
      ) : (
        <div style={{ display: "flex", gap: 12 }}>
          {statuses.map((s) => (
            <div
              key={s.label}
              style={{
                flex: 1,
                padding: "12px",
                backgroundColor: "#f8fafc",
                borderRadius: 8,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.count}</div>
              <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase" }}>
                {s.label.split(" ")[0]}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
