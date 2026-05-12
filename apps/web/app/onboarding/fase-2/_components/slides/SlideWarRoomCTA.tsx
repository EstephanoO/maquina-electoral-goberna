"use client";

import { motion } from "motion/react";
import { ArrowRight, Radar, MapPinned, Megaphone, BarChart3 } from "lucide-react";

import { EditableT } from "../EditableT";

interface SlideWarRoomCTAProps {
  onContinue: () => void;
}

const PIEZAS = [
  {
    key: "inteligencia",
    icon: Radar,
    titulo: "Inteligencia",
    descripcion: "Diagnóstico, adversarios, debilidades — todo mapeado.",
  },
  {
    key: "territorio",
    icon: MapPinned,
    titulo: "Territorio",
    descripcion: "Cartografía, padrón segmentado, zonas calientes.",
  },
  {
    key: "comunicacion",
    icon: Megaphone,
    titulo: "Comunicación",
    descripcion: "Aire, mar, tierra — calendarizados y trackeados.",
  },
  {
    key: "metricas",
    icon: BarChart3,
    titulo: "Métricas",
    descripcion: "Avance diario, alertas, KPIs en tiempo real.",
  },
];

export function SlideWarRoomCTA({ onContinue }: SlideWarRoomCTAProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[calc(100vh-180px)] px-4 sm:px-8 text-center">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="inline-flex items-center gap-2 rounded-full bg-amber-400/10 border border-amber-400/40 px-5 py-2 text-xs uppercase tracking-[0.3em] text-amber-400 font-semibold mb-8"
      >
        <EditableT k="war-room.kicker">Tu cuartel de campaña</EditableT>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.6 }}
        className="text-5xl sm:text-7xl md:text-8xl font-black text-white uppercase tracking-tight leading-[0.95] max-w-5xl"
      >
        <EditableT k="war-room.titulo" multiline>
          Tu campaña ya tiene su War Room.
        </EditableT>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-6 text-base sm:text-lg text-gray-300 max-w-2xl"
      >
        <EditableT k="war-room.subtitulo" multiline>
          Inteligencia, territorio, comunicación y métricas — todo en un solo dashboard. Aquí decides, aquí mides, aquí ganas.
        </EditableT>
      </motion.p>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl w-full">
        {PIEZAS.map((p, i) => {
          const Icon = p.icon;
          return (
            <motion.div
              key={p.titulo}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.08 }}
              className="flex items-start gap-3 rounded-md border border-amber-400/25 bg-[#0a1e4a]/60 px-4 py-3 text-left"
            >
              <Icon className="size-6 text-amber-400 shrink-0 mt-0.5" strokeWidth={2.2} />
              <div>
                <div className="text-sm font-extrabold uppercase tracking-wide text-white">
                  <EditableT k={`war-room.piezas.${p.key}.titulo`}>{p.titulo}</EditableT>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed mt-0.5">
                  <EditableT k={`war-room.piezas.${p.key}.descripcion`} multiline>{p.descripcion}</EditableT>
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.85 }}
        className="mt-12"
      >
        <motion.button
          type="button"
          onClick={onContinue}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          className="inline-flex items-center gap-3 px-12 py-5 rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-[#0a1e4a] font-black text-xl uppercase tracking-wider shadow-[0_20px_60px_rgba(251,191,36,0.5)] hover:shadow-[0_25px_80px_rgba(251,191,36,0.7)] transition-shadow"
        >
          <EditableT k="war-room.cta.boton">Entrar al Dashboard</EditableT>
          <ArrowRight className="size-6" />
        </motion.button>

        <p className="mt-6 text-xs uppercase tracking-[0.4em] text-amber-400/60">
          <EditableT k="war-room.cta.footer">Fin del briefing · Goberna te acompaña</EditableT>
        </p>
      </motion.div>
    </div>
  );
}
