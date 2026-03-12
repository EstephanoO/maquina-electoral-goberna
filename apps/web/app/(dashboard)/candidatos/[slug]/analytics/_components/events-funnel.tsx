/**
 * GOBERNA — EventsFunnel Component
 * Visual funnel showing event progression from page_view to conversion actions.
 * Highlights drop-off between each stage.
 */

"use client";

import { useMemo } from "react";
import type { GA4Event } from "./types";

type Props = {
  events: GA4Event[];
  primaryColor: string;
};

/** Canonical funnel order */
const FUNNEL_ORDER = [
  "page_view",
  "session_start",
  "first_visit",
  "user_engagement",
  "scroll",
  "click",
  "form_start",
  "form_submit",
  "contact_whatsapp",
  "purchase",
];

const EVENT_LABELS: Record<string, string> = {
  page_view: "Vistas de pagina",
  session_start: "Inicio de sesion",
  first_visit: "Primera visita",
  user_engagement: "Engagement",
  scroll: "Scroll",
  click: "Click",
  form_start: "Inicio formulario",
  form_submit: "Envio formulario",
  contact_whatsapp: "Contacto WhatsApp",
  purchase: "Compra",
};

export function EventsFunnel({ events, primaryColor }: Props) {
  const funnelData = useMemo(() => {
    if (!events.length) return [];

    // Sort events by funnel order, put unknown events at the end
    const eventMap = new Map(events.map((e) => [e.name, e]));
    const ordered: (GA4Event & { label: string; dropOff: number | null })[] = [];

    // First add events in funnel order
    for (const name of FUNNEL_ORDER) {
      const evt = eventMap.get(name);
      if (evt) {
        eventMap.delete(name);
        ordered.push({ ...evt, label: EVENT_LABELS[name] || name, dropOff: null });
      }
    }

    // Then add any remaining events not in the canonical order
    for (const [name, evt] of eventMap) {
      ordered.push({ ...evt, label: EVENT_LABELS[name] || name, dropOff: null });
    }

    // Calculate drop-off percentages
    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1].users;
      const curr = ordered[i].users;
      if (prev > 0) {
        ordered[i].dropOff = -((1 - curr / prev) * 100);
      }
    }

    return ordered;
  }, [events]);

  if (!funnelData.length) {
    return (
      <div style={S.container}>
        <div style={S.headerRow}>
          <h3 style={S.title}>Funnel de Eventos</h3>
        </div>
        <div style={S.empty}>
          <span style={S.emptyText}>Sin datos de eventos</span>
          <span style={S.emptyHint}>Sube el CSV de Eventos para ver el funnel</span>
        </div>
      </div>
    );
  }

  const maxCount = funnelData[0]?.count || 1;
  const maxUsers = funnelData[0]?.users || 1;

  return (
    <div style={S.container}>
      <div style={S.headerRow}>
        <h3 style={S.title}>Funnel de Eventos</h3>
        <span style={S.badge}>{funnelData.length} tipos</span>
      </div>

      <div style={S.funnel}>
        {funnelData.map((evt, idx) => {
          const barWidth = Math.max(8, (evt.count / maxCount) * 100);
          const userWidth = Math.max(8, (evt.users / maxUsers) * 100);
          const isFirst = idx === 0;
          const isConversion = ["form_start", "form_submit", "contact_whatsapp", "purchase"].includes(evt.name);

          return (
            <div key={evt.name}>
              {/* Drop-off indicator */}
              {evt.dropOff !== null && !isFirst && (
                <div style={S.dropOff}>
                  <div style={S.dropOffLine} />
                  <span style={{
                    ...S.dropOffText,
                    color: evt.dropOff < -80 ? "#dc2626" : evt.dropOff < -50 ? "#f59e0b" : "var(--color-text-secondary)",
                  }}>
                    {evt.dropOff.toFixed(0)}%
                  </span>
                </div>
              )}

              <div style={{
                ...S.row,
                borderLeft: isConversion ? `3px solid ${primaryColor}` : "3px solid transparent",
              }}>
                <div style={S.labelCol}>
                  <span style={{
                    ...S.eventName,
                    fontWeight: isConversion ? 700 : 500,
                  }}>
                    {evt.label}
                  </span>
                  <span style={S.eventCode}>{evt.name}</span>
                </div>

                <div style={S.barsCol}>
                  {/* Events bar */}
                  <div style={S.barRow}>
                    <div style={S.barBg}>
                      <div style={{
                        ...S.bar,
                        width: `${barWidth}%`,
                        backgroundColor: primaryColor,
                        opacity: 0.8,
                      }} />
                    </div>
                    <span style={S.barValue}>{evt.count.toLocaleString()}</span>
                  </div>
                  {/* Users bar */}
                  <div style={S.barRow}>
                    <div style={S.barBg}>
                      <div style={{
                        ...S.bar,
                        width: `${userWidth}%`,
                        backgroundColor: primaryColor,
                        opacity: 0.3,
                      }} />
                    </div>
                    <span style={S.barValueLight}>{evt.users.toLocaleString()} usr</span>
                  </div>
                </div>

                <div style={S.metricCol}>
                  <span style={S.metricValue}>{evt.countPerUser.toFixed(1)}</span>
                  <span style={S.metricLabel}>por usr</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={S.legend}>
        <div style={S.legendItem}>
          <div style={{ ...S.legendDot, backgroundColor: primaryColor, opacity: 0.8 }} />
          <span>Eventos</span>
        </div>
        <div style={S.legendItem}>
          <div style={{ ...S.legendDot, backgroundColor: primaryColor, opacity: 0.3 }} />
          <span>Usuarios</span>
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: "var(--color-surface)",
    borderRadius: 16,
    border: "1px solid var(--color-border)",
    padding: 20,
    height: "100%",
    display: "flex",
    flexDirection: "column" as const,
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: "var(--color-text-primary)",
  },
  badge: {
    fontSize: 11,
    fontWeight: 500,
    color: "var(--color-text-secondary)",
    backgroundColor: "var(--color-surface-active)",
    padding: "3px 8px",
    borderRadius: 4,
  },
  funnel: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    gap: 0,
    overflow: "auto",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 10px",
    borderRadius: 8,
    transition: "background 0.15s",
  },
  labelCol: {
    width: 130,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column" as const,
    gap: 1,
  },
  eventName: {
    fontSize: 12,
    color: "var(--color-text-primary)",
    lineHeight: 1.3,
  },
  eventCode: {
    fontSize: 9,
    color: "var(--color-text-tertiary)",
    fontFamily: "monospace",
  },
  barsCol: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    gap: 3,
    minWidth: 0,
  },
  barRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  barBg: {
    flex: 1,
    height: 6,
    backgroundColor: "var(--color-surface-active)",
    borderRadius: 3,
    overflow: "hidden",
  },
  bar: {
    height: "100%",
    borderRadius: 3,
    transition: "width 0.5s ease",
  },
  barValue: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--color-text-secondary)",
    minWidth: 50,
    textAlign: "right" as const,
  },
  barValueLight: {
    fontSize: 10,
    color: "var(--color-text-tertiary)",
    minWidth: 50,
    textAlign: "right" as const,
  },
  metricCol: {
    width: 50,
    flexShrink: 0,
    textAlign: "center" as const,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
  },
  metricValue: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--color-text-primary)",
  },
  metricLabel: {
    fontSize: 9,
    color: "var(--color-text-tertiary)",
  },
  dropOff: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "2px 10px 2px 20px",
  },
  dropOffLine: {
    flex: 1,
    height: 1,
    backgroundColor: "var(--color-border)",
  },
  dropOffText: {
    fontSize: 10,
    fontWeight: 600,
    whiteSpace: "nowrap" as const,
  },
  legend: {
    display: "flex",
    gap: 16,
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid var(--color-surface-active)",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    color: "var(--color-text-secondary)",
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  empty: {
    flex: 1,
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
    color: "var(--color-text-tertiary)",
  },
  emptyHint: {
    fontSize: 11,
    color: "#cbd5e1",
  },
};
