"use client";

import { motion } from "motion/react";
import { SlideShell } from "../../../../fase-2/_components/slides/SlideShell";
import type { Fase1Rapida } from "@/lib/onboarding-api";

const EJE_LABEL: Record<string, string> = {
  PLAN_DE_GOBIERNO:   "Plan de Gobierno",
  "EQUIPO_DE_CAMPAÑA": "Equipo de Campaña",
  SIMPATIA:           "Simpatía",
  ESPERANZA:          "Esperanza",
  ODIO:               "Indignación",
  MIEDO:              "Miedo",
};

const FRENTE_LABEL: Record<string, { label: string; icon: string; desc: string }> = {
  TIERRA: { label: "Tierra", icon: "🏘", desc: "Campaña territorial: puerta a puerta, mercados, mítines" },
  MAR:    { label: "Mar",    icon: "📺", desc: "Medios masivos: TV, radio, prensa" },
  AIRE:   { label: "Aire",   icon: "📱", desc: "Digital: redes sociales, ads" },
};

const TIPO_COLOR: Record<string, string> = {
  RACIONAL:   "#60a5fa",
  EMOTIVA:    "#f472b6",
  INSTINTIVA: "#fb923c",
  MIXTA:      "#a78bfa",
};

export function SlideF1Estrategia({ f1 }: { f1: Fase1Rapida }) {
  const e = f1.estrategia ?? {};
  const color1 = f1.branding?.color_primario ?? "#fbc02d";
  const tipoCampana = e.tipo_campana ?? "";
  const mixta = e.combinacion_mixta ?? [];
  const frentePpal = e.frente_principal ?? "";
  const frentesSecundarios = e.frentes_secundarios ?? [];
  const allFrentes = [frentePpal, ...frentesSecundarios].filter(Boolean);

  return (
    <SlideShell
      kicker={`Estrategia · ${f1.candidato?.nombre_completo ?? "Candidato"}`}
      title="ESTRATEGIA DE CAMPAÑA"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Tipo */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-[#0a1e4a]/50 border border-white/8 rounded-2xl p-5"
        >
          <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500 font-semibold mb-3">
            Tipo de campaña
          </p>
          {tipoCampana ? (
            <>
              <div
                className="inline-flex px-4 py-2 rounded-full font-black text-lg mb-3"
                style={{
                  background: `${TIPO_COLOR[tipoCampana] ?? color1}20`,
                  color: TIPO_COLOR[tipoCampana] ?? color1,
                  border: `1px solid ${TIPO_COLOR[tipoCampana] ?? color1}40`,
                }}
              >
                {tipoCampana}
              </div>
              {tipoCampana === "MIXTA" && mixta.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-2">
                  {mixta.map((m) => (
                    <span
                      key={m}
                      className="px-2.5 py-1 rounded-full text-xs font-semibold"
                      style={{
                        background: `${TIPO_COLOR[m] ?? color1}15`,
                        color: TIPO_COLOR[m] ?? color1,
                        border: `1px solid ${TIPO_COLOR[m] ?? color1}30`,
                      }}
                    >
                      {m}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-600 italic text-sm">Sin definir</p>
          )}
        </motion.div>

        {/* Eje emocional */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-[#0a1e4a]/50 border border-white/8 rounded-2xl p-5"
        >
          <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500 font-semibold mb-3">
            Eje emocional
          </p>
          {e.eje_emocional ? (
            <div
              className="text-2xl font-black"
              style={{ color: color1 }}
            >
              {EJE_LABEL[e.eje_emocional] ?? e.eje_emocional}
            </div>
          ) : (
            <p className="text-gray-600 italic text-sm">Sin definir</p>
          )}
        </motion.div>

        {/* Frentes */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-[#0a1e4a]/50 border border-white/8 rounded-2xl p-5"
        >
          <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500 font-semibold mb-3">
            Frentes de campaña
          </p>
          {allFrentes.length === 0 ? (
            <p className="text-gray-600 italic text-sm">Sin definir</p>
          ) : (
            <div className="space-y-3">
              {allFrentes.map((f, i) => {
                const info = FRENTE_LABEL[f];
                if (!info) return null;
                return (
                  <div key={f} className="flex items-start gap-2.5">
                    <span className="text-xl flex-shrink-0">{info.icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{info.label}</span>
                        {i === 0 && (
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider"
                            style={{ background: `${color1}20`, color: color1 }}
                          >
                            Principal
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{info.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>
    </SlideShell>
  );
}
