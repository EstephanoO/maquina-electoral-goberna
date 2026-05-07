import { useState } from "react";
import { Copy } from "lucide-react";
import { Modal } from "../Modal";
import { useToast } from "../../toast";
import type { BotInstance } from "../../types/config";

type Props = {
  source: BotInstance | null;
  candidates: BotInstance[];
  onClose: () => void;
  onCopy: (targetId: number, fromId: number) => Promise<unknown>;
};

export function CopyConfigDialog({ source, candidates, onClose, onCopy }: Props) {
  const toast = useToast();
  const [targetId, setTargetId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  if (!source) return null;
  const targets = candidates.filter(c => c.id !== source.id);

  async function go() {
    if (!targetId || !source) return;
    setBusy(true);
    try { await onCopy(targetId, source.id); toast(`Copiada de ${source.slug} a destino`, "ok"); onClose(); }
    catch (e: any) { toast(`Error: ${e.message}`, "err"); }
    finally { setBusy(false); }
  }

  const footer = (
    <>
      <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded">
        Cancelar
      </button>
      <button
        onClick={go} disabled={!targetId || busy}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        <Copy size={16} /> {busy ? "Copiando…" : "Copiar configuración"}
      </button>
    </>
  );

  return (
    <Modal open title={`Copiar config de ${source.slug}: ${source.display_name}`} onClose={onClose} footer={footer} maxWidth="max-w-md">
      <p className="text-xs text-slate-500">
        Se copia: agente · firma · productos · cuenta bancaria · yape · prompt extra · reglas asociadas.
        <strong className="block mt-1">No se copia: slug · phone · auto_reply.</strong>
      </p>

      <div className="space-y-2">
        {targets.map(t => (
          <label
            key={t.id}
            className={`flex items-center gap-3 p-3 rounded border cursor-pointer ${
              targetId === t.id ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            <input
              type="radio"
              checked={targetId === t.id}
              onChange={() => setTargetId(t.id)}
            />
            <div className="flex-1">
              <div className="text-sm font-medium">{t.slug} · {t.display_name}</div>
              {t.phone && <div className="text-xs text-slate-500">{t.phone}</div>}
            </div>
          </label>
        ))}
        {targets.length === 0 && (
          <div className="text-xs text-slate-400 italic text-center py-4">
            No hay otras instancias para copiar.
          </div>
        )}
      </div>
    </Modal>
  );
}
