"use client";

type Props = {
  metaDatos: number;
  metaVotos: number;
  currentDatos: number;
  currentVotos: number;
  primaryColor: string;
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function MetaCard({
  label,
  current,
  target,
  color,
}: {
  label: string;
  current: number;
  target: number;
  color: string;
}) {
  const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0;

  return (
    <div
      style={{
        padding: "12px 16px",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        minWidth: 160,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "#64748b",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#0f172a" }}>TOTAL</span>
        <span style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
          {formatNumber(current)}/{formatNumber(target)}
        </span>
        <span style={{ fontSize: 12, color: "#64748b" }}>{percentage.toFixed(2)}%</span>
      </div>
      {/* Progress bar */}
      <div
        style={{
          marginTop: 8,
          height: 4,
          backgroundColor: "#e2e8f0",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${percentage}%`,
            backgroundColor: color,
            borderRadius: 2,
            transition: "width 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}

export function MetasDisplay({ metaDatos, metaVotos, currentDatos, currentVotos, primaryColor }: Props) {
  return (
    <div style={{ display: "flex", gap: 16 }}>
      <MetaCard label="Meta de datos" current={currentDatos} target={metaDatos} color={primaryColor} />
      <MetaCard label="Meta de votos" current={currentVotos} target={metaVotos} color="#22c55e" />
    </div>
  );
}
