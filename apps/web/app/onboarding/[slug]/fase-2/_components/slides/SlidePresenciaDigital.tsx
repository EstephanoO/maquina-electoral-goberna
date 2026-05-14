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
 * propio stamp RIESGO arriba-derecha, métrica grande central, y barra de
 * estado horizontal en el footer.
 */
interface Props {
  f2: ConsultorFormFase2;
}

type Level = "critico" | "alto" | "medio" | "bajo";

interface ChannelCard {
  key: "google" | "facebook" | "instagram" | "whatsapp";
  label: string;
  Icon: typeof Search;
  /** URL/handle si existe. */
  value: string | undefined;
  /** Etiqueta de la métrica central (e.g. "POSICIONAMIENTO"). */
  metricLabel: string;
  /** Valor de la métrica central (e.g. "BAJO", "Sin datos"). */
  metricValue: string;
  /** Level mapeado para el stamp + barra footer. */
  level: Level;
}

const LEVEL_BAR_BG: Record<Level, string> = {
  critico: "bg-red-600",
  alto: "bg-orange-600",
  medio: "bg-amber-500",
  bajo: "bg-emerald-600",
};

const LEVEL_METRIC_TEXT: Record<Level, string> = {
  critico: "CRÍTICO",
  alto: "ALTO",
  medio: "MEDIO",
  bajo: "BAJO",
};

// Animación stagger por cuadrante: TL → TR → BL → BR.
const QUADRANT_DELAY = [0, 0.1, 0.2, 0.3];

export function SlidePresenciaDigital({ f2 }: Props) {
  const handles = f2.redes_sociales?.candidato;
  const pd = f2.presencia_digital;
  const notas = pd?.notas;

  // ── Decisión por canal ────────────────────────────────────────────────
  // Google: del status google_results.
  const googleLevel: Level = statusToLevel(pd?.google_results) ?? "medio";
  const googleMetric: string = LEVEL_METRIC_TEXT[googleLevel];

  // Facebook: si hay handle, usar status redes_verificadas; si no, crítico.
  const fbHasHandle = !!handles?.facebook && handles.facebook.trim().length > 0;
  const facebookLevel: Level = fbHasHandle
    ? (statusToLevel(pd?.redes_verificadas) ?? "medio")
    : "critico";
  const facebookMetric: string = fbHasHandle
    ? (statusToLevel(pd?.redes_verificadas) ? LEVEL_METRIC_TEXT[facebookLevel] : "Activo · sin verificar")
    : "Sin datos";

  // Instagram: misma lógica que facebook.
  const igHasHandle = !!handles?.instagram && handles.instagram.trim().length > 0;
  const instagramLevel: Level = igHasHandle
    ? (statusToLevel(pd?.redes_verificadas) ?? "medio")
    : "critico";
  const instagramMetric: string = igHasHandle
    ? (statusToLevel(pd?.redes_verificadas) ? LEVEL_METRIC_TEXT[instagramLevel] : "Activo · sin verificar")
    : "Sin datos";

  // WhatsApp: handle → bajo, sin handle → critico.
  const waHasHandle = !!handles?.whatsapp && handles.whatsapp.trim().length > 0;
  const whatsappLevel: Level = waHasHandle ? "bajo" : "critico";
  const whatsappMetric: string = waHasHandle ? "Activo" : "Sin canal";

  const cards: ChannelCard[] = [
    {
      key: "google",
      label: "Google",
      Icon: Search,
      value: handles?.web_oficial,
      metricLabel: "POSICIONAMIENTO",
      metricValue: googleMetric,
      level: googleLevel,
    },
    {
      key: "facebook",
      label: "Facebook",
      Icon: Facebook,
      value: handles?.facebook,
      metricLabel: "ALCANCE",
      metricValue: facebookMetric,
      level: facebookLevel,
    },
    {
      key: "instagram",
      label: "Instagram",
      Icon: Instagram,
      value: handles?.instagram,
      metricLabel: "ALCANCE",
      metricValue: instagramMetric,
      level: instagramLevel,
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      Icon: MessageCircle,
      value: handles?.whatsapp,
      metricLabel: "ACTIVIDAD",
      metricValue: whatsappMetric,
      level: whatsappLevel,
    },
  ];

  return (
    <SlideChromeData
      title="PRESENCIA DIGITAL"
      subtitle="Auditoría de canales públicos"
      chapter={2}
      chapterHint="huella digital del candidato"
      footer={notas ? <span className="italic text-slate-500">{notas}</span> : undefined}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
        {cards.map((card, i) => {
          const Icon = card.Icon;
          const hasValue = !!card.value && card.value.trim().length > 0;
          const metricIsLevel = ["CRÍTICO", "ALTO", "MEDIO", "BAJO"].includes(card.metricValue);
          const metricIsEmpty = card.metricValue === "Sin datos" || card.metricValue === "Sin canal";
          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: QUADRANT_DELAY[i] ?? 0, duration: 0.4 }}
              className="relative flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
            >
              {/* Stamp arriba-derecha */}
              <div className="absolute top-3 right-3 pointer-events-none z-10">
                <RiesgoStamp level={card.level} size="sm" rotate={-12} />
              </div>

              {/* Header — icon + nombre + url chip */}
              <div className="flex items-start gap-3 px-5 pt-5 pr-24">
                <span className="size-11 shrink-0 rounded-full bg-amber-400/40 ring-1 ring-amber-400/60 flex items-center justify-center text-[#0a1f4a]">
                  <Icon className="size-6" strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight text-[#0a1f4a] leading-tight">
                    {card.label}
                  </h3>
                  {hasValue ? (
                    <span className="inline-block mt-1 max-w-full truncate text-[11px] font-semibold text-slate-600 bg-slate-100 rounded px-2 py-0.5 border border-slate-200">
                      {card.value}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Body — métrica central en grid */}
              <div className="flex-1 px-5 py-6 grid grid-cols-3 items-center">
                <div className="col-span-3 flex flex-col items-center gap-1">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                    {card.metricLabel}
                  </span>
                  <span
                    className={`text-2xl sm:text-3xl font-black uppercase tracking-tight leading-none ${
                      metricIsEmpty
                        ? "text-slate-400"
                        : metricIsLevel
                          ? "text-[#0a1f4a]"
                          : "text-[#0a1f4a]"
                    }`}
                  >
                    {card.metricValue}
                  </span>
                </div>
              </div>

              {/* Footer — barra horizontal de estado, full-width */}
              <div className={`h-2 w-full ${LEVEL_BAR_BG[card.level]}`} aria-hidden />
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
