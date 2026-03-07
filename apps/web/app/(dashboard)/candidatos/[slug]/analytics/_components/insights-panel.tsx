/**
 * GOBERNA — InsightsPanel Component
 * Auto-generated text insights from the combined GA4 data.
 * Answers the 5 key questions:
 * 1. What channel brings the best quality users?
 * 2. Which cities have the best intent?
 * 3. Which pages generate the most real engagement?
 * 4. Where does the funnel break?
 * 5. Where should we invest more budget?
 */

"use client";

import { useMemo } from "react";
import type { GA4Data, GSCData } from "./types";

type Props = {
  data: GA4Data;
  gscData?: GSCData | null;
  primaryColor: string;
};

type Insight = {
  type: "positive" | "warning" | "negative" | "neutral";
  category: string;
  title: string;
  detail: string;
};

export function InsightsPanel({ data, gscData, primaryColor }: Props) {
  const insights = useMemo(() => generateInsights(data, gscData ?? null), [data, gscData]);

  if (!insights.length) {
    return (
      <div style={S.container}>
        <div style={S.headerRow}>
          <h3 style={S.title}>Insights Accionables</h3>
        </div>
        <div style={S.empty}>
          <span style={S.emptyText}>Sube mas CSVs para generar insights</span>
          <span style={S.emptyHint}>Los insights se generan cruzando datos de multiples fuentes</span>
        </div>
      </div>
    );
  }

  return (
    <div style={S.container}>
      <div style={S.headerRow}>
        <h3 style={S.title}>Insights Accionables</h3>
        <span style={S.badge}>{insights.length} hallazgos</span>
      </div>

      <div style={S.insightsList}>
        {insights.map((insight) => {
          const typeColor = insight.type === "positive" ? "#10b981" :
                            insight.type === "warning" ? "#f59e0b" :
                            insight.type === "negative" ? "#ef4444" : "#64748b";
          return (
            <div key={`${insight.category}-${insight.title}`} style={{ ...S.insightCard, borderLeftColor: typeColor }}>
              <div style={S.insightHeader}>
                <span style={{ ...S.insightDot, backgroundColor: typeColor }} />
                <span style={S.insightCategory}>{insight.category}</span>
              </div>
              <div style={S.insightTitle}>{insight.title}</div>
              <div style={S.insightDetail}>{insight.detail}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Insight Generation Engine ──────────────────────────────────────── */

function generateInsights(data: GA4Data, gscData: GSCData | null): Insight[] {
  const insights: Insight[] = [];

  // ── Source insights ─────────────────────────────────────────────
  if (data.sources.length > 0) {
    const totalUsers = data.sources.reduce((s, src) => s + src.users, 0);

    // Top source dominance
    const topSource = data.sources[0];
    if (topSource) {
      const share = topSource.users / totalUsers;
      if (share > 0.7) {
        insights.push({
          type: "warning",
          category: "Canales",
          title: `${formatSource(topSource.source)} concentra el ${(share * 100).toFixed(0)}% del trafico`,
          detail: "Alta dependencia de un solo canal. Si cambia su algoritmo o costos, el trafico cae drasticamente. Diversifica con Google Ads y contenido organico.",
        });
      }
    }

    // Paid vs Organic
    const paidUsers = data.sources
      .filter((s) => ["paid", "Pagado", "cpc"].includes(s.medium))
      .reduce((sum, s) => sum + s.users, 0);
    const organicUsers = data.sources
      .filter((s) => ["organic", "referral"].includes(s.medium) || s.source === "(direct)")
      .reduce((sum, s) => sum + s.users, 0);

    if (paidUsers > 0 && organicUsers > 0) {
      const paidPct = (paidUsers / totalUsers) * 100;
      if (paidPct > 85) {
        insights.push({
          type: "negative",
          category: "Adquisicion",
          title: `${paidPct.toFixed(0)}% del trafico es pagado`,
          detail: "Casi todo el trafico depende de pauta. Invierte en SEO y contenido para reducir el costo de adquisicion a mediano plazo.",
        });
      } else if (paidPct < 40) {
        insights.push({
          type: "positive",
          category: "Adquisicion",
          title: "Buen balance entre trafico pagado y organico",
          detail: `${paidPct.toFixed(0)}% pagado vs ${(100 - paidPct).toFixed(0)}% organico/directo. Esto reduce la dependencia de presupuesto publicitario.`,
        });
      }
    }
  }

  // ── Event funnel insights ──────────────────────────────────────
  if (data.events.length > 0) {
    const pageViews = data.events.find((e) => e.name === "page_view");
    const scrolls = data.events.find((e) => e.name === "scroll");
    const clicks = data.events.find((e) => e.name === "click");
    const formStart = data.events.find((e) => e.name === "form_start");
    const engagement = data.events.find((e) => e.name === "user_engagement");

    // Scroll rate
    if (pageViews && scrolls) {
      const scrollRate = scrolls.users / pageViews.users;
      if (scrollRate < 0.05) {
        insights.push({
          type: "negative",
          category: "Engagement",
          title: `Solo ${(scrollRate * 100).toFixed(1)}% de usuarios hacen scroll`,
          detail: "La mayoria de visitantes no explora el contenido. Revisa el above-the-fold: el primer pantallazo debe captar atencion con propuesta de valor clara.",
        });
      } else if (scrollRate > 0.3) {
        insights.push({
          type: "positive",
          category: "Engagement",
          title: `${(scrollRate * 100).toFixed(0)}% de usuarios hacen scroll`,
          detail: "Buen nivel de consumo de contenido. Los usuarios estan explorando la pagina.",
        });
      }
    }

    // Form conversion
    if (pageViews && formStart) {
      const formRate = formStart.users / pageViews.users;
      if (formRate < 0.005) {
        insights.push({
          type: "warning",
          category: "Conversion",
          title: `Solo ${formStart.users} usuarios iniciaron formulario de ${pageViews.users.toLocaleString()} visitantes`,
          detail: "Tasa de conversion muy baja. Considera: CTA mas visible, formulario mas corto, o boton de WhatsApp como alternativa.",
        });
      }
    }

    // Engagement rate
    if (pageViews && engagement) {
      const engRate = engagement.users / pageViews.users;
      if (engRate < 0.05) {
        insights.push({
          type: "negative",
          category: "Engagement",
          title: "Engagement muy bajo",
          detail: `Solo ${(engRate * 100).toFixed(1)}% de visitantes generan engagement real. La mayoria rebota sin interactuar.`,
        });
      }
    }

    // Click rate
    if (pageViews && clicks) {
      const clickRate = clicks.users / pageViews.users;
      if (clickRate > 0.01 && clickRate < 0.03) {
        insights.push({
          type: "neutral",
          category: "Interaccion",
          title: `${(clickRate * 100).toFixed(1)}% tasa de click`,
          detail: `${clicks.users} usuarios hicieron click de ${pageViews.users.toLocaleString()} visitantes. Hay espacio para mejorar los CTAs.`,
        });
      }
    }
  }

  // ── Page insights ──────────────────────────────────────────────
  if (data.pagesDetailed.length > 0) {
    const homePage = data.pagesDetailed.find((p) => p.path === "/");
    const blogPages = data.pagesDetailed.filter((p) => p.path.includes("/2026/"));

    // Home dominance
    if (homePage) {
      const totalViews = data.pagesDetailed.reduce((s, p) => s + p.views, 0);
      const homeShare = homePage.views / totalViews;
      if (homeShare > 0.85) {
        insights.push({
          type: "warning",
          category: "Paginas",
          title: `Home concentra ${(homeShare * 100).toFixed(0)}% de las vistas`,
          detail: "Los usuarios no navegan mas alla del home. Mejora la navegacion interna con links destacados al blog o a propuestas.",
        });
      }
    }

    // Blog engagement
    if (blogPages.length > 0) {
      const avgBlogTime = blogPages.reduce((s, p) => s + p.avgEngagementTime, 0) / blogPages.length;
      const homeTime = homePage?.avgEngagementTime || 0;

      if (avgBlogTime > homeTime * 3 && avgBlogTime > 10) {
        insights.push({
          type: "positive",
          category: "Contenido",
          title: `Blog retiene ${formatTime(avgBlogTime)} en promedio`,
          detail: `${blogPages.length} articulos con engagement ${(avgBlogTime / Math.max(homeTime, 1)).toFixed(0)}x mayor al home. El contenido funciona, dirige mas trafico al blog.`,
        });
      }
    }
  }

  // ── Region insights (preferred over cities when available) ────
  const hasRegions = (data.regions?.length ?? 0) > 0;

  if (hasRegions) {
    const enrichedRegions = data.regions.filter((r) => r.avgEngagementTime !== undefined && r.avgEngagementTime > 0);

    if (enrichedRegions.length > 0) {
      const topRegion = data.regions[0];

      // Region with best engagement that is not the #1
      const bestEngagement = enrichedRegions
        .filter((r) => r.activeUsers > 5 && r.region !== topRegion?.region)
        .sort((a, b) => (b.avgEngagementTime || 0) - (a.avgEngagementTime || 0))[0];

      if (bestEngagement && bestEngagement.avgEngagementTime) {
        insights.push({
          type: "positive",
          category: "Geografia",
          title: `${bestEngagement.region} tiene el mejor engagement regional`,
          detail: `${formatTime(bestEngagement.avgEngagementTime)} promedio con ${bestEngagement.activeUsers} usuarios. Buena señal para inversion en pauta regional.`,
        });
      }

      // Top region with low engagement
      if (topRegion && topRegion.avgEngagementTime !== undefined && topRegion.avgEngagementTime < 3) {
        insights.push({
          type: "warning",
          category: "Geografia",
          title: `${topRegion.region} lidera trafico pero con bajo engagement`,
          detail: `${topRegion.activeUsers.toLocaleString()} usuarios pero solo ${formatTime(topRegion.avgEngagementTime || 0)} de interaccion. Revisa si la pauta en esa region esta bien segmentada.`,
        });
      }

      // Geographic concentration risk
      const totalRegionUsers = data.regions.reduce((s, r) => s + r.activeUsers, 0);
      if (topRegion && totalRegionUsers > 0) {
        const topShare = (topRegion.activeUsers / totalRegionUsers) * 100;
        if (topShare > 80) {
          insights.push({
            type: "neutral",
            category: "Geografia",
            title: `${topShare.toFixed(0)}% del trafico concentrado en ${topRegion.region}`,
            detail: `Presencia digital muy centralizada. Para ampliar el alcance, considera pauta en ${data.regions[1]?.region ?? "otras regiones"} y ${data.regions[2]?.region ?? "interior del pais"}.`,
          });
        }
      }
    }
  } else if (data.cities.length > 0) {
    // ── City insights (fallback when no regions) ───────────────
    const enrichedCities = data.cities.filter((c) => c.avgEngagementTime !== undefined && c.avgEngagementTime > 0);

    if (enrichedCities.length > 0) {
      const topCity = data.cities[0];
      const bestEngagement = enrichedCities
        .filter((c) => c.activeUsers > 5 && c.city !== topCity?.city)
        .sort((a, b) => (b.avgEngagementTime || 0) - (a.avgEngagementTime || 0))[0];

      if (bestEngagement && bestEngagement.avgEngagementTime) {
        insights.push({
          type: "positive",
          category: "Geografia",
          title: `${bestEngagement.city} tiene el mejor engagement`,
          detail: `${formatTime(bestEngagement.avgEngagementTime)} promedio de interaccion con ${bestEngagement.activeUsers} usuarios. Podria ser un buen target para pauta local.`,
        });
      }

      if (topCity && topCity.avgEngagementTime !== undefined && topCity.avgEngagementTime < 3) {
        insights.push({
          type: "warning",
          category: "Geografia",
          title: `${topCity.city} tiene alto trafico pero bajo engagement`,
          detail: `${topCity.activeUsers.toLocaleString()} usuarios pero solo ${formatTime(topCity.avgEngagementTime || 0)} de interaccion. Revisa la calidad de la pauta en esa ciudad.`,
        });
      }
    }
  }

  // ── Overview insight ───────────────────────────────────────────
  if (data.overview.avgEngagementTime > 0) {
    if (data.overview.avgEngagementTime < 5) {
      insights.push({
        type: "negative",
        category: "General",
        title: `Tiempo promedio de ${formatTime(data.overview.avgEngagementTime)}`,
        detail: "Muy bajo. Indica que la mayoria de visitas son rebotes. Necesitas contenido mas relevante o landing pages mejor diseñadas.",
      });
    } else if (data.overview.avgEngagementTime > 30) {
      insights.push({
        type: "positive",
        category: "General",
        title: `Excelente tiempo de engagement: ${formatTime(data.overview.avgEngagementTime)}`,
        detail: "Los usuarios pasan tiempo real en la pagina. El contenido esta funcionando.",
      });
    }
  }

  // ── GSC insights ───────────────────────────────────────────────
  if (gscData) {
    const { totals, queries } = gscData;

    // CTR global
    if (totals.ctr < 0.03 && totals.impressions > 100) {
      insights.push({
        type: "warning",
        category: "Búsquedas",
        title: `CTR de ${(totals.ctr * 100).toFixed(1)}% en Google Search`,
        detail: `Con ${totals.impressions.toLocaleString("es-PE")} impresiones, solo ${totals.clicks} personas hacen clic. El título y la meta descripción del sitio no son atractivos. Optimizalos para la búsqueda electoral.`,
      });
    } else if (totals.ctr >= 0.05) {
      insights.push({
        type: "positive",
        category: "Búsquedas",
        title: `CTR de ${(totals.ctr * 100).toFixed(1)}% — por encima del promedio`,
        detail: `El título en Google convierte bien: ${totals.clicks} clics de ${totals.impressions.toLocaleString("es-PE")} impresiones. Mantener consistencia en títulos de nuevas páginas.`,
      });
    }

    // Posición promedio
    if (totals.avgPosition > 10) {
      insights.push({
        type: "negative",
        category: "Búsquedas",
        title: `Posición ${totals.avgPosition.toFixed(1)} — fuera de la primera página`,
        detail: "La mayoría de búsquedas no muestran el sitio en la primera página de Google. Priorizar SEO on-page en la homepage y publicar contenido sobre el distrito.",
      });
    } else if (totals.avgPosition <= 3) {
      insights.push({
        type: "positive",
        category: "Búsquedas",
        title: `Posición ${totals.avgPosition.toFixed(1)} — top 3 en Google`,
        detail: "Excelente posicionamiento. El candidato aparece en los primeros resultados para sus búsquedas clave. Mantener la estrategia de contenido.",
      });
    }

    // Queries con impresiones altas pero cero clics (oportunidades)
    const zeroClickHighImpr = queries
      .filter((q) => q.clicks === 0 && q.impressions >= 20 && q.position <= 10)
      .slice(0, 2);
    if (zeroClickHighImpr.length > 0) {
      const names = zeroClickHighImpr.map((q) => `"${q.query}"`).join(", ");
      insights.push({
        type: "neutral",
        category: "Búsquedas",
        title: `Oportunidades SEO sin clic: ${names}`,
        detail: `Estas consultas aparecen en la primera página pero nadie hace clic. Mejorar el snippet (título + meta descripción) para esas palabras puede duplicar el tráfico sin invertir en pauta.`,
      });
    }

    // Query estrella (más clics, posición < 5)
    const starQuery = queries.find((q) => q.clicks >= 5 && q.position < 5);
    if (starQuery) {
      insights.push({
        type: "positive",
        category: "Búsquedas",
        title: `"${starQuery.query}" es la consulta estrella`,
        detail: `${starQuery.clicks} clics en posición ${starQuery.position.toFixed(1)} con CTR de ${(starQuery.ctr * 100).toFixed(1)}%. Es el término más efectivo — crear más contenido relacionado para consolidar el liderazgo.`,
      });
    }

    // Ratio impresiones / clics GA4 (coherencia entre fuentes)
    if (data.overview.activeUsers > 0 && totals.clicks > 0) {
      const gscShare = (totals.clicks / data.overview.activeUsers) * 100;
      if (gscShare < 5) {
        insights.push({
          type: "neutral",
          category: "Canales",
          title: `Google Orgánico aporta solo el ${gscShare.toFixed(1)}% del tráfico total`,
          detail: `${totals.clicks} clics orgánicos de ${data.overview.activeUsers.toLocaleString("es-PE")} visitantes totales. La mayor parte del tráfico viene de redes sociales o pauta. Fortalecer SEO reduciría la dependencia de presupuesto pagado.`,
        });
      } else if (gscShare > 30) {
        insights.push({
          type: "positive",
          category: "Canales",
          title: `Google Orgánico genera el ${gscShare.toFixed(1)}% del tráfico`,
          detail: `${totals.clicks} de ${data.overview.activeUsers.toLocaleString("es-PE")} visitantes llegan por búsqueda orgánica. Excelente señal de posicionamiento — este tráfico es gratis y de alta intención.`,
        });
      }
    }
  }

  return insights;
}

function formatSource(source: string): string {
  const map: Record<string, string> = {
    fb: "Facebook",
    ig: "Instagram",
    google: "Google",
    "(direct)": "Directo",
  };
  return map[source] || source;
}

function formatTime(seconds: number): string {
  if (seconds < 1) return "< 1s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

const S: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    border: "1px solid #e2e8f0",
    padding: 20,
    display: "flex",
    flexDirection: "column" as const,
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: "#0f172a",
  },
  badge: {
    fontSize: 11,
    fontWeight: 500,
    color: "#64748b",
    backgroundColor: "#f1f5f9",
    padding: "3px 8px",
    borderRadius: 4,
  },
  insightsList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  },
  insightCard: {
    padding: "14px 14px 14px 16px",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderLeft: "3px solid transparent",
  },
  insightHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  insightDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  },
  insightCategory: {
    fontSize: 10,
    fontWeight: 600,
    color: "#64748b",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  insightTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#1e293b",
    lineHeight: 1.4,
    marginBottom: 4,
  },
  insightDetail: {
    fontSize: 12,
    color: "#475569",
    lineHeight: 1.5,
  },
  empty: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: 32,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: 600,
    color: "#94a3b8",
  },
  emptyHint: {
    fontSize: 11,
    color: "#cbd5e1",
    textAlign: "center" as const,
  },
};
