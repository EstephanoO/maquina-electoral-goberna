"use client";

import { motion } from "motion/react";
import { SlideChromeData } from "../chrome/SlideChromeData";
import { TagTilt } from "../chrome/TagTilt";
import { DataTable } from "../chrome/DataTable";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";

/**
 * Slide ARQUITECTURA — replica p.17 del PDF Goberna:
 * Title "HERRAMIENTA" + Tag "PAUTAS DE META" + intro + tabla de 3 etapas.
 * Las barras de peso (Aire / Tierra / Mar) se mapean a Captación / Persuasión / Conversión
 * cuando hay datos de `formula_electoral`.
 */

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
  { key: "etapa",     label: "Etapa",            width: "16%" },
  { key: "objetivo",  label: "Objetivo",         width: "20%" },
  { key: "publico",   label: "Público objetivo", width: "18%" },
  { key: "contenido", label: "Tipo de contenido",width: "30%" },
  { key: "rol",       label: "Rol en la campaña",width: "16%" },
];

const TEXTO_GENERICO =
  "Se prioriza la visibilidad para instalar al candidato en el imaginario colectivo, complementando con mensajería estratégica que reduzca el miedo y genere confianza en votantes indecisos.";

interface Props {
  f2: ConsultorFormFase2;
}

export function SlideArquitectura({ f2 }: Props) {
  const fe = f2.formula_electoral ?? {};
  const intro = fe.justificacion?.trim() || TEXTO_GENERICO;

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

  const rows = ETAPAS.map((e) => {
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
                  style={{
                    width: `${Math.max(0, Math.min(100, peso))}%`,
                  }}
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

  return (
    <SlideChromeData
      title="HERRAMIENTA"
      footer={presupuestoLabel ?? undefined}
      chapter={5}
      chapterHint="arquitectura de pauta"
    >
      <div className="flex flex-col gap-7">
        {/* Tag */}
        <div className="flex justify-center pt-1">
          <TagTilt label="PAUTAS DE META" tone="amber" size="lg" rotate={0} />
        </div>

        {/* Intro */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="text-center text-sm sm:text-base text-slate-700 leading-relaxed max-w-4xl mx-auto"
        >
          {intro}
        </motion.p>

        {/* Tabla */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <div className="rounded-t-lg bg-[#0a1f4a] px-4 py-2.5 text-center text-white text-sm font-black uppercase tracking-wide">
            Arquitectura
          </div>
          <DataTable columns={COLUMNS} rows={rows} emphasizeFirst={false} compact />
        </motion.div>
      </div>
    </SlideChromeData>
  );
}

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
