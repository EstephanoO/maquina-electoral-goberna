import type { LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  size?: "sm" | "md" | "lg";
};

const SIZE = {
  sm: { wrap: "py-6 gap-2",  iconBox: "w-10 h-10", icon: "w-5 h-5",  title: "text-sm",  desc: "text-xs" },
  md: { wrap: "py-10 gap-3", iconBox: "w-14 h-14", icon: "w-7 h-7",  title: "text-base", desc: "text-sm" },
  lg: { wrap: "py-16 gap-4", iconBox: "w-20 h-20", icon: "w-10 h-10", title: "text-lg",  desc: "text-sm" },
};

export function EmptyState({ icon: Icon, title, description, action, size = "md" }: Props) {
  const s = SIZE[size];
  return (
    <div className={`flex flex-col items-center justify-center text-center ${s.wrap} animate-fade-in`}>
      <div className={`${s.iconBox} rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 flex items-center justify-center text-slate-400`}>
        <Icon className={s.icon} />
      </div>
      <div>
        <div className={`font-semibold text-slate-700 ${s.title}`}>{title}</div>
        {description && <div className={`text-slate-500 mt-1 max-w-xs ${s.desc}`}>{description}</div>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
