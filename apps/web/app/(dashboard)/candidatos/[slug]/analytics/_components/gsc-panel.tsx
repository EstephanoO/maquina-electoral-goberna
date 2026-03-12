"use client";

/**
 * GscPanel — Panel de Google Search Console
 *
 * Muestra datos de búsqueda orgánica en Google: clics, impresiones, CTR,
 * posición promedio, tendencia diaria, consultas top, páginas, dispositivos y países.
 *
 * Diseño: sin dependencias de terceros para charts — SVG puro inline.
 * Sigue el mismo estilo visual que el resto de analytics (tarjetas blancas, borde suave).
 */

import { useState } from "react";
import type { GSCData, GSCQuery, GSCPage, GSCDevice, GSCCountry } from "./types";

/* ─── Helpers ─── */

function pct(ctr: number) {
  return `${(ctr * 100).toFixed(2)}%`;
}

function fmt(n: number) {
  return n.toLocaleString("es-PE");
}

function shortUrl(url: string) {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "/" : u.pathname.replace(/\/$/, "");
    return path.length > 48 ? `${path.slice(0, 45)}…` : path;
  } catch {
    return url.length > 48 ? `${url.slice(0, 45)}…` : url;
  }
}

/* ─── Sparkline SVG (tendencia diaria de clics e impresiones) ─── */

type SparklineProps = {
  data: { date: string; clicks: number; impressions: number }[];
  primaryColor: string;
};

function Sparkline({ data, primaryColor }: SparklineProps) {
  if (data.length < 2) return null;

  const W = 640;
  const H = 120;
  const PAD = { top: 12, right: 8, bottom: 28, left: 44 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const maxImpr = Math.max(...data.map((d) => d.impressions), 1);
  const maxClicks = Math.max(...data.map((d) => d.clicks), 1);

  const xScale = (i: number) => PAD.left + (i / (data.length - 1)) * innerW;
  const yScaleImpr = (v: number) => PAD.top + innerH - (v / maxImpr) * innerH;
  const yScaleClicks = (v: number) => PAD.top + innerH - (v / maxClicks) * innerH;

  const toPath = (pts: [number, number][]) =>
    pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  const imprPts: [number, number][] = data.map((d, i) => [xScale(i), yScaleImpr(d.impressions)]);
  const clicksPts: [number, number][] = data.map((d, i) => [xScale(i), yScaleClicks(d.clicks)]);

  // X axis labels — show ~6 evenly spaced dates
  const labelStep = Math.max(1, Math.floor(data.length / 6));
  const labels = data
    .map((d, i) => ({ i, label: d.date.slice(5) })) // MM-DD
    .filter((_, i) => i % labelStep === 0 || i === data.length - 1);

  // Y axis gridlines (3 levels)
  const yGridImpr = [0, 0.5, 1].map((t) => ({
    y: PAD.top + innerH * (1 - t),
    label: Math.round(maxImpr * t).toString(),
  }));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-labelledby="gsc-sparkline-title"
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <title id="gsc-sparkline-title">Tendencia diaria de clics e impresiones</title>
      {/* Grid */}
      {yGridImpr.map((g) => (
        <g key={g.y}>
          <line
            x1={PAD.left}
            y1={g.y}
            x2={W - PAD.right}
            y2={g.y}
            stroke="var(--color-border)"
            strokeWidth="0.5"
          />
          <text x={PAD.left - 4} y={g.y + 3.5} textAnchor="end" fontSize="7" fill="var(--color-text-tertiary)">
            {g.label}
          </text>
        </g>
      ))}

      {/* Impressions area fill */}
      <path
        d={`${toPath(imprPts)} L${xScale(data.length - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${PAD.left.toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`}
        fill={`${primaryColor}18`}
      />

      {/* Impressions line */}
      <path d={toPath(imprPts)} fill="none" stroke={`${primaryColor}66`} strokeWidth="1.5" />

      {/* Clicks line */}
      <path d={toPath(clicksPts)} fill="none" stroke={primaryColor} strokeWidth="2" strokeLinecap="round" />

      {/* Clicks dots */}
      {clicksPts.map(([x, y], i) =>
        data[i].clicks > 0 ? (
          <circle key={data[i].date} cx={x} cy={y} r="2.5" fill={primaryColor} />
        ) : null,
      )}

      {/* X axis labels */}
      {labels.map(({ i, label }) => (
        <text key={i} x={xScale(i)} y={H - 4} textAnchor="middle" fontSize="7" fill="var(--color-text-tertiary)">
          {label}
        </text>
      ))}
    </svg>
  );
}

/* ─── Device bar ─── */

function DeviceBars({ devices, primaryColor }: { devices: GSCDevice[]; primaryColor: string }) {
  const total = devices.reduce((s, d) => s + d.clicks, 0) || 1;
  const colors = [primaryColor, `${primaryColor}99`, `${primaryColor}55`];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {devices.map((d, i) => (
        <div key={d.device}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500 }}>{d.device}</span>
            <span style={{ fontSize: 12, color: "var(--color-text-primary)", fontWeight: 700 }}>
              {fmt(d.clicks)} <span style={{ color: "var(--color-text-tertiary)", fontWeight: 400 }}>clics</span>
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 3, backgroundColor: "var(--color-surface-active)", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                borderRadius: 3,
                width: `${((d.clicks / total) * 100).toFixed(1)}%`,
                backgroundColor: colors[i] ?? "#cbd5e1",
                transition: "width 0.4s ease",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 3, fontSize: 10, color: "var(--color-text-tertiary)" }}>
            <span>{fmt(d.impressions)} imp.</span>
            <span>CTR {pct(d.ctr)}</span>
            <span>Pos. {d.position.toFixed(1)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Country flag pill ─── */

const COUNTRY_EMOJIS: Record<string, string> = {
  "Perú": "🇵🇪",
  "Estados Unidos": "🇺🇸",
  "México": "🇲🇽",
  "España": "🇪🇸",
  "Argentina": "🇦🇷",
  "Uruguay": "🇺🇾",
  "Bélgica": "🇧🇪",
  "Colombia": "🇨🇴",
  "Ecuador": "🇪🇨",
  "Chile": "🇨🇱",
  "Venezuela": "🇻🇪",
};

/* ─── Tabs ─── */

type Tab = "consultas" | "paginas" | "dispositivos" | "paises";

const TAB_LABELS: Record<Tab, string> = {
  consultas: "Consultas",
  paginas: "Páginas",
  dispositivos: "Dispositivos",
  paises: "Países",
};

/* ─── Main component ─── */

type Props = {
  data: GSCData;
  primaryColor: string;
};

export function GscPanel({ data, primaryColor }: Props) {
  const [tab, setTab] = useState<Tab>("consultas");
  const [showAllQueries, setShowAllQueries] = useState(false);
  const [showAllPages, setShowAllPages] = useState(false);

  const { totals, daily, queries, pages, devices, countries } = data;

  const visibleQueries: GSCQuery[] = showAllQueries ? queries : queries.slice(0, 10);
  const visiblePages: GSCPage[] = showAllPages ? pages : pages.slice(0, 8);

  return (
    <div style={S.card}>
      {/* ── Header ── */}
      <div style={S.cardHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ ...S.iconWrap, backgroundColor: `${primaryColor}18` }}>
            <SearchIcon color={primaryColor} />
          </div>
          <div>
            <div style={S.cardTitle}>Búsquedas en Google</div>
            <div style={S.cardSub}>Search Console · {data.period}</div>
          </div>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div style={S.kpiRow}>
        <KpiCell
          label="Clics totales"
          value={fmt(totals.clicks)}
          sub="visitas desde Google"
          color={primaryColor}
        />
        <KpiCell
          label="Impresiones"
          value={fmt(totals.impressions)}
          sub="veces que apareció"
          color="var(--color-text-secondary)"
        />
        <KpiCell
          label="CTR promedio"
          value={pct(totals.ctr)}
          sub="ratio de clics"
          color={totals.ctr >= 0.05 ? "#10b981" : totals.ctr >= 0.02 ? "#f59e0b" : "#ef4444"}
        />
        <KpiCell
          label="Posición media"
          value={totals.avgPosition.toFixed(1)}
          sub="en resultados Google"
          color={totals.avgPosition <= 3 ? "#10b981" : totals.avgPosition <= 10 ? "#f59e0b" : "#ef4444"}
        />
      </div>

      {/* ── Sparkline ── */}
      <div style={S.chartWrap}>
        <div style={S.chartLegend}>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--color-text-secondary)" }}>
            <span style={{ width: 20, height: 2, backgroundColor: primaryColor, borderRadius: 1, display: "inline-block" }} />
            Clics
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--color-text-tertiary)" }}>
            <span style={{ width: 20, height: 2, backgroundColor: `${primaryColor}66`, borderRadius: 1, display: "inline-block" }} />
            Impresiones
          </span>
        </div>
        <Sparkline data={daily} primaryColor={primaryColor} />
      </div>

      {/* ── Tabs ── */}
      <div style={S.tabs}>
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              ...S.tabBtn,
              ...(tab === t
                ? { color: primaryColor, borderBottom: `2px solid ${primaryColor}` }
                : {}),
            }}
          >
            {TAB_LABELS[t]}
            {t === "consultas" && (
              <span style={{ ...S.tabBadge, backgroundColor: `${primaryColor}18`, color: primaryColor }}>
                {queries.length}
              </span>
            )}
            {t === "paginas" && (
              <span style={{ ...S.tabBadge, backgroundColor: "var(--color-surface-active)", color: "var(--color-text-secondary)" }}>
                {pages.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div style={S.tabContent}>
        {/* Consultas */}
        {tab === "consultas" && (
          <div>
            <TableHeader cols={["Consulta", "Clics", "Impresiones", "CTR", "Posición"]} />
            {visibleQueries.map((q, i) => (
              <QueryRow key={q.query} rank={i + 1} query={q} primaryColor={primaryColor} />
            ))}
            {queries.length > 10 && (
              <button
                type="button"
                style={S.showMore}
                onClick={() => setShowAllQueries((v) => !v)}
              >
                {showAllQueries ? "Ver menos" : `Ver todas (${queries.length})`}
              </button>
            )}
          </div>
        )}

        {/* Páginas */}
        {tab === "paginas" && (
          <div>
            <TableHeader cols={["URL", "Clics", "Impresiones", "CTR", "Posición"]} />
            {visiblePages.map((p, i) => (
              <PageRow key={p.url} rank={i + 1} page={p} primaryColor={primaryColor} />
            ))}
            {pages.length > 8 && (
              <button
                type="button"
                style={S.showMore}
                onClick={() => setShowAllPages((v) => !v)}
              >
                {showAllPages ? "Ver menos" : `Ver todas (${pages.length})`}
              </button>
            )}
          </div>
        )}

        {/* Dispositivos */}
        {tab === "dispositivos" && (
          <div style={{ padding: "8px 0" }}>
            <DeviceBars devices={devices} primaryColor={primaryColor} />
          </div>
        )}

        {/* Países */}
        {tab === "paises" && (
          <div>
            <TableHeader cols={["País", "Clics", "Impresiones", "CTR", "Posición"]} />
            {countries.map((c, i) => (
              <CountryRow key={c.country} rank={i + 1} country={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function KpiCell({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div style={S.kpiCell}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1, marginBottom: 3 }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{sub}</div>
    </div>
  );
}

function TableHeader({ cols }: { cols: string[] }) {
  return (
    <div style={S.tableHeader}>
      {cols.map((c, i) => (
        <div key={c} style={{ flex: i === 0 ? 3 : 1, textAlign: i === 0 ? "left" : "right" }}>
          {c}
        </div>
      ))}
    </div>
  );
}

function QueryRow({
  rank,
  query,
  primaryColor,
}: {
  rank: number;
  query: GSCQuery;
  primaryColor: string;
}) {
  const isTop = query.clicks >= 5;
  return (
    <div style={{ ...S.tableRow, backgroundColor: isTop ? `${primaryColor}06` : "transparent" }}>
      <div style={{ flex: 3, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ ...S.rank, backgroundColor: rank <= 3 ? `${primaryColor}20` : "var(--color-surface-active)", color: rank <= 3 ? primaryColor : "var(--color-text-tertiary)" }}>
          {rank}
        </span>
        <span style={{ fontSize: 12, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {query.query}
        </span>
        {query.clicks >= 5 && (
          <span style={{ ...S.badge, backgroundColor: `${primaryColor}18`, color: primaryColor }}>top</span>
        )}
      </div>
      <div style={S.metricCell}>{query.clicks > 0 ? fmt(query.clicks) : <span style={{ color: "#cbd5e1" }}>—</span>}</div>
      <div style={S.metricCell}>{fmt(query.impressions)}</div>
      <div style={{ ...S.metricCell, color: query.ctr >= 0.1 ? "#10b981" : query.ctr >= 0.05 ? "#f59e0b" : "var(--color-text-secondary)" }}>
        {query.ctr > 0 ? pct(query.ctr) : <span style={{ color: "#cbd5e1" }}>—</span>}
      </div>
      <div style={{ ...S.metricCell, color: query.position <= 3 ? "#10b981" : query.position <= 10 ? "#f59e0b" : "var(--color-text-secondary)" }}>
        {query.position.toFixed(1)}
      </div>
    </div>
  );
}

function PageRow({
  rank,
  page,
  primaryColor,
}: {
  rank: number;
  page: GSCPage;
  primaryColor: string;
}) {
  return (
    <div style={S.tableRow}>
      <div style={{ flex: 3, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ ...S.rank, backgroundColor: "var(--color-surface-active)", color: "var(--color-text-tertiary)" }}>{rank}</span>
        <a
          href={page.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, color: primaryColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "none" }}
          title={page.url}
        >
          {shortUrl(page.url)}
        </a>
      </div>
      <div style={S.metricCell}>{page.clicks > 0 ? fmt(page.clicks) : <span style={{ color: "#cbd5e1" }}>—</span>}</div>
      <div style={S.metricCell}>{fmt(page.impressions)}</div>
      <div style={{ ...S.metricCell, color: page.ctr >= 0.08 ? "#10b981" : page.ctr >= 0.03 ? "#f59e0b" : "var(--color-text-secondary)" }}>
        {page.ctr > 0 ? pct(page.ctr) : <span style={{ color: "#cbd5e1" }}>—</span>}
      </div>
      <div style={{ ...S.metricCell, color: page.position <= 3 ? "#10b981" : page.position <= 10 ? "#f59e0b" : "var(--color-text-secondary)" }}>
        {page.position.toFixed(1)}
      </div>
    </div>
  );
}

function CountryRow({ rank, country }: { rank: number; country: GSCCountry }) {
  const emoji = COUNTRY_EMOJIS[country.country] ?? "🌍";
  return (
    <div style={S.tableRow}>
      <div style={{ flex: 3, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ ...S.rank, backgroundColor: "var(--color-surface-active)", color: "var(--color-text-tertiary)" }}>{rank}</span>
        <span style={{ fontSize: 14 }}>{emoji}</span>
        <span style={{ fontSize: 12, color: "var(--color-text-primary)" }}>{country.country}</span>
      </div>
      <div style={S.metricCell}>{country.clicks > 0 ? fmt(country.clicks) : <span style={{ color: "#cbd5e1" }}>—</span>}</div>
      <div style={S.metricCell}>{fmt(country.impressions)}</div>
      <div style={{ ...S.metricCell, color: country.ctr >= 0.05 ? "#10b981" : "var(--color-text-secondary)" }}>
        {country.ctr > 0 ? pct(country.ctr) : <span style={{ color: "#cbd5e1" }}>—</span>}
      </div>
      <div style={S.metricCell}>{country.position.toFixed(1)}</div>
    </div>
  );
}

/* ─── Icon ─── */

function SearchIcon({ color = "var(--color-text-secondary)" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

/* ─── Styles ─── */

const S: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: 16,
    overflow: "hidden",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px 12px",
    borderBottom: "1px solid var(--color-surface-active)",
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--color-text-primary)",
    lineHeight: 1.2,
  },
  cardSub: {
    fontSize: 11,
    color: "var(--color-text-tertiary)",
    marginTop: 1,
  },
  kpiRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    borderBottom: "1px solid var(--color-surface-active)",
  },
  kpiCell: {
    padding: "16px 20px",
    borderRight: "1px solid var(--color-surface-active)",
  },
  chartWrap: {
    padding: "12px 16px 8px",
    borderBottom: "1px solid var(--color-surface-active)",
  },
  chartLegend: {
    display: "flex",
    gap: 16,
    marginBottom: 6,
    paddingLeft: 40,
  },
  tabs: {
    display: "flex",
    borderBottom: "1px solid var(--color-surface-active)",
    padding: "0 12px",
    gap: 0,
    backgroundColor: "#fafafa",
  },
  tabBtn: {
    padding: "10px 16px",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--color-text-tertiary)",
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
    transition: "color 0.15s",
  },
  tabBadge: {
    fontSize: 10,
    fontWeight: 700,
    padding: "1px 5px",
    borderRadius: 4,
  },
  tabContent: {
    padding: "8px 16px 16px",
  },
  tableHeader: {
    display: "flex",
    padding: "6px 8px",
    fontSize: 10,
    fontWeight: 700,
    color: "var(--color-text-tertiary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    borderBottom: "1px solid var(--color-surface-active)",
    marginBottom: 2,
  },
  tableRow: {
    display: "flex",
    alignItems: "center",
    padding: "7px 8px",
    borderRadius: 8,
    borderBottom: "1px solid var(--color-surface-hover)",
    transition: "background-color 0.15s",
  },
  metricCell: {
    flex: 1,
    textAlign: "right" as const,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--color-text-primary)",
  },
  rank: {
    minWidth: 20,
    height: 20,
    borderRadius: 5,
    fontSize: 10,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  badge: {
    fontSize: 9,
    fontWeight: 700,
    padding: "1px 5px",
    borderRadius: 3,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  showMore: {
    marginTop: 8,
    padding: "6px 12px",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--color-text-secondary)",
    backgroundColor: "var(--color-surface-hover)",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    cursor: "pointer",
    width: "100%",
  },
};
