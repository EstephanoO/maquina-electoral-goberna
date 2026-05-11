"use client";

import { motion } from "motion/react";
import { SlideShell } from "./SlideShell";
import type { CandidatoContext } from "@/lib/onboarding-api";

interface Props {
  ctx: CandidatoContext;
}

const DEFAULT_HITOS = [
  {
    key: "diagnostico",
    fase: "01",
    label: "Diagnóstico",
    cuando: "Hoy",
    detalle: "Mapeo de jurisdicción, contexto electoral, fortalezas y debilidades.",
  },
  {
    key: "estructura",
    fase: "02",
    label: "Estructura",
    cuando: "Mes 1",
    detalle: "Levantamiento de brigadas, validación de padrón, configuración digital.",
  },
  {
    key: "calentamiento",
    fase: "03",
    label: "Calentamiento",
    cuando: "Mes 2-3",
    detalle: "Marca personal, contenido propio, primeras activaciones territoriales.",
  },
  {
    key: "aceleracion",
    fase: "04",
    label: "Aceleración",
    cuando: "Mes 4-5",
    detalle: "Saturación digital, recorridos masivos, debate público.",
  },
  {
    key: "cierre",
    fase: "05",
    label: "Cierre",
    cuando: "Última semana",
    detalle: "GOTV, cuidado de mesa, conteo en tiempo real, comunicación de victoria.",
  },
];

export function SlideRecorridoEstrategico({ ctx }: Props) {
  const meta = ctx.user.full_name.split(/\s+/)[0] ?? "tú";
  const hitosForm = ctx.consultor_form?.recorrido_estrategico?.hitos ?? [];

  // Mergear: el form sobreescribe lo que matchea por key; lo demás keeps default
  const formByKey = new Map(hitosForm.map((h) => [h.key, h]));
  const HITOS = DEFAULT_HITOS.map((d) => {
    const f = formByKey.get(d.key);
    return f
      ? {
          ...d,
          label: f.titulo,
          cuando: f.fecha ?? d.cuando,
          detalle: f.descripcion ?? d.detalle,
        }
      : d;
  });
  return (
    <SlideShell kicker="Plan de campaña" title="EL RECORRIDO HASTA LAS URNAS">
      <div className="px-2 sm:px-4">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-base sm:text-lg text-gray-300 max-w-3xl mb-10 leading-relaxed"
        >
          Una campaña tiene 5 fases. Cada una tiene su mezcla de aire, mar y tierra.
          Saltarse una fase cuesta votos. Goberna te acompaña en las cinco.
        </motion.p>

        {/* Línea de tiempo horizontal en desktop, vertical en móvil */}
        <div className="relative">
          {/* Línea conectora */}
          <div className="hidden md:block absolute top-7 left-[5%] right-[5%] h-1 bg-gradient-to-r from-amber-400 via-amber-400/50 to-amber-400/20" />

          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 md:gap-2 relative">
            {HITOS.map((h, i) => (
              <motion.div
                key={h.fase}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.12, duration: 0.5 }}
                className="text-center md:text-left"
              >
                {/* Bolita con número */}
                <div className="flex md:block items-center gap-3 mb-3">
                  <div className="size-14 rounded-full bg-amber-400 text-[#0a1e4a] flex items-center justify-center font-black text-lg shadow-lg shadow-amber-400/30 mx-auto md:mx-0">
                    {h.fase}
                  </div>
                  <div className="md:mt-3">
                    <div className="text-[10px] uppercase tracking-[0.25em] text-amber-400 font-bold">
                      {h.cuando}
                    </div>
                    <div className="text-xl font-black text-white uppercase mt-0.5">
                      {h.label}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-400 leading-relaxed">{h.detalle}</p>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-10 text-center text-sm sm:text-base text-amber-400 uppercase tracking-[0.3em] font-bold"
        >
          De aquí al día de la elección, paso a paso, con {meta}
        </motion.p>
      </div>
    </SlideShell>
  );
}
