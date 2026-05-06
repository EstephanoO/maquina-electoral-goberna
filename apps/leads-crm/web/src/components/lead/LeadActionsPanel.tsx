import { useState } from "react";
import { AlertCircle, Check, MessageSquarePlus, Trash2 } from "lucide-react";
import { api } from "../../api";
import { useToast } from "../../toast";
import { TextArea } from "../forms/Field";
import type { Lead } from "../../types";

type LeadExt = Lead & { needs_human_attention?: boolean };

type Props = {
  lead: LeadExt;
  onChange: () => void;
  onDelete: () => void;
};

export function LeadActionsPanel({ lead, onChange, onDelete }: Props) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function flagAttention() {
    setBusy("flag");
    try {
      await api.post(`/leads/${lead.id}/flag-attention`, { reason: "manual_flag_by_operator" });
      toast("Marcado para atención", "ok"); onChange();
    } catch (e: any) { toast(`Error: ${e.message}`, "err"); }
    finally { setBusy(null); }
  }
  async function resolveAttention() {
    setBusy("resolve");
    try {
      await api.post(`/leads/${lead.id}/resolve-attention`);
      toast("Atención resuelta", "ok"); onChange();
    } catch (e: any) { toast(`Error: ${e.message}`, "err"); }
    finally { setBusy(null); }
  }
  async function addNote() {
    if (!note.trim()) return;
    setBusy("note");
    try {
      await api.post(`/leads/${lead.id}/interactions`, { kind: "note", body: note });
      setNote(""); toast("Nota agregada", "ok"); onChange();
    } catch (e: any) { toast(`Error: ${e.message}`, "err"); }
    finally { setBusy(null); }
  }

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Acciones</div>

      <div className="flex flex-wrap gap-2">
        {lead.needs_human_attention ? (
          <button onClick={resolveAttention} disabled={busy === "resolve"}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded">
            <Check size={14} /> Resolver atención
          </button>
        ) : (
          <button onClick={flagAttention} disabled={busy === "flag"}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-100 text-amber-800 hover:bg-amber-200 rounded">
            <AlertCircle size={14} /> Marcar para atención
          </button>
        )}
        <button onClick={onDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded ml-auto">
          <Trash2 size={14} /> Eliminar
        </button>
      </div>

      <div className="space-y-2">
        <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-medium">Agregar nota</label>
        <TextArea
          value={note} onChange={(e) => setNote(e.target.value)}
          rows={2} placeholder="Anotá lo que sea relevante…"
        />
        <button onClick={addNote} disabled={!note.trim() || busy === "note"}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-700 text-white hover:bg-slate-800 rounded disabled:opacity-50">
          <MessageSquarePlus size={14} /> Guardar nota
        </button>
      </div>
    </section>
  );
}
