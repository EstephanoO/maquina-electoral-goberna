import { ArrowRight, type LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  iconColor: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  onCtaClick: () => void;
  empty?: string | null;
  children?: React.ReactNode;
};

export function ConfigCard({ icon: Icon, iconColor, title, subtitle, ctaLabel, onCtaClick, empty, children }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col">
      <header className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconColor}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="font-semibold text-slate-900">{title}</div>
          <div className="text-xs text-slate-500">{subtitle}</div>
        </div>
      </header>

      <div className="flex-1">
        {empty ? <div className="text-xs text-slate-400 italic py-4 text-center">{empty}</div> : children}
      </div>

      <button
        onClick={onCtaClick}
        className="mt-3 flex items-center justify-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 py-2 rounded-lg border border-slate-200 transition"
      >
        {ctaLabel} <ArrowRight size={12} />
      </button>
    </div>
  );
}
