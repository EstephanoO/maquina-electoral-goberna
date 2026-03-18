"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useTheme } from "@/lib/theme-context";

import { api } from "@/lib/services";

import {
  DigitalHeader,
  KpiCards,
  PagesTable,
  TrafficSources,
  CitiesRanking,
  DailyChart,
  EventsFunnel,
  PagesDetailedTable,
  SourceQuality,
  InsightsPanel,
  RegionsRanking,
  SeoReport,
  GscPanel,
  type GA4Data,
  type GSCData,
} from "./_components";
import { EDWARDS_INFANTE_REGIONS, EDWARDS_INFANTE_GSC } from "./hardcoded-data";
import { FULL_SCREEN, S } from "./analytics-styles";

/** Lazy-load CitiesHeatmap — keeps MapLibre GL out of the analytics chunk */
const CitiesHeatmap = dynamic(
  () => import("./_components/cities-heatmap").then((m) => m.CitiesHeatmap),
  { ssr: false },
);

/** Lazy-load RegionsMap — keeps MapLibre GL out of the analytics chunk */
const RegionsMap = dynamic(
  () => import("./_components/regions-map").then((m) => m.RegionsMap),
  { ssr: false },
);

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
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const slug = params.slug as string;

  const [campaign, setCampaign] = useState<CampaignInfo | null>(null);
  const [ga4Data, setGA4Data] = useState<GA4Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);
  const [clickedCity, setClickedCity] = useState<string | null>(null);
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
  const [clickedRegion, setClickedRegion] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await api.get<AnalyticsResponse>(`/api/analytics/by-slug/${slug}`);

        if (res.ok && res.data) {
          setCampaign(res.data.campaign);
          const analytics = res.data.analytics;
          const regions = analytics.regions?.length
            ? analytics.regions
            : slug === "edwards-infante"
              ? EDWARDS_INFANTE_REGIONS
              : [];
          setGA4Data({
            ...analytics,
            pagesDetailed: analytics.pagesDetailed || [],
            sessionSources: analytics.sessionSources || [],
            events: analytics.events || [],
            regions,
          });
          setError(null);
        } else {
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

  /* ── Loading ─────────────────────────────────────────────────── */
  const fullScreenStyle = isDark
    ? {
      ...FULL_SCREEN,
      backgroundColor: "#090D15",
      "--color-surface": "#090D15",
      "--color-surface-elevated": "#090D15",
      "--color-surface-hover": "#090D15",
      "--color-surface-active": "#1a2738",
      "--color-border": "#1d2f43",
      "--color-border-strong": "#2c425d",
      "--color-text-primary": "#ffffff",
      "--color-text-secondary": "#cbd5e1",
      "--color-text-tertiary": "#94a3b8",
    } as React.CSSProperties
    : FULL_SCREEN;
  const contentStyle = isDark ? { ...S.content, backgroundColor: "#090D15" } : S.content;

  if (loading) {
    return (
      <div style={fullScreenStyle} className="analytics-page-root">
        <div style={S.loadingContainer}>
          <div style={S.spinner} />
          <span style={S.loadingText}>Cargando datos digitales...</span>
          <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
        </div>
      </div>
    );
  }

  /* ── Fatal error ─────────────────────────────────────────────── */
  if (error && !campaign) {
    return (
      <div style={fullScreenStyle} className="analytics-page-root">
        <div style={S.errorContainer}>
          <div style={S.errorTitle}>No se pudo cargar</div>
          <div style={S.errorMessage}>{error ?? "Candidato no encontrado"}</div>
          <button type="button" onClick={() => router.back()} style={S.backButton}>Volver</button>
        </div>
      </div>
    );
  }

  const pc = isDark ? "#ffffff" : (campaign?.color_primario ?? "#1e40af");
  const sc = campaign?.color_secundario ?? "#fbbf24";

  /* ── No GA4 data ─────────────────────────────────────────────── */
  if (!ga4Data) {
    const placeholderCampaign: CampaignInfo = campaign ?? {
      id: "", name: slug, slug, cargo: null, numero: null,
      partido: null, foto_url: null, color_primario: pc, color_secundario: sc,
    };
    return (
      <div style={fullScreenStyle} className="analytics-page-root">
        <NoDataHeader campaign={placeholderCampaign} onBack={() => router.back()} />
        <div style={S.emptyContainer}>
          <div style={S.emptyIcon}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" />
            </svg>
          </div>
          <div style={S.emptyTitle}>Sin datos de Google Analytics</div>
          <div style={S.emptyMessage}>Este candidato aun no tiene datos de GA4 configurados.</div>
          <div style={S.emptyHint}>Sube los reportes CSV de GA4 desde la tarjeta del candidato.</div>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div style={fullScreenStyle} className="analytics-page-root">
        <div style={S.errorContainer}>
          <div style={S.errorTitle}>Error de datos</div>
          <div style={S.errorMessage}>Datos de campana incompletos</div>
          <button type="button" onClick={() => router.back()} style={S.backButton}>Volver</button>
        </div>
      </div>
    );
  }

  const hasEvents = ga4Data.events.length > 0;
  const hasPagesDetailed = ga4Data.pagesDetailed.length > 0;
  const hasDailyUsers = ga4Data.dailyUsers.some((d) => d.newUsers > 0 || d.returningUsers > 0);
  const hasRegions = (ga4Data.regions?.length ?? 0) > 0;

  // ── GSC: datos hardcodeados para edwards-infante (única campaña con datos GSC por ahora) ──
  const gscData: GSCData | null = slug === "edwards-infante" ? EDWARDS_INFANTE_GSC : null;

  /* ═══════════════════════════════════════════════════════════════
     UNIFIED DASHBOARD — Single scrollable view
     ─────────────────────────────────────────────────────────────
     Header + KPIs
     Geografia:  Ranking (42%) | Heatmap (58%)
     Adquisicion: Source Quality | Traffic Sources (donut)
     Tendencia:  Daily Chart (full width) — only if data exists
     Contenido:  Pages Table (full or split with PagesDetailed)
     Eventos:    Events Funnel (full width) — only if events exist
     Insights:   Panel (full width)
     ═══════════════════════════════════════════════════════════ */

  return (
    <div style={fullScreenStyle} className="analytics-page-root">
      <DigitalHeader
        campaign={campaign}
        overview={ga4Data.overview}
        primaryColor={pc}
        secondaryColor={sc}
        hasGsc={!!gscData}
      />

      <div style={contentStyle}>
        {/* ── BLOQUE 1: KPIs ─────────────────────────────────────── */}
        <section style={S.section}>
          <KpiCards overview={ga4Data.overview} primaryColor={pc} secondaryColor={sc} />
        </section>

        {/* ── BLOQUE 2: Geografia ────────────────────────────────── */}
        <SectionLabel label={hasRegions ? "Mapa por Region" : "Mapa Geografico"} />
        <section style={S.heroGrid}>
          <div style={S.heroLeft}>
            {hasRegions ? (
              <RegionsRanking
                regions={ga4Data.regions}
                primaryColor={pc}
                onRegionHover={setHoveredRegion}
                onRegionClick={setClickedRegion}
                clickedRegion={clickedRegion}
              />
            ) : (
              <CitiesRanking
                cities={ga4Data.cities}
                primaryColor={pc}
                onCityHover={setHoveredCity}
                onCityClick={setClickedCity}
                clickedCity={clickedCity}
              />
            )}
          </div>
          <div style={S.heroRight}>
            {hasRegions ? (
              <RegionsMap
                regions={ga4Data.regions}
                primaryColor={pc}
                highlightRegion={hoveredRegion}
                clickedRegion={clickedRegion}
              />
            ) : (
              <CitiesHeatmap
                cities={ga4Data.cities}
                primaryColor={pc}
                highlightCity={hoveredCity}
                clickedCity={clickedCity}
              />
            )}
          </div>
        </section>

        {/* ── BLOQUE 2b: Ciudades (si hay regiones Y ciudades, mostrar ciudades tambien) */}
        {hasRegions && ga4Data.cities.length > 0 && (
          <>
            <SectionLabel label="Detalle por Ciudad" />
            <section style={S.heroGrid}>
              <div style={S.heroLeft}>
                <CitiesRanking
                  cities={ga4Data.cities}
                  primaryColor={pc}
                  onCityHover={setHoveredCity}
                  onCityClick={setClickedCity}
                  clickedCity={clickedCity}
                />
              </div>
              <div style={S.heroRight}>
                <CitiesHeatmap
                  cities={ga4Data.cities}
                  primaryColor={pc}
                  highlightCity={hoveredCity}
                  clickedCity={clickedCity}
                />
              </div>
            </section>
          </>
        )}

        {/* ── BLOQUE 3: Adquisicion ──────────────────────────────── */}
        <SectionLabel label="Adquisicion por Canal" />
        <div style={S.grid}>
          <div style={S.column}>
            <SourceQuality
              sources={ga4Data.sources}
              sessionSources={ga4Data.sessionSources}
              primaryColor={pc}
            />
          </div>
          <div style={S.column}>
            <TrafficSources sources={ga4Data.sources} primaryColor={pc} />
          </div>
        </div>

        {/* ── BLOQUE 4: Tendencia Diaria ─────────────────────────── */}
        {hasDailyUsers && (
          <>
            <SectionLabel label="Tendencia Diaria" />
            <section style={S.section}>
              <DailyChart dailyUsers={ga4Data.dailyUsers} primaryColor={pc} secondaryColor={sc} />
            </section>
          </>
        )}

        {/* ── BLOQUE 5: Contenido ────────────────────────────────── */}
        <SectionLabel label="Performance por Pagina" />
        {hasPagesDetailed ? (
          <div style={S.grid}>
            <div style={S.column}>
              <PagesDetailedTable pages={ga4Data.pagesDetailed} primaryColor={pc} />
            </div>
            <div style={S.column}>
              <PagesTable pages={ga4Data.pages} primaryColor={pc} />
            </div>
          </div>
        ) : (
          <section style={S.section}>
            <PagesTable pages={ga4Data.pages} primaryColor={pc} />
          </section>
        )}

        {/* ── BLOQUE 6: Eventos ──────────────────────────────────── */}
        {hasEvents && (
          <>
            <SectionLabel label="Eventos y Actividad" />
            <section style={S.section}>
              <EventsFunnel events={ga4Data.events} primaryColor={pc} />
            </section>
          </>
        )}

        {/* ── BLOQUE 7: Informe Web (SEO Report) ─────────────────── */}
        <SectionLabel label="Informe de Tráfico Web" />
        <section style={S.section}>
          <SeoReport
            data={ga4Data}
            gscData={gscData}
            primaryColor={pc}
            secondaryColor={sc}
            campaignName={campaign.name}
          />
        </section>

        {/* ── BLOQUE 7b: Búsquedas en Google (GSC) — solo si hay datos ── */}
        {gscData && (
          <>
            <SectionLabel label="Búsquedas en Google" />
            <section style={S.section}>
              <GscPanel data={gscData} primaryColor={pc} />
            </section>
          </>
        )}

        {/* ── BLOQUE 8: Insights ─────────────────────────────────── */}
        <SectionLabel label="Insights Accionables" />
        <section style={S.sectionLast}>
          <InsightsPanel data={ga4Data} gscData={gscData} primaryColor={pc} />
        </section>
      </div>
    </div>
  );
}

/* ========== Section Label ========== */

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={S.sectionLabel}>
      <div style={S.sectionLine} />
      <span style={S.sectionText}>{label}</span>
      <div style={S.sectionLine} />
    </div>
  );
}

/* ========== No Data Header ========== */

type NoDataHeaderProps = { campaign: CampaignInfo; onBack: () => void };

function NoDataHeader({ campaign, onBack }: NoDataHeaderProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <header style={{ ...S.header, ...(isDark ? { backgroundColor: "#090D15", borderBottom: "1px solid #1d2f43" } : null) }}>
      <div style={S.headerLeft}>
        <button type="button" onClick={onBack} style={{ ...S.headerBackBtn, ...(isDark ? { backgroundColor: "#090D15", border: "1px solid #1d2f43", color: "#cbd5e1" } : null) }} aria-label="Volver">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><polyline points="15 18 9 12 15 6" /></svg>
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


