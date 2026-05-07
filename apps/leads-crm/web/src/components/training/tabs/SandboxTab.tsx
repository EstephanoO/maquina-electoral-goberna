import { useState } from "react";
import { Loader2, FlaskConical } from "lucide-react";
import { TextArea } from "../../forms/Field";
import { api } from "../../../api";
import type { ClassifyResult } from "../../../types/training";

const SAMPLE = "Hola, quiero información del Diploma de Gestión Parlamentaria. Puedo pagar por Yape?";

export function SandboxTab() {
  const [text, setText] = useState(SAMPLE);
  const [result, setResult] = useState<ClassifyResult | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    if (!text.trim()) return;
    setRunning(true);
    try { setResult(await api.post<ClassifyResult>("/ai/test-classify", { text })); }
    finally { setRunning(false); }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-sm font-bold text-slate-800 mb-1">Sandbox de clasificación</h2>
      <p className="text-xs text-slate-500 mb-4">
        Pegá un mensaje y ves qué tags aplicarían las reglas activas. No persiste nada — útil para validar antes de publicar reglas nuevas.
      </p>

      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <TextArea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Pegá acá el mensaje a clasificar…" />
        <div className="flex justify-between items-center mt-3">
          <span className="text-[11px] text-slate-500">{text.length} caracteres</span>
          <button
            onClick={run} disabled={running || !text.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#1a3a6b] text-white rounded text-[13px] font-medium hover:bg-[#243d6b] disabled:opacity-50"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
            Clasificar
          </button>
        </div>
      </div>

      {result && <SandboxResult result={result} />}
    </div>
  );
}

function SandboxResult({ result }: { result: ClassifyResult }) {
  return (
    <div className="mt-4 bg-white rounded-lg border border-slate-200 p-5">
      <div className="text-[11px] font-medium text-slate-500 uppercase mb-3">Resultado</div>
      <div className="text-[13px] mb-3">
        <span className="font-semibold">{result.tags.length}</span> tag{result.tags.length !== 1 ? "s" : ""} matchearon
        <span className="text-slate-400"> · {result.rules_checked} reglas revisadas</span>
      </div>

      {result.tags.length === 0 ? (
        <div className="text-[12px] text-slate-400 italic">
          Ninguna regla matcheó. Tocá Reglas y agregá patterns.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {result.tags.map(t => (
              <span key={t} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-[12px] font-medium">{t}</span>
            ))}
          </div>
          <MatchedRulesTable matched={result.matched} />
        </>
      )}
    </div>
  );
}

function MatchedRulesTable({ matched }: { matched: ClassifyResult["matched"] }) {
  return (
    <>
      <div className="text-[11px] font-medium text-slate-500 uppercase mb-2">Reglas que matchearon</div>
      <table className="w-full text-[12px]">
        <thead className="bg-slate-50 text-[10px] text-slate-500 uppercase">
          <tr>
            <th className="px-2 py-1 text-left">Regla</th>
            <th className="px-2 py-1 text-left">Tag</th>
            <th className="px-2 py-1 text-right">Weight</th>
          </tr>
        </thead>
        <tbody>
          {matched.map(m => (
            <tr key={m.rule_id} className="border-t border-slate-100">
              <td className="px-2 py-1.5">{m.rule_name}</td>
              <td className="px-2 py-1.5"><code className="text-blue-600">{m.tag}</code></td>
              <td className="px-2 py-1.5 text-right">{m.weight.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
