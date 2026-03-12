"use client";

import type { GA4DailyUsers } from "./types";

type Props = {
  dailyUsers: GA4DailyUsers[];
  primaryColor: string;
  secondaryColor?: string;
};

export function DailyChart({ dailyUsers, primaryColor, secondaryColor }: Props) {
  const sc = secondaryColor || "var(--color-text-tertiary)";
  const daysWithData = dailyUsers.filter((d) => d.newUsers > 0 || d.returningUsers > 0);

  if (daysWithData.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.headerTitle}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={primaryColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>Tendencia Diaria</span>
          </div>
        </div>
        <div style={styles.emptyState}>
          <span>Sin datos de tendencia disponibles</span>
        </div>
      </div>
    );
  }

  const maxValue = Math.max(...daysWithData.map((d) => d.newUsers + d.returningUsers), 1);
  const totalNew = daysWithData.reduce((sum, d) => sum + d.newUsers, 0);
  const totalReturning = daysWithData.reduce((sum, d) => sum + d.returningUsers, 0);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={primaryColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span>Tendencia Diaria</span>
        </div>
        <div style={styles.legend}>
          <div style={styles.legendItem}>
            <div style={{ ...styles.legendDot, backgroundColor: primaryColor }} />
            <span style={styles.legendText}>Nuevos</span>
            <span style={styles.legendValue}>{totalNew.toLocaleString()}</span>
          </div>
          <div style={styles.legendItem}>
            <div style={{ ...styles.legendDot, backgroundColor: sc }} />
            <span style={styles.legendText}>Recurrentes</span>
            <span style={styles.legendValue}>{totalReturning.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div style={styles.chartArea}>
        {/* Y-axis */}
        <div style={styles.yAxis}>
          <span style={styles.yLabel}>{maxValue.toLocaleString()}</span>
          <span style={styles.yLabel}>{Math.round(maxValue / 2).toLocaleString()}</span>
          <span style={styles.yLabel}>0</span>
        </div>

        {/* Bars */}
        <div style={styles.barsArea}>
          {/* Grid lines */}
          <div style={styles.gridLines}>
            <div style={styles.gridLine} />
            <div style={styles.gridLine} />
            <div style={styles.gridLine} />
          </div>

          {/* Bar groups */}
          <div style={styles.bars}>
            {daysWithData.map((day) => {
              const total = day.newUsers + day.returningUsers;
              const heightPct = (total / maxValue) * 100;
              const newPct = total > 0 ? (day.newUsers / total) * 100 : 0;

              return (
                <div key={day.day} style={styles.barGroup}>
                  <div style={styles.barContainer}>
                    <div style={{ ...styles.barStack, height: `${heightPct}%` }}>
                      <div style={{ ...styles.barSegment, flex: newPct, backgroundColor: primaryColor }} />
                      {day.returningUsers > 0 && (
                        <div style={{ ...styles.barSegment, flex: 100 - newPct, backgroundColor: sc }} />
                      )}
                    </div>
                  </div>
                  <span style={styles.barLabel}>Dia {day.day}</span>
                  <span style={styles.barValue}>{total.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: "var(--color-surface)",
    borderRadius: 16,
    border: "1px solid var(--color-border)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid var(--color-surface-active)",
  },
  headerTitle: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 15,
    fontWeight: 600,
    color: "var(--color-text-primary)",
  },
  legend: {
    display: "flex",
    gap: 20,
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
  },
  legendText: {
    fontSize: 12,
    color: "var(--color-text-secondary)",
  },
  legendValue: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--color-text-primary)",
  },
  chartArea: {
    display: "flex",
    padding: 20,
    height: 200,
  },
  yAxis: {
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "space-between",
    paddingRight: 12,
    paddingBottom: 44,
  },
  yLabel: {
    fontSize: 10,
    color: "var(--color-text-tertiary)",
    textAlign: "right" as const,
  },
  barsArea: {
    flex: 1,
    position: "relative" as const,
  },
  gridLines: {
    position: "absolute" as const,
    inset: 0,
    bottom: 44,
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "space-between",
    pointerEvents: "none" as const,
  },
  gridLine: {
    height: 1,
    backgroundColor: "var(--color-surface-active)",
  },
  bars: {
    position: "absolute" as const,
    inset: 0,
    display: "flex",
    justifyContent: "center",
    gap: 24,
    paddingBottom: 0,
  },
  barGroup: {
    flex: 1,
    maxWidth: 80,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
  },
  barContainer: {
    flex: 1,
    width: "100%",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  barStack: {
    width: "60%",
    maxWidth: 48,
    borderRadius: "6px 6px 0 0",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column" as const,
    transition: "height 0.4s ease",
  },
  barSegment: {
    width: "100%",
  },
  barLabel: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: 500,
    color: "var(--color-text-secondary)",
  },
  barValue: {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--color-text-primary)",
    marginTop: 2,
  },
  emptyState: {
    padding: 40,
    textAlign: "center" as const,
    color: "var(--color-text-tertiary)",
    fontSize: 13,
  },
};
