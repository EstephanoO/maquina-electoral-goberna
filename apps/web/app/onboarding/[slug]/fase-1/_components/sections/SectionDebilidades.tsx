"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

import type { ConsultorFormFase2 } from "@/lib/onboarding-api";

import { Field, TextInput, Textarea, RadioGroup, TagList } from "../form-fields";

type Debilidades = NonNullable<ConsultorFormFase2["debilidades"]>;
type FuenteEntry = NonNullable<Debilidades["fuentes"]>[number];
type ItemLibre = NonNullable<Debilidades["lista_libre"]>[number];
type FuenteKey = FuenteEntry["key"];
type EstadoFuente = FuenteEntry["estado"];
type Severidad = ItemLibre["severidad"];

interface Props {
  data: Debilidades;
  onChange: (v: Debilidades) => void;
}

const ESTADO_OPTIONS: Array<{ value: EstadoFuente; label: string }> = [
  { value: "ok",     label: "Bueno" },
  { value: "review", label: "A revisar" },
  { value: "flag",   label: "Crítico" },
];

const FUENTES: Array<{ key: FuenteKey; label: string }> = [
  { key: "denuncias",          label: "Denuncias" },
  { key: "google",             label: "Google" },
  { key: "reputacion_redes",   label: "Reputación redes" },
  { key: "jne_observaciones",  label: "JNE" },
];

const SEVERIDAD_OPTIONS: Array<{ value: Severidad; label: string }> = [
  { value: "baja",  label: "Baja" },
  { value: "media", label: "Media" },
  { value: "alta",  label: "Alta" },
];

/**
 * Sección extendida — auditoría de debilidades y riesgos.
 * Alimenta el campo top-level `consultor_form.debilidades`.
 */
export function SectionDebilidades({ data, onChange }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fuentes = data.fuentes ?? [];
  const listaLibre = data.lista_libre ?? [];

  const getFuente = (key: FuenteKey): FuenteEntry =>
    fuentes.find((f) => f.key === key) ?? { key, estado: "review" };

  const setFuente = (key: FuenteKey, patch: Partial<FuenteEntry>) => {
    const idx = fuentes.findIndex((f) => f.key === key);
    const next = [...fuentes];
    if (idx >= 0) {
      next[idx] = { ...next[idx]!, ...patch };
    } else {
      next.push({ key, estado: "review", ...patch });
    }
    onChange({ ...data, fuentes: next });
  };

  const setLista = (next: ItemLibre[]) =>
    onChange({ ...data, lista_libre: next });

  const addLibre = () =>
    setLista([...listaLibre, { titulo: "", severidad: "media" }]);

  const updateLibre = <K extends keyof ItemLibre>(i: number, k: K, v: ItemLibre[K]) => {
    const arr = [...listaLibre];
    arr[i] = { ...arr[i]!, [k]: v };
    setLista(arr);
  };

  const removeLibre = (i: number) => setLista(listaLibre.filter((_, j) => j !== i));

  return (
    <div className="space-y-6">
      {/* Fuentes auditadas */}
      <div className="space-y-4">
        <h3 className="text-xs uppercase tracking-[0.25em] text-amber-400/70 font-bold">
          Fuentes auditadas
        </h3>
        <div className="space-y-3">
          {FUENTES.map((f) => {
            const entry = getFuente(f.key);
            const isOpen = expanded[f.key] ?? false;
            return (
              <div
                key={f.key}
                className="bg-[#0a1e4a]/40 border border-white/5 rounded-xl overflow-hidden"
              >
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-sm font-bold text-white flex-1">{f.label}</h4>
                    <button
                      type="button"
                      onClick={() => setExpanded((e) => ({ ...e, [f.key]: !isOpen }))}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-amber-400 hover:bg-amber-400/10 transition-colors flex-shrink-0"
                      aria-label={isOpen ? "Colapsar" : "Expandir"}
                    >
                      {isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </button>
                  </div>
                  <Field label="Estado">
                    <RadioGroup
                      value={entry.estado}
                      onChange={(v) => setFuente(f.key, { estado: v as EstadoFuente })}
                      options={ESTADO_OPTIONS}
                    />
                  </Field>
                </div>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-4">
                    <Field label="Hallazgos">
                      <TagList
                        items={entry.hallazgos ?? []}
                        onChange={(v) => setFuente(f.key, { hallazgos: v })}
                        placeholder="Agregar hallazgo..."
                        minItems={0}
                      />
                    </Field>
                    <Field label="URL de fuente">
                      <TextInput
                        value={entry.fuente_url ?? ""}
                        onChange={(v) => setFuente(f.key, { fuente_url: v })}
                        placeholder="https://..."
                      />
                    </Field>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Lista libre */}
      <div className="space-y-4 pt-2">
        <h3 className="text-xs uppercase tracking-[0.25em] text-amber-400/70 font-bold">
          Lista libre de debilidades
        </h3>
        <div className="space-y-3">
          {listaLibre.length === 0 && (
            <p className="text-xs text-gray-600 italic">
              Sin debilidades registradas. Usá el botón de abajo para agregar.
            </p>
          )}
          {listaLibre.map((item, i) => (
            <div
              key={i}
              className="bg-[#0a1e4a]/40 border border-white/5 rounded-xl p-4 space-y-3"
            >
              <div className="flex items-start gap-3">
                <span className="size-7 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-400 font-black text-sm flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <TextInput
                    value={item.titulo}
                    onChange={(v) => updateLibre(i, "titulo", v)}
                    placeholder="Título de la debilidad"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeLibre(i)}
                  className="p-2 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-colors flex-shrink-0"
                  aria-label="Eliminar"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <Field label="Descripción">
                <Textarea
                  value={item.descripcion ?? ""}
                  onChange={(v) => updateLibre(i, "descripcion", v)}
                  placeholder="Detalle de la debilidad..."
                  rows={2}
                />
              </Field>
              <Field label="Severidad">
                <RadioGroup
                  value={item.severidad}
                  onChange={(v) => updateLibre(i, "severidad", v as Severidad)}
                  options={SEVERIDAD_OPTIONS}
                />
              </Field>
            </div>
          ))}
          <button
            type="button"
            onClick={addLibre}
            className="w-full py-3 rounded-xl border-2 border-dashed border-gray-700/60 text-gray-600 hover:border-amber-400/40 hover:text-amber-400/70 transition-all flex items-center justify-center gap-2 text-sm"
          >
            <Plus className="size-4" />
            Agregar debilidad
          </button>
        </div>
      </div>
    </div>
  );
}
