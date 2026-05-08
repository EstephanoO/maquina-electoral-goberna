"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, ArrowRight } from "lucide-react";

import type { CandidatoContext } from "@/lib/onboarding-api";
import {
  ESTRATEGIA_CATALOGO,
  intensidadesInicial,
  calcularPresupuesto,
  calcularSubtotal,
  type EstrategiaIntensidades,
} from "@/lib/mocks/estrategia-mock";

import { SectionDivider } from "@/app/onboarding/fase-2/_components/slides/SectionDivider";

import { SlideFase3Intro } from "./slides/SlideFase3Intro";
import { SlideTrack } from "./slides/SlideTrack";
import { SlideResumenPresupuesto } from "./slides/SlideResumenPresupuesto";

interface Fase3DeckProps {
  ctx: CandidatoContext;
  onFinishStrategy: (data: { intensidades: EstrategiaIntensidades; total: number }) => void;
}

interface SlideDef {
  id: string;
  section?: { num: number; total: number; label: string };
  isDivider?: boolean;
  node: React.ReactNode;
}

export function Fase3Deck({ ctx, onFinishStrategy }: Fase3DeckProps) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [intensidades, setIntensidades] = useState<EstrategiaIntensidades>(intensidadesInicial());
  const containerRef = useRef<HTMLDivElement>(null);

  const total = useMemo(() => calcularPresupuesto(intensidades), [intensidades]);
  const subDigital = useMemo(() => calcularSubtotal("digital", intensidades), [intensidades]);
  const subTerritorial = useMemo(() => calcularSubtotal("territorial", intensidades), [intensidades]);

  function handleSlider(catId: string, value: number) {
    setIntensidades((prev) => ({ ...prev, [catId]: value }));
  }

  const slides = useMemo<SlideDef[]>(
    () => [
      { id: "intro", node: <SlideFase3Intro ctx={ctx} /> },
      {
        id: "div-digital",
        section: { num: 1, total: 2, label: "Estrategia Digital" },
        isDivider: true,
        node: (
          <SectionDivider
            sectionNumber="01"
            kicker="Estrategia digital"
            question="Donde se libra la batalla de percepción"
            highlight="batalla de percepción"
          />
        ),
      },
      {
        id: "digital",
        section: { num: 1, total: 2, label: "Estrategia Digital" },
        node: (
          <SlideTrack
            track={ESTRATEGIA_CATALOGO[0]!}
            kicker="01 · Configurá tu presencia online"
            subtotal={subDigital}
            intensidades={intensidades}
            onChange={handleSlider}
          />
        ),
      },
      {
        id: "div-territorial",
        section: { num: 2, total: 2, label: "Estrategia Territorial" },
        isDivider: true,
        node: (
          <SectionDivider
            sectionNumber="02"
            kicker="Estrategia territorial"
            question="Donde se ganan las elecciones"
            highlight="se ganan"
          />
        ),
      },
      {
        id: "territorial",
        section: { num: 2, total: 2, label: "Estrategia Territorial" },
        node: (
          <SlideTrack
            track={ESTRATEGIA_CATALOGO[1]!}
            kicker="02 · Configurá tu operación de campo"
            subtotal={subTerritorial}
            intensidades={intensidades}
            onChange={handleSlider}
          />
        ),
      },
      {
        id: "resumen",
        node: (
          <SlideResumenPresupuesto
            total={total}
            digital={subDigital}
            territorial={subTerritorial}
            intensidades={intensidades}
            onContinue={() => onFinishStrategy({ intensidades, total })}
          />
        ),
      },
    ],
    [ctx, intensidades, total, subDigital, subTerritorial, onFinishStrategy],
  );

  const totalSlides = slides.length;
  const current = slides[index]!;

  const goNext = useCallback(() => {
    setDirection(1);
    setIndex((i) => Math.min(i + 1, totalSlides - 1));
  }, [totalSlides]);

  const goPrev = useCallback(() => {
    setDirection(-1);
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  const goTo = useCallback(
    (target: number) => {
      setDirection(target > index ? 1 : -1);
      setIndex(Math.max(0, Math.min(target, totalSlides - 1)));
    },
    [index, totalSlides],
  );

  // Keyboard nav (no interfiere con sliders/inputs)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "Home") {
        goTo(0);
      } else if (e.key === "End") {
        goTo(totalSlides - 1);
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, goTo, totalSlides]);

  // Touch swipe (sólo si NO empezó sobre un slider/input)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let startX = 0;
    let startY = 0;
    let onSlider = false;
    function onStart(e: TouchEvent) {
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
      const target = e.target as HTMLElement;
      onSlider = !!target.closest('input[type="range"], button');
    }
    function onEnd(e: TouchEvent) {
      if (onSlider) return;
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
      <CloudSkyBg />

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

      {/* Sticky live total — visible en todos los slides excepto el resumen final */}
      {current.id !== "resumen" && current.id !== "intro" && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-4 right-4 z-30 hidden sm:block"
        >
          <div className="rounded-2xl bg-gradient-to-br from-amber-400/20 to-amber-500/10 backdrop-blur-md border border-amber-400/40 px-4 py-2.5">
            <p className="text-[9px] uppercase tracking-[0.3em] text-amber-400/80 font-semibold leading-none">
              Presupuesto vivo
            </p>
            <p className="text-lg font-black text-amber-400 tabular-nums leading-tight mt-1">
              {formatPen(total)}
            </p>
          </div>
        </motion.div>
      )}

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

      {/* Footer nav */}
      <div className="fixed bottom-0 inset-x-0 z-20 bg-gradient-to-t from-[#020a1e] via-[#020a1e]/95 to-transparent backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400/70">
            <span className="size-7 rounded-full border border-amber-400/40 bg-amber-400/10 flex items-center justify-center text-amber-400 font-black text-xs">
              G
            </span>
            <span className="hidden sm:inline font-semibold">Goberna · Tu estrategia</span>
          </div>

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
              <span className="text-amber-400 font-semibold">{index + 1}</span> / {totalSlides}
            </span>
          </div>

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
            {index === totalSlides - 1 ? (
              <button
                type="button"
                onClick={() => onFinishStrategy({ intensidades, total })}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-gradient-to-r from-amber-400 to-amber-600 text-[#0a1e4a] font-bold shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 transition-all"
              >
                Contraseña
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

function formatPen(n: number): string {
  if (n >= 1_000_000) return `S/ ${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `S/ ${(n / 1_000).toFixed(0)}K`;
  return `S/ ${n}`;
}

function CloudSkyBg() {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-[#0a1e4a] via-[#061b3d] to-[#020a1e]" />
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
      <div className="pointer-events-none fixed inset-x-0 top-0 h-1/3 bg-gradient-to-b from-amber-400/[0.06] to-transparent" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-[#020a1e] to-transparent" />
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
