import { useState } from "react";
import { Check, X, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import type { ExtractionCandidate } from "../../hooks/useExtractionCandidates";
import { cn } from "../../lib/utils";

type Props = {
  c: ExtractionCandidate;
  onApprove: (c: ExtractionCandidate, value: string) => Promise<void>;
  onReject: (c: ExtractionCandidate, reason?: string) => Promise<void>;
};

const KIND_LABEL: Record<string, string> = {
  price: "Precio",
  bank_account: "Cuenta bancaria",
  yape: "Yape",
  image_url: "Imagen / link",
  product_name: "Producto",
  phone_other: "Teléfono",
  whatsapp_link: "Link WhatsApp",
};

export function ExtractionCandidateRow({ c, onApprove, onReject }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(c.value_raw);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const target = c.suggested_target?.type ?? "—";
  const targetDisplay = target === "—"
    ? <span className="text-slate-400 italic">sin destino sugerido</span>
    : <code className="text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">{target}</code>;

  async function approve() {
    setBusy("approve");
    try { await onApprove(c, editing ? editValue : c.value_raw); }
    finally { setBusy(null); setEditing(false); }
  }

  async function reject() {
    setBusy("reject");
    try { await onReject(c); }
    finally { setBusy(null); }
  }

  return (
    <>
      <tr className={cn("border-b border-slate-100 hover:bg-slate-50", c.status !== "pending" && "opacity-60")}>
        <td className="px-3 py-2 align-top">
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-slate-400 hover:text-slate-600"
            aria-label={expanded ? "Colapsar" : "Expandir"}
          >
            {expanded ? <ChevronDown className="w-4 h-4"/> : <ChevronRight className="w-4 h-4"/>}
          </button>
        </td>
        <td className="px-3 py-2 align-top">
          <span className="text-[11px] uppercase tracking-wide text-slate-500">
            {KIND_LABEL[c.kind] ?? c.kind}
          </span>
        </td>
        <td className="px-3 py-2 align-top">
          {editing ? (
            <input
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              className="w-full px-2 py-1 border border-slate-300 rounded text-[13px] font-mono"
              autoFocus
            />
          ) : (
            <button onClick={() => setEditing(true)} className="text-left font-mono text-[13px] hover:underline">
              {c.value_raw}
            </button>
          )}
        </td>
        <td className="px-3 py-2 align-top text-right tabular-nums text-[12px] text-slate-600">
          {c.occurrences}× · {Math.round(c.confidence * 100)}%
        </td>
        <td className="px-3 py-2 align-top">
          {targetDisplay}
        </td>
        <td className="px-3 py-2 align-top text-right whitespace-nowrap">
          {c.status === "pending" ? (
            <div className="flex items-center gap-1 justify-end">
              <button
                onClick={approve}
                disabled={busy !== null}
                className="flex items-center gap-1 px-2 py-1 bg-emerald-600 text-white rounded text-[12px] hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy === "approve" ? <Loader2 className="w-3 h-3 animate-spin"/> : <Check className="w-3 h-3"/>}
                Aprobar
              </button>
              <button
                onClick={reject}
                disabled={busy !== null}
                className="flex items-center gap-1 px-2 py-1 border border-slate-300 text-slate-700 rounded text-[12px] hover:bg-slate-100 disabled:opacity-50"
              >
                {busy === "reject" ? <Loader2 className="w-3 h-3 animate-spin"/> : <X className="w-3 h-3"/>}
                Rechazar
              </button>
            </div>
          ) : (
            <span className="text-[11px] text-slate-500 capitalize">{c.status}</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50/60 border-b border-slate-100">
          <td></td>
          <td colSpan={5} className="px-3 py-2 text-[12px] text-slate-600 space-y-1">
            <div>
              <span className="font-medium">Normalizado: </span>
              <code className="text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">{c.value_normalized}</code>
            </div>
            {c.value_meta && Object.keys(c.value_meta).length > 0 && (
              <div>
                <span className="font-medium">Meta: </span>
                <code className="text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">{JSON.stringify(c.value_meta)}</code>
              </div>
            )}
            {c.sample_texts.length > 0 && (
              <div>
                <div className="font-medium mb-1">Muestras del operador:</div>
                <ul className="space-y-1 pl-4">
                  {c.sample_texts.map((t, i) => (
                    <li key={i} className="text-[12px] text-slate-700 border-l-2 border-slate-300 pl-2 italic">
                      {t.length > 240 ? `${t.slice(0, 240)}…` : t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
