"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { getCampaignStats } from "@/lib/services";
import type { CampaignStats } from "@/lib/types";

import { CandidateHeader } from "./_components/candidate-header";
import { MetasDisplay } from "./_components/metas-display";
import { TopAgentsPanel } from "./_components/top-agents-panel";
import { AgentsStatusPanel } from "./_components/agents-status-panel";
import { EventLog } from "./_components/event-log";
import { ProgressChart } from "./_components/progress-chart";
import { TierraMap } from "./_components/tierra-map";

export default function TierraPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<"day" | "week">("day");
  const [activeTab, setActiveTab] = useState<"tracking" | "datos" | "inboxs">("tracking");

  const fetchStats = useCallback(async () => {
    const res = await getCampaignStats(slug, period);
    if (res.ok && res.data) {
      setStats(res.data);
      setError(null);
    } else {
      setError(res.error?.message ?? "Error cargando datos");
    }
    setLoading(false);
  }, [slug, period]);

  useEffect(() => {
    fetchStats();
    // Refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 24, color: "#64748b" }}>Cargando...</div>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 24, color: "#ef4444", marginBottom: 8 }}>Error</div>
          <div style={{ color: "#64748b" }}>{error ?? "Candidato no encontrado"}</div>
        </div>
      </div>
    );
  }

  const { campaign, metas, totals, top_agents, agent_forms_chart, recent_events } = stats;
  const primaryColor = campaign.color_primario;
  const secondaryColor = campaign.color_secundario;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f8fafc" }}>
      {/* Header */}
      <CandidateHeader
        campaign={campaign}
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
      />

      {/* Metas + Tabs */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "16px 24px",
          backgroundColor: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <MetasDisplay
          metaDatos={metas.datos}
          metaVotos={metas.votos}
          currentDatos={totals.forms_count}
          currentVotos={0}
          primaryColor={primaryColor}
        />

        <div style={{ display: "flex", gap: 8 }}>
          {(["tracking", "datos", "inboxs"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                textTransform: "capitalize",
                backgroundColor: activeTab === tab ? primaryColor : "#f1f5f9",
                color: activeTab === tab ? "#ffffff" : "#64748b",
                transition: "all 0.2s",
              }}
            >
              {tab === "inboxs" ? "Ver inboxs" : tab === "datos" ? "Datos" : "Tracking"}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 340px",
          gap: 0,
          minHeight: "calc(100vh - 200px)",
        }}
      >
        {/* Map area */}
        <div style={{ position: "relative", backgroundColor: "#e2e8f0" }}>
          <TierraMap campaignId={campaign.id} primaryColor={primaryColor} />
        </div>

        {/* Right panel */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderLeft: "1px solid #e2e8f0",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <TopAgentsPanel
            agents={top_agents}
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
          />

          <AgentsStatusPanel campaignId={campaign.id} primaryColor={primaryColor} />

          <EventLog events={recent_events} primaryColor={primaryColor} />
        </div>
      </div>

      {/* Bottom chart */}
      <div
        style={{
          padding: 24,
          backgroundColor: "#ffffff",
          borderTop: "1px solid #e2e8f0",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#334155",
            }}
          >
            Progreso por agente de campo
          </h3>

          <div style={{ display: "flex", gap: 4 }}>
            {(["day", "week"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  backgroundColor: period === p ? primaryColor : "#f1f5f9",
                  color: period === p ? "#ffffff" : "#64748b",
                }}
              >
                {p === "day" ? "Día" : "Semana"}
              </button>
            ))}
          </div>
        </div>

        <ProgressChart data={agent_forms_chart} primaryColor={primaryColor} secondaryColor={secondaryColor} />
      </div>
    </div>
  );
}
