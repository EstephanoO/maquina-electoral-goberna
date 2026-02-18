"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { api } from "@/lib/services";

import {
  DigitalHeader,
  KpiCards,
  PagesTable,
  TrafficSources,
  CitiesChart,
  DailyChart,
  type GA4Data,
} from "./_components";

/* ========== Types ========== */

type CampaignInfo = {
  id: string;
  name: string;
  slug: string;
  cargo: string | null;
  numero: number | null;
  partido: string | null;
  foto_url: string | null;
  color_primario: string;
  color_secundario: string;
};

type AnalyticsResponse = {
  ok: boolean;
  campaign: CampaignInfo;
  analytics: GA4Data;
  error?: { message: string };
};

/* ========== Page ========== */

export default function DigitalPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [campaign, setCampaign] = useState<CampaignInfo | null>(null);
  const [ga4Data, setGA4Data] = useState<GA4Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await api.get<AnalyticsResponse>(`/api/analytics/by-slug/${slug}`);
        
        if (res.ok && res.data) {
          setCampaign(res.data.campaign);
          setGA4Data(res.data.analytics);
          setError(null);
        } else {
          // Si no hay analytics, tratamos de obtener solo la info de la campana
          // para mostrar el empty state con el nombre correcto
          const statsRes = await api.get<{ ok: boolean; campaign: CampaignInfo }>(`/api/campaigns/${slug}/stats`);
          if (statsRes.ok && statsRes.data?.campaign) {
            setCampaign(statsRes.data.campaign);
          }
          setError(res.error?.message ?? "No hay datos de analytics");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error cargando datos");
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, [slug]);

  if (loading) {
    return (
      <div style={FULL_SCREEN}>
        <div style={S.loadingContainer}>
          <div style={S.spinner} />
          <span style={S.loadingText}>Cargando datos digitales...</span>
          <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
        </div>
      </div>
    );
  }

  if (error && !campaign) {
    return (
      <div style={FULL_SCREEN}>
        <div style={S.errorContainer}>
          <div style={S.errorTitle}>No se pudo cargar</div>
          <div style={S.errorMessage}>{error ?? "Candidato no encontrado"}</div>
          <button type="button" onClick={() => router.back()} style={S.backButton}>
            Volver
          </button>
        </div>
      </div>
    );
  }

  const pc = campaign?.color_primario ?? "#1e40af";
  const sc = campaign?.color_secundario ?? "#fbbf24";

  // Si no hay datos de GA4 para este candidato
  if (!ga4Data) {
    // Placeholder campaign info when campaign is null
    const placeholderCampaign: CampaignInfo = campaign ?? {
      id: "",
      name: slug,
      slug,
      cargo: null,
      numero: null,
      partido: null,
      foto_url: null,
      color_primario: pc,
      color_secundario: sc,
    };

    return (
      <div style={FULL_SCREEN}>
        <NoDataHeader campaign={placeholderCampaign} onBack={() => router.back()} />
        <div style={S.emptyContainer}>
          <div style={S.emptyIcon}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20V10" />
              <path d="M18 20V4" />
              <path d="M6 20v-4" />
            </svg>
          </div>
          <div style={S.emptyTitle}>Sin datos de Google Analytics</div>
          <div style={S.emptyMessage}>
            Este candidato aun no tiene datos de GA4 configurados.
          </div>
          <div style={S.emptyHint}>
            Sube el informe panoramico de GA4 para visualizar metricas digitales.
          </div>
        </div>
      </div>
    );
  }

  // At this point, ga4Data is guaranteed to exist
  // Campaign should also exist if we got analytics
  if (!campaign) {
    return (
      <div style={FULL_SCREEN}>
        <div style={S.errorContainer}>
          <div style={S.errorTitle}>Error de datos</div>
          <div style={S.errorMessage}>Datos de campana incompletos</div>
          <button type="button" onClick={() => router.back()} style={S.backButton}>
            Volver
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={FULL_SCREEN}>
      {/* Header */}
      <DigitalHeader
        campaign={campaign}
        overview={ga4Data.overview}
        primaryColor={pc}
        secondaryColor={sc}
      />

      {/* Content */}
      <div style={S.content}>
        {/* KPIs row */}
        <section style={S.section}>
          <KpiCards
            overview={ga4Data.overview}
            primaryColor={pc}
            secondaryColor={sc}
          />
        </section>

        {/* Main grid: 2 columns */}
        <div style={S.grid}>
          {/* Left column: Pages + Daily chart */}
          <div style={S.column}>
            <PagesTable pages={ga4Data.pages} primaryColor={pc} />
            <DailyChart
              dailyUsers={ga4Data.dailyUsers}
              primaryColor={pc}
              secondaryColor={sc}
            />
          </div>

          {/* Right column: Sources + Cities */}
          <div style={S.column}>
            <TrafficSources sources={ga4Data.sources} primaryColor={pc} />
            <CitiesChart cities={ga4Data.cities} primaryColor={pc} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========== No Data Header ========== */

type NoDataHeaderProps = {
  campaign: CampaignInfo;
  onBack: () => void;
};

function NoDataHeader({ campaign, onBack }: NoDataHeaderProps) {
  return (
    <header style={S.header}>
      <div style={S.headerLeft}>
        <button type="button" onClick={onBack} style={S.headerBackBtn} aria-label="Volver">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><title>Volver</title><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div style={S.headerIdentity}>
          <div style={S.headerName}>{campaign.name}</div>
          <div style={S.headerMeta}>
            <span style={{ ...S.headerBadge, backgroundColor: campaign.color_primario }}>Digital</span>
            {campaign.cargo && <span>{campaign.cargo}</span>}
          </div>
        </div>
      </div>
    </header>
  );
}

/* ========== Full screen container ========== */

const FULL_SCREEN: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  backgroundColor: "#f8fafc",
  minHeight: "calc(100vh - 48px)",
  margin: -24,
};

const S: Record<string, React.CSSProperties> = {
  content: {
    flex: 1,
    overflow: "auto",
    padding: 24,
    backgroundColor: "#f8fafc",
  },
  section: {
    marginBottom: 24,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1.1fr 0.9fr",
    gap: 24,
  },
  column: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 24,
  },
  loadingContainer: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    gap: 12,
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid #e2e8f0",
    borderTopColor: "#1d4ed8",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  loadingText: {
    fontSize: 14,
    color: "#64748b",
  },
  errorContainer: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: "#1e293b",
  },
  errorMessage: {
    fontSize: 14,
    color: "#64748b",
  },
  backButton: {
    marginTop: 12,
    padding: "8px 20px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    color: "#334155",
    fontSize: 13,
    cursor: "pointer",
  },
  emptyContainer: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    gap: 12,
    padding: 40,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: "50%",
    backgroundColor: "#f1f5f9",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#1e293b",
  },
  emptyMessage: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center" as const,
  },
  emptyHint: {
    fontSize: 12,
    color: "#94a3b8",
    textAlign: "center" as const,
    maxWidth: 300,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: 56,
    padding: "0 16px",
    backgroundColor: "#ffffff",
    borderBottom: "1px solid #e2e8f0",
    flexShrink: 0,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  headerBackBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    backgroundColor: "#f8fafc",
    color: "#64748b",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  headerIdentity: {},
  headerName: {
    fontSize: 14,
    fontWeight: 700,
    color: "#0f172a",
  },
  headerMeta: {
    display: "flex",
    gap: 8,
    fontSize: 11,
    color: "#64748b",
    alignItems: "center",
  },
  headerBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    color: "#ffffff",
  },
};
