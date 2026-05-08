"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, ArrowRight } from "lucide-react";

import type { CandidatoContext } from "@/lib/onboarding-api";

import { SlideCover } from "./slides/SlideCover";
import { SlideRoadmap } from "./slides/SlideRoadmap";
import { SlideIdentity } from "./slides/SlideIdentity";
import { SlideResumen } from "./slides/SlideResumen";
import { SlideAnalisisElectoral } from "./slides/SlideAnalisisElectoral";
import { SlidePartidosImportantes } from "./slides/SlidePartidosImportantes";
import { SlideHistorialINFOGOB } from "./slides/SlideHistorialINFOGOB";
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

  const slides = useMemo<SlideDef[]>(
    () => [
      // Apertura
      { id: "cover", node: <SlideCover /> },
      { id: "roadmap", node: <SlideRoadmap ctx={ctx} /> },
      // Sección 1: Tu territorio
      {
        id: "identity",
        section: { num: 1, total: 5, label: "Tu territorio" },
        node: <SlideIdentity ctx={ctx} />,
      },
      {
        id: "resumen",
        section: { num: 1, total: 5, label: "Tu territorio" },
        node: <SlideResumen ctx={ctx} />,
      },
      // Sección 2: Análisis electoral
      {
        id: "div-analisis",
        section: { num: 2, total: 5, label: "Análisis electoral" },
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
        section: { num: 2, total: 5, label: "Análisis electoral" },
        node: <SlideAnalisisElectoral ctx={ctx} />,
      },
      // Sección 3: Quiénes mandan
      {
        id: "div-partidos",
        section: { num: 3, total: 5, label: "Competencia partidaria" },
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
        section: { num: 3, total: 5, label: "Competencia partidaria" },
        node: <SlidePartidosImportantes ctx={ctx} />,
      },
      // Sección 4: Historial político
      {
        id: "div-historial",
        section: { num: 4, total: 5, label: "Historial político" },
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
        section: { num: 4, total: 5, label: "Historial político" },
        node: <SlideHistorialINFOGOB ctx={ctx} />,
      },
      // Sección 5: ¿Quién sos?
      {
        id: "div-quien",
        section: { num: 5, total: 5, label: "Tu imagen pública" },
        isDivider: true,
        node: (
          <SectionDivider
            sectionNumber="05"
            kicker="Tu imagen pública"
            question={`¿Quién es ${ctx.user.full_name.split(/\s+/)[0]}?`}
            highlight={ctx.user.full_name.split(/\s+/)[0] ?? ""}
          />
        ),
      },
      {
        id: "quien-es",
        section: { num: 5, total: 5, label: "Tu imagen pública" },
        node: <SlideQuienEs ctx={ctx} />,
      },
      // Cierre
      {
        id: "cta",
        node: <SlideCTA onContinue={() => router.push("/onboarding/fase-3")} />,
      },
    ],
    [ctx, router, partidoNombre, jurisdiccionLabel],
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

/**
 * Background "cielo nublado" estilo PDF Goberna: navy profundo con
 * múltiples capas de gradientes + textura de ruido sutil.
 */
function CloudSkyBg() {
  return (
    <>
      {/* Capa 1: gradiente base navy */}
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-[#0a1e4a] via-[#061b3d] to-[#020a1e]" />

      {/* Capa 2: nubes — múltiples radial gradients */}
      <div
        className="pointer-events-none fixed inset-0 opacity-60"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 60% 40% at 15% 20%, rgba(59, 130, 246, 0.15), transparent 60%),
            radial-gradient(ellipse 70% 50% at 85% 30%, rgba(30, 64, 175, 0.20), transparent 65%),
            radial-gradient(ellipse 80% 50% at 50% 80%, rgba(15, 23, 42, 0.6), transparent 70%),
            radial-gradient(ellipse 40% 30% at 75% 70%, rgba(96, 165, 250, 0.10), transparent 50%)
          `,
        }}
      />

      {/* Capa 3: glow dorado del top (acento) */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-1/3 bg-gradient-to-b from-amber-400/[0.06] to-transparent" />

      {/* Capa 4: vignette inferior */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-[#020a1e] to-transparent" />

      {/* Capa 5: noise texture sutil */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")",
        }}
      />
    </>
  );
}
