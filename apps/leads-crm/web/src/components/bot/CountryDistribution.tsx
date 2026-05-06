import { Globe } from "lucide-react";
import { useByCountry } from "../../hooks/useBotActivityExtras";

const FLAG: Record<string, string> = {
  "Perú": "🇵🇪", "México": "🇲🇽", "Bolivia": "🇧🇴", "Ecuador": "🇪🇨",
  "Colombia": "🇨🇴", "República Dominicana": "🇩🇴", "Honduras": "🇭🇳",
  "Paraguay": "🇵🇾", "Panamá": "🇵🇦", "Chile": "🇨🇱", "Argentina": "🇦🇷",
  "Brasil": "🇧🇷", "España": "🇪🇸", "EEUU/Canadá": "🇺🇸",
};

export function CountryDistribution() {
  const { data } = useByCountry();
  const items = data ?? [];
  const max = Math.max(1, ...items.map(i => i.msgs));

  return (
    <div className="card p-5">
      <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
        <Globe className="w-4 h-4 text-blue-500" />
        Distribución geográfica · mensajes IN hoy
      </h2>
      {items.length === 0 ? (
        <div className="text-xs text-slate-400 py-3">Sin datos</div>
      ) : (
        <div className="space-y-1.5">
          {items.map(i => (
            <div key={i.country} className="flex items-center gap-2 text-xs">
              <span className="w-6 shrink-0">{FLAG[i.country] ?? "🏳️"}</span>
              <span className="w-32 truncate text-slate-700">{i.country}</span>
              <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full"
                  style={{ width: `${(i.msgs / max) * 100}%` }}
                />
              </div>
              <span className="font-mono tabular-nums w-10 text-right text-slate-700">{i.msgs}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
