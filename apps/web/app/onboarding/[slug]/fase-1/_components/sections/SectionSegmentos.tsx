"use client";

import { Plus, Trash2 } from "lucide-react";

import type { C2Segmento, TerritoryEcd } from "@/lib/onboarding-api";

import { Field, TagList, TextInput, Textarea } from "../form-fields";

type NucleoGoberna = NonNullable<TerritoryEcd["nucleo_goberna"]>;
type SegmentoPrioritario = NonNullable<
  NucleoGoberna["segmentos_prioritarios"]
>[number];

interface Props {
  data: TerritoryEcd;
  onChange: (v: TerritoryEcd) => void;
}

/**
 * Sección extendida — segmentos del electorado + segmentos prioritarios
 * (núcleo Goberna). Alimenta un subset de `consultor_form.territorio_ecd`:
 * `c2_segmentos` y `nucleo_goberna.segmentos_prioritarios`.
 */
export function SectionSegmentos({ data, onChange }: Props) {
  const segmentos = data.c2_segmentos ?? [];
  const nucleo = data.nucleo_goberna ?? {};
  const prioritarios = nucleo.segmentos_prioritarios ?? [];

  // ── Mutaciones c2_segmentos ─────────────────────────────────────
  const updateSegmento = <K extends keyof C2Segmento>(
    i: number,
    k: K,
    v: C2Segmento[K],
  ) => {
    const next = [...segmentos];
    next[i] = { ...next[i]!, [k]: v };
    onChange({ ...data, c2_segmentos: next });
  };

  const addSegmento = () => {
    onChange({
      ...data,
      c2_segmentos: [
        ...segmentos,
        {
          id: "",
          nombre: "",
          valores: [],
          aspiraciones: [],
          temores: [],
        },
      ],
    });
  };

  const removeSegmento = (i: number) => {
    const seg = segmentos[i];
    const next = segmentos.filter((_, j) => j !== i);
    // Limpiar prioritario asociado si existía
    const nextPrioritarios = seg?.id
      ? prioritarios.filter((p) => p.segmento_id !== seg.id)
      : prioritarios;
    onChange({
      ...data,
      c2_segmentos: next,
      nucleo_goberna: { ...nucleo, segmentos_prioritarios: nextPrioritarios },
    });
  };

  // ── Mutaciones segmentos_prioritarios ───────────────────────────
  const updatePrioritario = <K extends keyof SegmentoPrioritario>(
    segmentoId: string,
    k: K,
    v: SegmentoPrioritario[K],
  ) => {
    const idx = prioritarios.findIndex((p) => p.segmento_id === segmentoId);
    let next: SegmentoPrioritario[];
    if (idx === -1) {
      next = [...prioritarios, { segmento_id: segmentoId, [k]: v } as SegmentoPrioritario];
    } else {
      next = [...prioritarios];
      next[idx] = { ...next[idx]!, [k]: v };
    }
    onChange({
      ...data,
      nucleo_goberna: { ...nucleo, segmentos_prioritarios: next },
    });
  };

  const getPrioritario = (segmentoId: string): SegmentoPrioritario =>
    prioritarios.find((p) => p.segmento_id === segmentoId) ?? {
      segmento_id: segmentoId,
    };

  const segmentosConId = segmentos.filter((s) => s.id.trim() !== "");

  return (
    <div className="space-y-8">
      {/* ── Segmentos del electorado ──────────────────────────── */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-amber-400/70">
          Segmentos del electorado
        </h3>

        <div className="space-y-4">
          {segmentos.map((seg, i) => (
            <div
              key={i}
              className="bg-[#0a1e4a]/40 border border-white/5 rounded-xl p-4 space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="ID (slug)">
                  <TextInput
                    value={seg.id}
                    onChange={(v) => updateSegmento(i, "id", v)}
                    placeholder="base, indecisos, jovenes..."
                  />
                </Field>
                <Field label="Nombre">
                  <TextInput
                    value={seg.nombre}
                    onChange={(v) => updateSegmento(i, "nombre", v)}
                    placeholder="Base dura castillista"
                  />
                </Field>
              </div>

              <Field label="% aproximado del electorado">
                <input
                  type="number"
                  step="0.1"
                  max={100}
                  min={0}
                  value={seg.pct_aprox?.toString() ?? ""}
                  onChange={(e) =>
                    updateSegmento(
                      i,
                      "pct_aprox",
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value),
                    )
                  }
                  placeholder="25.5"
                  className="w-full px-4 py-3 bg-black/40 border-2 border-gray-700/50 rounded-xl text-white placeholder:text-gray-600 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
                />
              </Field>

              <Field label="Valores clave">
                <TagList
                  items={seg.valores ?? []}
                  onChange={(v) => updateSegmento(i, "valores", v)}
                  placeholder="Agregar valor..."
                />
              </Field>

              <Field label="Aspiraciones">
                <TagList
                  items={seg.aspiraciones ?? []}
                  onChange={(v) => updateSegmento(i, "aspiraciones", v)}
                  placeholder="Agregar aspiración..."
                />
              </Field>

              <Field label="Temores">
                <TagList
                  items={seg.temores ?? []}
                  onChange={(v) => updateSegmento(i, "temores", v)}
                  placeholder="Agregar temor..."
                />
              </Field>

              <Field label="Problema principal">
                <Textarea
                  value={seg.problema_principal ?? ""}
                  onChange={(v) => updateSegmento(i, "problema_principal", v)}
                  placeholder="Cuál es el dolor central de este segmento..."
                  rows={2}
                />
              </Field>

              <Field label="Medio de información preferido">
                <TextInput
                  value={seg.medio_info_preferido ?? ""}
                  onChange={(v) =>
                    updateSegmento(i, "medio_info_preferido", v)
                  }
                  placeholder="TikTok, radio local, voz a voz..."
                />
              </Field>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => removeSegmento(i)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-colors text-xs"
                >
                  <Trash2 className="size-3.5" />
                  Eliminar segmento
                </button>
              </div>
            </div>
          ))}

          {segmentos.length === 0 && (
            <p className="text-xs text-gray-600 italic">
              Sin segmentos registrados aún.
            </p>
          )}

          <button
            type="button"
            onClick={addSegmento}
            className="w-full py-3 rounded-xl border-2 border-dashed border-gray-700/60 text-gray-600 hover:border-amber-400/40 hover:text-amber-400/70 transition-all flex items-center justify-center gap-2 text-sm"
          >
            <Plus className="size-4" />
            Agregar segmento
          </button>
        </div>
      </div>

      {/* ── Segmentos prioritarios (núcleo Goberna) ──────────── */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-amber-400/70">
          Segmentos prioritarios (núcleo Goberna)
        </h3>

        {segmentosConId.length === 0 && (
          <p className="text-xs text-gray-600 italic">
            Agregá segmentos con ID arriba para definir su tratamiento prioritario.
          </p>
        )}

        <div className="space-y-4">
          {segmentosConId.map((seg) => {
            const p = getPrioritario(seg.id);
            return (
              <div
                key={seg.id}
                className="bg-[#0a1e4a]/40 border border-white/5 rounded-xl p-4 space-y-4"
              >
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-amber-400/15 border border-amber-400/30 text-amber-400 text-[10px] uppercase tracking-wider font-bold">
                    {seg.id}
                  </span>
                  <span className="text-sm font-semibold text-gray-200">
                    {seg.nombre || "(sin nombre)"}
                  </span>
                </div>

                <Field label="Mensaje central">
                  <TextInput
                    value={p.mensaje_central ?? ""}
                    onChange={(v) =>
                      updatePrioritario(seg.id, "mensaje_central", v)
                    }
                    placeholder="La idea-fuerza para este segmento..."
                  />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Canal principal">
                    <TextInput
                      value={p.canal_principal ?? ""}
                      onChange={(v) =>
                        updatePrioritario(seg.id, "canal_principal", v)
                      }
                      placeholder="TikTok, radio, puerta a puerta..."
                    />
                  </Field>
                  <Field label="Portavoz sugerido">
                    <TextInput
                      value={p.portavoz ?? ""}
                      onChange={(v) =>
                        updatePrioritario(seg.id, "portavoz", v)
                      }
                      placeholder="Candidato, vocera juvenil..."
                    />
                  </Field>
                </div>

                <Field label="Acción inmediata">
                  <Textarea
                    value={p.accion_inmediata ?? ""}
                    onChange={(v) =>
                      updatePrioritario(seg.id, "accion_inmediata", v)
                    }
                    placeholder="Qué hacer ya esta semana con este segmento..."
                    rows={2}
                  />
                </Field>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
