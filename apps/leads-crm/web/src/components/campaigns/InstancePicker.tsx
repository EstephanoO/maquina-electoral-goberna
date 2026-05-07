import { Phone, Power, AlertCircle, Crown } from "lucide-react";
import { useBotInstances } from "../../hooks/useConfig";
import { Avatar } from "../ui";

type Props = {
  value: number | null;
  onChange: (id: number | null) => void;
};

export function InstancePicker({ value, onChange }: Props) {
  const { instances, loading } = useBotInstances();
  if (loading) return <div className="text-xs text-slate-400 py-3">Cargando instancias…</div>;

  const enabled = instances.filter(i => i.enabled);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {enabled.map(inst => {
        const active = value === inst.id;
        const recommended = inst.auto_reply;
        return (
          <button
            key={inst.id}
            onClick={() => onChange(inst.id)}
            className={`relative text-left p-3 rounded-lg border transition-all ${
              active
                ? "border-blue-400 bg-blue-50 ring-2 ring-blue-100"
                : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
            }`}
          >
            {recommended && (
              <span className="absolute -top-2 -right-2 badge bg-amber-100 text-amber-700 border border-amber-300">
                <Crown size={9} fill="currentColor" /> activo
              </span>
            )}
            <div className="flex items-start gap-2 mb-2">
              <Avatar name={inst.agent_name} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-mono px-1.5 bg-slate-100 text-slate-700 rounded uppercase">{inst.slug}</span>
                  <span className={`text-sm font-semibold truncate ${active ? "text-blue-900" : "text-slate-800"}`}>
                    {inst.agent_name}
                  </span>
                </div>
                {inst.phone && (
                  <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                    <Phone size={9} /> {inst.phone}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className={`flex items-center gap-1 ${inst.auto_reply ? "text-emerald-700" : "text-slate-400"}`}>
                <Power size={10} /> auto-reply {inst.auto_reply ? "ON" : "OFF"}
              </span>
              {!inst.phone && (
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertCircle size={10} /> sin phone
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
