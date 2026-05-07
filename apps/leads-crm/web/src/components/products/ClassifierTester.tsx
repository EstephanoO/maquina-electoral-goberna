import { useState } from "react";
import { TextInput } from "../forms/Field";
import { validateRegex } from "../../hooks/useProducts";
import { useToast } from "../../toast";

type Props = { pattern: string | null | undefined; tag: string | null | undefined };

export function ClassifierTester({ pattern, tag }: Props) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ matched: boolean } | null>(null);

  if (!pattern) return null;

  function run() {
    const err = validateRegex(pattern);
    if (err) { toast(`Regex roto: ${err}`, "err"); return; }
    setResult({ matched: new RegExp(pattern!, "i").test(text) });
  }

  return (
    <div className="mt-3 bg-slate-50 rounded p-3">
      <div className="text-xs font-medium text-slate-600 mb-2">Probar contra mensaje:</div>
      <div className="flex gap-2">
        <TextInput
          className="flex-1 text-xs"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Hola, quisiera info del Diploma de Gestión Parlamentaria"
        />
        <button onClick={run} className="px-3 py-1 bg-slate-700 text-white rounded text-xs hover:bg-slate-800">
          Probar
        </button>
      </div>
      {result && (
        <div className={`mt-2 text-xs flex items-center gap-2 ${result.matched ? "text-green-700" : "text-red-700"}`}>
          {result.matched ? "✓ Match — aplicaría" : "✗ No match"}
          {result.matched && tag && (
            <span className="font-mono bg-white px-2 py-0.5 rounded border">{tag}</span>
          )}
        </div>
      )}
    </div>
  );
}
