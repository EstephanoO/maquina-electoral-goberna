import { Crown, Award, Lightbulb, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSegmentPresets } from "../../hooks/useCampaigns";
import { usePreviewSegment } from "../../hooks/useCampaigns";

export type QuickStart = {
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  color: string;
  presetSlug: string;
  suggestedTemplate?: string;
  suggestedHook: string;
};

export const QUICK_STARTS: QuickStart[] = [
  {
    id: "vip-winback",
    title: "Reactivar VIPs",
    subtitle: "Clientes top sin contacto 60+ días",
    icon: Crown,
    color: "from-amber-50 to-amber-100 border-amber-200 text-amber-900",
    presetSlug: "vip_inactive_60d",
    suggestedTemplate: "saludo_kathy",
    suggestedHook: "Hola 👋 Te escribo porque hace tiempo que no hablamos y queríamos compartirte algo especial para vos.",
  },
  {
    id: "crosssell",
    title: "Cross-sell Egresados",
    subtitle: "Egresados últimos 30 días",
    icon: Award,
    color: "from-emerald-50 to-emerald-100 border-emerald-200 text-emerald-900",
    presetSlug: "delivered_30d",
    suggestedTemplate: "seguimiento_revision",
    suggestedHook: "Hola {{nombre}} 👋 Sé que ya completaste {{último_curso}}. Queríamos compartirte el siguiente paso.",
  },
  {
    id: "hot-leads",
    title: "Cerrar Hot Leads",
    subtitle: "Interesados sin comprar",
    icon: Lightbulb,
    color: "from-rose-50 to-rose-100 border-rose-200 text-rose-900",
    presetSlug: "interested_no_buy",
    suggestedTemplate: "cierre_procedemos",
    suggestedHook: "Hola {{nombre}} 👋 Hace unos días me consultaste por nuestros programas. ¿Seguís interesado?",
  },
];

type Props = {
  onPick: (qs: QuickStart) => void;
};

export function QuickStartCards({ onPick }: Props) {
  const { data: presets } = useSegmentPresets();

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
        <Zap className="w-3.5 h-3.5 text-amber-500" />
        Crear campaña en 30 segundos
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {QUICK_STARTS.map(qs => {
          const preset = presets?.find(p => p.slug === qs.presetSlug);
          return (
            <QuickCard key={qs.id} qs={qs} preset={preset} onPick={() => onPick(qs)} />
          );
        })}
      </div>
    </div>
  );
}

function QuickCard({ qs, preset, onPick }: {
  qs: QuickStart; preset?: any; onPick: () => void;
}) {
  const previewQ = usePreviewSegment(preset?.filter ?? null);
  const Icon = qs.icon;
  const count = previewQ.data?.total ?? 0;

  return (
    <button
      onClick={onPick}
      className={`text-left relative p-4 rounded-xl border bg-gradient-to-br ${qs.color} hover:shadow-md transition-all hover:-translate-y-0.5 group`}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-white/60 backdrop-blur flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm">{qs.title}</div>
          <div className="text-[11px] opacity-70 mt-0.5">{qs.subtitle}</div>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-2xl font-bold tabular-nums tracking-tight">
              {count.toLocaleString()}
            </span>
            <span className="text-[10px] opacity-60">leads</span>
          </div>
        </div>
      </div>
      <div className="absolute bottom-2 right-3 text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition">
        Empezar →
      </div>
    </button>
  );
}
