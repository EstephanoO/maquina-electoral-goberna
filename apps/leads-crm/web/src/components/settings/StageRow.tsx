import { ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { TextInput, Select } from "../forms/Field";
import { STAGE_COLORS, STAGE_GROUPS, type PipelineStage } from "../../types/config";

type Props = {
  stage: PipelineStage;
  onChange: (patch: Partial<PipelineStage>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  isFirst: boolean;
  isLast: boolean;
};

export function StageRow({ stage, onChange, onMoveUp, onMoveDown, onRemove, isFirst, isLast }: Props) {
  return (
    <div className={`flex items-center gap-2 p-3 rounded-lg border ${stage.enabled ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-60"}`}>
      <div className="flex flex-col gap-0.5">
        <button onClick={onMoveUp} disabled={isFirst}
                className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
          <ChevronUp size={14} />
        </button>
        <button onClick={onMoveDown} disabled={isLast}
                className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
          <ChevronDown size={14} />
        </button>
      </div>

      <span className={`px-2 py-1 rounded text-[12px] font-medium ${stage.color}`}>
        {stage.label}
      </span>

      <TextInput
        className="flex-1 text-sm"
        value={stage.label}
        onChange={(e) => onChange({ label: e.target.value })}
        placeholder="Label visible"
      />

      <Select
        className="w-32 text-xs"
        value={stage.color}
        onChange={(e) => onChange({ color: e.target.value })}
      >
        {STAGE_COLORS.map(c => <option key={c} value={c}>{c.replace(/^bg-|-100|-800/g, "")}</option>)}
      </Select>

      <Select
        className="w-24 text-xs"
        value={stage.group_name}
        onChange={(e) => onChange({ group_name: e.target.value })}
      >
        {STAGE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
      </Select>

      <label className="flex items-center gap-1 text-xs text-slate-600">
        <input type="checkbox" checked={stage.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
        On
      </label>

      <button onClick={onRemove} className="p-1 text-red-500 hover:bg-red-50 rounded" title="Quitar">
        <Trash2 size={14} />
      </button>
    </div>
  );
}
