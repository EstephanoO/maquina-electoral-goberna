import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { Interaction, Lead } from "../types";
import {
  LeadDetailHeader, PipelineStepper, LeadStatsGrid,
  LeadInfoPanel, LeadTimeline, LeadActionsPanel,
} from "../components/lead";

type Props = { leadId: number; onClose: () => void; onSaved?: (l: Lead) => void; onDeleted?: () => void };

export function LeadDetail({ leadId, onClose, onSaved, onDeleted }: Props) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    try {
      const [l, ints] = await Promise.all([
        api.getLead(leadId),
        api.listInteractions(leadId),
      ]);
      setLead(l); setInteractions(ints);
    } catch (e: any) { setError(e.message); }
  }

  useEffect(() => { void reload(); }, [leadId]);

  async function changeStage(stage: string) {
    if (!lead) return;
    const updated = await api.updateLead(lead.id, { stage } as any);
    setLead(updated); onSaved?.(updated);
  }

  async function deleteLead() {
    if (!lead || !confirm("¿Eliminar este lead?")) return;
    await api.deleteLead(lead.id);
    onDeleted?.();
  }

  // Stage history from interactions (kind=stage_change, meta.to_stage)
  const stageHistory = useMemo(() => {
    return interactions
      .filter(i => i.kind === "stage_change" && (i.meta as any)?.to_stage)
      .map(i => ({ stage: (i.meta as any).to_stage as string, at: i.created_at }))
      .reverse();  // chronological
  }, [interactions]);

  if (error)   return <Drawer onClose={onClose}><div className="p-6 text-red-500">{error}</div></Drawer>;
  if (!lead)   return <Drawer onClose={onClose}><div className="p-6 text-slate-400">Cargando…</div></Drawer>;

  return (
    <Drawer onClose={onClose}>
      <LeadDetailHeader lead={lead as any} onClose={onClose} />

      <div className="p-5 space-y-4">
        <LeadStatsGrid lead={lead as any} />
        <div className="card p-4">
          <PipelineStepper current={lead.stage} onChange={changeStage} history={stageHistory} />
        </div>
        <LeadInfoPanel lead={lead as any} />
        <LeadActionsPanel lead={lead as any} onChange={reload} onDelete={deleteLead} />
        <LeadTimeline interactions={interactions} />
      </div>
    </Drawer>
  );
}

function Drawer({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex" onClick={onClose}>
      <div
        className="ml-auto bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
