import { cn } from "../../lib/utils";

type Props = {
  name: string;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  ring?: "vip" | "online" | "attention" | null;
  className?: string;
};

const SIZE = {
  xs: "w-6 h-6 text-[10px]",
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-12 h-12 text-base",
  xl: "w-20 h-20 text-2xl",
};

const RING = {
  vip:       "ring-2 ring-amber-400 ring-offset-1",
  online:    "ring-2 ring-emerald-400 ring-offset-1",
  attention: "ring-2 ring-red-400 ring-offset-1",
};

const GRADIENTS = [
  "from-blue-400 to-indigo-500",
  "from-purple-400 to-pink-500",
  "from-emerald-400 to-cyan-500",
  "from-amber-400 to-orange-500",
  "from-rose-400 to-red-500",
  "from-violet-400 to-purple-500",
  "from-teal-400 to-emerald-500",
  "from-sky-400 to-blue-500",
];

function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % GRADIENTS.length;
  return GRADIENTS[h];
}

function initials(name: string): string {
  if (!name || /^\+?\d/.test(name)) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]).join("").toUpperCase();
}

export function Avatar({ name, src, size = "md", ring, className }: Props) {
  const grad = gradientFor(name || "?");
  const ringClass = ring ? RING[ring] : "";

  return (
    <div
      className={cn(
        "relative shrink-0 rounded-full flex items-center justify-center font-semibold text-white shadow-sm",
        "bg-gradient-to-br", grad,
        SIZE[size],
        ringClass,
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" className="w-full h-full rounded-full object-cover" />
      ) : (
        <span style={{ textShadow: "0 1px 2px rgba(0,0,0,0.15)" }}>{initials(name)}</span>
      )}
    </div>
  );
}
