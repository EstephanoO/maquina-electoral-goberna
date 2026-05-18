"use client";

interface GapBarProps {
  current: number;   // current % (e.g. 35)
  target: number;    // target % (e.g. 51)
  weeks?: number;    // weeks to election
  totalVotes?: number; // padrón for calculating absolute votes
}

function fmt(n: number): string {
  return n.toLocaleString("es-PE");
}

export function GapBar({ current, target, weeks, totalVotes }: GapBarProps) {
  const gap = target - current;
  const votosGap = totalVotes
    ? Math.round(totalVotes * gap / 100)
    : null;

  // Clamp percentages for bar rendering (0–100)
  const currentClamped = Math.max(0, Math.min(100, current));
  const targetClamped = Math.max(0, Math.min(100, target));

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Big numbers row */}
      <div className="flex items-end justify-between gap-4">
        {/* Current % */}
        <div className="flex flex-col items-start">
          <span
            className="font-black leading-none tabular-nums"
            style={{ fontSize: "64px", color: "#ef4444" }}
          >
            {current}%
          </span>
          <span className="text-xs text-white/40 uppercase tracking-wider mt-1">
            Hoy
          </span>
        </div>

        {/* Gap indicator */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-2xl font-black text-white/60 tabular-nums">
            +{gap}pts
          </span>
          {weeks !== undefined && weeks > 0 && (
            <span
              className="text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full"
              style={{
                color: "#fbbf24",
                backgroundColor: "#fbbf2418",
                border: "1px solid #fbbf2440",
              }}
            >
              {weeks} sem.
            </span>
          )}
        </div>

        {/* Target % */}
        <div className="flex flex-col items-end">
          <span
            className="font-black leading-none tabular-nums"
            style={{ fontSize: "64px", color: "#22c55e" }}
          >
            {target}%
          </span>
          <span className="text-xs text-white/40 uppercase tracking-wider mt-1 text-right">
            Meta
          </span>
        </div>
      </div>

      {/* Progress bar — 40px tall */}
      <div className="relative w-full rounded-lg overflow-hidden" style={{ height: "40px", backgroundColor: "#1a2744" }}>
        {/* Solid red zone (0 → current%) */}
        <div
          className="absolute left-0 top-0 bottom-0 rounded-l-lg"
          style={{
            width: `${currentClamped}%`,
            background: "linear-gradient(to right, #b91c1c, #ef4444)",
          }}
        />

        {/* Hatched amber zone (current% → target%) */}
        {targetClamped > currentClamped && (
          <div
            className="absolute top-0 bottom-0"
            style={{
              left: `${currentClamped}%`,
              width: `${targetClamped - currentClamped}%`,
              background: "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(251,191,36,0.15) 3px, rgba(251,191,36,0.15) 4px)",
              borderLeft: "2px dashed rgba(251,191,36,0.6)",
            }}
          />
        )}

        {/* Green marker at target% */}
        <div
          className="absolute top-0 bottom-0"
          style={{
            left: `${targetClamped}%`,
            width: "2px",
            backgroundColor: "#22c55e",
          }}
        />
      </div>

      {/* Bar label */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/50">
          {votosGap !== null
            ? `${fmt(votosGap)} votos a conquistar`
            : `${gap} puntos de brecha`}
        </span>
        {totalVotes && (
          <span className="text-white/30">
            Padrón: {fmt(totalVotes)}
          </span>
        )}
      </div>

      {/* Caption */}
      <p className="text-[11px] text-white/30 leading-relaxed">
        GAP electoral: {gap} puntos · de {current}% actual a {target}% meta
        {weeks !== undefined && weeks > 0 ? ` · ${weeks} semanas disponibles` : ""}
        {votosGap !== null ? ` · ${fmt(votosGap)} votos adicionales` : ""}
      </p>
    </div>
  );
}
