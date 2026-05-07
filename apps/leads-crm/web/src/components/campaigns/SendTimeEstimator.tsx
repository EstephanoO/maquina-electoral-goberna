import { Clock, Send, AlertCircle } from "lucide-react";
import { estimateSendTime } from "../../lib/campaign-personalize";

type Props = {
  recipients: number;
  throttle: number;
  windowStart: number;
  windowEnd: number;
};

export function SendTimeEstimator({ recipients, throttle, windowStart, windowEnd }: Props) {
  const { humanReadable, totalMin } = estimateSendTime(recipients, throttle, windowStart, windowEnd);
  const tooLong = totalMin > 60 * 24;
  const tooFast = throttle > 25;

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-2">
        <Clock className="w-3.5 h-3.5 text-blue-600" />
        Tiempo estimado de envío
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat icon={Send} value={recipients.toLocaleString()} label="destinatarios" />
        <Stat icon={Clock} value={humanReadable} label="duración" />
        <Stat icon={AlertCircle}
              value={`${throttle}/min`}
              label="throttle"
              variant={tooFast ? "warn" : "default"} />
      </div>

      <div className="mt-2 space-y-1 text-[10.5px] text-slate-600">
        <div>• Ventana: {windowStart}:00 – {windowEnd}:00 hora Perú · {windowEnd - windowStart}h diarias</div>
        {tooLong && (
          <div className="text-amber-700">⚠ La campaña tomará más de 1 día. Considerá subir el throttle o reducir el segmento.</div>
        )}
        {tooFast && (
          <div className="text-amber-700">⚠ Throttle alto puede ser detectado como spam por WhatsApp. Recomendado &le; 15/min.</div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, value, label, variant = "default" }: {
  icon: any; value: string; label: string; variant?: "default" | "warn";
}) {
  return (
    <div className={`rounded p-1.5 ${variant === "warn" ? "bg-amber-50" : "bg-white"}`}>
      <Icon className={`inline w-3 h-3 mr-1 ${variant === "warn" ? "text-amber-600" : "text-slate-400"}`} />
      <div className="text-sm font-bold text-slate-800 tabular-nums">{value}</div>
      <div className="text-[9px] text-slate-500">{label}</div>
    </div>
  );
}
