"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";

import { SlideChromeData } from "../chrome/SlideChromeData";
import { DataTable } from "../chrome/DataTable";

interface Props {
  f2: ConsultorFormFase2;
}

const FOOTER_TEXT =
  "La victoria no depende solo de fortalecer la base, sino de persuadir en territorios fragmentados y generar confianza en los sectores que aún dudan.";

/**
 * Slide "División del voto" — replica el patrón p.15 del deck Goberna:
 * tabla 3-col (Segmento · Características clave · Objetivo estratégico)
 * alimentada por `territorio_ecd.c2_segmentos[]` y cruzada contra
 * `nucleo_goberna.segmentos_prioritarios` para el objetivo estratégico.
 */
export function SlideSegmentos({ f2 }: Props) {
  const segmentos = f2.territorio_ecd?.c2_segmentos ?? [];
  const prioritarios =
    f2.territorio_ecd?.nucleo_goberna?.segmentos_prioritarios ?? [];

  const rows = segmentos.map((seg) => {
    const valores = seg.valores ?? [];
    const problema = seg.problema_principal ?? "";
    const caracteristicas = [...valores, problema]
      .filter((s) => s && s.trim().length > 0)
      .join(" · ");

    const match = prioritarios.find((p) => p.segmento_id === seg.id);
    const objetivo = match?.mensaje_central?.trim() || "—";

    return {
      segmento: (
        <motion.span
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35 }}
        >
          {seg.nombre}
        </motion.span>
      ),
      caracteristicas: caracteristicas || "—",
      objetivo,
    };
  });

  return (
    <SlideChromeData
      title="División del voto"
      footer={<span className="font-semibold text-[#0a1f4a]">{FOOTER_TEXT}</span>}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-5xl mx-auto"
      >
        <DataTable
          columns={[
            { key: "segmento", label: "Segmento", width: "22%" },
            { key: "caracteristicas", label: "Características clave", width: "46%" },
            { key: "objetivo", label: "Objetivo estratégico", width: "32%" },
          ]}
          rows={rows}
          emphasizeFirst
        />
      </motion.div>
    </SlideChromeData>
  );
}

SlideSegmentos.isVisible = (f2: ConsultorFormFase2): boolean => {
  return (f2.territorio_ecd?.c2_segmentos?.length ?? 0) > 0;
};
