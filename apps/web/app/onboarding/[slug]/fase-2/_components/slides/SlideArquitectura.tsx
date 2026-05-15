"use client";

import type { ComponentType } from "react";
import { motion } from "motion/react";
import { Footprints, Radio, Wind } from "lucide-react";
import { SlideChromeData } from "../chrome/SlideChromeData";
import { TagTilt } from "../chrome/TagTilt";
import { DataTable } from "../chrome/DataTable";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";

// ---------------------------------------------------------------------------
// Type aliases scoped to this module
// ---------------------------------------------------------------------------

type TipoCampana = "RACIONAL" | "EMOTIVA" | "INSTINTIVA" | "MIXTA";
type EjeEmocional =
  | "PLAN_DE_GOBIERNO"
  | "EQUIPO_DE_CAMPAÑA"
  | "SIMPATIA"
  | "ESPERANZA"
  | "ODIO"
  | "MIEDO";
type Frente = "TIERRA" | "MAR" | "AIRE";

// ---------------------------------------------------------------------------
// Static lookup maps
// ---------------------------------------------------------------------------

const TIPO_META: Record<
  TipoCampana,
  { label: string; description: string; color: string }
> = {
  RACIONAL: {
    label: "Campaña Racional",
    description:
      "Propuestas concretas, datos verificables y plan de gobierno sólido",
    color: "bg-sky-100 text-sky-800 border-sky-300",
  },
  EMOTIVA: {
    label: "Campaña Emotiva",
    description:
      "Conexión emocional, identidad y sentido de pertenencia",
    color: "bg-rose-100 text-rose-800 border-rose-300",
  },
  INSTINTIVA: {
    label: "Campaña Instintiva",
    description:
      "Presencia en territorio, contacto directo y eventos masivos",
    color: "bg-green-100 text-green-700 border-green-300",
  },
  MIXTA: {
    label: "Campaña Mixta",
    description: "Combinación estratégica de enfoques",
    color: "bg-amber-100 text-amber-800 border-amber-300",
  },
};

const EJE_LABEL: Record<EjeEmocional, string> = {
  PLAN_DE_GOBIERNO: "Plan de Gobierno",
  "EQUIPO_DE_CAMPAÑA": "Equipo de Campaña",
  SIMPATIA: "Simpatía",
  ESPERANZA: "Esperanza",
  ODIO: "Indignación",
  MIEDO: "Miedo",
};

const FRENTE_META: Record<
  Frente,
  { label: string; sublabel: string; Icon: ComponentType<{ size?: number; className?: string }> }
> = {
  TIERRA: {
    label: "Tierra",
    sublabel: "Puerta a puerta, actos, territorio",
    Icon: Footprints,
  },
  MAR: {
    label: "Mar",
    sublabel: "TV, radio, prensa, broadcast",
    Icon: Radio,
  },
  AIRE: {
    label: "Aire",
    sublabel: "Redes sociales, digital, ads",
    Icon: Wind,
  },
};

const FRENTE_ORDER: Frente[] = ["TIERRA", "MAR", "AIRE"];

// ---------------------------------------------------------------------------
// Fallback table (generic Captación / Persuasión / Conversión)
// ---------------------------------------------------------------------------

const ETAPAS = [
  {
    key: "captacion",
    etapa: "Captación",
    sufijo: "(visualización)",
    objetivo: "Instalar al candidato en el imaginario colectivo",
    publico: "Zonas nuevas, votantes que no lo conocen",
    contenido:
      "Videos cortos, historia personal, presencia territorial, mensajes simples",
    rol: "Generar reconocimiento y familiaridad",
    pesoKey: "peso_aire" as const,
  },
  {
    key: "persuasion",
    etapa: "Persuasión",
    sufijo: "(propuesta)",
    objetivo: "Convertir interés en intención de voto",
    publico: "Zonas en disputa, votantes fragmentados",
    contenido:
      "Propuestas claras (seguridad, economía), comparación moderada, soluciones concretas",
    rol: "Construir preferencia electoral",
    pesoKey: "peso_tierra" as const,
  },
  {
    key: "conversion",
    etapa: "Conversión",
    sufijo: "(decisión)",
    objetivo: "Activar y definir el voto",
    publico: "Indecisos y voto blando",
    contenido:
      "Mensajes de confianza, gobernabilidad, cercanía, llamados a la acción",
    rol: "Reducir miedo y cerrar decisión de voto",
    pesoKey: "peso_mar" as const,
  },
];

const COLUMNS = [
  { key: "etapa",     label: "Etapa",             width: "16%" },
  { key: "objetivo",  label: "Objetivo",          width: "20%" },
  { key: "publico",   label: "Público objetivo",  width: "18%" },
  { key: "contenido", label: "Tipo de contenido", width: "30%" },
  { key: "rol",       label: "Rol en la campaña", width: "16%" },
];

const TEXTO_GENERICO =
  "Se prioriza la visibilidad para instalar al candidato en el imaginario colectivo, complementando con mensajería estratégica que reduzca el miedo y genere confianza en votantes indecisos.";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface TipoBadgeProps {
  tipo: TipoCampana;
  size?: "base" | "lg";
}

function TipoBadge({ tipo, size = "base" }: TipoBadgeProps) {
  const meta = TIPO_META[tipo];
  const textSize = size === "lg" ? "text-base sm:text-lg" : "text-sm";
  return (
    <div
      className={`inline-flex flex-col gap-0.5 rounded-lg border px-4 py-2.5 ${meta.color}`}
    >
      <span className={`font-black uppercase tracking-wide ${textSize}`}>
        {meta.label}
      </span>
      <span className="text-xs font-medium opacity-80">{meta.description}</span>
    </div>
  );
}

interface FrenteRowProps {
  frente: Frente;
  isPrincipal: boolean;
  isSecundario: boolean;
  delay: number;
}

function FrenteRow({ frente, isPrincipal, isSecundario, delay }: FrenteRowProps) {
  const meta = FRENTE_META[frente];
  const { Icon } = meta;

  const barWidth = isPrincipal ? "100%" : isSecundario ? "40%" : "5%";
  const barColor = isPrincipal
    ? "bg-amber-400"
    : isSecundario
      ? "bg-amber-400/40"
      : "bg-slate-200";

  const badgeEl = isPrincipal ? (
    <span className="inline-block rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#0a1f4a]">
      Principal
    </span>
  ) : isSecundario ? (
    <span className="inline-block rounded-full border border-amber-400/60 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
      Secundario
    </span>
  ) : null;

  const labelOpacity = !isPrincipal && !isSecundario ? "opacity-35" : "";

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="flex items-center gap-3"
    >
      {/* Icon + label */}
      <div className={`flex w-28 shrink-0 items-center gap-2 ${labelOpacity}`}>
        <Icon size={16} className="text-[#0a1f4a]" />
        <div className="flex flex-col leading-tight">
          <span className="text-xs font-black uppercase tracking-wide text-[#0a1f4a]">
            {meta.label}
          </span>
          <span className="text-[10px] text-slate-500">{meta.sublabel}</span>
        </div>
      </div>

      {/* Bar */}
      <div className="flex flex-1 items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
          <motion.div
            className={`h-full rounded-full ${barColor}`}
            initial={{ width: 0 }}
            animate={{ width: barWidth }}
            transition={{ delay: delay + 0.1, duration: 0.5, ease: "easeOut" }}
          />
        </div>
        {badgeEl}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  f2: ConsultorFormFase2;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SlideArquitectura({ f2 }: Props) {
  const fe = f2.formula_electoral ?? {};
  const estrategia = f2.fase1_rapida?.estrategia ?? {};

  const tipo = estrategia.tipo_campana;
  const combinacion = estrategia.combinacion_mixta ?? [];
  const eje = estrategia.eje_emocional;
  const frentePrincipal = estrategia.frente_principal;
  const frentesSecundarios = estrategia.frentes_secundarios ?? [];

  const hasEstrategia =
    !!tipo ||
    !!eje ||
    !!frentePrincipal ||
    frentesSecundarios.length > 0;

  const intro = fe.justificacion?.trim() || null;

  // Fallback table data (pesos from formula_electoral)
  const pesos = {
    peso_aire:   typeof fe.peso_aire   === "number" ? fe.peso_aire   : null,
    peso_tierra: typeof fe.peso_tierra === "number" ? fe.peso_tierra : null,
    peso_mar:    typeof fe.peso_mar    === "number" ? fe.peso_mar    : null,
  };
  const hasPesos =
    pesos.peso_aire !== null ||
    pesos.peso_tierra !== null ||
    pesos.peso_mar !== null;

  const presupuesto = fe.presupuesto_total;
  const presupuestoLabel =
    typeof presupuesto === "number" && presupuesto > 0
      ? `Presupuesto total: S/ ${presupuesto.toLocaleString("es-PE")}`
      : null;

  const fallbackRows = ETAPAS.map((e) => {
    const peso = pesos[e.pesoKey];
    return {
      etapa: (
        <div className="flex flex-col gap-1">
          <span className="font-bold text-[#0a1f4a]">{e.etapa}</span>
          <span className="text-[11px] text-slate-500 font-medium">
            {e.sufijo}
          </span>
          {hasPesos && peso !== null ? (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 w-20 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-amber-400"
                  style={{ width: `${Math.max(0, Math.min(100, peso))}%` }}
                />
              </div>
              <span className="text-[10px] font-bold text-slate-600 tabular-nums">
                {peso}%
              </span>
            </div>
          ) : null}
        </div>
      ),
      objetivo:  e.objetivo,
      publico:   e.publico,
      contenido: e.contenido,
      rol:       e.rol,
    };
  });

  // -------------------------------------------------------------------------
  // Render — no estrategia data: show generic table as-was
  // -------------------------------------------------------------------------

  if (!hasEstrategia) {
    return (
      <SlideChromeData
        title="ESTRATEGIA DE CAMPAÑA"
        footer={presupuestoLabel ?? undefined}
        chapter={5}
        chapterHint="arquitectura estratégica"
      >
        <div className="flex flex-col gap-7">
          <div className="flex justify-center pt-1">
            <TagTilt label="PAUTAS DE META" tone="amber" size="lg" rotate={0} />
          </div>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="text-center text-sm sm:text-base text-slate-700 leading-relaxed max-w-4xl mx-auto"
          >
            {TEXTO_GENERICO}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <div className="rounded-t-lg bg-[#0a1f4a] px-4 py-2.5 text-center text-white text-sm font-black uppercase tracking-wide">
              Arquitectura
            </div>
            <DataTable columns={COLUMNS} rows={fallbackRows} emphasizeFirst={false} compact />
          </motion.div>
        </div>
      </SlideChromeData>
    );
  }

  // -------------------------------------------------------------------------
  // Render — primary: estrategia data present
  // -------------------------------------------------------------------------

  return (
    <SlideChromeData
      title="ESTRATEGIA DE CAMPAÑA"
      footer={presupuestoLabel ?? undefined}
      chapter={5}
      chapterHint="arquitectura estratégica"
    >
      <div className="flex flex-col gap-8">
        {/* ---------------------------------------------------------------- */}
        {/* Two-column section                                               */}
        {/* ---------------------------------------------------------------- */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto]">

          {/* LEFT — Campaign type + emotional axis */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col gap-5"
          >
            {/* Section label */}
            <div className="flex items-center gap-2">
              <div className="h-0.5 w-5 bg-amber-400" />
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                Tipo de campaña
              </span>
            </div>

            {/* Primary tipo badge */}
            {tipo ? (
              <div className="flex flex-col gap-3">
                <TipoBadge tipo={tipo} size="lg" />
                {/* Combination badges (MIXTA only) */}
                {tipo === "MIXTA" && combinacion.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pl-2">
                    {combinacion.map((t) => (
                      <TipoBadge key={t} tipo={t} size="base" />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm italic text-slate-400">
                Sin tipo de campaña definido
              </p>
            )}

            {/* Eje emocional */}
            {eje ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                  Eje emocional dominante
                </span>
                <span className="text-xl font-black text-[#0a1f4a]">
                  {EJE_LABEL[eje]}
                </span>
              </div>
            ) : null}
          </motion.div>

          {/* RIGHT — Fronts */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col gap-5 lg:min-w-[320px] lg:border-l lg:border-slate-200 lg:pl-6"
          >
            <div className="flex items-center gap-2">
              <div className="h-0.5 w-5 bg-amber-400" />
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                Frentes de campaña
              </span>
            </div>

            <div className="flex flex-col gap-4">
              {FRENTE_ORDER.map((frente, i) => (
                <FrenteRow
                  key={frente}
                  frente={frente}
                  isPrincipal={frente === frentePrincipal}
                  isSecundario={frentesSecundarios.includes(frente)}
                  delay={0.25 + i * 0.08}
                />
              ))}
            </div>
          </motion.div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Optional justificación intro text                               */}
        {/* ---------------------------------------------------------------- */}
        {intro ? (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="border-l-2 border-amber-400 pl-4 text-sm italic text-slate-600 leading-relaxed max-w-3xl"
          >
            {intro}
          </motion.p>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {/* Secondary section — Captación / Persuasión / Conversión table   */}
        {/* ---------------------------------------------------------------- */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="flex flex-col gap-2"
        >
          <div className="flex items-center gap-2">
            <div className="h-0.5 w-5 bg-slate-300" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Arquitectura de pauta
            </span>
          </div>
          <div className="text-[11px] leading-none">
            <div className="rounded-t-md bg-[#0a1f4a] px-3 py-2 text-center text-white text-[10px] font-black uppercase tracking-wide">
              Captación · Persuasión · Conversión
            </div>
            <div className="[&_td]:py-1.5 [&_td]:px-2.5 [&_th]:py-1.5 [&_th]:px-2.5 [&_th]:text-[10px] [&_td]:text-[11px] opacity-80">
              <DataTable
                columns={COLUMNS}
                rows={fallbackRows}
                emphasizeFirst={false}
                compact
              />
            </div>
          </div>
        </motion.div>
      </div>
    </SlideChromeData>
  );
}

// ---------------------------------------------------------------------------
// Visibility predicate — keep exactly as-is
// ---------------------------------------------------------------------------

/** Heurística de visibilidad — true si hay justificación, pesos, o estrategia f1. */
export function isSlideArquitecturaVisible(f2: ConsultorFormFase2): boolean {
  const fe = f2.formula_electoral ?? {};
  const hasJust = !!fe.justificacion?.trim();
  const hasPesos =
    typeof fe.peso_aire   === "number" ||
    typeof fe.peso_tierra === "number" ||
    typeof fe.peso_mar    === "number";
  const estrategia = f2.fase1_rapida?.estrategia ?? {};
  const hasEstrategia =
    !!estrategia.tipo_campana ||
    !!estrategia.eje_emocional ||
    !!estrategia.frente_principal ||
    (estrategia.frentes_secundarios?.length ?? 0) > 0;
  return hasJust || hasPesos || hasEstrategia;
}
