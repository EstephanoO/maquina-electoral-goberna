import { Play, Pause, X, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { useCampaigns } from "../../hooks/useCampaigns";
import { Button, EmptyState } from "../ui";
import type { CampaignProgress } from "../../types/campaign";
import { formatRelative } from "../../lib/utils";

const STATUS_STYLE: Record<string, string> = {
  draft:     "bg-slate-100 text-slate-700",
  scheduled: "bg-blue-100 text-blue-700",
  running:   "bg-emerald-100 text-emerald-700 animate-pulse",
  paused:    "bg-amber-100 text-amber-700",
  completed: "bg-slate-100 text-slate-500",
  cancelled: "bg-red-50 text-red-600",
};

export function CampaignList() {
  const { list, launch, pause, cancel } = useCampaigns();

  if (list.isLoading) return <div className="text-xs text-slate-400 py-6 text-center">Cargando…</div>;
  if (!list.data || list.data.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="Sin campañas todavía"
        description="Crea tu primera campaña arriba para reactivar antiguos compradores."
      />
    );
  }

  return (
    <div className="space-y-2">
      {list.data.map(c => <Row key={c.id} c={c}
        onLaunch={() => launch.mutateAsync(c.id)}
        onPause={() => pause.mutateAsync(c.id)}
        onCancel={() => { if (confirm(`Cancelar "${c.name}"?`)) cancel.mutateAsync(c.id); }}
      />)}
    </div>
  );
}

function Row({ c, onLaunch, onPause, onCancel }: {
  c: CampaignProgress;
  onLaunch: () => void;
  onPause: () => void;
  onCancel: () => void;
}) {
  const pct = Number(c.pct_sent);

  return (
    <article className="card p-4">
      <header className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-slate-800 truncate">{c.name}</h4>
            <span className={`badge ${STATUS_STYLE[c.status] ?? STATUS_STYLE.draft}`}>{c.status}</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {c.total_recipients} destinatarios · creada {formatRelative(c.created_at)}
            {c.started_at && ` · iniciada ${formatRelative(c.started_at)}`}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          {c.status === "draft" || c.status === "paused" ? (
            <Button size="sm" leftIcon={<Play className="w-3.5 h-3.5" />} onClick={onLaunch}>
              Lanzar
            </Button>
          ) : c.status === "running" ? (
            <Button size="sm" variant="secondary" leftIcon={<Pause className="w-3.5 h-3.5" />} onClick={onPause}>
              Pausar
            </Button>
          ) : null}
          {c.status !== "completed" && c.status !== "cancelled" && (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </header>

      {c.total_recipients > 0 && (
        <div className="mt-2">
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                c.status === "completed" ? "bg-emerald-500" :
                c.status === "running"   ? "bg-blue-500 animate-pulse" :
                                           "bg-slate-300"
              }`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-500">
            <span>
              {c.sent_count} enviados · {c.failed_count > 0 && `${c.failed_count} fallos · `}
              {pct}%
            </span>
            <span className="flex items-center gap-2">
              {c.replied_count > 0 && <span>💬 {c.replied_count} respuestas ({c.reply_rate_pct}%)</span>}
              {c.converted_count > 0 && <span className="text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {c.converted_count} compras</span>}
            </span>
          </div>
        </div>
      )}
    </article>
  );
}
