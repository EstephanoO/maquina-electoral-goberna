"use client";

/**
 * SeoReport — Informe mensual de trafico web y presencia digital.
 *
 * Secciones:
 *   1. Resumen Ejecutivo  — KPIs principales con lectura humana
 *   2. Trafico Web        — tendencia y calidad de sesiones
 *   3. Alcance Geografico — top regiones / ciudades con engagement
 *   4. Origen del Trafico — canales desglosados con calidad
 *   5. Paginas mas Vistas — URLs con tiempo y profundidad
 *   6. Posicionamiento    — placeholder Search Console (coming soon)
 *
 * Fuentes de datos: GA4 overview + regions (o cities) + sources + pages
 * No requiere eventos ni pagesDetailed — funciona solo con panoramico + region CSV.
 */

import { useMemo } from "react";
import type { GA4Data, GSCData } from "./types";

type Props = {
  data: GA4Data;
  gscData?: GSCData | null;
  primaryColor: string;
  secondaryColor?: string;
  campaignName: string;
};

/* ═══════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════ */

function fmtTime(s: number): string {
  if (s <= 0) return "0s";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function fmtNum(n: number): string {
  return n.toLocaleString("es-PE");
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function formatDateRange(start: string, end: string): string {
  if (!start || start.length < 8) return "";
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const s = new Date(+start.slice(0, 4), +start.slice(4, 6) - 1, +start.slice(6, 8));
  const e = new Date(+end.slice(0, 4), +end.slice(4, 6) - 1, +end.slice(6, 8));
  return `${s.getDate()} ${months[s.getMonth()]} ${s.getFullYear()} — ${e.getDate()} ${months[e.getMonth()]} ${e.getFullYear()}`;
}

function getSourceLabel(source: string, medium: string): string {
  const s = source.toLowerCase();
  if (s.includes("fb") || s.includes("facebook")) return "Facebook";
  if (s.includes("ig") || s.includes("instagram")) return "Instagram";
  if (s.includes("google")) return medium === "cpc" ? "Google Ads" : "Google Orgánico";
  if (s === "(direct)") return "Tráfico Directo";
  if (s.includes("tiktok")) return "TikTok";
  if (s.includes("youtube")) return "YouTube";
  if (s.includes("twitter") || s.includes("t.co")) return "Twitter/X";
  if (s.includes("whatsapp") || s.includes("wa.me")) return "WhatsApp";
  return source;
}

function getSourceIcon(source: string): string {
  const s = source.toLowerCase();
  if (s.includes("fb") || s.includes("facebook")) return "fb";
  if (s.includes("ig") || s.includes("instagram")) return "ig";
  if (s.includes("google")) return "google";
  if (s === "(direct)") return "direct";
  if (s.includes("tiktok")) return "tiktok";
  if (s.includes("youtube")) return "youtube";
  if (s.includes("whatsapp")) return "wa";
  return "link";
}

function getSourceColor(source: string, medium: string): string {
  const s = source.toLowerCase();
  if (s.includes("fb") || s.includes("facebook")) return "#1877f2";
  if (s.includes("ig") || s.includes("instagram")) return "#e4405f";
  if (s.includes("google")) return medium === "cpc" ? "#fbbc04" : "#34a853";
  if (s === "(direct)") return "#6366f1";
  if (s.includes("tiktok")) return "#010101";
  if (s.includes("youtube")) return "#ff0000";
  if (s.includes("whatsapp")) return "#25d366";
  if (s.includes("twitter")) return "#1da1f2";
  return "#94a3b8";
}

function getMediumBadge(medium: string): { label: string; color: string; bg: string } | null {
  if (medium === "cpc" || medium === "paid") return { label: "Pagado", color: "#92400e", bg: "#fef3c7" };
  if (medium === "organic") return { label: "Orgánico", color: "#065f46", bg: "#d1fae5" };
  if (medium === "referral") return { label: "Referido", color: "#1e40af", bg: "#dbeafe" };
  if (medium === "(none)" || !medium) return { label: "Directo", color: "#4c1d95", bg: "#ede9fe" };
  return null;
}

function normalizeRegionName(r: string): string {
  const MAP: Record<string, string> = {
    "Lima Province": "Lima (Provincia)",
    "Lima Region": "Lima (Región)",
    "Callao Region": "Callao",
    "La Libertad": "La Libertad",
  };
  return MAP[r] ?? r;
}

/* ═══════════════════════════════════════════════════════════════════
   Main component
   ═══════════════════════════════════════════════════════════════════ */

export function SeoReport({ data, gscData, primaryColor, secondaryColor = "#10b981", campaignName }: Props) {
  /* --- Derived data ------------------------------------------ */
  const dateLabel = useMemo(
    () => formatDateRange(data.overview.dateRange.start, data.overview.dateRange.end),
    [data.overview.dateRange],
  );

  // Geography: prefer regions over cities
  const geoData = useMemo(() => {
    const hasRegions = (data.regions?.length ?? 0) > 0;
    if (hasRegions) {
      return data.regions
        .filter((r) => r.activeUsers > 0)
        .slice(0, 8)
        .map((r) => ({
          name: normalizeRegionName(r.region),
          users: r.activeUsers,
          newUsers: r.newUsers,
          avgTime: r.avgEngagementTime,
          engagementRate: r.engagementRate,
          events: r.events,
        }));
    }
    return data.cities
      .filter((c) => c.activeUsers > 0)
      .slice(0, 8)
      .map((c) => ({
        name: c.city,
        users: c.activeUsers,
        newUsers: c.newUsers,
        avgTime: c.avgEngagementTime,
        engagementRate: c.engagementRate,
        events: c.events,
      }));
  }, [data.regions, data.cities]);

  const geoTotal = useMemo(() => geoData.reduce((s, g) => s + g.users, 0), [geoData]);
  const geoMax = useMemo(() => Math.max(...geoData.map((g) => g.users), 1), [geoData]);
  const isRegionBased = (data.regions?.length ?? 0) > 0;

  // Sources
  const topSources = useMemo(
    () => [...data.sources].sort((a, b) => b.users - a.users).slice(0, 6),
    [data.sources],
  );
  const sourcesTotal = useMemo(() => topSources.reduce((s, src) => s + src.users, 0), [topSources]);

  // Pages — prefer pagesDetailed, fallback to pages
  const topPages = useMemo(() => {
    if (data.pagesDetailed.length > 0) {
      return data.pagesDetailed.slice(0, 6).map((p) => ({
        label: p.path === "/" ? "/ (Inicio)" : p.path,
        views: p.views,
        users: p.activeUsers,
        avgTime: p.avgEngagementTime,
        isHome: p.path === "/",
      }));
    }
    return data.pages.slice(0, 6).map((p) => ({
      label: p.title || "(sin título)",
      views: p.views,
      users: p.activeUsers,
      avgTime: undefined as number | undefined,
      isHome: false,
    }));
  }, [data.pagesDetailed, data.pages]);

  const pagesMax = useMemo(() => Math.max(...topPages.map((p) => p.views), 1), [topPages]);

  // Overview engagement quality
  const engagementQuality = useMemo(() => {
    const t = data.overview.avgEngagementTime;
    if (t >= 60) return { label: "Excelente", color: "#10b981", emoji: "🟢" };
    if (t >= 30) return { label: "Bueno", color: "#3b82f6", emoji: "🔵" };
    if (t >= 10) return { label: "Regular", color: "#f59e0b", emoji: "🟡" };
    return { label: "Bajo", color: "#ef4444", emoji: "🔴" };
  }, [data.overview.avgEngagementTime]);

  const newUsersPct = data.overview.activeUsers > 0
    ? (data.overview.newUsers / data.overview.activeUsers) * 100
    : 0;

  return (
    <div style={S.wrapper}>
      {/* ── HEADER DEL INFORME ─────────────────────────────────── */}
      <div style={{ ...S.reportHeader, borderLeftColor: primaryColor }}>
        <div style={S.reportHeaderLeft}>
          <div style={S.reportHeaderIcon}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={primaryColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <div>
            <div style={S.reportTitle}>Informe de Tráfico Web</div>
            <div style={S.reportSubtitle}>{campaignName} · {dateLabel || "Período seleccionado"}</div>
          </div>
        </div>
        <div style={S.reportBadge}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22.4 6.8c-.4-.7-1.1-1.1-1.8-1.1h-3.4c-.7 0-1.4.4-1.8 1.1l-1.7 3c-.4.7-.4 1.5 0 2.2l1.7 3c.4.7 1.1 1.1 1.8 1.1h3.4c.7 0 1.4-.4 1.8-1.1l1.7-3c.4-.7.4-1.5 0-2.2l-1.7-3z" fill="#F9AB00" />
            <path d="M12 4.5c-.7 0-1.4.4-1.8 1.1l-1.7 3c-.4.7-.4 1.5 0 2.2l1.7 3c.4.7 1.1 1.1 1.8 1.1h3.4c.7 0 1.4-.4 1.8-1.1l1.7-3c.4-.7.4-1.5 0-2.2l-1.7-3c-.4-.7-1.1-1.1-1.8-1.1H12z" fill="#E37400" />
            <circle cx="6" cy="18" r="4" fill="#F9AB00" />
          </svg>
          Google Analytics 4
        </div>
      </div>

      {/* ── 1. RESUMEN EJECUTIVO ───────────────────────────────── */}
      <Section title="Resumen Ejecutivo" icon="chart">
        <div style={S.execGrid}>
          <ExecKpi
            label="Visitantes totales"
            value={fmtNum(data.overview.activeUsers)}
            sub={`${fmtNum(data.overview.newUsers)} nuevos (${newUsersPct.toFixed(0)}%)`}
            color={primaryColor}
            icon="users"
          />
          <ExecKpi
            label="Tiempo en sitio"
            value={fmtTime(data.overview.avgEngagementTime)}
            sub={`Calidad: ${engagementQuality.emoji} ${engagementQuality.label}`}
            color={engagementQuality.color}
            icon="clock"
          />
          <ExecKpi
            label="Total de eventos"
            value={fmtNum(data.overview.totalEvents)}
            sub={`${(data.overview.totalEvents / Math.max(data.overview.activeUsers, 1)).toFixed(1)} por visitante`}
            color={secondaryColor}
            icon="activity"
          />
          <ExecKpi
            label="Regiones alcanzadas"
            value={fmtNum(geoData.length)}
            sub={isRegionBased ? "departamentos del Perú" : "ciudades"}
            color="#6366f1"
            icon="map"
          />
        </div>

        {/* Narrative summary */}
        <div style={S.narrative}>
          <p style={S.narrativeText}>
            Durante el período analizado, <strong>{campaignName}</strong> recibió{" "}
            <strong style={{ color: primaryColor }}>{fmtNum(data.overview.activeUsers)} visitantes</strong>{" "}
            en su sitio web, de los cuales el{" "}
            <strong>{newUsersPct.toFixed(0)}%</strong> fueron nuevos usuarios.
            El tiempo promedio de interacción fue de{" "}
            <strong style={{ color: engagementQuality.color }}>{fmtTime(data.overview.avgEngagementTime)}</strong>{" "}
            ({engagementQuality.label.toLowerCase()} engagement).
            {geoData.length > 0 && ` La presencia digital alcanzó ${geoData.length} ${isRegionBased ? "regiones" : "ciudades"}, con mayor concentración en ${geoData[0]?.name ?? ""}.`}
          </p>
        </div>
      </Section>

      {/* ── 2. ALCANCE GEOGRAFICO ─────────────────────────────── */}
      {geoData.length > 0 && (
        <Section title={isRegionBased ? "Alcance por Región" : "Alcance por Ciudad"} icon="map">
          <div style={S.geoTable}>
            {/* Header */}
            <div style={{ ...S.geoRow, ...S.geoRowHeader }}>
              <span style={S.geoColRank}>#</span>
              <span style={S.geoColName}>Región</span>
              <span style={S.geoColBar} />
              <span style={S.geoColUsers}>Visitantes</span>
              <span style={S.geoColShare}>Cuota</span>
              <span style={S.geoColTime}>Tiempo prom.</span>
              <span style={S.geoColEng}>Engagement</span>
            </div>

            {geoData.map((geo, i) => {
              const pct = geoTotal > 0 ? (geo.users / geoTotal) * 100 : 0;
              const barW = (geo.users / geoMax) * 100;
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
              return (
                <div key={geo.name} style={{ ...S.geoRow, ...(i % 2 === 0 ? S.geoRowEven : {}) }}>
                  <span style={{ ...S.geoColRank, fontWeight: medal ? 700 : 400 }}>
                    {medal || (i + 1)}
                  </span>
                  <span style={{ ...S.geoColName, fontWeight: i < 3 ? 600 : 400, color: i < 3 ? "#0f172a" : "#334155" }}>
                    {geo.name}
                  </span>
                  <div style={S.geoColBar}>
                    <div style={S.geoBarTrack}>
                      <div style={{
                        ...S.geoBarFill,
                        width: `${barW}%`,
                        backgroundColor: i < 3 ? primaryColor : `${primaryColor}60`,
                      }} />
                    </div>
                  </div>
                  <span style={{ ...S.geoColUsers, color: i < 3 ? primaryColor : "#475569", fontWeight: i < 3 ? 700 : 500 }}>
                    {fmtNum(geo.users)}
                  </span>
                  <span style={S.geoColShare}>{pct.toFixed(1)}%</span>
                  <span style={S.geoColTime}>
                    {geo.avgTime !== undefined && geo.avgTime > 0 ? fmtTime(geo.avgTime) : "—"}
                  </span>
                  <span style={S.geoColEng}>
                    {geo.engagementRate !== undefined && geo.engagementRate > 0
                      ? fmtPct(geo.engagementRate)
                      : "—"}
                  </span>
                </div>
              );
            })}
          </div>

          {isRegionBased && (
            <div style={S.geoNote}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              Datos por región de Perú (departamento). Lima Province y Lima Region se reportan por separado.
            </div>
          )}
        </Section>
      )}

      {/* ── 3. ORIGEN DEL TRAFICO ─────────────────────────────── */}
      {topSources.length > 0 && (
        <Section title="Origen del Tráfico" icon="share">
          <div style={S.sourcesGrid}>
            {topSources.map((src, i) => {
              const pct = sourcesTotal > 0 ? (src.users / sourcesTotal) * 100 : 0;
              const color = getSourceColor(src.source, src.medium);
              const label = getSourceLabel(src.source, src.medium);
              const mediumBadge = getMediumBadge(src.medium);
              return (
                <div key={`${src.source}-${src.medium}`} style={S.sourceCard}>
                  <div style={S.sourceCardTop}>
                    <div style={{ ...S.sourceIcon, backgroundColor: `${color}18`, borderColor: `${color}30` }}>
                      <SourceIconSvg icon={getSourceIcon(src.source)} color={color} />
                    </div>
                    <div style={S.sourceInfo}>
                      <div style={S.sourceName}>{label}</div>
                      {mediumBadge && (
                        <span style={{ ...S.sourceMediumBadge, color: mediumBadge.color, backgroundColor: mediumBadge.bg }}>
                          {mediumBadge.label}
                        </span>
                      )}
                    </div>
                    <div style={S.sourceRight}>
                      <div style={{ ...S.sourceUsers, color }}>{fmtNum(src.users)}</div>
                      <div style={S.sourcePct}>{pct.toFixed(1)}%</div>
                    </div>
                  </div>
                  {/* Bar */}
                  <div style={S.sourceBarTrack}>
                    <div style={{ ...S.sourceBarFill, width: `${pct}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Channel mix analysis */}
          <div style={S.channelMix}>
            <ChannelMixBar sources={topSources} total={sourcesTotal} primaryColor={primaryColor} />
          </div>
        </Section>
      )}

      {/* ── 4. PAGINAS MAS VISTAS ─────────────────────────────── */}
      {topPages.length > 0 && (
        <Section title="Páginas Más Vistas" icon="file">
          <div style={S.pagesTable}>
            <div style={{ ...S.pageRow, ...S.pageRowHeader }}>
              <span style={S.pageColPage}>Página</span>
              <span style={S.pageColViews}>Vistas</span>
              <span style={S.pageColBar} />
              <span style={S.pageColUsers}>Visitantes</span>
              <span style={S.pageColTime}>Tiempo</span>
            </div>
            {topPages.map((p, i) => {
              const barW = (p.views / pagesMax) * 100;
              return (
                <div key={p.label} style={{ ...S.pageRow, ...(i % 2 === 0 ? S.pageRowEven : {}) }}>
                  <div style={S.pageColPage}>
                    <span style={{ ...S.pageLabel, fontWeight: i === 0 ? 600 : 400 }}>
                      {p.isHome && (
                        <span style={S.pageHomeBadge}>HOME</span>
                      )}
                      {p.label}
                    </span>
                  </div>
                  <span style={{ ...S.pageColViews, color: i < 3 ? primaryColor : "#475569", fontWeight: i < 3 ? 700 : 500 }}>
                    {fmtNum(p.views)}
                  </span>
                  <div style={S.pageColBar}>
                    <div style={S.pageBarTrack}>
                      <div style={{
                        ...S.pageBarFill,
                        width: `${barW}%`,
                        backgroundColor: i < 3 ? primaryColor : `${primaryColor}50`,
                      }} />
                    </div>
                  </div>
                  <span style={S.pageColUsers}>{fmtNum(p.users)}</span>
                  <span style={S.pageColTime}>
                    {p.avgTime !== undefined ? fmtTime(p.avgTime) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── 5. POSICIONAMIENTO EN GOOGLE ─────────────────────── */}
      <Section title="Posicionamiento en Google" icon="search">
        {gscData ? (
          <GscSummary gscData={gscData} primaryColor={primaryColor} />
        ) : (
          <div style={S.gscPlaceholder}>
            <div style={S.gscIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <div style={S.gscTitle}>Search Console no conectado</div>
            <div style={S.gscDesc}>
              Los datos de palabras clave y posicionamiento en Google provienen de{" "}
              <strong>Google Search Console</strong>. Conecta tu propiedad para ver:
            </div>
            <div style={S.gscFeatures}>
              {[
                "Palabras clave con más impresiones y clics",
                "Posición promedio en resultados de Google",
                "CTR (tasa de clics) por keyword",
                "Páginas mejor posicionadas en búsqueda orgánica",
                "Consultas de búsqueda que llevan tráfico",
              ].map((f) => (
                <div key={f} style={S.gscFeatureRow}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <span style={S.gscFeatureText}>{f}</span>
                </div>
              ))}
            </div>
            <div style={S.gscNote}>
              Próximamente disponible — sube el CSV de Search Console cuando esté listo.
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════ */

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={S.section}>
      <div style={S.sectionHeader}>
        <SectionIconSvg icon={icon} />
        <span style={S.sectionTitle}>{title}</span>
      </div>
      <div style={S.sectionBody}>{children}</div>
    </div>
  );
}

function ExecKpi({ label, value, sub, color, icon }: {
  label: string; value: string; sub: string; color: string; icon: string;
}) {
  return (
    <div style={S.execKpi}>
      <div style={{ ...S.execKpiIconBg, backgroundColor: `${color}12` }}>
        <ExecKpiIcon icon={icon} color={color} />
      </div>
      <div style={S.execKpiContent}>
        <div style={S.execKpiLabel}>{label}</div>
        <div style={{ ...S.execKpiValue, color }}>{value}</div>
        <div style={S.execKpiSub}>{sub}</div>
      </div>
    </div>
  );
}

function ChannelMixBar({ sources, total, primaryColor }: {
  sources: { source: string; medium: string; users: number }[];
  total: number;
  primaryColor: string;
}) {
  const segments = sources.slice(0, 6).map((s) => ({
    color: getSourceColor(s.source, s.medium),
    pct: total > 0 ? (s.users / total) * 100 : 0,
    label: getSourceLabel(s.source, s.medium),
  }));

  return (
    <div style={S.mixWrapper}>
      <div style={S.mixLabel}>Mix de canales</div>
      <div style={S.mixBar}>
        {segments.map((seg) => (
          <div
            key={seg.label}
            style={{
              ...S.mixSegment,
              width: `${seg.pct}%`,
              backgroundColor: seg.color,
            }}
            title={`${seg.label}: ${seg.pct.toFixed(1)}%`}
          />
        ))}
      </div>
      <div style={S.mixLegend}>
        {segments.map((seg) => (
          <div key={seg.label} style={S.mixLegendItem}>
            <div style={{ ...S.mixLegendDot, backgroundColor: seg.color }} />
            <span style={S.mixLegendName}>{seg.label}</span>
            <span style={S.mixLegendPct}>{seg.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Icon helpers ──────────────────────────────────────────────── */

function SectionIconSvg({ icon }: { icon: string }) {
  const p = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "#64748b", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (icon) {
    case "chart": return <svg {...p} aria-hidden="true"><path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" /></svg>;
    case "map": return <svg {...p} aria-hidden="true"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg>;
    case "share": return <svg {...p} aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>;
    case "file": return <svg {...p} aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
    case "search": return <svg {...p} aria-hidden="true"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
    default: return null;
  }
}

function ExecKpiIcon({ icon, color }: { icon: string; color: string }) {
  const p = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (icon) {
    case "users": return <svg {...p} aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case "clock": return <svg {...p} aria-hidden="true"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
    case "activity": return <svg {...p} aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>;
    case "map": return <svg {...p} aria-hidden="true"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg>;
    default: return null;
  }
}

function SourceIconSvg({ icon, color }: { icon: string; color: string }) {
  const p = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (icon) {
    case "fb": return <svg {...p} aria-hidden="true"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></svg>;
    case "ig": return <svg {...p} aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>;
    case "google": return <svg {...p} aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>;
    case "direct": return <svg {...p} aria-hidden="true"><circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" /></svg>;
    case "youtube": return <svg {...p} aria-hidden="true"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z" /><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" /></svg>;
    case "wa": return <svg {...p} aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>;
    default: return <svg {...p} aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>;
  }
}

/* ── GscSummary — resumen ejecutivo de Search Console dentro del SeoReport ── */

function GscSummary({ gscData, primaryColor }: { gscData: GSCData; primaryColor: string }) {
  const { totals, queries } = gscData;
  const topQueries = queries.filter((q) => q.clicks > 0).slice(0, 5);
  const posColor = totals.avgPosition <= 3 ? "#10b981" : totals.avgPosition <= 10 ? "#f59e0b" : "#ef4444";
  const ctrColor = totals.ctr >= 0.05 ? "#10b981" : totals.ctr >= 0.02 ? "#f59e0b" : "#ef4444";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Clics totales", value: fmtNum(totals.clicks), sub: gscData.period, color: primaryColor },
          { label: "Impresiones", value: fmtNum(totals.impressions), sub: "apariciones en Google", color: "#64748b" },
          { label: "CTR promedio", value: fmtPct(totals.ctr), sub: "ratio de clics", color: ctrColor },
          { label: "Posición media", value: totals.avgPosition.toFixed(1), sub: "en resultados", color: posColor },
        ].map((k) => (
          <div key={k.label} style={{ padding: "12px 16px", backgroundColor: "#fafbfc", borderRadius: 10, border: "1px solid #f1f5f9" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 3 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Top queries */}
      {topQueries.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>
            Consultas con más clics
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {topQueries.map((q, i) => (
              <div key={q.query} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 8, backgroundColor: i === 0 ? `${primaryColor}08` : "transparent" }}>
                <span style={{ minWidth: 20, fontSize: 11, fontWeight: 700, color: i < 3 ? primaryColor : "#94a3b8", textAlign: "right" as const }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: 12, color: "#1e293b", fontWeight: i === 0 ? 600 : 400 }}>{q.query}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: primaryColor }}>{q.clicks} clics</span>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>pos. {q.position.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GSC badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#94a3b8", paddingTop: 4 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        Google Search Console · {gscData.period} · búsqueda web
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Styles
   ═══════════════════════════════════════════════════════════════════ */

const S: Record<string, React.CSSProperties> = {
  wrapper: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },

  /* Report header */
  reportHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 24px",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    border: "1px solid #e2e8f0",
    borderLeft: "4px solid",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  },
  reportHeaderLeft: { display: "flex", alignItems: "center", gap: 14 },
  reportHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    border: "1px solid #e2e8f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  reportTitle: { fontSize: 16, fontWeight: 700, color: "#0f172a" },
  reportSubtitle: { fontSize: 12, color: "#64748b", marginTop: 2 },
  reportBadge: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 600,
    color: "#92400e",
    padding: "6px 12px",
    backgroundColor: "#fff7ed",
    borderRadius: 8,
    border: "1px solid #fed7aa",
  },

  /* Sections */
  section: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    border: "1px solid #e2e8f0",
    overflow: "hidden",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 20px",
    borderBottom: "1px solid #f1f5f9",
    backgroundColor: "#fafbfc",
  },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: "#0f172a" },
  sectionBody: { padding: 20 },

  /* Executive KPIs */
  execGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 12,
    marginBottom: 16,
  },
  execKpi: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 16px",
    borderRadius: 12,
    border: "1px solid #f1f5f9",
    backgroundColor: "#fafbfc",
  },
  execKpiIconBg: {
    width: 40,
    height: 40,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  execKpiContent: { minWidth: 0 },
  execKpiLabel: { fontSize: 10, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em" },
  execKpiValue: { fontSize: 22, fontWeight: 700, lineHeight: 1.1, marginTop: 2 },
  execKpiSub: { fontSize: 11, color: "#64748b", marginTop: 2 },

  /* Narrative */
  narrative: {
    padding: "14px 16px",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    border: "1px solid #f1f5f9",
  },
  narrativeText: { margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.65 },

  /* Geography table */
  geoTable: { display: "flex", flexDirection: "column", gap: 0, marginBottom: 12 },
  geoRow: {
    display: "grid",
    gridTemplateColumns: "32px 160px 1fr 80px 60px 80px 80px",
    gap: 8,
    alignItems: "center",
    padding: "8px 12px",
    fontSize: 13,
    color: "#475569",
    borderRadius: 6,
  },
  geoRowHeader: {
    fontSize: 10,
    fontWeight: 700,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    backgroundColor: "#f8fafc",
    borderBottom: "1px solid #f1f5f9",
    borderRadius: "6px 6px 0 0",
    marginBottom: 4,
  },
  geoRowEven: { backgroundColor: "#fafbfc" },
  geoColRank: { fontSize: 13, color: "#94a3b8", textAlign: "center" as const },
  geoColName: { fontSize: 13, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  geoColBar: { display: "flex", alignItems: "center" },
  geoBarTrack: { width: "100%", height: 4, backgroundColor: "#f1f5f9", borderRadius: 2, overflow: "hidden" },
  geoBarFill: { height: "100%", borderRadius: 2, transition: "width 0.3s ease" },
  geoColUsers: { textAlign: "right" as const, fontVariantNumeric: "tabular-nums" },
  geoColShare: { textAlign: "right" as const, fontSize: 12, color: "#94a3b8" },
  geoColTime: { textAlign: "right" as const, fontSize: 12, color: "#64748b" },
  geoColEng: { textAlign: "right" as const, fontSize: 12, color: "#64748b" },
  geoNote: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    color: "#94a3b8",
    padding: "8px 0 0",
  },

  /* Sources */
  sourcesGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 12,
    marginBottom: 16,
  },
  sourceCard: {
    padding: 14,
    borderRadius: 12,
    border: "1px solid #f1f5f9",
    backgroundColor: "#fafbfc",
  },
  sourceCardTop: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 },
  sourceIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    border: "1px solid",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sourceInfo: { flex: 1, minWidth: 0 },
  sourceName: { fontSize: 13, fontWeight: 600, color: "#1e293b" },
  sourceMediumBadge: {
    display: "inline-flex",
    marginTop: 2,
    fontSize: 9,
    fontWeight: 700,
    padding: "2px 6px",
    borderRadius: 4,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  sourceRight: { textAlign: "right" as const },
  sourceUsers: { fontSize: 18, fontWeight: 700, lineHeight: 1 },
  sourcePct: { fontSize: 11, color: "#94a3b8", marginTop: 2 },
  sourceBarTrack: { width: "100%", height: 3, backgroundColor: "#f1f5f9", borderRadius: 2, overflow: "hidden" },
  sourceBarFill: { height: "100%", borderRadius: 2, transition: "width 0.4s ease" },

  /* Channel mix bar */
  mixWrapper: { padding: "14px 0 4px" },
  mixLabel: { fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 },
  mixBar: { display: "flex", height: 8, borderRadius: 4, overflow: "hidden", gap: 1 },
  mixSegment: { height: "100%", minWidth: 2, transition: "width 0.4s ease" },
  mixLegend: { display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 10 },
  mixLegendItem: { display: "flex", alignItems: "center", gap: 6 },
  mixLegendDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  mixLegendName: { fontSize: 11, color: "#475569" },
  mixLegendPct: { fontSize: 11, fontWeight: 600, color: "#1e293b" },

  /* Pages table */
  pagesTable: { display: "flex", flexDirection: "column", gap: 0 },
  pageRow: {
    display: "grid",
    gridTemplateColumns: "1fr 70px 100px 80px 70px",
    gap: 8,
    alignItems: "center",
    padding: "8px 12px",
    fontSize: 13,
    color: "#475569",
    borderRadius: 6,
  },
  pageRowHeader: {
    fontSize: 10,
    fontWeight: 700,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    backgroundColor: "#f8fafc",
    borderRadius: "6px 6px 0 0",
    marginBottom: 4,
  },
  pageRowEven: { backgroundColor: "#fafbfc" },
  pageColPage: { minWidth: 0, overflow: "hidden" },
  pageLabel: { fontSize: 12, color: "#334155", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 6 },
  pageHomeBadge: {
    display: "inline-flex",
    fontSize: 9,
    fontWeight: 700,
    padding: "1px 5px",
    borderRadius: 4,
    backgroundColor: "#dbeafe",
    color: "#1e40af",
    textTransform: "uppercase" as const,
    letterSpacing: "0.03em",
    flexShrink: 0,
  },
  pageColViews: { textAlign: "right" as const, fontWeight: 600, fontVariantNumeric: "tabular-nums" },
  pageColBar: { display: "flex", alignItems: "center" },
  pageBarTrack: { width: "100%", height: 4, backgroundColor: "#f1f5f9", borderRadius: 2, overflow: "hidden" },
  pageBarFill: { height: "100%", borderRadius: 2, transition: "width 0.3s ease" },
  pageColUsers: { textAlign: "right" as const, fontSize: 12, color: "#64748b", fontVariantNumeric: "tabular-nums" },
  pageColTime: { textAlign: "right" as const, fontSize: 12, color: "#64748b" },

  /* GSC placeholder */
  gscPlaceholder: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    padding: "8px 0 4px",
    gap: 12,
  },
  gscIcon: {
    width: 64,
    height: 64,
    borderRadius: "50%",
    backgroundColor: "#f1f5f9",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  gscTitle: { fontSize: 16, fontWeight: 700, color: "#1e293b" },
  gscDesc: { fontSize: 13, color: "#64748b", maxWidth: 420, lineHeight: 1.6 },
  gscFeatures: { display: "flex", flexDirection: "column", gap: 8, textAlign: "left" as const, width: "100%", maxWidth: 380 },
  gscFeatureRow: { display: "flex", alignItems: "center", gap: 8 },
  gscFeatureText: { fontSize: 13, color: "#475569" },
  gscNote: {
    fontSize: 12,
    color: "#94a3b8",
    padding: "10px 16px",
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    border: "1px solid #f1f5f9",
    width: "100%",
    maxWidth: 420,
    textAlign: "center" as const,
    boxSizing: "border-box" as const,
  },
};
