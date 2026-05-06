import { useEffect, useState } from "react";
import { api } from "../api";
import { humanizeDays } from "../lib";
import { STAGE_LABELS, STAGES, type Lead, type Stage } from "../types";

type Props = { onOpenLead: (id: number) => void; refreshKey?: number };

export function Kanban({ onOpenLead, refreshKey }: Props) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      setLeads(await api.listLeads());
      setError(null);
    } catch {
      setError("No se pudo conectar al backend");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [refreshKey]);

  async function moveLead(id: number, stage: Stage) {
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.stage === stage) return;
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, stage } : l));
    try {
      await api.updateLead(id, { stage });
    } catch {
      load();
    }
  }

  if (loading && leads.length === 0) return <div className="empty">Cargando…</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="kanban">
      {STAGES.map((stage) => {
        const items = leads.filter((l) => l.stage === stage);
        return (
          <div
            key={stage}
            className="kb-col"
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              const id = Number(e.dataTransfer.getData("text/plain"));
              if (id) moveLead(id, stage);
              setDraggingId(null);
            }}
          >
            <div className={`kb-col-header kb-h-${stage}`}>
              <span>{STAGE_LABELS[stage]}</span>
              <span className="kb-count">{items.length}</span>
            </div>
            <div className="kb-col-body">
              {items.length === 0 && <div className="kb-empty">Sin leads</div>}
              {items.map((l) => (
                <div
                  key={l.id}
                  className={`kb-card ${draggingId === l.id ? "dragging" : ""}`}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(l.id)); setDraggingId(l.id); }}
                  onDragEnd={() => setDraggingId(null)}
                  onClick={() => onOpenLead(l.id)}
                >
                  <div className="kb-card-name">{l.name}</div>
                  {l.phone && <div className="kb-card-phone">{l.phone}</div>}
                  <div className="kb-card-meta">
                    {[l.course, l.level && `N${l.level}`, l.last_purchase_year].filter(Boolean).join(" · ") || "—"}
                  </div>
                  <div className="kb-card-signals">
                    <span className="kb-signal">⏱ {humanizeDays(l.days_since_contact ?? null)}</span>
                    {l.was_previously_interested && (
                      <span className="kb-signal kb-signal-alert" title="Fue Interesado antes pero no cerró">⚠ Re-engage</span>
                    )}
                  </div>
                  {l.tags.length > 0 && (
                    <div className="kb-card-tags">
                      {l.tags.slice(0, 3).map((t) => <span key={t} className="tag-mini">{t}</span>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
