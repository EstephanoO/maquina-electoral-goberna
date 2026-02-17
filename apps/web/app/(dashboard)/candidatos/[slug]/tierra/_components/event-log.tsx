"use client";

import type { CampaignEvent } from "@/lib/types";

type Props = {
  events: CampaignEvent[];
  primaryColor: string;
};

function getEventIcon(type: CampaignEvent["type"]): { emoji: string; color: string } {
  switch (type) {
    case "form_submitted":
      return { emoji: "●", color: "#22c55e" };
    case "agent_connected":
      return { emoji: "●", color: "#3b82f6" };
    case "agent_disconnected":
      return { emoji: "●", color: "#94a3b8" };
    default:
      return { emoji: "●", color: "#64748b" };
  }
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

export function EventLog({ events }: Props) {
  return (
    <div style={{ padding: 16, flex: 1, display: "flex", flexDirection: "column" }}>
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
        Log operativo
      </h3>

      {events.length === 0 ? (
        <div style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: "16px 0" }}>
          Sin eventos recientes.
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            maxHeight: 200,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {events.map((event, index) => {
            const icon = getEventIcon(event.type);
            return (
              <div
                key={`${event.timestamp}-${index}`}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "8px 12px",
                  backgroundColor: "#f8fafc",
                  borderRadius: 8,
                }}
              >
                <span style={{ color: icon.color, fontSize: 10, marginTop: 4 }}>{icon.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "#0f172a" }}>{event.message}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                    {formatTime(event.timestamp)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
