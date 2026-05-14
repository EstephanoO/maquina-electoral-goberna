"use client";

import { motion } from "motion/react";
import { Search, Facebook, Instagram, MessageCircle } from "lucide-react";

import type { ConsultorFormFase2 } from "@/lib/onboarding-api";

import { SlideChromeData } from "../chrome/SlideChromeData";
import { RiesgoStamp, statusToLevel } from "../chrome/RiesgoStamp";

/**
 * Slide data — Presencia Digital.
 * Dashboard 2x2 inspirado en pp.5-8 del PDF "ROBERTO SÁNCHEZ - SEGUNDA VUELTA":
 * cada canal (Google · Facebook · Instagram · WhatsApp) ocupa una card con su
 * propio stamp RIESGO arriba-derecha.
 */
interface Props {
  f2: ConsultorFormFase2;
}

type Level = "critico" | "alto" | "medio" | "bajo";

interface ChannelCard {
  key: "google" | "facebook" | "instagram" | "whatsapp";
  label: string;
  Icon: typeof Search;
  /** Tinte del header de la card. */
  tint: string;
  iconTint: string;
  /** URL/handle si existe. */
  value: string | undefined;
  /** Level mapeado para el stamp. */
  level: Level;
}

export function SlidePresenciaDigital({ f2 }: Props) {
  const handles = f2.redes_sociales?.candidato;
  const pd = f2.presencia_digital;
  const notas = pd?.notas;

  // Status helpers — Google usa google_results; redes verificadas para FB/IG.
  const googleLevel: Level = statusToLevel(pd?.google_results) ?? "medio";
  const redesLevel: Level = statusToLevel(pd?.redes_verificadas) ?? "medio";
  const whatsappLevel: Level = handles?.whatsapp ? "bajo" : "critico";

  const cards: ChannelCard[] = [
    {
      key: "google",
      label: "Google",
      Icon: Search,
      tint: "from-slate-100 to-slate-50",
      iconTint: "bg-slate-200 text-[#0a1f4a]",
      value: handles?.web_oficial,
      level: googleLevel,
    },
    {
      key: "facebook",
      label: "Facebook",
      Icon: Facebook,
      tint: "from-blue-50 to-slate-50",
      iconTint: "bg-blue-100 text-blue-700",
      value: handles?.facebook,
      level: redesLevel,
    },
    {
      key: "instagram",
      label: "Instagram",
      Icon: Instagram,
      tint: "from-pink-50 to-amber-50",
      iconTint: "bg-pink-100 text-pink-600",
      value: handles?.instagram,
      level: redesLevel,
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      Icon: MessageCircle,
      tint: "from-emerald-50 to-slate-50",
      iconTint: "bg-emerald-100 text-emerald-600",
      value: handles?.whatsapp,
      level: whatsappLevel,
    },
  ];

  return (
    <SlideChromeData
      title="¿QUIÉN ES? — PRESENCIA DIGITAL"
      subtitle="Auditoría de canales públicos del candidato"
      footer={notas ?? undefined}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 h-full">
        {cards.map((card, i) => {
          const Icon = card.Icon;
          const hasValue = !!card.value && card.value.trim().length > 0;
          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.08, duration: 0.4 }}
              className={`relative rounded-xl border border-slate-200 bg-gradient-to-br ${card.tint} p-5 sm:p-6 shadow-sm overflow-hidden`}
            >
              {/* Stamp arriba-derecha */}
              <div className="absolute top-3 right-3 sm:top-4 sm:right-4 pointer-events-none">
                <RiesgoStamp level={card.level} size="sm" rotate={-10} />
              </div>

              {/* Header — icon + nombre */}
              <div className="flex items-center gap-3 mb-4 pr-20">
                <span
                  className={`size-11 rounded-lg flex items-center justify-center ${card.iconTint} shadow-sm`}
                >
                  <Icon className="size-6" strokeWidth={2.2} />
                </span>
                <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight text-[#0a1f4a]">
                  {card.label}
                </h3>
              </div>

              {/* Body — handle/url o "No registrado" */}
              <div className="mt-2">
                {hasValue ? (
                  <p className="text-sm sm:text-base font-semibold text-slate-800 break-all leading-snug">
                    {card.value}
                  </p>
                ) : (
                  <p className="text-sm sm:text-base italic text-slate-400">
                    No registrado
                  </p>
                )}
              </div>

              {/* Acento amarillo abajo */}
              <div className="absolute left-0 bottom-0 h-1 w-full bg-amber-400/70" />
            </motion.div>
          );
        })}
      </div>
    </SlideChromeData>
  );
}

/**
 * Determina si la slide es relevante para el deck del candidato.
 * - Algún handle en redes_sociales.candidato no vacío, OR
 * - Algún campo de presencia_digital.* poblado.
 */
export function isVisible(f2: ConsultorFormFase2): boolean {
  const handles = f2.redes_sociales?.candidato;
  const hasHandle = !!handles && Object.values(handles).some(
    (v) => typeof v === "string" && v.trim().length > 0,
  );
  const pd = f2.presencia_digital;
  const hasPd = !!pd && (
    !!pd.web_oficial ||
    !!pd.google_results ||
    !!pd.redes_verificadas ||
    !!pd.info_clave ||
    (typeof pd.notas === "string" && pd.notas.trim().length > 0)
  );
  return hasHandle || hasPd;
}
