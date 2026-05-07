import { MessageSquare, Users, AlertCircle, Inbox } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ChatTab = "all" | "dm" | "group" | "attention";

type Counts = { all?: number; dm?: number; group?: number; attention?: number };

const TABS: Array<{ key: ChatTab; icon: LucideIcon; label: string; color: string }> = [
  { key: "all",       icon: Inbox,         label: "Todos",   color: "text-slate-700" },
  { key: "dm",        icon: MessageSquare, label: "Chats",   color: "text-blue-700" },
  { key: "group",     icon: Users,         label: "Grupos",  color: "text-violet-700" },
  { key: "attention", icon: AlertCircle,   label: "Atención", color: "text-amber-700" },
];

type Props = { current: ChatTab; counts?: Counts; onChange: (t: ChatTab) => void };

export function ChatTabs({ current, counts = {}, onChange }: Props) {
  return (
    <div className="flex gap-1 border-b border-slate-200 px-3 py-2 bg-white sticky top-0 z-10">
      {TABS.map(({ key, icon: Icon, label, color }) => {
        const active = current === key;
        const n = counts[key];
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition ${
              active ? `bg-slate-100 ${color}` : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            <Icon size={14} />
            {label}
            {n !== undefined && n > 0 && (
              <span className={`text-[10px] font-semibold px-1.5 rounded ${
                key === "attention" ? "bg-amber-200 text-amber-900" : "bg-slate-200 text-slate-700"
              }`}>
                {n > 999 ? "999+" : n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
