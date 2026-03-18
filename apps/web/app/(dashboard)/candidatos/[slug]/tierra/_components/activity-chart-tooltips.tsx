/**
 * activity-chart-tooltips.tsx — Tooltip styles and components for ActivityCharts.
 *
 * Extracted from activity-charts.tsx to reduce component size.
 */

/* ========== Tooltip styles (inline required for Recharts) ========== */

export function getTooltipStyle(isDark: boolean): React.CSSProperties {
  return {
    backgroundColor: isDark ? "#090D15" : "#ffffff",
    border: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
    borderRadius: 10,
    fontSize: 11,
    color: isDark ? "#e2e8f0" : "#07091D",
    boxShadow: isDark ? "0 8px 24px rgba(0,0,0,0.24)" : "0 4px 16px rgba(0,0,0,0.06)",
    padding: "8px 14px",
  };
}

export function RankingTooltip({
  active,
  payload,
  isDark,
}: {
  active?: boolean;
  payload?: Array<{ payload: { fullName: string; forms: number } }>;
  isDark: boolean;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const row = payload[0].payload;
  return (
    <div
      style={{
        backgroundColor: isDark ? "#090D15" : "#ffffff",
        border: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
        borderRadius: 10,
        padding: "8px 10px",
        boxShadow: isDark ? "0 8px 24px rgba(0,0,0,0.24)" : "0 4px 16px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: isDark ? "#ffffff" : "#0f172a" }}>{row.fullName}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#ffffff" : "#334155" }}>{row.forms} registros</div>
    </div>
  );
}
