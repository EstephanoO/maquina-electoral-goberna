import { Copy } from "lucide-react";
import { AVAILABLE_VARS } from "../../lib/campaign-personalize";
import { useToast } from "../../toast";

export function VariablesHelper() {
  const toast = useToast();

  function copy(token: string) {
    navigator.clipboard.writeText(token).catch(() => {});
    toast(`Copiado: ${token}`, "ok");
  }

  return (
    <div className="border border-slate-200 rounded-lg p-2 bg-slate-50">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1.5">
        Variables disponibles · click para copiar
      </div>
      <div className="flex flex-wrap gap-1">
        {AVAILABLE_VARS.map(v => (
          <button
            key={v.token}
            onClick={() => copy(v.token)}
            className="group flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-white border border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-300 transition"
            title={`${v.desc} (ej: ${v.sample})`}
          >
            {v.token}
            <Copy className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100" />
          </button>
        ))}
      </div>
    </div>
  );
}
