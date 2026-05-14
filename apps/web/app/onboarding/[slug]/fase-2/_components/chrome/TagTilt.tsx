"use client";

/**
 * Etiqueta amarilla tilteada — imita los "RUMBO", "A LA", "SEGUNDA", "PASO 1"
 * del deck Goberna. Block element con sombra y rotación leve.
 */
interface Props {
  label: string;
  /** Color del tag. Default amber. "white" usa amarillo pálido. */
  tone?: "amber" | "white";
  /** Tamaño. "sm" ≈ chips · "md" ≈ tags chicos · "lg" ≈ hero tags. */
  size?: "sm" | "md" | "lg" | "xl";
  /** Grados de rotación (positivo gira CCW). Default aleatorio entre -8 y -2. */
  rotate?: number;
  className?: string;
}

const SIZE_MAP = {
  sm: "px-3 py-1 text-xs",
  md: "px-4 py-1.5 text-sm sm:text-base",
  lg: "px-6 py-2 text-lg sm:text-xl",
  xl: "px-8 py-3 text-2xl sm:text-3xl md:text-4xl",
};

export function TagTilt({
  label,
  tone = "amber",
  size = "md",
  rotate = -4,
  className = "",
}: Props) {
  const bg =
    tone === "white"
      ? "bg-white text-[#0a1f4a]"
      : "bg-amber-400 text-[#0a1f4a]";

  return (
    <span
      className={`inline-block ${bg} ${SIZE_MAP[size]} font-black uppercase tracking-wider shadow-[6px_6px_0_rgba(2,10,30,0.35)] ${className}`}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      {label}
    </span>
  );
}
