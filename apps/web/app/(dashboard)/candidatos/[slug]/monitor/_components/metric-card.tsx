import { MONITOR_THEME as G } from "./theme";

function Sparkline({ points, accent, large = false }: { points: number[]; accent: string; large?: boolean }) {
  const width = large ? 360 : 96;
  const height = large ? 84 : 36;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const normalized = points.map((point, index) => {
    const x = (index / Math.max(points.length - 1, 1)) * width;
    const y = height - ((point - min) / range) * (height - 8) - 4;
    return { x, y };
  });

  const path = normalized.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const areaPath = `${path} L ${width},${height} L 0,${height} Z`;
  const gradientId = `spark-gradient-${accent.replace(/[^a-zA-Z0-9]/g, "")}-${points.length}`;
  const fadeGradientId = `spark-fade-gradient-${accent.replace(/[^a-zA-Z0-9]/g, "")}-${points.length}`;
  const fadeMaskId = `spark-fade-mask-${accent.replace(/[^a-zA-Z0-9]/g, "")}-${points.length}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMinYMid meet" style={{ width: large ? "100%" : width, height, display: "block" }} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.14" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.01" />
        </linearGradient>
        <linearGradient id={fadeGradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity="1" />
          <stop offset="82%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id={fadeMaskId}>
          <rect x="0" y="0" width={width} height={height} fill={`url(#${fadeGradientId})`} />
        </mask>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} mask={`url(#${fadeMaskId})`} />
      <path d={path} fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {normalized.map((point, index) => {
        const isLast = index === normalized.length - 1;
        const key = `${point.x}-${point.y}-${points.slice(0, index).join("-") || "start"}`;

        return (
          <g key={key}>
            <circle
              cx={point.x}
              cy={point.y}
              r={isLast ? 5.5 : 3.5}
              fill={accent}
              opacity={isLast ? 0.16 : 0.12}
            />
            <circle
              cx={point.x}
              cy={point.y}
              r={isLast ? 2.8 : 1.8}
              fill={accent}
              opacity={isLast ? 0.92 : 0.72}
            />
          </g>
        );
      })}
    </svg>
  );
}

function MicroBars({ label, points, accent, large = false }: { label: string; points: number[]; accent: string; large?: boolean }) {
  const max = Math.max(...points, 1);
  const width = large ? 360 : 96;
  const height = large ? 84 : 36;

  return (
    <div style={{ display: "flex", alignItems: "end", gap: 3, width, height, padding: "2px 0" }} aria-hidden="true">
      {points.map((point, index) => (
        <div
          key={`${label}-${point}-${points.slice(0, index).join("-") || "start"}`}
          style={{
            flex: 1,
            minWidth: large ? 7 : 6,
            height: `${Math.max((point / max) * 100, 18)}%`,
            borderRadius: 999,
            background: accent,
            opacity: 0.24 + ((index + 1) / points.length) * 0.36,
          }}
        />
      ))}
    </div>
  );
}

function MicroDonut({ value, total, accent, softColor, large = false, label }: { value: number; total: number; accent: string; softColor: string; large?: boolean; label?: string }) {
  const safeTotal = total > 0 ? total : 1;
  const pct = Math.max(0, Math.min((value / safeTotal) * 100, 100));
  const radius = large ? 22 : 20;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const size = large ? 110 : 58;
  const center = large ? 55 : 28;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, display: "block" }} aria-hidden="true">
      <circle cx={center} cy={center} r={radius} fill="none" stroke={softColor} strokeWidth={large ? "8" : "6"} />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={accent}
        strokeWidth={large ? "8" : "6"}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${center} ${center})`}
      />
      <text x={center} y={large ? 55 : 31} textAnchor="middle" fontSize={large ? "18" : "14"} fontWeight="900" fill={accent}>
        {label ?? value}
      </text>
    </svg>
  );
}

function MicroStackedBar({ segments, softColor, large = false }: { segments: Array<{ value: number; color: string }>; softColor: string; large?: boolean }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  const width = large ? 360 : 96;

  return (
    <div style={{ width, display: "flex", flexDirection: "column", gap: 6 }} aria-hidden="true">
      <div style={{ display: "flex", width: "100%", height: large ? 12 : 10, borderRadius: 999, overflow: "hidden", background: softColor }}>
        {segments.map((segment, index) => (
          <div
            key={`${segment.color}-${segment.value}-${segments.slice(0, index).map((item) => `${item.color}-${item.value}`).join("|") || "start"}`}
            style={{
              width: `${(segment.value / total) * 100}%`,
              background: segment.color,
              minWidth: segment.value > 0 ? 6 : 0,
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {segments.map((segment, index) => (
          <div key={`${segment.color}-${segment.value}-${segments.slice(0, index).map((item) => `${item.color}-${item.value}`).join("|") || "start"}-legend`} style={{ width: 8, height: 8, borderRadius: 999, background: segment.color, opacity: 0.9 }} />
        ))}
      </div>
    </div>
  );
}

export function MetricCard({
  value,
  label,
  sub,
  color,
  emphasis = false,
  trend,
  trendType = "line",
  donutValue,
  donutTotal,
  donutLabel,
  segments,
  compact = false,
  graphicSize = "default",
  hideValue = false,
}: {
  value: string | number;
  label: string;
  sub?: string;
  color: string;
  emphasis?: boolean;
  trend?: number[];
  trendType?: "line" | "bars" | "donut" | "stacked";
  donutValue?: number;
  donutTotal?: number;
  donutLabel?: string;
  segments?: Array<{ value: number; color: string }>;
  compact?: boolean;
  graphicSize?: "default" | "large";
  hideValue?: boolean;
}) {
  const graphicWidth = compact ? 72 : graphicSize === "large" ? 360 : 104;
  const lineTrendColor = trend && trend.length > 1
    ? trend[trend.length - 1] > trend[0]
      ? G.green
      : trend[trend.length - 1] < trend[0]
        ? G.red
        : G.textMid
    : color;

  return (
    <div
      style={{
        flex: 1,
        minWidth: compact ? 0 : 150,
        padding: compact ? "14px 16px" : graphicSize === "large" ? "12px 0 10px" : "16px 18px",
        background: G.surface,
        border: `1px solid ${G.borderStrong}`,
        borderRadius: 24,
        position: "relative",
        overflow: "hidden",
        boxShadow: "none",
      }}
    >
      <div style={{ display: "flex", flexDirection: graphicSize === "large" ? "column" : "row", alignItems: graphicSize === "large" ? "stretch" : "center", justifyContent: "space-between", gap: graphicSize === "large" ? 8 : compact ? 12 : 16, minHeight: graphicSize === "large" ? 138 : undefined }}>
        <div style={{ flex: 1, minWidth: 0, padding: graphicSize === "large" ? "0 18px" : 0 }}>
          <div
            style={{
              fontSize: compact ? 10 : 11,
              fontWeight: 800,
              color: G.textMid,
              textTransform: "uppercase",
              letterSpacing: compact ? "2.4px" : "3px",
            }}
          >
            {label}
          </div>
          {!hideValue ? (
            <div style={{ fontSize: compact ? 24 : 30, fontWeight: 800, color: G.text, letterSpacing: compact ? "-0.5px" : "-0.8px", lineHeight: 1, marginTop: compact ? 8 : 8 }}>
              {value}
            </div>
          ) : null}
          {sub ? <div style={{ fontSize: compact ? 10 : 11, color: G.textDim, marginTop: hideValue ? 10 : 6 }}>{sub}</div> : null}
        </div>
        <div style={{ width: graphicSize === "large" ? "calc(100% + 36px)" : graphicWidth, minWidth: graphicSize === "large" ? 0 : graphicWidth, marginLeft: graphicSize === "large" ? "-18px" : 0, display: "flex", justifyContent: graphicSize === "large" ? "flex-start" : "flex-end", alignItems: "center", flex: graphicSize === "large" ? 1 : undefined }}>
          {trendType === "donut" && typeof donutValue === "number" && typeof donutTotal === "number"
            ? <MicroDonut value={donutValue} total={donutTotal} accent={color} softColor={G.surfaceSoft} large={graphicSize === "large"} label={donutLabel} />
            : trendType === "stacked" && segments && segments.length > 0
              ? <MicroStackedBar segments={segments} softColor={G.surfaceSoft} large={graphicSize === "large"} />
              : trend && trend.length > 1
                ? trendType === "bars"
                  ? <MicroBars label={label} points={trend} accent={color} large={graphicSize === "large"} />
                  : <Sparkline points={trend} accent={lineTrendColor} large={graphicSize === "large"} />
                : null}
        </div>
      </div>
    </div>
  );
}
