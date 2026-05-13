"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronLeft, ChevronRight, Check, Loader2, Plus, Trash2,
  User, MapPin, Zap, BarChart2, Lightbulb, Palette, Globe, Eye
} from "lucide-react";

import { CloudSkyBg } from "@/components/cloud-sky-bg";
import { onboardingApi, type Fase1Rapida } from "@/lib/onboarding-api";

// ── Types ────────────────────────────────────────────────────────────

type Section = {
  id: string;
  label: string;
  icon: React.ReactNode;
};

const SECTIONS: Section[] = [
  { id: "candidato",           label: "Candidato",     icon: <User className="size-4" /> },
  { id: "postulacion",         label: "Postulación",   icon: <MapPin className="size-4" /> },
  { id: "estrategia",          label: "Estrategia",    icon: <Zap className="size-4" /> },
  { id: "diagnostico_inicial", label: "Diagnóstico",   icon: <BarChart2 className="size-4" /> },
  { id: "propuestas",          label: "Propuestas",    icon: <Lightbulb className="size-4" /> },
  { id: "branding",            label: "Branding",      icon: <Palette className="size-4" /> },
  { id: "contexto_territorio", label: "Territorio",    icon: <Globe className="size-4" /> },
];

const CARGO_OPTIONS = [
  { value: "alcalde_distrital",   label: "Alcalde Distrital" },
  { value: "alcalde_provincial",  label: "Alcalde Provincial" },
  { value: "regidor",             label: "Regidor" },
  { value: "consejero_regional",  label: "Consejero Regional" },
  { value: "gobernador_regional", label: "Gobernador Regional" },
  { value: "congresista",         label: "Congresista" },
  { value: "presidente",          label: "Presidente" },
];

// ── Helpers ──────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay = 1200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ── Field components ─────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-[0.2em] text-gray-400 font-semibold mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-gray-600">{hint}</p>}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-4 py-3 bg-black/40 border-2 border-gray-700/50 rounded-xl text-white placeholder:text-gray-600 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
    />
  );
}

function Textarea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-4 py-3 bg-black/40 border-2 border-gray-700/50 rounded-xl text-white placeholder:text-gray-600 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all resize-none"
    />
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder = "Seleccionar...",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-4 py-3 bg-black/40 border-2 border-gray-700/50 rounded-xl text-white focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all appearance-none"
    >
      <option value="" disabled>{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-[#0a1e4a]">{o.label}</option>
      ))}
    </select>
  );
}

function RadioGroup({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; desc?: string }[];
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`p-3 rounded-xl border-2 text-left transition-all ${
            value === o.value
              ? "border-amber-400 bg-amber-400/10 text-amber-400"
              : "border-gray-700/50 bg-black/30 text-gray-300 hover:border-gray-600"
          }`}
        >
          <div className="flex items-center gap-2">
            <div className={`size-3.5 rounded-full border-2 flex-shrink-0 ${
              value === o.value ? "border-amber-400 bg-amber-400" : "border-gray-600"
            }`} />
            <span className="text-sm font-semibold">{o.label}</span>
          </div>
          {o.desc && <p className="mt-1 text-xs text-gray-500 ml-5.5">{o.desc}</p>}
        </button>
      ))}
    </div>
  );
}

function CheckGroup({
  values,
  onChange,
  options,
  max,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  options: { value: string; label: string }[];
  max?: number;
}) {
  const toggle = (v: string) => {
    if (values.includes(v)) {
      onChange(values.filter((x) => x !== v));
    } else if (!max || values.length < max) {
      onChange([...values, v]);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = values.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className={`px-3 py-1.5 rounded-full border text-xs font-semibold uppercase tracking-wider transition-all ${
              active
                ? "border-amber-400 bg-amber-400/15 text-amber-400"
                : "border-gray-700 bg-black/20 text-gray-500 hover:border-gray-500 hover:text-gray-300"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function TagList({
  items,
  onChange,
  placeholder,
  minItems = 1,
}: {
  items: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  minItems?: number;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !items.includes(v)) {
      onChange([...items, v]);
      setDraft("");
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={placeholder ?? "Agregar y presionar Enter..."}
          className="flex-1 px-3 py-2 bg-black/40 border-2 border-gray-700/50 rounded-lg text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-amber-500 transition-all"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 disabled:opacity-40 hover:bg-amber-500/25 transition-all"
        >
          <Plus className="size-4" />
        </button>
      </div>
      {items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {items.map((item, i) => (
            <li key={i} className="flex items-center gap-2 px-3 py-2 bg-[#0a1e4a]/60 rounded-lg border border-white/5">
              <span className="flex-1 text-sm text-gray-200">{item}</span>
              {items.length > minItems && (
                <button
                  type="button"
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
                  className="text-gray-600 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Section: Candidato ───────────────────────────────────────────────

function SectionCandidato({
  data,
  onChange,
}: {
  data: NonNullable<Fase1Rapida["candidato"]>;
  onChange: (v: Fase1Rapida["candidato"]) => void;
}) {
  const set = (k: string, v: unknown) => onChange({ ...data, [k]: v });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <div className="sm:col-span-2">
        <Field label="Nombre completo">
          <TextInput value={data.nombre_completo ?? ""} onChange={(v) => set("nombre_completo", v)} placeholder="Ej: Carlos Mendoza Torres" />
        </Field>
      </div>
      <Field label="Apodo / nombre de campaña">
        <TextInput value={data.apodo ?? ""} onChange={(v) => set("apodo", v)} placeholder="Ej: Carlos" />
      </Field>
      <Field label="Profesión / ocupación">
        <TextInput value={data.ocupacion_actual ?? ""} onChange={(v) => set("ocupacion_actual", v)} placeholder="Ej: Médico cirujano" />
      </Field>
      <Field label="Fecha de nacimiento">
        <TextInput type="date" value={data.fecha_nacimiento ?? ""} onChange={(v) => set("fecha_nacimiento", v)} />
      </Field>
      <Field label="Sexo">
        <Select
          value={data.sexo ?? ""}
          onChange={(v) => set("sexo", v)}
          options={[{ value: "M", label: "Masculino" }, { value: "F", label: "Femenino" }]}
        />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Bio corta (máx. 300 caracteres)" hint={`${(data.bio_corta ?? "").length}/300`}>
          <Textarea
            value={data.bio_corta ?? ""}
            onChange={(v) => v.length <= 300 && set("bio_corta", v)}
            placeholder="Médico con 15 años de servicio en Lima Norte, ex director de hospital distrital..."
            rows={3}
          />
        </Field>
      </div>
      <Field label="Tipo">
        <RadioGroup
          value={data.tipo ?? "candidato-propio"}
          onChange={(v) => set("tipo", v)}
          options={[
            { value: "candidato-propio", label: "Propio" },
            { value: "aliado", label: "Aliado" },
            { value: "rival", label: "Rival" },
          ]}
        />
      </Field>
    </div>
  );
}

// ── Section: Postulación ─────────────────────────────────────────────

function SectionPostulacion({
  data,
  onChange,
}: {
  data: NonNullable<Fase1Rapida["postulacion"]>;
  onChange: (v: Fase1Rapida["postulacion"]) => void;
}) {
  const set = (k: string, v: unknown) => onChange({ ...data, [k]: v });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <div className="sm:col-span-2">
        <Field label="Cargo al que postula">
          <Select
            value={data.cargo_codigo ?? ""}
            onChange={(v) => set("cargo_codigo", v)}
            options={CARGO_OPTIONS}
          />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Nombre del territorio (distrito, provincia, etc.)">
          <TextInput value={data.nombre_territorio ?? ""} onChange={(v) => set("nombre_territorio", v)} placeholder="Ej: Lima Norte" />
        </Field>
      </div>
      <Field label="Nivel del territorio">
        <Select
          value={data.nivel_territorio ?? ""}
          onChange={(v) => set("nivel_territorio", v)}
          options={[
            { value: "distrital", label: "Distrital" },
            { value: "provincial", label: "Provincial" },
            { value: "regional", label: "Regional" },
            { value: "nacional", label: "Nacional" },
          ]}
        />
      </Field>
      <Field label="Fecha de elección">
        <TextInput type="date" value={data.fecha_eleccion ?? ""} onChange={(v) => set("fecha_eleccion", v)} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Organización política / partido">
          <TextInput value={data.nombre_organizacion ?? ""} onChange={(v) => set("nombre_organizacion", v)} placeholder="Ej: Avancemos Lima" />
        </Field>
      </div>
    </div>
  );
}

// ── Section: Estrategia ──────────────────────────────────────────────

function SectionEstrategia({
  data,
  onChange,
}: {
  data: NonNullable<Fase1Rapida["estrategia"]>;
  onChange: (v: Fase1Rapida["estrategia"]) => void;
}) {
  const set = (k: string, v: unknown) => onChange({ ...data, [k]: v });
  return (
    <div className="space-y-6">
      <Field label="Tipo de campaña">
        <RadioGroup
          value={data.tipo_campana ?? ""}
          onChange={(v) => set("tipo_campana", v)}
          options={[
            { value: "RACIONAL",   label: "Racional",   desc: "Data + plan de gobierno" },
            { value: "EMOTIVA",    label: "Emotiva",    desc: "Emoción + conexión humana" },
            { value: "INSTINTIVA", label: "Instintiva", desc: "Imagen + carisma + presencia" },
            { value: "MIXTA",      label: "Mixta",      desc: "Combinación — elegir 2" },
          ]}
        />
      </Field>
      {data.tipo_campana === "MIXTA" && (
        <Field label="Combinación (elegir 2)">
          <CheckGroup
            values={data.combinacion_mixta ?? []}
            onChange={(v) => set("combinacion_mixta", v)}
            options={[
              { value: "RACIONAL", label: "Racional" },
              { value: "EMOTIVA", label: "Emotiva" },
              { value: "INSTINTIVA", label: "Instintiva" },
            ]}
            max={2}
          />
        </Field>
      )}
      <Field label="Eje emocional dominante">
        <RadioGroup
          value={data.eje_emocional ?? ""}
          onChange={(v) => set("eje_emocional", v)}
          options={[
            { value: "PLAN_DE_GOBIERNO", label: "Plan de gobierno" },
            { value: "EQUIPO_DE_CAMPAÑA", label: "Equipo de campaña" },
            { value: "SIMPATIA",          label: "Simpatía" },
            { value: "ESPERANZA",         label: "Esperanza" },
            { value: "ODIO",              label: "Indignación / Odio" },
            { value: "MIEDO",             label: "Miedo" },
          ]}
        />
      </Field>
      <Field label="Frente principal">
        <RadioGroup
          value={data.frente_principal ?? ""}
          onChange={(v) => set("frente_principal", v)}
          options={[
            { value: "TIERRA", label: "Tierra", desc: "Puerta a puerta, mercados, mítines" },
            { value: "MAR",    label: "Mar",    desc: "TV, radio, prensa escrita" },
            { value: "AIRE",   label: "Aire",   desc: "Redes sociales, ads digitales" },
          ]}
        />
      </Field>
      <Field label="Frentes secundarios (hasta 2)">
        <CheckGroup
          values={data.frentes_secundarios ?? []}
          onChange={(v) => set("frentes_secundarios", v)}
          options={[
            { value: "TIERRA", label: "Tierra" },
            { value: "MAR",    label: "Mar" },
            { value: "AIRE",   label: "Aire" },
          ]}
          max={2}
        />
      </Field>
    </div>
  );
}

// ── Section: Diagnóstico ─────────────────────────────────────────────

function SectionDiagnostico({
  data,
  onChange,
}: {
  data: NonNullable<Fase1Rapida["diagnostico_inicial"]>;
  onChange: (v: Fase1Rapida["diagnostico_inicial"]) => void;
}) {
  const set = (k: string, v: unknown) => onChange({ ...data, [k]: v });
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Field label="Fortalezas (mín. 3)">
          <TagList
            items={data.fortalezas ?? []}
            onChange={(v) => set("fortalezas", v)}
            placeholder="Agregar fortaleza..."
            minItems={0}
          />
        </Field>
        <Field label="Debilidades (mín. 3)">
          <TagList
            items={data.debilidades ?? []}
            onChange={(v) => set("debilidades", v)}
            placeholder="Agregar debilidad..."
            minItems={0}
          />
        </Field>
        <Field label="Oportunidades (mín. 3)">
          <TagList
            items={data.oportunidades ?? []}
            onChange={(v) => set("oportunidades", v)}
            placeholder="Agregar oportunidad..."
            minItems={0}
          />
        </Field>
        <Field label="Amenazas (mín. 3)">
          <TagList
            items={data.amenazas ?? []}
            onChange={(v) => set("amenazas", v)}
            placeholder="Agregar amenaza..."
            minItems={0}
          />
        </Field>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs uppercase tracking-[0.2em] text-gray-400 font-semibold">
            Competidores principales (máx. 5)
          </label>
          {(data.principales_competidores?.length ?? 0) < 5 && (
            <button
              type="button"
              onClick={() =>
                set("principales_competidores", [
                  ...(data.principales_competidores ?? []),
                  { nombre: "", nivel_amenaza: "medio" },
                ])
              }
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-400/30 text-amber-400 text-xs hover:bg-amber-400/10 transition-colors"
            >
              <Plus className="size-3" />
              Agregar
            </button>
          )}
        </div>
        <div className="space-y-3">
          {(data.principales_competidores ?? []).map((c, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-start bg-[#0a1e4a]/40 rounded-xl p-3 border border-white/5">
              <div className="col-span-12 sm:col-span-4">
                <TextInput
                  value={c.nombre}
                  onChange={(v) => {
                    const arr = [...(data.principales_competidores ?? [])];
                    arr[i] = { ...arr[i]!, nombre: v };
                    set("principales_competidores", arr);
                  }}
                  placeholder="Nombre del rival"
                />
              </div>
              <div className="col-span-5 sm:col-span-3">
                <TextInput
                  value={c.partido ?? ""}
                  onChange={(v) => {
                    const arr = [...(data.principales_competidores ?? [])];
                    arr[i] = { ...arr[i]!, partido: v };
                    set("principales_competidores", arr);
                  }}
                  placeholder="Partido"
                />
              </div>
              <div className="col-span-5 sm:col-span-3">
                <Select
                  value={c.nivel_amenaza ?? "medio"}
                  onChange={(v) => {
                    const arr = [...(data.principales_competidores ?? [])];
                    arr[i] = { ...arr[i]!, nivel_amenaza: v as "bajo" | "medio" | "alto" };
                    set("principales_competidores", arr);
                  }}
                  options={[
                    { value: "bajo", label: "Bajo" },
                    { value: "medio", label: "Medio" },
                    { value: "alto", label: "Alto" },
                  ]}
                />
              </div>
              <div className="col-span-2 flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() =>
                    set(
                      "principales_competidores",
                      (data.principales_competidores ?? []).filter((_, j) => j !== i),
                    )
                  }
                  className="p-2 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
          {(data.principales_competidores ?? []).length === 0 && (
            <p className="text-xs text-gray-600 italic">Sin competidores registrados aún.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Section: Propuestas ──────────────────────────────────────────────

function SectionPropuestas({
  data,
  onChange,
}: {
  data: NonNullable<Fase1Rapida["propuestas"]>;
  onChange: (v: Fase1Rapida["propuestas"]) => void;
}) {
  const add = () => {
    if (data.length < 6) {
      onChange([...data, { orden: data.length + 1, titulo: "", descripcion_corta: "", icono: "⭐" }]);
    }
  };
  const update = (i: number, k: string, v: unknown) => {
    const arr = [...data];
    arr[i] = { ...arr[i]!, [k]: v };
    onChange(arr);
  };
  const remove = (i: number) => {
    onChange(
      data
        .filter((_, j) => j !== i)
        .map((p, j) => ({ ...p, orden: j + 1 })),
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">Entre 3 y 6 propuestas. Cada descripción corta máx. 140 caracteres.</p>
      {data.map((p, i) => (
        <div key={i} className="bg-[#0a1e4a]/40 border border-white/5 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className="size-7 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-400 font-black text-sm flex items-center justify-center flex-shrink-0">
              {p.orden}
            </span>
            <input
              type="text"
              value={p.icono ?? "⭐"}
              onChange={(e) => update(i, "icono", e.target.value)}
              maxLength={2}
              className="size-10 text-center bg-black/30 border border-gray-700 rounded-lg text-lg focus:outline-none focus:border-amber-500"
            />
            <div className="flex-1">
              <TextInput
                value={p.titulo}
                onChange={(v) => update(i, "titulo", v)}
                placeholder={`Propuesta ${p.orden} — título breve`}
              />
            </div>
            {data.length > 3 && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="p-2 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-colors flex-shrink-0"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
          <div>
            <Textarea
              value={p.descripcion_corta}
              onChange={(v) => v.length <= 140 && update(i, "descripcion_corta", v)}
              placeholder="Descripción breve de la propuesta (máx. 140 caracteres)"
              rows={2}
            />
            <p className="text-[11px] text-gray-600 mt-1 text-right">
              {p.descripcion_corta.length}/140
            </p>
          </div>
        </div>
      ))}
      {data.length < 6 && (
        <button
          type="button"
          onClick={add}
          className="w-full py-3 rounded-xl border-2 border-dashed border-gray-700/60 text-gray-600 hover:border-amber-400/40 hover:text-amber-400/70 transition-all flex items-center justify-center gap-2 text-sm"
        >
          <Plus className="size-4" />
          Agregar propuesta
        </button>
      )}
    </div>
  );
}

// ── Section: Branding ────────────────────────────────────────────────

function SectionBranding({
  data,
  onChange,
}: {
  data: NonNullable<Fase1Rapida["branding"]>;
  onChange: (v: Fase1Rapida["branding"]) => void;
}) {
  const set = (k: string, v: unknown) => onChange({ ...data, [k]: v });
  const color1 = data.color_primario ?? "#fbc02d";
  const color2 = data.color_secundario ?? "#0a1e4a";

  return (
    <div className="space-y-5">
      <Field label="Slogan de campaña">
        <TextInput
          value={data.slogan ?? ""}
          onChange={(v) => set("slogan", v)}
          placeholder="Ej: Con Carlos, Lima avanza"
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Color primario">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={color1}
              onChange={(e) => set("color_primario", e.target.value)}
              className="size-12 rounded-xl border-2 border-gray-700 cursor-pointer bg-transparent"
            />
            <TextInput value={color1} onChange={(v) => set("color_primario", v)} placeholder="#fbc02d" />
          </div>
        </Field>
        <Field label="Color secundario">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={color2}
              onChange={(e) => set("color_secundario", e.target.value)}
              className="size-12 rounded-xl border-2 border-gray-700 cursor-pointer bg-transparent"
            />
            <TextInput value={color2} onChange={(v) => set("color_secundario", v)} placeholder="#0a1e4a" />
          </div>
        </Field>
      </div>

      {/* Live brand preview */}
      <div className="mt-4">
        <p className="text-[10px] uppercase tracking-[0.25em] text-gray-600 mb-2">Vista previa</p>
        <div
          className="rounded-xl p-5 flex flex-col gap-2"
          style={{ background: color2, border: `2px solid ${color1}40` }}
        >
          <div
            className="h-1.5 w-24 rounded-full"
            style={{ background: color1 }}
          />
          <p className="text-lg font-black text-white" style={{ textShadow: `0 0 20px ${color1}40` }}>
            {data.slogan || "Tu slogan aquí"}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <div className="size-2 rounded-full" style={{ background: color1 }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: color1 }}>
              Goberna · Consultoría Política
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Section: Territorio ──────────────────────────────────────────────

function SectionTerritorio({
  data,
  onChange,
}: {
  data: NonNullable<Fase1Rapida["contexto_territorio"]>;
  onChange: (v: Fase1Rapida["contexto_territorio"]) => void;
}) {
  const set = (k: string, v: unknown) => onChange({ ...data, [k]: v });
  return (
    <div className="space-y-5">
      <Field label="Población aproximada">
        <TextInput
          type="number"
          value={String(data.poblacion_aproximada ?? "")}
          onChange={(v) => set("poblacion_aproximada", v ? Number(v) : undefined)}
          placeholder="Ej: 350000"
        />
      </Field>
      <Field label="Principales problemas del territorio">
        <TagList
          items={data.principales_problemas ?? []}
          onChange={(v) => set("principales_problemas", v)}
          placeholder="Ej: Inseguridad ciudadana"
          minItems={0}
        />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Zonas fuertes">
          <TagList
            items={data.zonas_fuertes ?? []}
            onChange={(v) => set("zonas_fuertes", v)}
            placeholder="Ej: Centro histórico"
            minItems={0}
          />
        </Field>
        <Field label="Zonas débiles">
          <TagList
            items={data.zonas_debiles ?? []}
            onChange={(v) => set("zonas_debiles", v)}
            placeholder="Ej: Zona norte periférica"
            minItems={0}
          />
        </Field>
      </div>
      <Field label="Notas adicionales">
        <Textarea
          value={data.notas_adicionales ?? ""}
          onChange={(v) => set("notas_adicionales", v)}
          placeholder="Contexto relevante: economía local, historial político, dinámicas culturales..."
          rows={4}
        />
      </Field>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────

export function Fase1RapidaClient({ slug }: { slug: string }) {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<Fase1Rapida>({
    modo: "rapida",
    candidato: {},
    postulacion: {},
    estrategia: {},
    diagnostico_inicial: { fortalezas: [], debilidades: [], oportunidades: [], amenazas: [], principales_competidores: [] },
    propuestas: [],
    branding: { color_primario: "#fbc02d", color_secundario: "#0a1e4a" },
    contexto_territorio: { principales_problemas: [], zonas_fuertes: [], zonas_debiles: [] },
    secciones_completas: [],
  });

  // Load existing data
  useEffect(() => {
    (async () => {
      try {
        const result = await onboardingApi.getFase2BySlug(slug);
        if (result?.deck.consultor_form?.fase1_rapida) {
          setForm((prev) => ({ ...prev, ...result.deck.consultor_form!.fase1_rapida! }));
        }
      } catch {
        // no-op — fresh form
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  // Auto-save with debounce
  const debouncedForm = useDebounce(form, 1500);
  const lastSavedRef = useRef<string>("");

  useEffect(() => {
    const serialized = JSON.stringify(debouncedForm);
    if (serialized === lastSavedRef.current || loading) return;
    lastSavedRef.current = serialized;
    (async () => {
      setSaving(true);
      try {
        await onboardingApi.patchFase2Form(slug, { fase1_rapida: debouncedForm });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSaving(false);
      }
    })();
  }, [debouncedForm, slug, loading]);

  const updateSection = useCallback(
    <K extends keyof Fase1Rapida>(key: K, value: Fase1Rapida[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handlePreview = async () => {
    // Save immediately then go to fase-2
    setSaving(true);
    try {
      await onboardingApi.patchFase2Form(slug, { fase1_rapida: form });
    } finally {
      setSaving(false);
    }
    router.push(`/onboarding/${slug}/fase-2`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020a1e]">
        <Loader2 className="size-10 animate-spin text-amber-400" />
      </div>
    );
  }

  const currentSection = SECTIONS[activeSection]!;

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#020a1e] text-white">
      <CloudSkyBg />

      {/* Top bar */}
      <div className="fixed top-0 inset-x-0 z-30 px-4 sm:px-8 pt-4 sm:pt-5 flex items-center justify-between gap-3 pointer-events-none">
        <a
          href={`/onboarding/${slug}/fase-2`}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-[#020a1e]/60 backdrop-blur-md px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-amber-400/80 hover:text-amber-400 hover:border-amber-400/40 transition-colors font-semibold"
        >
          <ChevronLeft className="size-3.5" />
          Volver
        </a>

        <div className="pointer-events-auto rounded-full bg-[#020a1e]/80 backdrop-blur-md border border-amber-400/20 px-4 py-1.5 text-[10px] uppercase tracking-[0.3em] text-amber-400/90 font-semibold">
          Fase 1 · Onboarding
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          {/* Save indicator */}
          <AnimatePresence>
            {(saving || saved) && (
              <motion.span
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-[10px] uppercase tracking-[0.15em] text-amber-400/60"
              >
                {saving ? "Guardando..." : "✓ Guardado"}
              </motion.span>
            )}
          </AnimatePresence>
          <button
            onClick={handlePreview}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-600 text-[#0a1e4a] px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] font-black shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 transition-all"
          >
            <Eye className="size-3.5" />
            Previsualizar
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto w-full max-w-5xl px-4 sm:px-6 pt-20 pb-32 min-h-screen flex">
        {/* Sidebar */}
        <aside className="hidden lg:flex flex-col gap-1 w-52 flex-shrink-0 pr-8 pt-8 sticky top-20 self-start">
          <p className="text-[10px] uppercase tracking-[0.3em] text-gray-600 font-semibold mb-3">
            Secciones
          </p>
          {SECTIONS.map((s, i) => {
            const isActive = i === activeSection;
            const isDone = (form.secciones_completas ?? []).includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSection(i)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                  isActive
                    ? "bg-amber-400/15 border border-amber-400/30 text-amber-400"
                    : "border border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5"
                }`}
              >
                <span className={isActive ? "text-amber-400" : isDone ? "text-green-400" : "text-gray-600"}>
                  {isDone && !isActive ? <Check className="size-4" /> : s.icon}
                </span>
                <span>{s.label}</span>
                <span className={`ml-auto text-[10px] font-black ${isActive ? "text-amber-400" : "text-gray-700"}`}>
                  {String(i + 1).padStart(2, "0")}
                </span>
              </button>
            );
          })}

          <div className="mt-6 pt-4 border-t border-white/5">
            <button
              onClick={handlePreview}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-600 text-[#0a1e4a] font-black text-sm shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 transition-all flex items-center justify-center gap-2"
            >
              <Eye className="size-4" />
              Ver Fase 2
            </button>
          </div>
        </aside>

        {/* Main form */}
        <div className="flex-1 min-w-0 pt-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSection.id}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="w-full"
            >
              {/* Section header */}
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                  <span className="size-10 rounded-xl bg-amber-400/15 border border-amber-400/30 text-amber-400 flex items-center justify-center">
                    {currentSection.icon}
                  </span>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-amber-400/70 font-semibold">
                      Sección {String(activeSection + 1).padStart(2, "0")} de {SECTIONS.length}
                    </p>
                    <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                      {currentSection.label}
                    </h2>
                  </div>
                </div>
                {/* Section progress bar */}
                <div className="h-1 bg-gray-800 rounded-full mt-4">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full transition-all duration-300"
                    style={{ width: `${((activeSection + 1) / SECTIONS.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Section content */}
              <div className="space-y-6">
                {activeSection === 0 && (
                  <SectionCandidato
                    data={form.candidato ?? {}}
                    onChange={(v) => updateSection("candidato", v)}
                  />
                )}
                {activeSection === 1 && (
                  <SectionPostulacion
                    data={form.postulacion ?? {}}
                    onChange={(v) => updateSection("postulacion", v)}
                  />
                )}
                {activeSection === 2 && (
                  <SectionEstrategia
                    data={form.estrategia ?? {}}
                    onChange={(v) => updateSection("estrategia", v)}
                  />
                )}
                {activeSection === 3 && (
                  <SectionDiagnostico
                    data={form.diagnostico_inicial ?? {}}
                    onChange={(v) => updateSection("diagnostico_inicial", v)}
                  />
                )}
                {activeSection === 4 && (
                  <SectionPropuestas
                    data={form.propuestas ?? []}
                    onChange={(v) => updateSection("propuestas", v)}
                  />
                )}
                {activeSection === 5 && (
                  <SectionBranding
                    data={form.branding ?? {}}
                    onChange={(v) => updateSection("branding", v)}
                  />
                )}
                {activeSection === 6 && (
                  <SectionTerritorio
                    data={form.contexto_territorio ?? {}}
                    onChange={(v) => updateSection("contexto_territorio", v)}
                  />
                )}
              </div>

              {/* Nav buttons */}
              <div className="flex items-center justify-between mt-10">
                <button
                  type="button"
                  onClick={() => setActiveSection((i) => Math.max(0, i - 1))}
                  disabled={activeSection === 0}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-gray-700 text-gray-400 text-sm font-semibold hover:border-gray-500 hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="size-4" />
                  Anterior
                </button>
                {activeSection < SECTIONS.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setActiveSection((i) => Math.min(SECTIONS.length - 1, i + 1))}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-600 text-[#0a1e4a] text-sm font-black shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 transition-all"
                  >
                    Siguiente
                    <ChevronRight className="size-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handlePreview}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-600 text-[#0a1e4a] text-sm font-black shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 transition-all"
                  >
                    <Eye className="size-4" />
                    Ver presentación Fase 2
                  </button>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Error toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-red-500/20 border border-red-500/40 rounded-xl px-5 py-3 text-sm text-red-300"
          >
            {error}
            <button onClick={() => setError(null)} className="ml-3 text-red-500 hover:text-red-300">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer — dot indicator */}
      <div className="fixed bottom-0 inset-x-0 z-20 bg-gradient-to-t from-[#020a1e] via-[#020a1e]/95 to-transparent backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400/70">
            <span className="size-7 rounded-full border border-amber-400/40 bg-amber-400/10 flex items-center justify-center text-amber-400 font-black text-xs">G</span>
            <span className="hidden sm:inline font-semibold">Goberna · Fase 1</span>
          </div>
          <div className="flex items-center gap-1.5">
            {SECTIONS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSection(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === activeSection
                    ? "w-10 bg-amber-400"
                    : i < activeSection
                      ? "w-3 bg-amber-400/40"
                      : "w-3 bg-gray-700"
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-gray-400 tabular-nums">
            <span className="text-amber-400 font-semibold">{activeSection + 1}</span> / {SECTIONS.length}
          </span>
        </div>
      </div>
    </div>
  );
}
