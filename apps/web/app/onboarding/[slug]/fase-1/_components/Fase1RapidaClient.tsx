"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, Plus, Trash2,
  User, MapPin, Zap, BarChart2, Lightbulb, Palette, Globe
} from "lucide-react";

import { onboardingApi, type Fase1Rapida, type CandidatoContext, type ConsultorFormFase2 } from "@/lib/onboarding-api";

import { WizardShell } from "./wizard/WizardShell";
import {
  useDebounce,
  Field,
  TextInput,
  Textarea,
  Select,
  RadioGroup,
  CheckGroup,
  TagList,
} from "./form-fields";
import { SectionQuienEs } from "./sections/SectionQuienEs";
import { SectionPresenciaDigital } from "./sections/SectionPresenciaDigital";
import { SectionDebilidades } from "./sections/SectionDebilidades";
import { SectionVotos } from "./sections/SectionVotos";
import { SectionSegmentos } from "./sections/SectionSegmentos";
import { SectionRecorrido } from "./sections/SectionRecorrido";

import { UserCircle, Globe2, AlertTriangle, Vote, Users2, Route } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────

type Section = {
  id: string;
  label: string;
  icon: React.ReactNode;
  category: "minimo" | "extendido";
};

const SECTIONS: Section[] = [
  // ── MÍNIMO (form Fase 1 rápido — escribe a consultor_form.fase1_rapida) ──
  { id: "candidato",           label: "Candidato",         icon: <User className="size-4" />,           category: "minimo" },
  { id: "postulacion",         label: "Postulación",       icon: <MapPin className="size-4" />,         category: "minimo" },
  { id: "estrategia",          label: "Estrategia",        icon: <Zap className="size-4" />,            category: "minimo" },
  { id: "diagnostico_inicial", label: "Diagnóstico",       icon: <BarChart2 className="size-4" />,      category: "minimo" },
  { id: "propuestas",          label: "Propuestas",        icon: <Lightbulb className="size-4" />,      category: "minimo" },
  { id: "branding",            label: "Branding",          icon: <Palette className="size-4" />,        category: "minimo" },
  { id: "contexto_territorio", label: "Territorio",        icon: <Globe className="size-4" />,          category: "minimo" },
  // ── EXTENDIDO (escribe a top-level del consultor_form) ──
  { id: "quien_es",            label: "¿Quién es?",        icon: <UserCircle className="size-4" />,     category: "extendido" },
  { id: "presencia",           label: "Presencia digital", icon: <Globe2 className="size-4" />,         category: "extendido" },
  { id: "debilidades",         label: "Debilidades",       icon: <AlertTriangle className="size-4" />,  category: "extendido" },
  { id: "votos",               label: "Votos y padrón",    icon: <Vote className="size-4" />,           category: "extendido" },
  { id: "segmentos",           label: "Segmentación",      icon: <Users2 className="size-4" />,         category: "extendido" },
  { id: "recorrido",           label: "Recorrido",         icon: <Route className="size-4" />,          category: "extendido" },
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

interface Fase1RapidaClientProps {
  slug: string;
  /** Si está presente, se monta con este ctx y se saltea el fetch al backend. */
  mockCtx?: CandidatoContext | null;
  /** Si está presente, hidrata el form inicial sin llamar al backend. */
  mockForm?: Fase1Rapida;
}

export function Fase1RapidaClient({ slug, mockCtx, mockForm }: Fase1RapidaClientProps) {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ctx, setCtx] = useState<CandidatoContext | null>(null);

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

  // Campos top-level del consultor_form (alimentan las secciones "extendido"
  // del sidebar y las slides Quién es / Presencia / Debilidades / Votos /
  // Segmentos / Reorganizar / Arquitectura del deck Fase 2).
  type ExtendedFields = Pick<
    ConsultorFormFase2,
    | "quien_es"
    | "presencia_digital"
    | "redes_sociales"
    | "debilidades"
    | "votos_para_ganar"
    | "historial"
    | "territorio_ecd"
    | "recorrido_estrategico"
    | "formula_electoral"
  >;
  const [extended, setExtended] = useState<ExtendedFields>({
    quien_es: {},
    presencia_digital: {},
    redes_sociales: { candidato: {} },
    debilidades: {},
    votos_para_ganar: {},
    historial: { entries: [] },
    territorio_ecd: { c2_segmentos: [], nucleo_goberna: { segmentos_prioritarios: [] } },
    recorrido_estrategico: { hitos: [] },
    formula_electoral: {},
  });

  const updateExtended = useCallback(
    <K extends keyof ExtendedFields>(key: K, value: ExtendedFields[K]) => {
      setExtended((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // Load existing data — o usar mocks si se pasaron (preview dev)
  useEffect(() => {
    if (mockCtx !== undefined || mockForm !== undefined) {
      if (mockCtx) {
        setCtx(mockCtx);
        // hydrate extended desde consultor_form del mock
        const cf = mockCtx.consultor_form;
        if (cf) {
          setExtended((prev) => ({
            ...prev,
            quien_es:               cf.quien_es ?? prev.quien_es,
            presencia_digital:      cf.presencia_digital ?? prev.presencia_digital,
            redes_sociales:         cf.redes_sociales ?? prev.redes_sociales,
            debilidades:            cf.debilidades ?? prev.debilidades,
            votos_para_ganar:       cf.votos_para_ganar ?? prev.votos_para_ganar,
            historial:              cf.historial ?? prev.historial,
            territorio_ecd:         cf.territorio_ecd ?? prev.territorio_ecd,
            recorrido_estrategico:  cf.recorrido_estrategico ?? prev.recorrido_estrategico,
            formula_electoral:      cf.formula_electoral ?? prev.formula_electoral,
          }));
        }
      }
      if (mockForm) setForm((prev) => ({ ...prev, ...mockForm }));
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const result = await onboardingApi.getFase2BySlug(slug);
        if (result?.ctx) {
          setCtx(result.ctx);
        }
        if (result?.deck.consultor_form) {
          const cf = result.deck.consultor_form;
          if (cf.fase1_rapida) {
            setForm((prev) => ({ ...prev, ...cf.fase1_rapida! }));
          }
          // hydrate extended fields desde el backend
          setExtended((prev) => ({
            quien_es:              cf.quien_es ?? prev.quien_es,
            presencia_digital:     cf.presencia_digital ?? prev.presencia_digital,
            redes_sociales:        cf.redes_sociales ?? prev.redes_sociales,
            debilidades:           cf.debilidades ?? prev.debilidades,
            votos_para_ganar:      cf.votos_para_ganar ?? prev.votos_para_ganar,
            historial:             cf.historial ?? prev.historial,
            territorio_ecd:        cf.territorio_ecd ?? prev.territorio_ecd,
            recorrido_estrategico: cf.recorrido_estrategico ?? prev.recorrido_estrategico,
            formula_electoral:     cf.formula_electoral ?? prev.formula_electoral,
          }));
        }
        if (!result?.deck.consultor_form?.fase1_rapida && result?.ctx) {
          // Seed from existing onboarding data (name, cargo, territory, org)
          const ctx = result.ctx;
          const j = ctx.jurisdiccion;
          const nombreTerritorio =
            j.distrito?.nombre ?? j.provincia?.nombre ?? j.departamento?.nombre ?? j.pais.nombre;

          const ambitoToNivel: Record<string, string> = {
            pais:         "nacional",
            departamento: "regional",
            provincia:    "provincial",
            distrito:     "distrital",
          };

          // Normalize cargo code: try exact match first, then partial
          const cargoNorm = ctx.cargo.codigo.toLowerCase().replace(/[-\s]/g, "_");
          const cargoMatch = CARGO_OPTIONS.find((o) => o.value === cargoNorm)
            ?? CARGO_OPTIONS.find((o) => ctx.cargo.nombre.toLowerCase().includes(o.value.replace(/_/g, " ")));

          type NivelTerritorio = NonNullable<NonNullable<Fase1Rapida["postulacion"]>["nivel_territorio"]>;
          type CargoCodigo = NonNullable<NonNullable<Fase1Rapida["postulacion"]>["cargo_codigo"]>;

          setForm((prev) => ({
            ...prev,
            candidato: {
              ...prev.candidato,
              nombre_completo: ctx.user.full_name || prev.candidato?.nombre_completo,
              foto_url:        ctx.user.foto_url ?? prev.candidato?.foto_url,
            },
            postulacion: {
              ...prev.postulacion,
              ...(cargoMatch && { cargo_codigo: cargoMatch.value as CargoCodigo }),
              nombre_territorio:  nombreTerritorio,
              nivel_territorio:   (ambitoToNivel[ctx.cargo.ambito] ?? undefined) as NivelTerritorio | undefined,
              nombre_organizacion: ctx.organizacion_politica?.nombre ?? prev.postulacion?.nombre_organizacion,
            },
          }));
        }
      } catch {
        // no-op — fresh form
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, mockCtx, mockForm]);

  // Auto-save with debounce — DISABLED en modo mock
  const debouncedForm = useDebounce(form, 1500);
  const debouncedExtended = useDebounce(extended, 1500);
  const lastSavedRef = useRef<string>("");

  useEffect(() => {
    if (mockCtx !== undefined || mockForm !== undefined) return; // skip auto-save en preview dev
    const patch = { fase1_rapida: debouncedForm, ...debouncedExtended };
    const serialized = JSON.stringify(patch);
    if (serialized === lastSavedRef.current || loading) return;
    lastSavedRef.current = serialized;
    (async () => {
      setSaving(true);
      try {
        await onboardingApi.patchFase2Form(slug, patch);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSaving(false);
      }
    })();
  }, [debouncedForm, debouncedExtended, slug, loading, mockCtx, mockForm]);

  const updateSection = useCallback(
    <K extends keyof Fase1Rapida>(key: K, value: Fase1Rapida[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleNext = useCallback(async () => {
    // Save immediately
    setSaving(true);
    try {
      await onboardingApi.patchFase2Form(slug, {
        fase1_rapida: form,
        ...extended,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      // Refresh Next.js cache so deck sees new data
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
    // Advance to next section
    if (activeSection < SECTIONS.length - 1) {
      setActiveSection((s) => s + 1);
    }
  }, [slug, form, extended, activeSection, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020a1e]">
        <Loader2 className="size-10 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <WizardShell
      slug={slug}
      sections={SECTIONS}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      onNext={handleNext}
      saving={saving}
      saved={saved}
    >
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
          data={form.diagnostico_inicial ?? { fortalezas: [], debilidades: [], oportunidades: [], amenazas: [], principales_competidores: [] }}
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
          data={form.branding ?? { color_primario: "#fbc02d", color_secundario: "#0a1e4a" }}
          onChange={(v) => updateSection("branding", v)}
        />
      )}
      {activeSection === 6 && (
        <SectionTerritorio
          data={form.contexto_territorio ?? { principales_problemas: [], zonas_fuertes: [], zonas_debiles: [] }}
          onChange={(v) => updateSection("contexto_territorio", v)}
        />
      )}
      {activeSection === 7 && (
        <SectionQuienEs
          data={extended.quien_es ?? {}}
          onChange={(v) => updateExtended("quien_es", v)}
        />
      )}
      {activeSection === 8 && (
        <SectionPresenciaDigital
          presencia={extended.presencia_digital ?? {}}
          redes={extended.redes_sociales?.candidato ?? {}}
          onChangePresencia={(v) => updateExtended("presencia_digital", v)}
          onChangeRedes={(v) => updateExtended("redes_sociales", { ...(extended.redes_sociales ?? {}), candidato: v })}
        />
      )}
      {activeSection === 9 && (
        <SectionDebilidades
          data={extended.debilidades ?? {}}
          onChange={(v) => updateExtended("debilidades", v)}
        />
      )}
      {activeSection === 10 && (
        <SectionVotos
          votos={extended.votos_para_ganar ?? {}}
          historial={extended.historial ?? { entries: [] }}
          onChangeVotos={(v) => updateExtended("votos_para_ganar", v)}
          onChangeHistorial={(v) => updateExtended("historial", v)}
        />
      )}
      {activeSection === 11 && (
        <SectionSegmentos
          data={extended.territorio_ecd ?? { c2_segmentos: [], nucleo_goberna: { segmentos_prioritarios: [] } }}
          onChange={(v) => updateExtended("territorio_ecd", v)}
        />
      )}
      {activeSection === 12 && (
        <SectionRecorrido
          recorrido={extended.recorrido_estrategico ?? { hitos: [] }}
          formula={extended.formula_electoral ?? {}}
          onChangeRecorrido={(v) => updateExtended("recorrido_estrategico", v)}
          onChangeFormula={(v) => updateExtended("formula_electoral", v)}
        />
      )}
    </WizardShell>
  );
}
