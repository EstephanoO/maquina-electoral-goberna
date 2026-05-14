"use client";

/**
 * Stamp de riesgo — caja rotada con borde doble, mimic del "CRÍTICO" del PDF.
 * Se mapea al status del form (ok/review/flag) o a un nivel explícito.
 */
type Level = "critico" | "alto" | "medio" | "bajo";

interface Props {
  level: Level;
  /** Override del label si no querés usar el default por level. */
  label?: string;
  size?: "sm" | "md" | "lg";
  /** Grados de rotación. Default -12. */
  rotate?: number;
  className?: string;
}

const LEVEL_MAP: Record<Level, { label: string; color: string }> = {
  critico: { label: "CRÍTICO", color: "text-red-600 border-red-600" },
  alto:    { label: "ALTO",    color: "text-orange-600 border-orange-600" },
  medio:   { label: "MEDIO",   color: "text-amber-500 border-amber-500" },
  bajo:    { label: "BAJO",    color: "text-emerald-600 border-emerald-600" },
};

const SIZE_MAP = {
  sm: "px-3 py-1 text-sm border-2",
  md: "px-5 py-1.5 text-lg border-[3px]",
  lg: "px-7 py-2 text-2xl border-4",
};

export function RiesgoStamp({
  level,
  label,
  size = "md",
  rotate = -12,
  className = "",
}: Props) {
  const { label: defaultLabel, color } = LEVEL_MAP[level];
  return (
    <span
      className={`inline-block ${SIZE_MAP[size]} ${color} font-black uppercase tracking-widest bg-white/5 rounded-sm ${className}`}
      style={{
        transform: `rotate(${rotate}deg)`,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      }}
    >
      {label ?? defaultLabel}
    </span>
  );
}

/** Helper: status del form → level del stamp. */
export function statusToLevel(
  status: "ok" | "review" | "flag" | undefined | null,
): Level | null {
  if (!status) return null;
  if (status === "ok") return "bajo";
  if (status === "review") return "medio";
  return "critico"; // flag
}

/** Helper: severidad (debilidades.lista_libre) → level del stamp. */
export function severityToLevel(
  severidad: "baja" | "media" | "alta" | undefined,
): Level {
  if (severidad === "alta") return "critico";
  if (severidad === "media") return "alto";
  return "medio"; // baja o undefined
}
