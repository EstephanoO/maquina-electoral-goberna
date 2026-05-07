import type { LucideIcon } from "lucide-react";
import { ClipboardList, BookText, FlaskConical, Inbox } from "lucide-react";
import { cn } from "../../lib/utils";

export type TrainingTab = "rules" | "prompt" | "sandbox" | "extraction";

const TABS: Array<{ key: TrainingTab; icon: LucideIcon; label: string }> = [
  { key: "rules", icon: ClipboardList, label: "Reglas" },
  { key: "prompt", icon: BookText, label: "Prompt IA" },
  { key: "sandbox", icon: FlaskConical, label: "Sandbox" },
  { key: "extraction", icon: Inbox, label: "Extracciones" },
];

type Props = { current: TrainingTab; onChange: (t: TrainingTab) => void };

export function TrainingTabs({ current, onChange }: Props) {
  return (
    <nav className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-1">
      <h1 className="text-base font-bold text-slate-800 mr-6">Entrenamiento del Bot</h1>
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
