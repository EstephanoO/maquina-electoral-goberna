// apps/web/app/onboarding/[slug]/fase-2/_components/slides/shared/Badge.tsx
type Tone = "critico" | "revision" | "alta" | "media" | "verde";

interface Props {
  label?: string;
  tone: Tone;
  rotate?: number;
}

const TONE_STYLES: Record<Tone, string> = {
  critico:  "bg-red-600 text-white shadow-[2px_2px_0_rgba(0,0,0,0.5)]",
  revision: "bg-amber-600 text-white shadow-[2px_2px_0_rgba(0,0,0,0.4)]",
  alta:     "bg-red-700 text-white shadow-[2px_2px_0_rgba(0,0,0,0.5)]",
  media:    "bg-amber-500 text-white shadow-[2px_2px_0_rgba(0,0,0,0.3)]",
  verde:    "bg-emerald-600 text-white shadow-[2px_2px_0_rgba(0,0,0,0.3)]",
};

const TONE_LABELS: Record<Tone, string> = {
  critico:  "CRÍTICO",
  revision: "REVISIÓN",
  alta:     "ALTA",
  media:    "MEDIA",
  verde:    "OK",
};

export function Badge({ label, tone, rotate = -3 }: Props) {
  return (
    <span
      className={`inline-block px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider ${TONE_STYLES[tone]}`}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      {label ?? TONE_LABELS[tone]}
    </span>
  );
}
