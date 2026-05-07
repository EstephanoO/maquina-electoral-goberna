import type { LucideIcon } from "lucide-react";
import { GitBranch, Smartphone, Banknote } from "lucide-react";
import { cn } from "../../lib/utils";

export type SettingsTab = "pipeline" | "instances" | "banks";

const TABS: Array<{ key: SettingsTab; icon: LucideIcon; label: string }> = [
  { key: "pipeline", icon: GitBranch, label: "Embudo" },
  { key: "instances", icon: Smartphone, label: "Instancias del bot" },
  { key: "banks", icon: Banknote, label: "Cuentas bancarias" },
];

type Props = { current: SettingsTab; onChange: (t: SettingsTab) => void };

export function SettingsTabs({ current, onChange }: Props) {
  return (
    <nav className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-1">
      <h1 className="text-base font-bold text-slate-800 mr-6">Configuración</h1>
      {TABS.map(({ key, icon: Icon, label }) => {
        const active = current === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors",
              active ? "bg-[#1a3a6b] text-white" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <Icon className="w-4 h-4" />{label}
          </button>
        );
      })}
    </nav>
  );
}
