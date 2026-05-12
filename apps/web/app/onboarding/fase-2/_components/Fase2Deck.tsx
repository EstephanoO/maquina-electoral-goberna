"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, ArrowRight } from "lucide-react";

import type { CandidatoContext } from "@/lib/onboarding-api";
import { CloudSkyBg } from "@/components/cloud-sky-bg";

import { SlideCover } from "./slides/SlideCover";
import { SlideCapacidadGoberna } from "./slides/SlideCapacidadGoberna";
import { SlideFichaBasica } from "./slides/SlideFichaBasica";
import { SlideAnalisisElectoral } from "./slides/SlideAnalisisElectoral";
import { SlideVotosParaGanar } from "./slides/SlideVotosParaGanar";
import { SlideFormulaElectoral } from "./slides/SlideFormulaElectoral";
import { SlideDebilidades } from "./slides/SlideDebilidades";
import { SlideWarRoomCTA } from "./slides/SlideWarRoomCTA";

interface Fase2DeckProps {
  ctx: CandidatoContext;
}

interface SlideDef {
  id: string;
  node: React.ReactNode;
}

export function Fase2Deck({ ctx }: Fase2DeckProps) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Deck minimalista 8 slides — menos es más, narrativa condensada.
  // Cada slide es un beat impactante: brand → identidad → servicio →
  // territorio → meta → riesgos → plan → cierre.
  const slides = useMemo<SlideDef[]>(
    () => [
      { id: "cover", node: <SlideCover /> },
      { id: "ficha-basica", node: <SlideFichaBasica ctx={ctx} /> },
      { id: "capacidad-goberna", node: <SlideCapacidadGoberna /> },
      { id: "analisis", node: <SlideAnalisisElectoral ctx={ctx} /> },
      { id: "votos-para-ganar", node: <SlideVotosParaGanar ctx={ctx} /> },
      { id: "debilidades", node: <SlideDebilidades ctx={ctx} /> },
      { id: "formula-electoral", node: <SlideFormulaElectoral ctx={ctx} /> },
      {
        id: "war-room-cta",
        node: <SlideWarRoomCTA onContinue={() => router.push("/home")} />,
      },
    ],
    [ctx, router],
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

  return (
    <div
      ref={containerRef}
      className="relative min-h-screen w-full overflow-hidden bg-[#020a1e] text-white"
    >
      {/* Cloud sky background — multi-layer for depth */}
      <CloudSkyBg />

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
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => goTo(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      isActive
                        ? "w-10 bg-amber-400"
                        : isPast
                          ? "w-3 bg-amber-400/40"
                          : "w-3 bg-gray-700"
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

