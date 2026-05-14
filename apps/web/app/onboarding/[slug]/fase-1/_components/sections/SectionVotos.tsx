"use client";

import { Plus, Trash2 } from "lucide-react";

import type { ConsultorFormFase2 } from "@/lib/onboarding-api";

import { Field, Select, TextInput, Textarea } from "../form-fields";

type VotosParaGanar = NonNullable<ConsultorFormFase2["votos_para_ganar"]>;
type Historial = NonNullable<ConsultorFormFase2["historial"]>;
type HistorialEntry = NonNullable<Historial["entries"]>[number];

interface Props {
  votos: VotosParaGanar;
  historial: Historial;
  onChangeVotos: (v: VotosParaGanar) => void;
  onChangeHistorial: (v: Historial) => void;
}

/**
 * Sección extendida — aritmética del voto + historial electoral.
 * Alimenta los campos top-level `consultor_form.votos_para_ganar`
 * y `consultor_form.historial`.
 */
export function SectionVotos({
  votos,
  historial,
  onChangeVotos,
  onChangeHistorial,
}: Props) {
  const setVotos = <K extends keyof VotosParaGanar>(k: K, v: VotosParaGanar[K]) =>
    onChangeVotos({ ...votos, [k]: v });

  const setHistorial = <K extends keyof Historial>(k: K, v: Historial[K]) =>
    onChangeHistorial({ ...historial, [k]: v });

  const entries = historial.entries ?? [];

  const updateEntry = <K extends keyof HistorialEntry>(
    i: number,
    k: K,
    v: HistorialEntry[K],
  ) => {
    const next = [...entries];
    next[i] = { ...next[i]!, [k]: v };
    setHistorial("entries", next);
  };

  const addEntry = () => {
    setHistorial("entries", [...entries, { anio: 2021, cargo: "" }]);
  };

  const removeEntry = (i: number) => {
    setHistorial("entries", entries.filter((_, j) => j !== i));
  };

  // Hints derivados de la aritmética
  const padron = votos.padron_actual;
  const meta = votos.votos_meta;
  const ganadorAnterior = votos.votos_ganador_anterior;

  let aritmeticaHint: string | undefined;
  if (padron && meta && padron > 0) {
    const pct = (meta / padron) * 100;
    aritmeticaHint = `Meta = ${pct.toFixed(1)}% del padrón`;
  } else if (ganadorAnterior && meta) {
    const diff = meta - ganadorAnterior;
    const pct = ganadorAnterior > 0 ? (diff / ganadorAnterior) * 100 : 0;
    aritmeticaHint =
      diff > 0
        ? `Necesitás +${diff.toLocaleString("es-PE")} votos (${pct.toFixed(1)}% más)`
        : `Estás ${Math.abs(diff).toLocaleString("es-PE")} votos por debajo del ganador anterior`;
  }

  return (
    <div className="space-y-6">
      {/* ── Aritmética del voto ─────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-amber-400/70">
          Aritmética del voto
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Padrón actual" hint={aritmeticaHint}>
            <TextInput
              type="number"
              value={votos.padron_actual?.toString() ?? ""}
              onChange={(v) =>
                setVotos("padron_actual", v === "" ? undefined : Number(v))
              }
              placeholder="Ej: 250000"
            />
          </Field>
          <Field label="Votos del ganador anterior">
            <TextInput
              type="number"
              value={votos.votos_ganador_anterior?.toString() ?? ""}
              onChange={(v) =>
                setVotos(
                  "votos_ganador_anterior",
                  v === "" ? undefined : Number(v),
                )
              }
              placeholder="Ej: 78000"
            />
          </Field>
          <Field label="Votos meta">
            <TextInput
              type="number"
              value={votos.votos_meta?.toString() ?? ""}
              onChange={(v) =>
                setVotos("votos_meta", v === "" ? undefined : Number(v))
              }
              placeholder="Ej: 95000"
            />
          </Field>
          <Field label="Fuente">
            <TextInput
              value={votos.fuente ?? ""}
              onChange={(v) => setVotos("fuente", v)}
              placeholder="ONPE — Elecciones 2021"
            />
          </Field>
        </div>
      </div>

      {/* ── Historial electoral ─────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-amber-400/70">
          Historial electoral
        </h3>

        <button
          type="button"
          onClick={() =>
            setHistorial("nunca_postulo", !historial.nunca_postulo)
          }
          className={`w-full p-3 rounded-xl border-2 text-left transition-all flex items-center gap-3 ${
            historial.nunca_postulo
              ? "border-amber-400 bg-amber-400/10 text-amber-400"
              : "border-gray-700/50 bg-black/30 text-gray-300 hover:border-gray-600"
          }`}
        >
          <div
            className={`size-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
              historial.nunca_postulo
                ? "border-amber-400 bg-amber-400"
                : "border-gray-600"
            }`}
          >
            {historial.nunca_postulo && (
              <svg
                viewBox="0 0 16 16"
                className="size-3 text-[#0a1e4a]"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              >
                <path d="M3 8.5l3 3 7-7" />
              </svg>
            )}
          </div>
          <span className="text-sm font-semibold">
            Nunca ha postulado a un cargo
          </span>
        </button>

        {!historial.nunca_postulo && (
          <div className="space-y-3">
            {entries.map((entry, i) => (
              <div
                key={i}
                className="bg-[#0a1e4a]/40 border border-white/5 rounded-xl p-4 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field label="Año">
                    <TextInput
                      type="number"
                      value={entry.anio?.toString() ?? ""}
                      onChange={(v) =>
                        updateEntry(i, "anio", v === "" ? 0 : Number(v))
                      }
                      placeholder="2021"
                    />
                  </Field>
                  <Field label="Cargo">
                    <TextInput
                      value={entry.cargo ?? ""}
                      onChange={(v) => updateEntry(i, "cargo", v)}
                      placeholder="Alcalde distrital"
                    />
                  </Field>
                  <Field label="Jurisdicción">
                    <TextInput
                      value={entry.jurisdiccion ?? ""}
                      onChange={(v) => updateEntry(i, "jurisdiccion", v)}
                      placeholder="Lima Norte"
                    />
                  </Field>
                  <Field label="Partido">
                    <TextInput
                      value={entry.partido ?? ""}
                      onChange={(v) => updateEntry(i, "partido", v)}
                      placeholder="Avancemos"
                    />
                  </Field>
                  <Field label="Resultado">
                    <Select
                      value={entry.resultado ?? ""}
                      onChange={(v) => updateEntry(i, "resultado", v)}
                      options={[
                        { value: "Electo", label: "Electo" },
                        { value: "Segundo", label: "Segundo" },
                        { value: "Tercero", label: "Tercero" },
                        { value: "No participó", label: "No participó" },
                      ]}
                    />
                  </Field>
                  <Field label="Votos">
                    <TextInput
                      type="number"
                      value={entry.votos?.toString() ?? ""}
                      onChange={(v) =>
                        updateEntry(
                          i,
                          "votos",
                          v === "" ? undefined : Number(v),
                        )
                      }
                      placeholder="32000"
                    />
                  </Field>
                  <Field label="Porcentaje (%)">
                    <input
                      type="number"
                      step="0.01"
                      value={entry.porcentaje?.toString() ?? ""}
                      onChange={(e) =>
                        updateEntry(
                          i,
                          "porcentaje",
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                        )
                      }
                      placeholder="27.5"
                      className="w-full px-4 py-3 bg-black/40 border-2 border-gray-700/50 rounded-xl text-white placeholder:text-gray-600 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
                    />
                  </Field>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeEntry(i)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-colors text-xs"
                  >
                    <Trash2 className="size-3.5" />
                    Eliminar
                  </button>
                </div>
              </div>
            ))}

            {entries.length === 0 && (
              <p className="text-xs text-gray-600 italic">
                Sin elecciones registradas aún.
              </p>
            )}

            <button
              type="button"
              onClick={addEntry}
              className="w-full py-3 rounded-xl border-2 border-dashed border-gray-700/60 text-gray-600 hover:border-amber-400/40 hover:text-amber-400/70 transition-all flex items-center justify-center gap-2 text-sm"
            >
              <Plus className="size-4" />
              Agregar elección
            </button>

            <Field label="Observaciones">
              <Textarea
                value={historial.observaciones ?? ""}
                onChange={(v) => setHistorial("observaciones", v)}
                placeholder="Notas adicionales sobre el historial electoral..."
                rows={2}
              />
            </Field>
          </div>
        )}
      </div>
    </div>
  );
}
