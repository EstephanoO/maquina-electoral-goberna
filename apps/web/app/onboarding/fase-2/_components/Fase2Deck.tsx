"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, ArrowRight } from "lucide-react";

import type { CandidatoContext } from "@/lib/onboarding-api";
import { CloudSkyBg } from "@/components/cloud-sky-bg";

import { SlideCover } from "./slides/SlideCover";
import { SlideCapacidadGoberna } from "./slides/SlideCapacidadGoberna";
import { SlideOficinasGoberna } from "./slides/SlideOficinasGoberna";
import { SlideRoadmap } from "./slides/SlideRoadmap";
import { SlideRecorridoEstrategico } from "./slides/SlideRecorridoEstrategico";
import { SlideIdentity } from "./slides/SlideIdentity";
import { SlideResumen } from "./slides/SlideResumen";
import { SlideAnalisisElectoral } from "./slides/SlideAnalisisElectoral";
import { SlideVotosParaGanar } from "./slides/SlideVotosParaGanar";
import { SlidePartidosImportantes } from "./slides/SlidePartidosImportantes";
import { SlideHistorialINFOGOB } from "./slides/SlideHistorialINFOGOB";
import { SlideFormulaElectoral } from "./slides/SlideFormulaElectoral";
import { SlidePresenciaDigital } from "./slides/SlidePresenciaDigital";
import { SlideQuienEs } from "./slides/SlideQuienEs";
import { SlideCTA } from "./slides/SlideCTA";
import { SectionDivider } from "./slides/SectionDivider";

interface Fase2DeckProps {
  ctx: CandidatoContext;
}

interface SlideDef {
  id: string;
  /** Si está, se muestra como "Sección X de 5: <kicker>" en el header. */
  section?: { num: number; total: number; label: string };
  /** Si true, es slide divisor (sin header band). */
  isDivider?: boolean;
  node: React.ReactNode;
}

export function Fase2Deck({ ctx }: Fase2DeckProps) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const partidoNombre = ctx.organizacion_politica?.nombre ?? "tu candidatura";
  const jurisdiccionLabel =
    ctx.jurisdiccion.distrito?.nombre ??
    ctx.jurisdiccion.provincia?.nombre ??
    ctx.jurisdiccion.departamento?.nombre ??
    ctx.jurisdiccion.pais.nombre;

  const firstName = ctx.user.full_name.split(/\s+/)[0] ?? "";
  const SECCIONES_TOTAL = 7;

  const slides = useMemo<SlideDef[]>(
    () => [
      // ── Apertura ──
      { id: "cover", node: <SlideCover /> },

      // ── Sección 0: Capacidad Goberna (institucional) ──
      {
        id: "capacidad-goberna",
        section: { num: 0, total: SECCIONES_TOTAL, label: "Quién te acompaña" },
        node: <SlideCapacidadGoberna />,
      },
      {
        id: "oficinas-goberna",
        section: { num: 0, total: SECCIONES_TOTAL, label: "Quién te acompaña" },
        node: <SlideOficinasGoberna />,
      },

      // ── Roadmap del deck ──
      { id: "roadmap", node: <SlideRoadmap ctx={ctx} /> },

      // ── Sección 1: Tu territorio ──
      {
        id: "identity",
        section: { num: 1, total: SECCIONES_TOTAL, label: "Tu territorio" },
        node: <SlideIdentity ctx={ctx} />,
      },
      {
        id: "resumen",
        section: { num: 1, total: SECCIONES_TOTAL, label: "Tu territorio" },
        node: <SlideResumen ctx={ctx} />,
      },

      // ── Sección 2: Análisis electoral + votos para ganar ──
      {
        id: "div-analisis",
        section: { num: 2, total: SECCIONES_TOTAL, label: "Análisis electoral" },
        isDivider: true,
        node: (
          <SectionDivider
            sectionNumber="02"
            kicker="Análisis Electoral"
            question={`¿Cómo le fue a ${partidoNombre} en ${jurisdiccionLabel}?`}
            highlight={partidoNombre}
          />
        ),
      },
      {
        id: "analisis",
        section: { num: 2, total: SECCIONES_TOTAL, label: "Análisis electoral" },
        node: <SlideAnalisisElectoral ctx={ctx} />,
      },
      {
        id: "votos-para-ganar",
        section: { num: 2, total: SECCIONES_TOTAL, label: "Análisis electoral" },
        node: <SlideVotosParaGanar ctx={ctx} />,
      },

      // ── Sección 3: Competencia partidaria ──
      {
        id: "div-partidos",
        section: { num: 3, total: SECCIONES_TOTAL, label: "Competencia partidaria" },
        isDivider: true,
        node: (
          <SectionDivider
            sectionNumber="03"
            kicker="Competencia partidaria"
            question={`¿Quiénes mandan en ${jurisdiccionLabel}?`}
            highlight={jurisdiccionLabel}
          />
        ),
      },
      {
        id: "partidos",
        section: { num: 3, total: SECCIONES_TOTAL, label: "Competencia partidaria" },
        node: <SlidePartidosImportantes ctx={ctx} />,
      },

      // ── Sección 4: Historial político del candidato ──
      {
        id: "div-historial",
        section: { num: 4, total: SECCIONES_TOTAL, label: "Historial político" },
        isDivider: true,
        node: (
          <SectionDivider
            sectionNumber="04"
            kicker="Historial político"
            question={`Tu trayectoria electoral en ${jurisdiccionLabel}`}
            highlight={jurisdiccionLabel}
          />
        ),
      },
      {
        id: "historial",
        section: { num: 4, total: SECCIONES_TOTAL, label: "Historial político" },
        node: <SlideHistorialINFOGOB ctx={ctx} />,
      },

      // ── Sección 5: Estrategia (fórmula electoral + recorrido) ──
      {
        id: "div-estrategia",
        section: { num: 5, total: SECCIONES_TOTAL, label: "Estrategia" },
        isDivider: true,
        node: (
          <SectionDivider
            sectionNumber="05"
            kicker="Estrategia"
            question="¿Por dónde luchamos esta elección?"
            highlight="luchamos"
          />
        ),
      },
      {
        id: "formula-electoral",
        section: { num: 5, total: SECCIONES_TOTAL, label: "Estrategia" },
        node: <SlideFormulaElectoral ctx={ctx} />,
      },
      {
        id: "recorrido-estrategico",
        section: { num: 5, total: SECCIONES_TOTAL, label: "Estrategia" },
        node: <SlideRecorridoEstrategico ctx={ctx} />,
      },

      // ── Sección 6: Presencia digital del candidato ──
      {
        id: "div-presencia",
        section: { num: 6, total: SECCIONES_TOTAL, label: "Presencia digital" },
        isDivider: true,
        node: (
          <SectionDivider
            sectionNumber="06"
            kicker="Presencia digital"
            question={`¿Te encuentran cuando te buscan en Google?`}
            highlight="Google"
          />
        ),
      },
      {
        id: "presencia-digital",
        section: { num: 6, total: SECCIONES_TOTAL, label: "Presencia digital" },
        node: <SlidePresenciaDigital ctx={ctx} />,
      },

      // ── Sección 7: ¿Quién es? ──
      {
        id: "div-quien",
        section: { num: 7, total: SECCIONES_TOTAL, label: "Tu imagen pública" },
        isDivider: true,
        node: (
          <SectionDivider
            sectionNumber="07"
            kicker="Tu imagen pública"
            question={`¿Quién es ${firstName}?`}
            highlight={firstName}
          />
        ),
      },
      {
        id: "quien-es",
        section: { num: 7, total: SECCIONES_TOTAL, label: "Tu imagen pública" },
        node: <SlideQuienEs ctx={ctx} />,
      },

      // ── Cierre ──
      {
        id: "cta",
        node: <SlideCTA onContinue={() => router.push("/onboarding/fase-3")} />,
      },
    ],
    [ctx, router, partidoNombre, jurisdiccionLabel, firstName],
  );

  const total = slides.length;
  const current = slides[index]!;

  const goNext = useCallback(() => {
    setDirection(1);
    setIndex((i) => Math.min(i + 1, total - 1));
  }, [total]);

  const goPrev = useCallback(() => {
    setDirection(-1);
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  const goTo = useCallback(
    (target: number) => {
      setDirection(target > index ? 1 : -1);
      setIndex(Math.max(0, Math.min(target, total - 1)));
    },
    [index, total],
  );

  // Keyboard nav
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "Home") {
        goTo(0);
      } else if (e.key === "End") {
        goTo(total - 1);
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, goTo, total]);

  // Touch swipe
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let startX = 0;
    let startY = 0;
    function onStart(e: TouchEvent) {
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
    }
    function onEnd(e: TouchEvent) {
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) goNext();
        else goPrev();
      }
    }
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
    };
  }, [goNext, goPrev]);

  function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }

  useEffect(() => {
    function onChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const sectionProgress = current.section
    ? `Sección ${current.section.num} de ${current.section.total} · ${current.section.label}`
    : null;

  return (
    <div
      ref={containerRef}
      className="relative min-h-screen w-full overflow-hidden bg-[#020a1e] text-white"
    >
      {/* Cloud sky background — multi-layer for depth */}
      <CloudSkyBg />

      {/* Top: section indicator (only on content/divider slides) */}
      {sectionProgress && (
        <motion.div
          key={`section-${current.section?.num}`}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-30 px-3 py-1 hidden sm:block"
        >
          <div className="rounded-full bg-[#020a1e]/80 backdrop-blur-md border border-amber-400/20 px-4 py-1.5 text-[10px] uppercase tracking-[0.3em] text-amber-400/90 font-semibold">
            {sectionProgress}
          </div>
        </motion.div>
      )}

      {/* Slide content */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-8 pt-6 pb-32 min-h-screen flex flex-col">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={current.id}
            custom={direction}
            initial={{ opacity: 0, x: direction === 1 ? 80 : -80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction === 1 ? -80 : 80 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="flex-1 flex flex-col"
          >
            {current.node}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer nav bar */}
      <div className="fixed bottom-0 inset-x-0 z-20 bg-gradient-to-t from-[#020a1e] via-[#020a1e]/95 to-transparent backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between gap-3">
          {/* Goberna footer logo */}
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400/70">
            <span className="size-7 rounded-full border border-amber-400/40 bg-amber-400/10 flex items-center justify-center text-amber-400 font-black text-xs">
              G
            </span>
            <span className="hidden sm:inline font-semibold">Goberna · Consultoría Política</span>
          </div>

          {/* Dot indicator + counter */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-1.5">
              {slides.map((s, i) => {
                const isActive = i === index;
                const isPast = i < index;
                const isDivider = s.isDivider;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => goTo(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      isActive
                        ? "w-10 bg-amber-400"
                        : isPast
                          ? `${isDivider ? "w-2" : "w-3"} bg-amber-400/40`
                          : `${isDivider ? "w-2" : "w-3"} bg-gray-700`
                    }`}
                    aria-label={`Slide ${i + 1}`}
                  />
                );
              })}
            </div>
            <span className="text-xs text-gray-400 tabular-nums">
              <span className="text-amber-400 font-semibold">{index + 1}</span> / {total}
            </span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={index === 0}
              className="size-10 rounded-full border border-gray-700 hover:border-amber-400/50 bg-black/40 text-gray-300 hover:text-amber-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              aria-label="Anterior"
            >
              <ChevronLeft className="size-5" />
            </button>
            {index === total - 1 ? (
              <button
                type="button"
                onClick={() => router.push("/onboarding/fase-3")}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-gradient-to-r from-amber-400 to-amber-600 text-[#0a1e4a] font-bold shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 transition-all"
              >
                Fase 3
                <ArrowRight className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                className="size-10 rounded-full bg-amber-400 hover:bg-amber-300 text-[#0a1e4a] flex items-center justify-center transition-colors shadow-lg shadow-amber-500/30"
                aria-label="Siguiente"
              >
                <ChevronRight className="size-5" />
              </button>
            )}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="hidden sm:flex size-10 rounded-full border border-gray-700 hover:border-amber-400/50 bg-black/40 text-gray-300 hover:text-amber-400 items-center justify-center transition-colors"
              aria-label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
              title="Pantalla completa (F)"
            >
              {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

