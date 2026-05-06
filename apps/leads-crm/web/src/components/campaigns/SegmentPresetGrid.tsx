import { Crown, Repeat, Award, Clock, Lightbulb, MapPin, Phone, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SegmentPreset } from "../../types/campaign";

const ICON_MAP: Record<string, LucideIcon> = {
  Crown, Repeat, Award, Clock, Lightbulb, MapPin, Phone, Sparkles,
};

type Props = {
  presets: SegmentPreset[];
  selected: SegmentPreset | null;
  onSelect: (p: SegmentPreset) => void;
};

export function SegmentPresetGrid({ presets, selected, onSelect }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {presets.map(p => {
        const Icon = ICON_MAP[p.icon] ?? Sparkles;
        const isActive = selected?.id === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className={`text-left p-3 rounded-lg border transition-all ${
              isActive
                ? "border-blue-400 bg-blue-50 ring-2 ring-blue-100"
                : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
            }`}
          >
            <div className="flex items-start gap-2.5">
              <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
                isActive ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"
              }`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-semibold ${isActive ? "text-blue-900" : "text-slate-800"}`}>
                  {p.name}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{p.description}</div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
