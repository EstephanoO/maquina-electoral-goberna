"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  Loader2, CheckCircle2,
  User, MapPin, Target, Palette, BarChart3, Layers,
} from "lucide-react";

import {
  onboardingApi,
  type CandidatoContext,
  type ConsultorFormFase2,
  type Fase2DeckMeta,
  type PerfilCandidato,
  type TerritoryEcd,
  type C2Segmento,
  type D5MatrixRow,
  type Fase1Rapida,
} from "@/lib/onboarding-api";

// ── Types ──────────────────────────────────────────────────────────────────

type CompletionLevel = "empty" | "partial" | "done";

// ── Steps definition ───────────────────────────────────────────────────────

const STEPS = [
  { id: "candidato",  label: "Candidato",   icon: User,      hint: "Datos personales, trayectoria y patrimonio" },
  { id: "territorio", label: "Territorio",  icon: MapPin,    hint: "Padrón, elecciones anteriores y campo político" },
  { id: "c2",         label: "Segmentos",   icon: Target,    hint: "Grupos de votantes y sus perfiles" },
  { id: "d5",         label: "Decisión",    icon: Layers,    hint: "Mensaje, canal y portavoz por segmento" },
  { id: "propuestas", label: "Propuestas",  icon: BarChart3, hint: "Las propuestas programáticas de la campaña" },
  { id: "branding",   label: "Branding",    icon: Palette,   hint: "Slogan, colores y logo de la campaña" },
  { id: "foda",       label: "FODA",        icon: BarChart3, hint: "Fortalezas, debilidades, oportunidades y amenazas" },
  { id: "conciencia", label: "Conciencia",  icon: Target,    hint: "Intención de voto, issues y evaluación" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

// ── Helpers ────────────────────────────────────────────────────────────────

function stringsCompletion(arr: string[] | undefined, min = 1): CompletionLevel {
  if (!arr || arr.length === 0) return "empty";
  const filled = arr.filter((s) => s.trim().length > 0).length;
  if (filled === 0) return "empty";
  return filled >= min ? "done" : "partial";
}

function objectCompletion(
  obj: Record<string, unknown> | null | undefined,
  requiredKeys: string[],
): CompletionLevel {
  if (!obj) return "empty";
  const filled = requiredKeys.filter((k) => {
    const v = obj[k];
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }).length;
  if (filled === 0) return "empty";
  return filled >= Math.ceil(requiredKeys.length * 0.6) ? "done" : "partial";
}

// ── Input helpers ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] uppercase tracking-[0.15em] text-slate-600 font-bold">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-colors shadow-sm";

const textareaClass = inputClass + " resize-none";
const selectClass = inputClass;

function TagsInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            }
          }}
          placeholder={placeholder ?? "Escribir y Enter"}
          className={inputClass}
        />
        <button
          type="button"
          onClick={commit}
          className="px-3 py-2 rounded-xl bg-amber-400/20 text-amber-700 text-xs font-bold hover:bg-amber-400/30 transition-colors"
        >
          +
        </button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs"
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="text-amber-600 hover:text-red-500 transition-colors"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Utility: deep merge (shallow 1 level) ─────────────────────────────────

function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(patch)) {
    const pv = patch[key];
    const bv = base[key];
    if (
      pv !== null &&
      typeof pv === "object" &&
      !Array.isArray(pv) &&
      bv !== null &&
      typeof bv === "object" &&
      !Array.isArray(bv)
    ) {
      result[key] = { ...(bv as Record<string, unknown>), ...(pv as Record<string, unknown>) };
    } else {
      result[key] = pv;
    }
  }
  return result;
}

// ── LiveProfileCard ────────────────────────────────────────────────────────

function LiveProfileCard({
  f1,
  ecd,
  color1,
  nombre,
  donePct,
  territory,
}: {
  f1: Fase1Rapida;
  ecd: TerritoryEcd;
  color1: string;
  nombre: string;
  donePct: number;
  territory: string;
}) {
  const cargo = f1.postulacion?.cargo_codigo
    ? f1.postulacion.cargo_codigo.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Candidato";

  return (
    <div className="p-6 space-y-5">
      {/* Candidate header */}
      <div className="flex items-center gap-4">
        <div
          className="size-14 rounded-2xl flex items-center justify-center font-black text-2xl flex-shrink-0"
          style={{
            background: color1 + "20",
            color: color1,
            border: `2px solid ${color1}40`,
          }}
        >
          {nombre[0]?.toUpperCase() ?? "C"}
        </div>
        <div>
          <h2 className="font-black text-slate-900 text-base leading-tight">{nombre}</h2>
          <p className="text-[11px] text-slate-600 mt-0.5">
            {cargo} · {territory}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <div className="h-1 w-24 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-400 transition-all duration-700"
                style={{ width: `${donePct}%` }}
              />
            </div>
            <span className="text-[9px] text-slate-500 font-bold">{donePct}%</span>
          </div>
        </div>
      </div>

      {/* Bio */}
      {f1.candidato?.bio_corta && (
        <p className="text-[11px] text-slate-600 italic border-l-2 border-amber-400/30 pl-3">
          {f1.candidato.bio_corta}
        </p>
      )}

      {/* Propuesta central */}
      {ecd.nucleo_goberna?.propuesta_central && (
        <div className="rounded-xl bg-amber-400/10 border border-amber-400/20 p-3">
          <p className="text-[9px] uppercase tracking-widest text-amber-700 font-bold mb-1">
            Propuesta central
          </p>
          <p className="text-[12px] text-slate-900 font-semibold">
            {ecd.nucleo_goberna.propuesta_central}
          </p>
        </div>
      )}

      {/* Segments mini */}
      {(ecd.c2_segmentos?.length ?? 0) > 0 && (
        <div>
          <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-2">
            Segmentos electorales
          </p>
          <div className="space-y-1.5">
            {ecd.c2_segmentos!.slice(0, 4).map((seg) => (
              <div key={seg.id} className="flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-400/60"
                    style={{ width: `${seg.pct_aprox ?? 0}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-500 w-8 text-right">
                  {seg.pct_aprox}%
                </span>
                <span className="text-[10px] text-slate-700 flex-[2] truncate">
                  {seg.nombre.split("/")[0].trim()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Propuestas pills */}
      {(f1.propuestas?.length ?? 0) > 0 && (
        <div>
          <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-2">
            Propuestas ({f1.propuestas!.length})
          </p>
          <div className="space-y-1">
            {f1.propuestas!.slice(0, 3).map((p) => (
              <div key={p.orden} className="flex items-center gap-2 text-[10px] text-slate-700">
                <span className="size-4 rounded-full bg-amber-400/20 text-amber-700 flex items-center justify-center font-bold flex-shrink-0">
                  {p.orden}
                </span>
                <span className="truncate">{p.titulo}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FODA counts */}
      {(f1.diagnostico_inicial?.fortalezas?.length ||
        f1.diagnostico_inicial?.debilidades?.length) ? (
        <div className="grid grid-cols-2 gap-2">
          {f1.diagnostico_inicial?.fortalezas?.length ? (
            <div className="rounded-lg bg-green-50 border border-green-200 p-2 text-center">
              <p className="text-green-600 font-black text-base">
                {f1.diagnostico_inicial.fortalezas.length}
              </p>
              <p className="text-[9px] text-green-600/70 uppercase tracking-wide">Fortalezas</p>
            </div>
          ) : null}
          {f1.diagnostico_inicial?.debilidades?.length ? (
            <div className="rounded-lg bg-red-50 border border-red-200 p-2 text-center">
              <p className="text-red-500 font-black text-base">
                {f1.diagnostico_inicial.debilidades.length}
              </p>
              <p className="text-[9px] text-red-500/70 uppercase tracking-wide">Debilidades</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Rivals */}
      {(ecd.e4_campo_politico?.partidos_fuertes?.length ?? 0) > 0 && (
        <div>
          <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-2">
            Campo político
          </p>
          <div className="space-y-1.5">
            {ecd.e4_campo_politico!.partidos_fuertes!.slice(0, 2).map((p, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg bg-slate-100 border border-slate-200 px-3 py-1.5"
              >
                <span className="text-[10px] text-slate-700 font-semibold">{p.nombre}</span>
                {p.pct_aprox !== undefined && (
                  <span className="text-[10px] text-slate-500">{p.pct_aprox}%</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section editors ────────────────────────────────────────────────────────

// Historial Electoral type + component (kept from original)
type HistorialEntry = NonNullable<Fase1Rapida["historial_electoral_territorio"]>[number];

function HistorialElectoralEditor({
  value,
  onChange,
}: {
  value: HistorialEntry[];
  onChange: (v: HistorialEntry[]) => void;
}) {
  function addEntry() {
    const newEntry: HistorialEntry = { anio: new Date().getFullYear() - 4 };
    onChange([...value, newEntry]);
  }

  function update(i: number, patch: Partial<HistorialEntry>) {
    onChange(value.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  }

  function remove(i: number) {
    onChange(value.filter((_, j) => j !== i));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-slate-700 uppercase tracking-widest pb-1.5 border-b border-slate-200">
            Elecciones anteriores del territorio
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Resultados de elecciones pasadas en este cargo/distrito.
          </p>
        </div>
        <button
          type="button"
          onClick={addEntry}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-400/30 text-amber-600 text-[10px] font-bold hover:bg-amber-400/10 transition-colors"
        >
          + Agregar
        </button>
      </div>

      {value.length === 0 && (
        <p className="text-[11px] text-slate-400 italic text-center py-4 border border-dashed border-slate-200 rounded-xl">
          Sin elecciones registradas — presioná "+ Agregar"
        </p>
      )}

      <div className="space-y-3">
        {value.map((entry, i) => (
          <div
            key={i}
            className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-600">Elección {i + 1}</p>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-[10px] text-red-400/60 hover:text-red-500 transition-colors"
              >
                Eliminar
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Año">
                <input
                  type="number"
                  className={inputClass}
                  value={entry.anio}
                  onChange={(e) => update(i, { anio: Number(e.target.value) })}
                  placeholder="2022"
                />
              </Field>
              <Field label="Cargo">
                <input
                  className={inputClass}
                  value={entry.cargo ?? ""}
                  onChange={(e) => update(i, { cargo: e.target.value })}
                  placeholder="Alcalde distrital"
                />
              </Field>
              <Field label="Padrón">
                <input
                  type="number"
                  className={inputClass}
                  value={entry.padron ?? ""}
                  onChange={(e) =>
                    update(i, { padron: e.target.value ? Number(e.target.value) : undefined })
                  }
                  placeholder="Ej. 245 000"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Ganador (1°)">
                <input
                  className={inputClass}
                  value={entry.ganador ?? ""}
                  onChange={(e) => update(i, { ganador: e.target.value })}
                  placeholder="Nombre del ganador"
                />
              </Field>
              <Field label="Partido">
                <input
                  className={inputClass}
                  value={entry.partido_ganador ?? ""}
                  onChange={(e) => update(i, { partido_ganador: e.target.value })}
                  placeholder="Partido o movimiento"
                />
              </Field>
              <Field label="% / Votos">
                <div className="flex gap-2">
                  <input
                    type="number"
                    className={inputClass}
                    value={entry.pct_ganador ?? ""}
                    onChange={(e) =>
                      update(i, {
                        pct_ganador: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    placeholder="%"
                  />
                  <input
                    type="number"
                    className={inputClass}
                    value={entry.votos_ganador ?? ""}
                    onChange={(e) =>
                      update(i, {
                        votos_ganador: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    placeholder="Votos"
                  />
                </div>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="2° lugar">
                <input
                  className={inputClass}
                  value={entry.segundo ?? ""}
                  onChange={(e) => update(i, { segundo: e.target.value })}
                  placeholder="Nombre"
                />
              </Field>
              <Field label="Partido 2°">
                <input
                  className={inputClass}
                  value={entry.partido_segundo ?? ""}
                  onChange={(e) => update(i, { partido_segundo: e.target.value })}
                  placeholder="Partido"
                />
              </Field>
              <Field label="% 2° lugar">
                <input
                  type="number"
                  className={inputClass}
                  value={entry.pct_segundo ?? ""}
                  onChange={(e) =>
                    update(i, {
                      pct_segundo: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  placeholder="%"
                />
              </Field>
            </div>

            <Field label="Notas">
              <input
                className={inputClass}
                value={entry.notas ?? ""}
                onChange={(e) => update(i, { notas: e.target.value })}
                placeholder="Observaciones relevantes…"
              />
            </Field>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CandidatoEditor — sections A-F ────────────────────────────────────────

type LaboralEntry = NonNullable<NonNullable<PerfilCandidato["n2_trayectoria"]>["historial_laboral"]>[number];
type FormacionEntry = NonNullable<NonNullable<PerfilCandidato["n2_trayectoria"]>["formacion"]>[number];
type DenunciaEntry = NonNullable<NonNullable<PerfilCandidato["n3_riesgo"]>["denuncias_penales"]>[number];

function CandidatoEditor({
  f1,
  ctx,
  perfil,
  padronActual,
  onPadronChange,
  onChange,
  onPerfilChange,
}: {
  f1: Fase1Rapida;
  ctx: CandidatoContext;
  perfil: PerfilCandidato;
  padronActual?: number;
  onPadronChange: (v: number | undefined) => void;
  onChange: (patch: Partial<Fase1Rapida>) => void;
  onPerfilChange: (patch: Partial<PerfilCandidato>) => void;
}) {
  const c = f1.candidato ?? {};
  const p = f1.postulacion ?? {};
  const n1 = perfil.n1_identidad ?? {};
  const n2 = perfil.n2_trayectoria ?? {};
  const n3 = perfil.n3_riesgo ?? {};
  const n4 = perfil.n4_patrimonio ?? {};

  // Historial laboral helpers
  function addLaboral() {
    const cur: LaboralEntry[] = n2.historial_laboral ?? [];
    onPerfilChange({
      n2_trayectoria: {
        ...n2,
        historial_laboral: [...cur, { orden: cur.length + 1, cargo: "", organizacion: "" }],
      },
    });
  }
  function updateLaboral(i: number, patch: Partial<LaboralEntry>) {
    const cur = n2.historial_laboral ?? [];
    onPerfilChange({
      n2_trayectoria: {
        ...n2,
        historial_laboral: cur.map((e, j) => (j === i ? { ...e, ...patch } : e)),
      },
    });
  }
  function removeLaboral(i: number) {
    const cur = n2.historial_laboral ?? [];
    onPerfilChange({
      n2_trayectoria: {
        ...n2,
        historial_laboral: cur.filter((_, j) => j !== i).map((e, j) => ({ ...e, orden: j + 1 })),
      },
    });
  }

  // Formacion helpers
  function addFormacion() {
    const cur: FormacionEntry[] = n2.formacion ?? [];
    onPerfilChange({
      n2_trayectoria: {
        ...n2,
        formacion: [...cur, { nivel: "", institucion: "" }],
      },
    });
  }
  function updateFormacion(i: number, patch: Partial<FormacionEntry>) {
    const cur = n2.formacion ?? [];
    onPerfilChange({
      n2_trayectoria: {
        ...n2,
        formacion: cur.map((e, j) => (j === i ? { ...e, ...patch } : e)),
      },
    });
  }
  function removeFormacion(i: number) {
    const cur = n2.formacion ?? [];
    onPerfilChange({ n2_trayectoria: { ...n2, formacion: cur.filter((_, j) => j !== i) } });
  }

  // Denuncias helpers
  function addDenuncia() {
    const cur: DenunciaEntry[] = n3.denuncias_penales ?? [];
    onPerfilChange({
      n3_riesgo: { ...n3, denuncias_penales: [...cur, { descripcion: "", estado: "activa" }] },
    });
  }
  function updateDenuncia(i: number, patch: Partial<DenunciaEntry>) {
    const cur = n3.denuncias_penales ?? [];
    onPerfilChange({
      n3_riesgo: {
        ...n3,
        denuncias_penales: cur.map((e, j) => (j === i ? { ...e, ...patch } : e)),
      },
    });
  }
  function removeDenuncia(i: number) {
    const cur = n3.denuncias_penales ?? [];
    onPerfilChange({ n3_riesgo: { ...n3, denuncias_penales: cur.filter((_, j) => j !== i) } });
  }

  const riskColors: Record<string, string> = {
    bajo: "text-green-600 bg-green-50 border-green-200",
    medio: "text-amber-600 bg-amber-50 border-amber-200",
    alto: "text-orange-600 bg-orange-50 border-orange-200",
    critico: "text-red-600 bg-red-50 border-red-200",
  };

  return (
    <div className="space-y-10">
      {/* SECTION A — Datos básicos */}
      <div>
        <p className="text-xs font-bold text-slate-700 uppercase tracking-widest mb-4 pb-2 border-b border-slate-200">
          A — Datos básicos
        </p>
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nombre completo">
              <input
                className={inputClass}
                value={c.nombre_completo ?? ""}
                onChange={(e) => onChange({ candidato: { ...c, nombre_completo: e.target.value } })}
                placeholder={ctx.user.full_name}
              />
            </Field>
            <Field label="Apodo / nombre de campaña">
              <input
                className={inputClass}
                value={c.apodo ?? ""}
                onChange={(e) => onChange({ candidato: { ...c, apodo: e.target.value } })}
                placeholder="Como lo llama la gente"
              />
            </Field>
          </div>

          <Field label="Bio corta (para el deck)">
            <textarea
              className={textareaClass}
              rows={3}
              maxLength={300}
              value={c.bio_corta ?? ""}
              onChange={(e) => onChange({ candidato: { ...c, bio_corta: e.target.value } })}
              placeholder="Descripción de 1-2 oraciones del candidato..."
            />
          </Field>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field label="Fecha de nacimiento">
              <input
                type="date"
                className={inputClass}
                value={c.fecha_nacimiento ?? ""}
                onChange={(e) => onChange({ candidato: { ...c, fecha_nacimiento: e.target.value } })}
              />
            </Field>
            <Field label="Sexo">
              <select
                className={selectClass}
                value={c.sexo ?? ""}
                onChange={(e) =>
                  onChange({ candidato: { ...c, sexo: e.target.value as "M" | "F" } })
                }
              >
                <option value="">—</option>
                <option value="M">Masculino</option>
                <option value="F">Femenino</option>
              </select>
            </Field>
            <Field label="Tipo doc">
              <select
                className={selectClass}
                value={c.documento_tipo ?? ""}
                onChange={(e) =>
                  onChange({
                    candidato: {
                      ...c,
                      documento_tipo: e.target.value as "DNI" | "CE" | "PASAPORTE",
                    },
                  })
                }
              >
                <option value="">—</option>
                <option value="DNI">DNI</option>
                <option value="CE">CE</option>
                <option value="PASAPORTE">Pasaporte</option>
              </select>
            </Field>
            <Field label="Número">
              <input
                className={inputClass}
                value={c.documento_numero ?? ""}
                onChange={(e) =>
                  onChange({ candidato: { ...c, documento_numero: e.target.value } })
                }
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Ocupación actual">
              <input
                className={inputClass}
                value={c.ocupacion_actual ?? ""}
                onChange={(e) =>
                  onChange({ candidato: { ...c, ocupacion_actual: e.target.value } })
                }
              />
            </Field>
            <Field label="URL de foto">
              <input
                className={inputClass}
                value={c.foto_url ?? ""}
                onChange={(e) => onChange({ candidato: { ...c, foto_url: e.target.value } })}
                placeholder="https://..."
              />
            </Field>
          </div>
        </div>
      </div>

      <hr className="border-slate-200" />

      {/* SECTION B — Postulación */}
      <div>
        <p className="text-xs font-bold text-slate-700 uppercase tracking-widest mb-4 pb-2 border-b border-slate-200">
          B — Postulación
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Cargo al que postula">
            <select
              className={selectClass}
              value={p.cargo_codigo ?? ""}
              onChange={(e) =>
                onChange({
                  postulacion: {
                    ...p,
                    cargo_codigo: e.target
                      .value as NonNullable<Fase1Rapida["postulacion"]>["cargo_codigo"],
                  },
                })
              }
            >
              <option value="">Seleccionar cargo</option>
              <option value="alcalde_distrital">Alcalde Distrital</option>
              <option value="alcalde_provincial">Alcalde Provincial</option>
              <option value="regidor">Regidor</option>
              <option value="consejero_regional">Consejero Regional</option>
              <option value="gobernador_regional">Gobernador Regional</option>
              <option value="congresista">Congresista</option>
              <option value="presidente">Presidente</option>
            </select>
          </Field>
          <Field label="Nivel territorial">
            <select
              className={selectClass}
              value={p.nivel_territorio ?? ""}
              onChange={(e) =>
                onChange({
                  postulacion: {
                    ...p,
                    nivel_territorio: e.target.value as
                      | "distrital"
                      | "provincial"
                      | "regional"
                      | "nacional",
                  },
                })
              }
            >
              <option value="">—</option>
              <option value="distrital">Distrital</option>
              <option value="provincial">Provincial</option>
              <option value="regional">Regional</option>
              <option value="nacional">Nacional</option>
            </select>
          </Field>
          <Field label="Territorio">
            <input
              className={inputClass}
              value={p.nombre_territorio ?? ""}
              onChange={(e) =>
                onChange({ postulacion: { ...p, nombre_territorio: e.target.value } })
              }
              placeholder={
                ctx.jurisdiccion.distrito?.nombre ??
                ctx.jurisdiccion.provincia?.nombre ??
                ctx.jurisdiccion.departamento?.nombre ??
                ""
              }
            />
          </Field>
          <Field label="Organización política">
            <input
              className={inputClass}
              value={p.nombre_organizacion ?? ""}
              onChange={(e) =>
                onChange({ postulacion: { ...p, nombre_organizacion: e.target.value } })
              }
              placeholder={ctx.organizacion_politica?.nombre ?? "Partido / movimiento"}
            />
          </Field>
          <Field label="Fecha de elección">
            <input
              type="date"
              className={inputClass}
              value={p.fecha_eleccion ?? ""}
              onChange={(e) =>
                onChange({ postulacion: { ...p, fecha_eleccion: e.target.value } })
              }
            />
          </Field>
        </div>
      </div>

      <hr className="border-slate-200" />

      {/* SECTION C — Identidad completa */}
      <div>
        <p className="text-xs font-bold text-slate-700 uppercase tracking-widest mb-4 pb-2 border-b border-slate-200">
          C — Identidad completa
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Lugar de nacimiento">
            <input
              className={inputClass}
              value={n1.lugar_nacimiento ?? ""}
              onChange={(e) =>
                onPerfilChange({ n1_identidad: { ...n1, lugar_nacimiento: e.target.value } })
              }
            />
          </Field>
          <Field label="Estado civil">
            <input
              className={inputClass}
              value={n1.estado_civil ?? ""}
              onChange={(e) =>
                onPerfilChange({ n1_identidad: { ...n1, estado_civil: e.target.value } })
              }
            />
          </Field>
          <Field label="Número de hijos">
            <input
              type="number"
              min={0}
              className={inputClass}
              value={n1.hijos ?? ""}
              onChange={(e) =>
                onPerfilChange({ n1_identidad: { ...n1, hijos: Number(e.target.value) } })
              }
            />
          </Field>
          <Field label="Religión">
            <input
              className={inputClass}
              value={n1.religion ?? ""}
              onChange={(e) =>
                onPerfilChange({ n1_identidad: { ...n1, religion: e.target.value } })
              }
            />
          </Field>
        </div>
      </div>

      <hr className="border-slate-200" />

      {/* SECTION D — Trayectoria profesional */}
      <div>
        <p className="text-xs font-bold text-slate-700 uppercase tracking-widest mb-4 pb-2 border-b border-slate-200">
          D — Trayectoria profesional
        </p>
        <div className="space-y-5">
          {/* Historial laboral */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                Historial laboral
              </label>
              <button
                type="button"
                onClick={addLaboral}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-amber-400/30 text-amber-600 text-[10px] font-bold hover:bg-amber-400/10 transition-colors"
              >
                + Agregar cargo
              </button>
            </div>
            {(n2.historial_laboral ?? []).length === 0 && (
              <p className="text-[11px] text-slate-400 italic text-center py-3 border border-dashed border-slate-200 rounded-xl">
                Sin cargos registrados
              </p>
            )}
            <div className="space-y-3">
              {(n2.historial_laboral ?? []).map((entry, i) => (
                <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600">Cargo {i + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeLaboral(i)}
                      className="text-[10px] text-red-400/60 hover:text-red-500 transition-colors"
                    >
                      Eliminar
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Cargo">
                      <input
                        className={inputClass}
                        value={entry.cargo}
                        onChange={(e) => updateLaboral(i, { cargo: e.target.value })}
                        placeholder="Nombre del cargo"
                      />
                    </Field>
                    <Field label="Organización">
                      <input
                        className={inputClass}
                        value={entry.organizacion}
                        onChange={(e) => updateLaboral(i, { organizacion: e.target.value })}
                        placeholder="Empresa / institución"
                      />
                    </Field>
                    <Field label="Año inicio">
                      <input
                        type="number"
                        className={inputClass}
                        value={entry.anio_inicio ?? ""}
                        onChange={(e) =>
                          updateLaboral(i, {
                            anio_inicio: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        placeholder="2018"
                      />
                    </Field>
                    <Field label="Año fin (o 'actual')">
                      <input
                        className={inputClass}
                        value={entry.anio_fin !== undefined ? String(entry.anio_fin) : ""}
                        onChange={(e) => {
                          const v = e.target.value.trim().toLowerCase();
                          if (v === "" ) {
                            updateLaboral(i, { anio_fin: undefined });
                          } else if (v === "actual") {
                            updateLaboral(i, { anio_fin: "actual" });
                          } else if (!isNaN(Number(v))) {
                            updateLaboral(i, { anio_fin: Number(v) });
                          }
                        }}
                        placeholder="2022 o actual"
                      />
                    </Field>
                  </div>
                  <Field label="Descripción">
                    <input
                      className={inputClass}
                      value={entry.descripcion ?? ""}
                      onChange={(e) => updateLaboral(i, { descripcion: e.target.value })}
                      placeholder="Breve descripción del rol"
                    />
                  </Field>
                </div>
              ))}
            </div>
          </div>

          {/* Formación académica */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                Formación académica
              </label>
              <button
                type="button"
                onClick={addFormacion}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-amber-400/30 text-amber-600 text-[10px] font-bold hover:bg-amber-400/10 transition-colors"
              >
                + Agregar título
              </button>
            </div>
            {(n2.formacion ?? []).length === 0 && (
              <p className="text-[11px] text-slate-400 italic text-center py-3 border border-dashed border-slate-200 rounded-xl">
                Sin formación registrada
              </p>
            )}
            <div className="space-y-3">
              {(n2.formacion ?? []).map((entry, i) => (
                <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600">Título {i + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeFormacion(i)}
                      className="text-[10px] text-red-400/60 hover:text-red-500 transition-colors"
                    >
                      Eliminar
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Field label="Nivel">
                      <input
                        className={inputClass}
                        value={entry.nivel}
                        onChange={(e) => updateFormacion(i, { nivel: e.target.value })}
                        placeholder="Universitario"
                      />
                    </Field>
                    <Field label="Institución">
                      <input
                        className={inputClass}
                        value={entry.institucion}
                        onChange={(e) => updateFormacion(i, { institucion: e.target.value })}
                        placeholder="Universidad / colegio"
                      />
                    </Field>
                    <Field label="Título">
                      <input
                        className={inputClass}
                        value={entry.titulo ?? ""}
                        onChange={(e) => updateFormacion(i, { titulo: e.target.value })}
                        placeholder="Lic. Derecho"
                      />
                    </Field>
                    <Field label="Año">
                      <input
                        type="number"
                        className={inputClass}
                        value={entry.anio ?? ""}
                        onChange={(e) =>
                          updateFormacion(i, {
                            anio: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        placeholder="2010"
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Logros principales */}
          <Field label="Logros principales">
            <TagsInput
              value={n2.logros_principales ?? []}
              onChange={(v) => onPerfilChange({ n2_trayectoria: { ...n2, logros_principales: v } })}
              placeholder="Logro destacado…"
            />
          </Field>
        </div>
      </div>

      <hr className="border-slate-200" />

      {/* SECTION E — Patrimonio */}
      <div>
        <p className="text-xs font-bold text-slate-700 uppercase tracking-widest mb-4 pb-2 border-b border-slate-200">
          E — Propiedades y patrimonio
        </p>
        <div className="space-y-4">
          <Field label="Bienes principales">
            <TagsInput
              value={n4.bienes_principales ?? []}
              onChange={(v) => onPerfilChange({ n4_patrimonio: { ...n4, bienes_principales: v } })}
              placeholder="Ej. Casa en Miraflores, Departamento en Surco…"
            />
          </Field>
          <Field label="Deudas">
            <TagsInput
              value={n4.deudas ?? []}
              onChange={(v) => onPerfilChange({ n4_patrimonio: { ...n4, deudas: v } })}
              placeholder="Ej. Préstamo hipotecario 2020…"
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="URL Declaración Jurada SUNAT">
              <input
                className={inputClass}
                value={n4.declaracion_jurada_url ?? ""}
                onChange={(e) =>
                  onPerfilChange({ n4_patrimonio: { ...n4, declaracion_jurada_url: e.target.value } })
                }
                placeholder="https://..."
              />
            </Field>
            <Field label="Consistencia patrimonial">
              <select
                className={selectClass}
                value={n4.consistencia ?? ""}
                onChange={(e) =>
                  onPerfilChange({
                    n4_patrimonio: {
                      ...n4,
                      consistencia: e.target.value as "consistente" | "inconsistente" | "sin_datos",
                    },
                  })
                }
              >
                <option value="">—</option>
                <option value="consistente">Consistente</option>
                <option value="inconsistente">Inconsistente</option>
                <option value="sin_datos">Sin datos</option>
              </select>
            </Field>
          </div>
          <Field label="Notas">
            <textarea
              className={textareaClass}
              rows={2}
              value={n4.notas ?? ""}
              onChange={(e) =>
                onPerfilChange({ n4_patrimonio: { ...n4, notas: e.target.value } })
              }
              placeholder="Observaciones adicionales…"
            />
          </Field>
        </div>
      </div>

      <hr className="border-slate-200" />

      {/* SECTION F — Riesgos */}
      <div>
        <p className="text-xs font-bold text-red-700 uppercase tracking-widest mb-4 pb-2 border-b border-red-200">
          F — Riesgos
        </p>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Field label="Nivel de riesgo global">
              <select
                className={selectClass}
                value={n3.nivel_riesgo_global ?? ""}
                onChange={(e) =>
                  onPerfilChange({
                    n3_riesgo: {
                      ...n3,
                      nivel_riesgo_global: e.target.value as "bajo" | "medio" | "alto" | "critico",
                    },
                  })
                }
              >
                <option value="">—</option>
                <option value="bajo">Bajo</option>
                <option value="medio">Medio</option>
                <option value="alto">Alto</option>
                <option value="critico">Crítico</option>
              </select>
            </Field>
            {n3.nivel_riesgo_global && (
              <span
                className={`mt-5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${riskColors[n3.nivel_riesgo_global] ?? ""}`}
              >
                {n3.nivel_riesgo_global}
              </span>
            )}
          </div>

          {/* Denuncias penales */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                Denuncias penales
              </label>
              <button
                type="button"
                onClick={addDenuncia}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-red-400/30 text-red-500 text-[10px] font-bold hover:bg-red-50 transition-colors"
              >
                + Agregar denuncia
              </button>
            </div>
            <div className="space-y-2">
              {(n3.denuncias_penales ?? []).map((d, i) => (
                <div key={i} className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-red-600">Denuncia {i + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeDenuncia(i)}
                      className="text-[10px] text-red-400/60 hover:text-red-600 transition-colors"
                    >
                      Eliminar
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-2">
                      <input
                        className={inputClass}
                        value={d.descripcion}
                        onChange={(e) => updateDenuncia(i, { descripcion: e.target.value })}
                        placeholder="Descripción de la denuncia"
                      />
                    </div>
                    <select
                      className={selectClass}
                      value={d.estado}
                      onChange={(e) =>
                        updateDenuncia(i, {
                          estado: e.target.value as "activa" | "archivada" | "sentencia",
                        })
                      }
                    >
                      <option value="activa">Activa</option>
                      <option value="archivada">Archivada</option>
                      <option value="sentencia">Sentencia</option>
                    </select>
                  </div>
                  <input
                    className={inputClass}
                    value={d.fuente ?? ""}
                    onChange={(e) => updateDenuncia(i, { fuente: e.target.value })}
                    placeholder="Fuente / URL"
                  />
                </div>
              ))}
            </div>
          </div>

          <Field label="Observaciones JNE / ONPE">
            <TagsInput
              value={n3.jne_observaciones ?? []}
              onChange={(v) => onPerfilChange({ n3_riesgo: { ...n3, jne_observaciones: v } })}
              placeholder="Observación…"
            />
          </Field>

          <Field label="Búsquedas negativas en Google">
            <TagsInput
              value={n3.google_negativo ?? []}
              onChange={(v) => onPerfilChange({ n3_riesgo: { ...n3, google_negativo: v } })}
              placeholder="Titular negativo…"
            />
          </Field>

          <Field label="Notas de riesgo">
            <textarea
              className={textareaClass}
              rows={2}
              value={n3.notas ?? ""}
              onChange={(e) =>
                onPerfilChange({ n3_riesgo: { ...n3, notas: e.target.value } })
              }
              placeholder="Contexto adicional…"
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ── TerritorioEditor ────────────────────────────────────────────────────────

function TerritorioEditor({
  f1,
  ecd,
  padronActual,
  onPadronChange,
  onChange,
  onEcdChange,
}: {
  f1: Fase1Rapida;
  ecd: TerritoryEcd;
  padronActual?: number;
  onPadronChange: (v: number | undefined) => void;
  onChange: (patch: Partial<Fase1Rapida>) => void;
  onEcdChange: (patch: Partial<TerritoryEcd>) => void;
}) {
  const e4 = ecd.e4_campo_politico ?? {};
  const e1 = ecd.e1_capital_economico ?? {};
  const e2 = ecd.e2_capital_social ?? {};
  const diag = f1.diagnostico_inicial ?? {};

  return (
    <div className="space-y-6">
      {/* Padrón y población */}
      <div>
        <p className="text-xs font-bold text-slate-700 uppercase tracking-widest mb-4 pb-2 border-b border-slate-200">
          Datos electorales
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Padrón electoral (electores habilitados)">
            <input
              type="number"
              className={inputClass}
              value={padronActual ?? ""}
              onChange={(e) =>
                onPadronChange(e.target.value ? Number(e.target.value) : undefined)
              }
              placeholder="Ej. 252 000"
            />
          </Field>
          <Field label="Población total del territorio">
            <input
              type="number"
              className={inputClass}
              value={f1.contexto_territorio?.poblacion_aproximada ?? ""}
              onChange={(e) => {
                const ct = f1.contexto_territorio ?? {};
                onChange({
                  contexto_territorio: {
                    ...ct,
                    poblacion_aproximada: e.target.value ? Number(e.target.value) : undefined,
                  },
                });
              }}
              placeholder="Ej. 340 000"
            />
          </Field>
        </div>
      </div>

      <hr className="border-slate-200" />

      {/* Elecciones anteriores */}
      <HistorialElectoralEditor
        value={f1.historial_electoral_territorio ?? []}
        onChange={(v) => onChange({ historial_electoral_territorio: v })}
      />

      <hr className="border-slate-200" />

      {/* E4 — Campo político */}
      <div>
        <p className="text-xs font-bold text-slate-700 uppercase tracking-widest mb-4 pb-2 border-b border-slate-200">
          Campo político
        </p>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Polarización política">
              <select
                className={selectClass}
                value={e4.nivel_polarizacion ?? ""}
                onChange={(e) =>
                  onEcdChange({
                    e4_campo_politico: {
                      ...e4,
                      nivel_polarizacion: e.target.value as "bajo" | "medio" | "alto",
                    },
                  })
                }
              >
                <option value="">—</option>
                <option value="bajo">Baja</option>
                <option value="medio">Media</option>
                <option value="alto">Alta</option>
              </select>
            </Field>
            <Field label="Tendencia histórica del voto">
              <input
                className={inputClass}
                value={e4.voto_historico_tendencia ?? ""}
                onChange={(e) =>
                  onEcdChange({
                    e4_campo_politico: { ...e4, voto_historico_tendencia: e.target.value },
                  })
                }
                placeholder="Ej: voto conservador, fragmentado…"
              />
            </Field>
          </div>

          {/* Partidos fuertes */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2 block">
              Partidos/movimientos fuertes en la zona
            </label>
            <div className="space-y-2">
              {(e4.partidos_fuertes ?? []).map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className={inputClass}
                    value={p.nombre}
                    onChange={(e) => {
                      const cur = [...(e4.partidos_fuertes ?? [])];
                      cur[i] = { ...cur[i]!, nombre: e.target.value };
                      onEcdChange({ e4_campo_politico: { ...e4, partidos_fuertes: cur } });
                    }}
                    placeholder="Nombre del partido"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className={`${inputClass} w-20`}
                    value={p.pct_aprox ?? ""}
                    onChange={(e) => {
                      const cur = [...(e4.partidos_fuertes ?? [])];
                      cur[i] = { ...cur[i]!, pct_aprox: Number(e.target.value) };
                      onEcdChange({ e4_campo_politico: { ...e4, partidos_fuertes: cur } });
                    }}
                    placeholder="%"
                  />
                  <select
                    className={`${selectClass} max-w-[110px]`}
                    value={p.trend ?? ""}
                    onChange={(e) => {
                      const cur = [...(e4.partidos_fuertes ?? [])];
                      cur[i] = {
                        ...cur[i]!,
                        trend: e.target.value as "subiendo" | "estable" | "bajando",
                      };
                      onEcdChange({ e4_campo_politico: { ...e4, partidos_fuertes: cur } });
                    }}
                  >
                    <option value="">trend</option>
                    <option value="subiendo">↑ Subiendo</option>
                    <option value="estable">→ Estable</option>
                    <option value="bajando">↓ Bajando</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = (e4.partidos_fuertes ?? []).filter((_, j) => j !== i);
                      onEcdChange({ e4_campo_politico: { ...e4, partidos_fuertes: cur } });
                    }}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                onEcdChange({
                  e4_campo_politico: {
                    ...e4,
                    partidos_fuertes: [...(e4.partidos_fuertes ?? []), { nombre: "" }],
                  },
                })
              }
              className="mt-2 text-xs text-amber-700 hover:text-amber-600 transition-colors"
            >
              + Agregar partido
            </button>
          </div>
        </div>
      </div>

      <hr className="border-slate-200" />

      {/* Competidores */}
      <div>
        <p className="text-xs font-bold text-slate-700 uppercase tracking-widest mb-4 pb-2 border-b border-slate-200">
          Principales competidores
        </p>
        <div className="space-y-2">
          {(diag.principales_competidores ?? []).map((comp, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className={inputClass}
                value={comp.nombre}
                onChange={(e) => {
                  const cur = [...(diag.principales_competidores ?? [])];
                  cur[i] = { ...cur[i]!, nombre: e.target.value };
                  onChange({ diagnostico_inicial: { ...diag, principales_competidores: cur } });
                }}
                placeholder="Nombre del rival"
              />
              <input
                className={inputClass}
                value={comp.partido ?? ""}
                onChange={(e) => {
                  const cur = [...(diag.principales_competidores ?? [])];
                  cur[i] = { ...cur[i]!, partido: e.target.value };
                  onChange({ diagnostico_inicial: { ...diag, principales_competidores: cur } });
                }}
                placeholder="Partido"
              />
              <select
                className={`${selectClass} max-w-[120px]`}
                value={comp.nivel_amenaza ?? "medio"}
                onChange={(e) => {
                  const cur = [...(diag.principales_competidores ?? [])];
                  cur[i] = {
                    ...cur[i]!,
                    nivel_amenaza: e.target.value as "bajo" | "medio" | "alto",
                  };
                  onChange({ diagnostico_inicial: { ...diag, principales_competidores: cur } });
                }}
              >
                <option value="bajo">Bajo</option>
                <option value="medio">Medio</option>
                <option value="alto">Alto</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  const cur = (diag.principales_competidores ?? []).filter((_, j) => j !== i);
                  onChange({ diagnostico_inicial: { ...diag, principales_competidores: cur } });
                }}
                className="text-slate-400 hover:text-red-500 transition-colors px-1"
              >
                ×
              </button>
            </div>
          ))}
          {(diag.principales_competidores ?? []).length < 5 && (
            <button
              type="button"
              onClick={() =>
                onChange({
                  diagnostico_inicial: {
                    ...diag,
                    principales_competidores: [
                      ...(diag.principales_competidores ?? []),
                      { nombre: "", nivel_amenaza: "medio" },
                    ],
                  },
                })
              }
              className="text-xs text-amber-700 hover:text-amber-600 transition-colors"
            >
              + Agregar rival
            </button>
          )}
        </div>
      </div>

      <hr className="border-slate-200" />

      {/* E1-E2 estructura */}
      <div>
        <p className="text-xs font-bold text-slate-700 uppercase tracking-widest mb-4 pb-2 border-b border-slate-200">
          Capital económico y social
        </p>
        <div className="space-y-4">
          <Field label="Pobreza estimada (%)">
            <input
              type="number"
              min={0}
              max={100}
              className={inputClass}
              value={e1.nivel_pobreza_pct ?? ""}
              onChange={(e) =>
                onEcdChange({
                  e1_capital_economico: { ...e1, nivel_pobreza_pct: Number(e.target.value) },
                })
              }
            />
          </Field>
          <Field label="Principales sectores económicos">
            <TagsInput
              value={e1.principales_sectores ?? []}
              onChange={(v) =>
                onEcdChange({ e1_capital_economico: { ...e1, principales_sectores: v } })
              }
              placeholder="agricultura, minería, comercio…"
            />
          </Field>
          <Field label="Organizaciones sociales clave">
            <TagsInput
              value={e2.organizaciones_clave ?? []}
              onChange={(v) =>
                onEcdChange({ e2_capital_social: { ...e2, organizaciones_clave: v } })
              }
              placeholder="APAFA, rondas campesinas, sindicatos…"
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ── C2SegmentosEditor ──────────────────────────────────────────────────────

function C2SegmentosEditor({
  value,
  onChange,
}: {
  value: C2Segmento[];
  onChange: (v: C2Segmento[]) => void;
}) {
  function addSegmento() {
    const id = `seg_${Date.now()}`;
    onChange([...value, { id, nombre: "" }]);
  }

  function update(i: number, patch: Partial<C2Segmento>) {
    onChange(value.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  function remove(i: number) {
    onChange(value.filter((_, j) => j !== i));
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Definí entre 2 y 5 grupos de votantes según sus valores y motivaciones. Estos alimentan la
        Matriz D5.
      </p>
      {value.map((seg, i) => (
        <div
          key={seg.id}
          className="rounded-xl border border-slate-200 bg-white p-4 space-y-4 shadow-sm"
        >
          {/* Header row */}
          <div className="flex items-center gap-3">
            <span className="size-7 rounded-full bg-amber-100 text-amber-700 font-black text-xs flex items-center justify-center flex-shrink-0">
              #{i + 1}
            </span>
            <input
              className={`${inputClass} flex-1`}
              value={seg.nombre}
              onChange={(e) => update(i, { nombre: e.target.value })}
              placeholder="Nombre del segmento (ej: Madres jóvenes urbanas)"
            />
            <input
              type="number"
              min={0}
              max={100}
              className={`${inputClass} w-20`}
              value={seg.pct_aprox ?? ""}
              onChange={(e) => update(i, { pct_aprox: Number(e.target.value) })}
              placeholder="%"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-slate-400 hover:text-red-500 transition-colors text-lg leading-none"
            >
              ×
            </button>
          </div>

          {/* Descripción */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 block">
              Descripción del segmento
            </label>
            <textarea
              className={textareaClass}
              rows={2}
              value={seg.problema_principal ?? ""}
              onChange={(e) => update(i, { problema_principal: e.target.value })}
              placeholder="¿Cuál es su mayor problema hoy? ¿Qué los define?"
            />
          </div>

          {/* 3 columns */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-green-50 border border-green-100 rounded-xl p-3 space-y-1.5">
              <label className="text-[9px] uppercase tracking-wider text-green-700 font-semibold block">
                Valores
                <span className="normal-case font-normal ml-1 text-green-600/70">(qué valoran)</span>
              </label>
              <TagsInput
                value={seg.valores ?? []}
                onChange={(v) => update(i, { valores: v })}
                placeholder="familia, trabajo…"
              />
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-1.5">
              <label className="text-[9px] uppercase tracking-wider text-blue-700 font-semibold block">
                Aspiraciones
                <span className="normal-case font-normal ml-1 text-blue-600/70">(qué buscan)</span>
              </label>
              <TagsInput
                value={seg.aspiraciones ?? []}
                onChange={(v) => update(i, { aspiraciones: v })}
                placeholder="progreso, seguridad…"
              />
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 space-y-1.5">
              <label className="text-[9px] uppercase tracking-wider text-red-700 font-semibold block">
                Temores
                <span className="normal-case font-normal ml-1 text-red-600/70">(qué los preocupa)</span>
              </label>
              <TagsInput
                value={seg.temores ?? []}
                onChange={(v) => update(i, { temores: v })}
                placeholder="desempleo, inseguridad…"
              />
            </div>
          </div>

          {/* Canal preferido */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 block">
              Canal preferido
            </label>
            <input
              className={inputClass}
              value={seg.medio_info_preferido ?? ""}
              onChange={(e) => update(i, { medio_info_preferido: e.target.value })}
              placeholder="WhatsApp, radio local, TikTok…"
            />
          </div>
        </div>
      ))}
      {value.length < 8 && (
        <button
          type="button"
          onClick={addSegmento}
          className="w-full py-2.5 rounded-xl border border-dashed border-amber-400/30 text-amber-700 text-sm hover:border-amber-400/60 hover:text-amber-600 transition-colors"
        >
          + Agregar segmento
        </button>
      )}
    </div>
  );
}

// ── D5MatrixEditor ─────────────────────────────────────────────────────────

function D5MatrixEditor({
  segments,
  value,
  onChange,
}: {
  segments: C2Segmento[];
  value: D5MatrixRow[];
  onChange: (v: D5MatrixRow[]) => void;
}) {
  if (segments.length === 0) {
    return (
      <p className="text-sm text-slate-400 italic">
        Primero definí los segmentos en "Segmentos".
      </p>
    );
  }

  function getRow(segId: string): D5MatrixRow {
    return value.find((r) => r.segmento_id === segId) ?? { segmento_id: segId };
  }

  function updateRow(segId: string, patch: Partial<D5MatrixRow>) {
    const existing = value.find((r) => r.segmento_id === segId);
    if (existing) {
      onChange(value.map((r) => (r.segmento_id === segId ? { ...r, ...patch } : r)));
    } else {
      onChange([...value, { segmento_id: segId, ...patch }]);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Para cada segmento, definí el mensaje clave, el canal más efectivo y el portavoz ideal.
      </p>
      {segments.map((seg) => {
        const row = getRow(seg.id);
        return (
          <div
            key={seg.id}
            className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <span className="font-bold text-amber-600 text-sm">
                {seg.nombre || `Segmento ${seg.id}`}
              </span>
              {seg.pct_aprox && (
                <span className="text-xs text-slate-400">{seg.pct_aprox}%</span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Candidato preferido actualmente">
                <input
                  className={inputClass}
                  value={row.candidato_preferido ?? ""}
                  onChange={(e) =>
                    updateRow(seg.id, { candidato_preferido: e.target.value })
                  }
                  placeholder="Nombre del rival preferido"
                />
              </Field>
              <Field label="Razón de preferencia">
                <input
                  className={inputClass}
                  value={row.razon_preferencia ?? ""}
                  onChange={(e) =>
                    updateRow(seg.id, { razon_preferencia: e.target.value })
                  }
                  placeholder="Por qué prefieren al rival"
                />
              </Field>
              <Field label="Probabilidad de cambio">
                <select
                  className={selectClass}
                  value={row.prob_cambio ?? ""}
                  onChange={(e) =>
                    updateRow(seg.id, {
                      prob_cambio: e.target.value as "alta" | "media" | "baja",
                    })
                  }
                >
                  <option value="">—</option>
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
              </Field>
              <Field label="¿Voto útil?">
                <div className="flex gap-3 items-center pt-2">
                  {[
                    { v: true, label: "Sí" },
                    { v: false, label: "No" },
                  ].map(({ v, label }) => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => updateRow(seg.id, { voto_util: v })}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        row.voto_util === v
                          ? "border-amber-400/50 bg-amber-400/20 text-amber-700"
                          : "border-slate-200 text-slate-400"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            <Field label="Mensaje clave para este segmento">
              <textarea
                className={textareaClass}
                rows={2}
                value={row.mensaje_clave ?? ""}
                onChange={(e) => updateRow(seg.id, { mensaje_clave: e.target.value })}
                placeholder="El mensaje principal que mueve a este segmento hacia nosotros…"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Canal más efectivo">
                <input
                  className={inputClass}
                  value={row.canal_efectivo ?? ""}
                  onChange={(e) => updateRow(seg.id, { canal_efectivo: e.target.value })}
                  placeholder="WhatsApp, mítines, radio…"
                />
              </Field>
              <Field label="Portavoz sugerido">
                <input
                  className={inputClass}
                  value={row.portavoz_sugerido ?? ""}
                  onChange={(e) =>
                    updateRow(seg.id, { portavoz_sugerido: e.target.value })
                  }
                  placeholder="Quién debe transmitir el mensaje"
                />
              </Field>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── PropuestasEditor ───────────────────────────────────────────────────────

function PropuestasEditor({
  value,
  onChange,
  color1,
}: {
  value: NonNullable<Fase1Rapida["propuestas"]>;
  onChange: (v: NonNullable<Fase1Rapida["propuestas"]>) => void;
  color1: string;
}) {
  function addPropuesta() {
    onChange([...value, { orden: value.length + 1, titulo: "", descripcion_corta: "" }]);
  }

  function updatePropuesta(
    i: number,
    patch: Partial<NonNullable<Fase1Rapida["propuestas"]>[number]>,
  ) {
    onChange(value.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }

  function removePropuesta(i: number) {
    onChange(
      value.filter((_, j) => j !== i).map((p, j) => ({ ...p, orden: j + 1 })),
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Las propuestas son las promesas programáticas de la campaña. Definí entre 3 y 6 propuestas
        concretas con su sector e ícono.
      </p>
      {value.map((prop, i) => (
        <div
          key={i}
          className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span
              className="text-lg font-black px-3 py-1 rounded-full"
              style={{ background: color1 + "15", color: color1 }}
            >
              #{prop.orden}
            </span>
            <button
              type="button"
              onClick={() => removePropuesta(i)}
              className="text-slate-400 hover:text-red-500 text-xs transition-colors"
            >
              Eliminar
            </button>
          </div>
          {/* Título prominente */}
          <input
            className={`${inputClass} text-base font-semibold`}
            value={prop.titulo}
            onChange={(e) => updatePropuesta(i, { titulo: e.target.value })}
            placeholder="Título de la propuesta"
          />
          {/* Descripción corta */}
          <textarea
            className={textareaClass}
            rows={2}
            maxLength={140}
            value={prop.descripcion_corta}
            onChange={(e) => updatePropuesta(i, { descripcion_corta: e.target.value })}
            placeholder="Descripción breve (máx 140 chars)"
          />
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Sector">
                <input
                  className={inputClass}
                  value={prop.sector ?? ""}
                  onChange={(e) => updatePropuesta(i, { sector: e.target.value })}
                  placeholder="ej: Seguridad, Movilidad, Salud"
                />
              </Field>
            </div>
            <Field label="Ícono emoji">
              <input
                className={inputClass}
                value={prop.icono ?? ""}
                onChange={(e) => updatePropuesta(i, { icono: e.target.value.slice(0, 2) })}
                placeholder="🏥"
                maxLength={2}
              />
            </Field>
          </div>
        </div>
      ))}
      {value.length < 6 && (
        <button
          type="button"
          onClick={addPropuesta}
          className="w-full py-2.5 rounded-xl border border-dashed border-amber-400/30 text-amber-700 text-sm hover:border-amber-400/60 hover:text-amber-600 transition-colors"
        >
          + Agregar propuesta
        </button>
      )}
    </div>
  );
}

// ── BrandingEditor ─────────────────────────────────────────────────────────

function BrandingEditor({
  value,
  onChange,
}: {
  value: NonNullable<Fase1Rapida["branding"]>;
  onChange: (v: NonNullable<Fase1Rapida["branding"]>) => void;
}) {
  return (
    <div className="space-y-4">
      <Field label="Slogan de campaña">
        <input
          className={inputClass}
          value={value.slogan ?? ""}
          onChange={(e) => onChange({ ...value, slogan: e.target.value })}
          placeholder="Frase central de la campaña"
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Color primario">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={value.color_primario ?? "#fbc02d"}
              onChange={(e) => onChange({ ...value, color_primario: e.target.value })}
              className="size-10 rounded-lg border border-slate-200 bg-transparent cursor-pointer"
            />
            <input
              className={inputClass}
              value={value.color_primario ?? ""}
              onChange={(e) => onChange({ ...value, color_primario: e.target.value })}
              placeholder="#fbc02d"
            />
          </div>
        </Field>
        <Field label="Color secundario">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={value.color_secundario ?? "#0a1e4a"}
              onChange={(e) => onChange({ ...value, color_secundario: e.target.value })}
              className="size-10 rounded-lg border border-slate-200 bg-transparent cursor-pointer"
            />
            <input
              className={inputClass}
              value={value.color_secundario ?? ""}
              onChange={(e) => onChange({ ...value, color_secundario: e.target.value })}
              placeholder="#0a1e4a"
            />
          </div>
        </Field>
      </div>
      <Field label="URL del logo">
        <input
          className={inputClass}
          value={value.logo_url ?? ""}
          onChange={(e) => onChange({ ...value, logo_url: e.target.value })}
          placeholder="https://..."
        />
      </Field>
    </div>
  );
}

// ── FodaEditor — 2×2 grid, sin competidores ────────────────────────────────

function FodaEditor({
  value,
  onChange,
}: {
  value: NonNullable<Fase1Rapida["diagnostico_inicial"]>;
  onChange: (v: NonNullable<Fase1Rapida["diagnostico_inicial"]>) => void;
}) {
  type QuadrantKey = "fortalezas" | "debilidades" | "oportunidades" | "amenazas";
  const quadrants: {
    key: QuadrantKey;
    label: string;
    emoji: string;
    sub: string;
    bg: string;
    border: string;
    labelColor: string;
  }[] = [
    {
      key: "fortalezas",
      label: "Fortalezas",
      emoji: "🟢",
      sub: "(factores internos)",
      bg: "bg-green-50",
      border: "border-green-200",
      labelColor: "text-green-700",
    },
    {
      key: "debilidades",
      label: "Debilidades",
      emoji: "🔴",
      sub: "(factores internos)",
      bg: "bg-red-50",
      border: "border-red-200",
      labelColor: "text-red-600",
    },
    {
      key: "oportunidades",
      label: "Oportunidades",
      emoji: "🔵",
      sub: "(factores externos)",
      bg: "bg-blue-50",
      border: "border-blue-200",
      labelColor: "text-blue-700",
    },
    {
      key: "amenazas",
      label: "Amenazas",
      emoji: "🟠",
      sub: "(factores externos)",
      bg: "bg-orange-50",
      border: "border-orange-200",
      labelColor: "text-orange-700",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {quadrants.map(({ key, label, emoji, sub, bg, border, labelColor }) => (
        <div key={key} className={`rounded-xl border ${border} ${bg} p-4 space-y-3`}>
          <div>
            <p className={`text-sm font-bold ${labelColor}`}>
              {emoji} {label}
            </p>
            <p className={`text-[10px] ${labelColor} opacity-70`}>{sub}</p>
          </div>
          <TagsInput
            value={value[key] ?? []}
            onChange={(v) => onChange({ ...value, [key]: v })}
            placeholder={`Agregar ${label.toLowerCase()}…`}
          />
        </div>
      ))}
    </div>
  );
}

// ── ConcienciaEditor ───────────────────────────────────────────────────────

function ConcienciaEditor({
  value,
  onChange,
}: {
  value: TerritoryEcd;
  onChange: (patch: Partial<TerritoryEcd>) => void;
}) {
  const c5 = value.c5_intencion_voto ?? {};
  const c4 = value.c4_evaluacion ?? {};
  const c6 = value.c6_voto_util ?? {};
  const c3 = value.c3_issues ?? {};

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Candidato puntero (rival principal)">
          <input
            className={inputClass}
            value={c5.candidato_puntero ?? ""}
            onChange={(e) =>
              onChange({ c5_intencion_voto: { ...c5, candidato_puntero: e.target.value } })
            }
          />
        </Field>
        <Field label="Nuestro candidato (% intención)">
          <input
            type="number"
            min={0}
            max={100}
            className={inputClass}
            value={c5.pct_nuestro_candidato ?? ""}
            onChange={(e) =>
              onChange({
                c5_intencion_voto: { ...c5, pct_nuestro_candidato: Number(e.target.value) },
              })
            }
            placeholder="%"
          />
        </Field>
        <Field label="Indecisos (%)">
          <input
            type="number"
            min={0}
            max={100}
            className={inputClass}
            value={c5.pct_indecisos ?? ""}
            onChange={(e) =>
              onChange({
                c5_intencion_voto: { ...c5, pct_indecisos: Number(e.target.value) },
              })
            }
            placeholder="%"
          />
        </Field>
        <Field label="Fuente de la encuesta">
          <input
            className={inputClass}
            value={c5.fuente ?? ""}
            onChange={(e) =>
              onChange({ c5_intencion_voto: { ...c5, fuente: e.target.value } })
            }
            placeholder="IPSOS, encuesta propia…"
          />
        </Field>
        <Field label="Aprobación nuestro candidato (%)">
          <input
            type="number"
            min={0}
            max={100}
            className={inputClass}
            value={c4.aprobacion_candidato ?? ""}
            onChange={(e) =>
              onChange({
                c4_evaluacion: { ...c4, aprobacion_candidato: Number(e.target.value) },
              })
            }
            placeholder="%"
          />
        </Field>
        <Field label="Riesgo voto útil">
          <select
            className={selectClass}
            value={c6.riesgo_voto_util ?? ""}
            onChange={(e) =>
              onChange({
                c6_voto_util: {
                  ...c6,
                  riesgo_voto_util: e.target.value as "bajo" | "medio" | "alto",
                },
              })
            }
          >
            <option value="">—</option>
            <option value="bajo">Bajo</option>
            <option value="medio">Medio</option>
            <option value="alto">Alto</option>
          </select>
        </Field>
      </div>

      <Field label="Principales issues del electorado">
        <TagsInput
          value={(c3.top_issues ?? []).map((ii) => ii.issue)}
          onChange={(v) =>
            onChange({
              c3_issues: {
                ...c3,
                top_issues: v.map((issue, idx) => ({ issue, prioridad: idx + 1 })),
              },
            })
          }
          placeholder="seguridad, agua, empleo…"
        />
      </Field>

      <Field label="Escenario voto útil">
        <textarea
          className={textareaClass}
          rows={2}
          value={c6.escenario ?? ""}
          onChange={(e) => onChange({ c6_voto_util: { ...c6, escenario: e.target.value } })}
          placeholder="Describir el escenario de voto útil y cómo nos afecta…"
        />
      </Field>
    </div>
  );
}

// ── Step preview helper ────────────────────────────────────────────────────

function getStepPreview(
  id: StepId,
  f1: Fase1Rapida,
  ecd: TerritoryEcd,
  perfil: PerfilCandidato,
  vpg: { padron_actual?: number; votos_meta?: number },
): React.ReactNode {
  // perfil param kept for future use / type safety
  void perfil;

  switch (id) {
    case "candidato": {
      const c = f1.candidato;
      if (!c?.nombre_completo && !c?.bio_corta) return null;
      return (
        <div className="space-y-1">
          {c.nombre_completo && <p className="font-semibold text-slate-800 truncate">{c.nombre_completo}</p>}
          {c.bio_corta && <p className="text-slate-500 line-clamp-2">{c.bio_corta}</p>}
          {vpg.padron_actual && (
            <p className="text-amber-600/80 text-[10px]">Padrón: {vpg.padron_actual.toLocaleString("es-PE")}</p>
          )}
        </div>
      );
    }
    case "territorio": {
      const partidos = ecd.e4_campo_politico?.partidos_fuertes;
      if (!partidos?.length && !vpg.padron_actual) return null;
      return (
        <div className="space-y-0.5">
          {vpg.padron_actual && (
            <p className="text-[10px] text-slate-500">
              Padrón: <span className="text-slate-700 font-semibold">{vpg.padron_actual.toLocaleString("es-PE")}</span>
            </p>
          )}
          {partidos?.slice(0, 2).map((p, i) => (
            <div key={i} className="flex justify-between gap-2">
              <span className="text-slate-600 truncate text-[10px]">{p.nombre}</span>
              <span className="text-amber-600 font-bold text-[10px] flex-shrink-0">{p.pct_aprox ?? 0}%</span>
            </div>
          ))}
        </div>
      );
    }
    case "c2": {
      const segs = ecd.c2_segmentos;
      if (!segs?.length) return null;
      return (
        <div className="space-y-1">
          {segs.slice(0, 3).map((s) => (
            <div key={s.id} className="flex justify-between gap-2">
              <span className="text-slate-600 truncate text-[10px]">{s.nombre.split("/")[0].trim()}</span>
              <span className="text-amber-600 font-bold text-[10px] flex-shrink-0">{s.pct_aprox ?? 0}%</span>
            </div>
          ))}
          {segs.length > 3 && <p className="text-slate-400 text-[10px]">+{segs.length - 3} más</p>}
        </div>
      );
    }
    case "d5": {
      const rows = ecd.d5_matrix;
      if (!rows?.length) return null;
      return (
        <div className="space-y-1">
          {rows.slice(0, 2).map((r, i) => (
            <p key={i} className="text-slate-500 line-clamp-1 text-[10px]">
              <span className="text-amber-700">→</span> {r.mensaje_clave ?? "Sin mensaje"}
            </p>
          ))}
        </div>
      );
    }
    case "propuestas": {
      const props = f1.propuestas;
      if (!props?.length) return null;
      return (
        <div className="space-y-0.5">
          {props.slice(0, 4).map((p, i) => (
            <p key={i} className="text-slate-600 line-clamp-1 text-[10px]">
              <span className="text-amber-600/60">{i + 1}.</span> {p.titulo}
            </p>
          ))}
        </div>
      );
    }
    case "branding": {
      const b = f1.branding;
      if (!b?.slogan && !b?.color_primario) return null;
      return (
        <div className="space-y-1.5">
          {b.slogan && <p className="text-slate-700 italic line-clamp-2">"{b.slogan}"</p>}
          {(b.color_primario || b.color_secundario) && (
            <div className="flex gap-1.5">
              {b.color_primario && (
                <div className="size-4 rounded-full border border-slate-300" style={{ background: b.color_primario }} />
              )}
              {b.color_secundario && (
                <div className="size-4 rounded-full border border-slate-300" style={{ background: b.color_secundario }} />
              )}
            </div>
          )}
        </div>
      );
    }
    case "foda": {
      const d = f1.diagnostico_inicial;
      if (!d?.fortalezas?.length && !d?.debilidades?.length) return null;
      return (
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div>
            <p className="text-green-600 font-semibold mb-0.5">F ({d.fortalezas?.length ?? 0})</p>
            {d.fortalezas?.slice(0, 2).map((f, i) => (
              <p key={i} className="text-slate-500 line-clamp-1">{f}</p>
            ))}
          </div>
          <div>
            <p className="text-red-500 font-semibold mb-0.5">D ({d.debilidades?.length ?? 0})</p>
            {d.debilidades?.slice(0, 2).map((dd, i) => (
              <p key={i} className="text-slate-500 line-clamp-1">{dd}</p>
            ))}
          </div>
        </div>
      );
    }
    case "conciencia": {
      const issues = ecd.c3_issues?.top_issues;
      const c5 = ecd.c5_intencion_voto;
      if (!issues?.length && !c5?.candidato_puntero) return null;
      return (
        <div className="space-y-1">
          {c5?.candidato_puntero && (
            <p className="text-[10px] text-slate-500">
              Puntero: <span className="text-slate-700">{c5.candidato_puntero}</span>
            </p>
          )}
          {c5?.pct_nuestro_candidato != null && (
            <p className="text-amber-600 font-bold text-[10px]">Nuestro: {c5.pct_nuestro_candidato}%</p>
          )}
          {issues?.slice(0, 2).map((iss, i) => (
            <p key={i} className="text-slate-500 line-clamp-1 text-[10px]">{iss.issue}</p>
          ))}
        </div>
      );
    }
    default:
      return null;
  }
}

// ── Main component ─────────────────────────────────────────────────────────

export default function PerfilHubV2Client({ slug }: { slug: string }) {
  const router = useRouter();
  const [ctx, setCtx] = useState<CandidatoContext | null>(null);
  const [deck, setDeck] = useState<Fase2DeckMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);

  // Form state
  const [f1, setF1] = useState<Fase1Rapida>({});
  const [perfil, setPerfil] = useState<PerfilCandidato>({});
  const [ecd, setEcd] = useState<TerritoryEcd>({});
  const [vpg, setVpg] = useState<{ padron_actual?: number; votos_meta?: number }>({});

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Partial<ConsultorFormFase2>>({});

  // Load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await onboardingApi.getFase2BySlug(slug);
        if (cancelled) return;
        if (!result) {
          setError("Candidatura no encontrada.");
          return;
        }
        setCtx(result.ctx);
        setDeck(result.deck);
        const form = result.deck.consultor_form;
        if (form?.fase1_rapida) setF1(form.fase1_rapida);
        if (form?.perfil_candidato) setPerfil(form.perfil_candidato);
        if (form?.territorio_ecd) setEcd(form.territorio_ecd);
        if (form?.votos_para_ganar) setVpg(form.votos_para_ganar as typeof vpg);
        // Seed from ctx if candidato name not set
        if (!form?.fase1_rapida?.candidato?.nombre_completo && result.ctx.user.full_name) {
          setF1((prev) => ({
            ...prev,
            candidato: {
              ...prev.candidato,
              nombre_completo: result.ctx.user.full_name,
              foto_url: result.ctx.user.foto_url ?? prev.candidato?.foto_url,
            },
          }));
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const scheduleSave = useCallback(
    (patch: Partial<ConsultorFormFase2>) => {
      pendingRef.current = { ...pendingRef.current, ...patch };
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        const toSave = pendingRef.current;
        pendingRef.current = {};
        setSaving(true);
        try {
          await onboardingApi.patchFase2Form(slug, toSave);
          setSavedAt(new Date());
        } finally {
          setSaving(false);
        }
      }, 1500);
    },
    [slug],
  );

  function updateF1(patch: Partial<Fase1Rapida>) {
    setF1((prev) => {
      const next = deepMerge(prev, patch) as Fase1Rapida;
      scheduleSave({ fase1_rapida: next });
      return next;
    });
  }

  function updateVpg(patch: Partial<typeof vpg>) {
    setVpg((prev) => {
      const next = { ...prev, ...patch };
      scheduleSave({ votos_para_ganar: next });
      return next;
    });
  }

  function updateEcd(patch: Partial<TerritoryEcd>) {
    setEcd((prev) => {
      const next = deepMerge(prev, patch) as TerritoryEcd;
      scheduleSave({ territorio_ecd: next });
      return next;
    });
  }

  function updatePerfil(patch: Partial<PerfilCandidato>) {
    setPerfil((prev) => {
      const next = deepMerge(
        prev as Record<string, unknown>,
        patch as Record<string, unknown>,
      ) as PerfilCandidato;
      scheduleSave({ perfil_candidato: next });
      return next;
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="size-10 animate-spin text-amber-500" />
      </div>
    );
  }

  if (error || !ctx || !deck) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-900">
        <div className="text-center px-6">
          <p className="text-red-500 mb-4 text-sm">{error ?? "Error"}</p>
          <button
            onClick={() => router.push("/onboarding")}
            className="px-6 py-2.5 rounded-full border border-slate-200 text-slate-600 text-sm"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  const nombre = f1.candidato?.nombre_completo ?? ctx.user.full_name ?? slug;
  const color1 = f1.branding?.color_primario ?? "#fbc02d";
  const territory =
    f1.postulacion?.nombre_territorio ??
    ctx.jurisdiccion.distrito?.nombre ??
    ctx.jurisdiccion.provincia?.nombre ??
    ctx.jurisdiccion.departamento?.nombre ??
    "";

  // Completion levels — 8 steps
  const comp: Record<StepId, CompletionLevel> = {
    candidato: objectCompletion(
      f1.candidato as Record<string, unknown> | undefined,
      ["nombre_completo", "bio_corta", "fecha_nacimiento"],
    ),
    territorio: (() => {
      const hasP = vpg.padron_actual != null;
      const hasE4 = (ecd.e4_campo_politico?.partidos_fuertes?.length ?? 0) > 0;
      if (!hasP && !hasE4) return "empty";
      return hasP && hasE4 ? "done" : "partial";
    })(),
    c2:
      ecd.c2_segmentos && ecd.c2_segmentos.length >= 2
        ? "done"
        : ecd.c2_segmentos && ecd.c2_segmentos.length > 0
          ? "partial"
          : "empty",
    d5:
      ecd.d5_matrix && ecd.d5_matrix.length > 0
        ? ecd.d5_matrix.every((r) => r.mensaje_clave && r.canal_efectivo)
          ? "done"
          : "partial"
        : "empty",
    propuestas:
      f1.propuestas && f1.propuestas.length >= 3
        ? "done"
        : f1.propuestas && f1.propuestas.length > 0
          ? "partial"
          : "empty",
    branding: objectCompletion(
      f1.branding as Record<string, unknown> | undefined,
      ["slogan", "color_primario"],
    ),
    foda: objectCompletion(
      f1.diagnostico_inicial as Record<string, unknown> | undefined,
      ["fortalezas", "debilidades"],
    ),
    conciencia: objectCompletion(
      ecd.c5_intencion_voto as Record<string, unknown> | undefined,
      ["candidato_puntero"],
    ),
  };

  // suppress unused-value warning for stringsCompletion — it is kept as a utility
  void stringsCompletion;

  const allLevels = Object.values(comp);
  const donePct = Math.round(
    (allLevels.filter((l) => l === "done").length / allLevels.length) * 100,
  );

  function getStepCompletion(id: StepId): CompletionLevel {
    return comp[id];
  }

  const currentStepDef = STEPS[currentStep]!;

  // Render left panel content
  function renderStepContent() {
    const id = currentStepDef.id;
    switch (id) {
      case "candidato":
        return (
          <CandidatoEditor
            f1={f1}
            ctx={ctx!}
            perfil={perfil}
            padronActual={vpg.padron_actual}
            onPadronChange={(v) => updateVpg({ padron_actual: v })}
            onChange={(patch) => updateF1(patch)}
            onPerfilChange={(patch) => updatePerfil(patch)}
          />
        );
      case "territorio":
        return (
          <TerritorioEditor
            f1={f1}
            ecd={ecd}
            padronActual={vpg.padron_actual}
            onPadronChange={(v) => updateVpg({ padron_actual: v })}
            onChange={(patch) => updateF1(patch)}
            onEcdChange={(patch) => updateEcd(patch)}
          />
        );
      case "c2":
        return (
          <C2SegmentosEditor
            value={ecd.c2_segmentos ?? []}
            onChange={(v) => updateEcd({ c2_segmentos: v })}
          />
        );
      case "d5":
        return (
          <D5MatrixEditor
            segments={ecd.c2_segmentos ?? []}
            value={ecd.d5_matrix ?? []}
            onChange={(v) => updateEcd({ d5_matrix: v })}
          />
        );
      case "propuestas":
        return (
          <PropuestasEditor
            value={f1.propuestas ?? []}
            onChange={(v) => updateF1({ propuestas: v })}
            color1={color1}
          />
        );
      case "branding":
        return (
          <BrandingEditor
            value={f1.branding ?? {}}
            onChange={(v) => updateF1({ branding: v })}
          />
        );
      case "foda":
        return (
          <FodaEditor
            value={f1.diagnostico_inicial ?? {}}
            onChange={(v) => updateF1({ diagnostico_inicial: v })}
          />
        );
      case "conciencia":
        return (
          <ConcienciaEditor
            value={ecd}
            onChange={(patch) => updateEcd(patch)}
          />
        );
    }
  }

  const stepCompletion = getStepCompletion(currentStepDef.id);
  const showHint = stepCompletion === "empty";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200">
        {/* Top row */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="size-8 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0"
              style={{
                background: color1 + "25",
                color: color1,
                border: `1.5px solid ${color1}50`,
              }}
            >
              {nombre[0]?.toUpperCase() ?? "C"}
            </div>
            <div>
              <h1 className="font-black text-slate-900 text-sm leading-tight">{nombre}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="h-1 w-20 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${donePct}%`,
                      background:
                        donePct >= 60 ? "#4ade80" : donePct >= 30 ? "#fbbf24" : "#94a3b8",
                    }}
                  />
                </div>
                <span className="text-[10px] text-slate-400">{donePct}%</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {saving ? (
              <span className="flex items-center gap-1.5 text-[10px] text-amber-700">
                <Loader2 className="size-3 animate-spin" /> Guardando…
              </span>
            ) : savedAt ? (
              <span className="flex items-center gap-1.5 text-[10px] text-green-700">
                <CheckCircle2 className="size-3" /> Guardado
              </span>
            ) : null}
            <a
              href={`/onboarding/${slug}/fase-2`}
              className="px-3.5 py-1.5 rounded-full text-[10px] uppercase tracking-wider font-bold transition-colors bg-amber-400/10 text-amber-700 border border-amber-400/30 hover:bg-amber-400/20"
            >
              Ver presentación →
            </a>
          </div>
        </div>

        {/* Step rail */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-2.5">
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
            {STEPS.map((step, i) => {
              const stepComp = getStepCompletion(step.id);
              const isCurrent = i === currentStep;
              const isHovered = hoveredStep === i;
              const preview = getStepPreview(step.id, f1, ecd, perfil, vpg);
              return (
                <div
                  key={step.id}
                  className="relative"
                  onMouseEnter={() => setHoveredStep(i)}
                  onMouseLeave={() => setHoveredStep(null)}
                >
                  <button
                    onClick={() => setCurrentStep(i)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-all ${
                      isCurrent
                        ? "bg-amber-400 text-slate-900"
                        : stepComp === "done"
                          ? "bg-green-100 text-green-700 border border-green-200"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                    }`}
                  >
                    <span
                      className={`size-1.5 rounded-full ${
                        isCurrent
                          ? "bg-slate-900"
                          : stepComp === "done"
                            ? "bg-green-500"
                            : "bg-slate-400"
                      }`}
                    />
                    {step.label}
                  </button>
                  {/* Hover preview tooltip */}
                  {isHovered && !isCurrent && preview && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none">
                      <div className="bg-white border border-slate-200 rounded-xl shadow-xl p-3 min-w-[180px] max-w-[240px]">
                        <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-1.5 font-semibold">
                          {step.label}
                        </p>
                        <div className="text-[11px] text-slate-700 leading-relaxed">
                          {preview}
                        </div>
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="flex-1 grid lg:grid-cols-2 gap-0">
        {/* LEFT PANEL */}
        <div className="overflow-y-auto">
          <div className="max-w-2xl mx-auto px-8 sm:px-12 py-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStepDef.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            >
              {/* Section title */}
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                  <div className="size-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
                    <currentStepDef.icon className="size-5 text-amber-600" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 leading-tight">{currentStepDef.label}</h2>
                    <p className="text-sm text-slate-500">{currentStepDef.hint}</p>
                  </div>
                </div>
              </div>

              {/* Context hint for empty sections */}
              {showHint && (
                <div className="mb-5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2.5">
                  <span className="text-amber-500 text-sm mt-0.5 flex-shrink-0">!</span>
                  <p className="text-[11px] text-amber-700/80 leading-relaxed">
                    Esta sección está vacía. Completala para enriquecer el perfil del candidato
                    y el deck de presentación.
                  </p>
                </div>
              )}

              {/* Editor */}
              {renderStepContent()}
            </motion.div>
          </AnimatePresence>
          </div>
        </div>

        {/* RIGHT PANEL — live profile card */}
        <div className="hidden lg:block sticky top-[73px] self-start h-[calc(100vh-73px)] bg-slate-100 border-l border-slate-200 overflow-y-auto">
          <LiveProfileCard
            f1={f1}
            ecd={ecd}
            color1={color1}
            nombre={nombre}
            donePct={donePct}
            territory={territory}
          />
        </div>
      </div>

      {/* ── Sticky footer ──────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 z-20 bg-white/95 backdrop-blur-md border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <button
            onClick={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
            disabled={currentStep === 0}
            className="px-4 py-2 rounded-full text-[11px] font-bold text-slate-500 hover:text-slate-900 disabled:opacity-30 transition-colors"
          >
            ← Anterior
          </button>
          <span className="text-[10px] text-slate-400">
            {currentStep + 1} / {STEPS.length}
          </span>
          {currentStep < STEPS.length - 1 ? (
            <button
              onClick={() => setCurrentStep((prev) => Math.min(STEPS.length - 1, prev + 1))}
              className="px-5 py-2 rounded-full text-[11px] font-bold bg-amber-400/10 text-amber-700 border border-amber-400/30 hover:bg-amber-400/20 transition-colors"
            >
              Siguiente →
            </button>
          ) : (
            <a
              href={`/onboarding/${slug}/fase-2`}
              className="px-5 py-2 rounded-full text-[11px] font-bold bg-amber-400 text-slate-900 hover:bg-amber-300 transition-colors"
            >
              Ver Presentación →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
