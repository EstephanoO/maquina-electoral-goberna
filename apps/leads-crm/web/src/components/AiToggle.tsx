import { useState, useEffect } from "react";
import { api } from "../api";
import { cn } from "../lib/utils";
import { Loader, Zap, ZapOff } from "lucide-react";

type AiToggleProps = {
  leadId: number;
  isLineReady: boolean;
  onAutoModeChange: (enabled: boolean) => void;
};

export function AiToggle({ leadId, isLineReady, onAutoModeChange }: AiToggleProps) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!leadId) return;
    setLoading(true);
    api.getSetting<boolean>(`ai_auto_${leadId}`)
      .then((val) => { const on = val ?? false; setEnabled(on); onAutoModeChange(on); })
      .catch(() => { setEnabled(false); onAutoModeChange(false); })
      .finally(() => setLoading(false));
  }, [leadId]);

  async function toggle() {
    if (!isLineReady || saving) return;
    const next = !enabled;
    setSaving(true);
    try {
      await api.setSetting(`ai_auto_${leadId}`, next);
      setEnabled(next);
      onAutoModeChange(next);
    } catch { /* ignore */ }
    setSaving(false);
  }

  if (loading) {
    return (
      <button disabled className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-slate-100 text-slate-400 text-[11px]">
        <Loader className="w-3 h-3 animate-spin" />
        IA...
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={!isLineReady}
      title={enabled ? "Desactivar auto-respuestas IA" : "Activar auto-respuestas IA"}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-semibold transition-all border",
        !isLineReady
          ? "opacity-30 cursor-not-allowed bg-slate-100 text-slate-400 border-slate-200"
          : enabled
            ? "bg-[#1B365D] text-white border-[#1B365D] hover:bg-[#2A4A7A]"
            : "bg-white text-slate-500 border-slate-200 hover:bg-[#FAF6EB] hover:text-[#9A7B2A] hover:border-[#C8A951]"
      )}
    >
      {enabled ? <Zap className="w-3.5 h-3.5" /> : <ZapOff className="w-3.5 h-3.5" />}
      {enabled ? "IA Auto ON" : "IA Auto OFF"}
    </button>
  );
}

export function AiStatusBadge({ autoMode }: { autoMode: boolean }) {
  if (!autoMode) return null;
  return (
    <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      <span className="text-[10px] font-bold text-emerald-600">AUTO IA</span>
    </div>
  );
}
