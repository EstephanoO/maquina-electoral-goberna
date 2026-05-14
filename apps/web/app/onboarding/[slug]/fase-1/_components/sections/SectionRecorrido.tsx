"use client";

import { Plus, Trash2 } from "lucide-react";

import type { ConsultorFormFase2 } from "@/lib/onboarding-api";

import { Field, TextInput, Textarea } from "../form-fields";

type RecorridoEstrategico = NonNullable<
  ConsultorFormFase2["recorrido_estrategico"]
>;
type Hito = NonNullable<RecorridoEstrategico["hitos"]>[number];
type FormulaElectoral = NonNullable<ConsultorFormFase2["formula_electoral"]>;

interface Props {
  recorrido: RecorridoEstrategico;
  formula: FormulaElectoral;
  onChangeRecorrido: (v: RecorridoEstrategico) => void;
  onChangeFormula: (v: FormulaElectoral) => void;
}

/**
 * Sección extendida — recorrido estratégico (hitos) + fórmula electoral
 * (presupuesto + pesos Aire/Mar/Tierra). Alimenta los campos top-level
 * `consultor_form.recorrido_estrategico` y `consultor_form.formula_electoral`.
 */
export function SectionRecorrido({
  recorrido,
  formula,
  onChangeRecorrido,
  onChangeFormula,
}: Props) {
  const hitos = recorrido.hitos ?? [];

  const updateHito = <K extends keyof Hito>(i: number, k: K, v: Hito[K]) => {
    const next = [...hitos];
    next[i] = { ...next[i]!, [k]: v };
    onChangeRecorrido({ ...recorrido, hitos: next });
  };

  const addHito = () => {
    const n = hitos.length + 1;
    onChangeRecorrido({
      ...recorrido,
      hitos: [...hitos, { key: `paso-${n}`, titulo: "" }],
    });
  };

  const removeHito = (i: number) => {
    onChangeRecorrido({
      ...recorrido,
      hitos: hitos.filter((_, j) => j !== i),
    });
  };

  const setFormula = <K extends keyof FormulaElectoral>(
    k: K,
    v: FormulaElectoral[K],
  ) => onChangeFormula({ ...formula, [k]: v });

  const pesoAire = formula.peso_aire ?? 0;
  const pesoMar = formula.peso_mar ?? 0;
  const pesoTierra = formula.peso_tierra ?? 0;
  const sumaPesos = pesoAire + pesoMar + pesoTierra;
  const pesosBalanceados = sumaPesos === 100;
  const pesosHint =
    sumaPesos === 0
      ? undefined
      : pesosBalanceados
        ? "✓ Pesos balanceados"
        : `⚠ Los pesos suman ${sumaPesos}% — ajustá para totalizar 100`;

  return (
    <div className="space-y-8">
      {/* ── Hitos estratégicos ────────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-amber-400/70">
            Hitos estratégicos
          </h3>
          <p className="mt-1 text-[11px] text-gray-500">
            3 pasos que se renderizan en la slide &ldquo;Cómo reorganizar el
            voto&rdquo;
          </p>
        </div>

        <div className="space-y-3">
          {hitos.map((h, i) => (
            <div
              key={i}
              className="bg-[#0a1e4a]/40 border border-white/5 rounded-xl p-4 space-y-3"
            >
              <div className="flex items-center gap-3">
                <span className="size-7 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-400 font-black text-xs flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </span>
                <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-semibold">
                  Paso {i + 1}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Key / ID interno">
                  <TextInput
                    value={h.key}
                    onChange={(v) => updateHito(i, "key", v)}
                    placeholder="paso-1"
                  />
                </Field>
                <Field label="Fecha (opcional)">
                  <TextInput
                    type="date"
                    value={h.fecha ?? ""}
                    onChange={(v) => updateHito(i, "fecha", v)}
                  />
                </Field>
              </div>

              <Field label="Título">
                <TextInput
                  value={h.titulo}
                  onChange={(v) => updateHito(i, "titulo", v)}
                  placeholder="Reunificar el voto castillista"
                />
              </Field>

              <Field label="Descripción">
                <Textarea
                  value={h.descripcion ?? ""}
                  onChange={(v) => updateHito(i, "descripcion", v)}
                  placeholder="Qué se hace en este hito, con qué recursos, contra quién..."
                  rows={3}
                />
              </Field>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => removeHito(i)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-colors text-xs"
                >
                  <Trash2 className="size-3.5" />
                  Eliminar hito
                </button>
              </div>
            </div>
          ))}

          {hitos.length === 0 && (
            <p className="text-xs text-gray-600 italic">
              Sin hitos registrados aún.
            </p>
          )}

          <button
            type="button"
            onClick={addHito}
            className="w-full py-3 rounded-xl border-2 border-dashed border-gray-700/60 text-gray-600 hover:border-amber-400/40 hover:text-amber-400/70 transition-all flex items-center justify-center gap-2 text-sm"
          >
            <Plus className="size-4" />
            Agregar hito (PASO {hitos.length + 1})
          </button>
        </div>
      </div>

      {/* ── Fórmula electoral ─────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-amber-400/70">
          Fórmula electoral (presupuesto + pesos)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Presupuesto total (S/.)">
            <TextInput
              type="number"
              value={formula.presupuesto_total?.toString() ?? ""}
              onChange={(v) =>
                setFormula(
                  "presupuesto_total",
                  v === "" ? undefined : Number(v),
                )
              }
              placeholder="500000"
            />
          </Field>

          <Field label="Peso Aire (%)" hint={pesosHint}>
            <input
              type="number"
              step="1"
              min={0}
              max={100}
              value={formula.peso_aire?.toString() ?? ""}
              onChange={(e) =>
                setFormula(
                  "peso_aire",
                  e.target.value === "" ? undefined : Number(e.target.value),
                )
              }
              placeholder="35"
              className="w-full px-4 py-3 bg-black/40 border-2 border-gray-700/50 rounded-xl text-white placeholder:text-gray-600 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
            />
          </Field>

          <Field label="Peso Tierra (%)">
            <input
              type="number"
              step="1"
              min={0}
              max={100}
              value={formula.peso_tierra?.toString() ?? ""}
              onChange={(e) =>
                setFormula(
                  "peso_tierra",
                  e.target.value === "" ? undefined : Number(e.target.value),
                )
              }
              placeholder="50"
              className="w-full px-4 py-3 bg-black/40 border-2 border-gray-700/50 rounded-xl text-white placeholder:text-gray-600 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
            />
          </Field>

          <Field label="Peso Mar (%)">
            <input
              type="number"
              step="1"
              min={0}
              max={100}
              value={formula.peso_mar?.toString() ?? ""}
              onChange={(e) =>
                setFormula(
                  "peso_mar",
                  e.target.value === "" ? undefined : Number(e.target.value),
                )
              }
              placeholder="15"
              className="w-full px-4 py-3 bg-black/40 border-2 border-gray-700/50 rounded-xl text-white placeholder:text-gray-600 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
            />
          </Field>
        </div>

        <Field label="Justificación">
          <Textarea
            value={formula.justificacion ?? ""}
            onChange={(v) => setFormula("justificacion", v)}
            placeholder="Por qué este reparto Aire/Mar/Tierra y este presupuesto..."
            rows={4}
          />
        </Field>
      </div>
    </div>
  );
}
