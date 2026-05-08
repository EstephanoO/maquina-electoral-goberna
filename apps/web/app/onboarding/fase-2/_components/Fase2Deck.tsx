"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, ArrowRight } from "lucide-react";

import type { CandidatoContext } from "@/lib/onboarding-api";

import { SlideCover } from "./slides/SlideCover";
import { SlideIdentity } from "./slides/SlideIdentity";
import { SlideResumen } from "./slides/SlideResumen";
import { SlideAnalisisElectoral } from "./slides/SlideAnalisisElectoral";
import { SlidePartidosImportantes } from "./slides/SlidePartidosImportantes";
import { SlideHistorialINFOGOB } from "./slides/SlideHistorialINFOGOB";
import { SlideQuienEs } from "./slides/SlideQuienEs";
import { SlideCTA } from "./slides/SlideCTA";

interface Fase2DeckProps {
  ctx: CandidatoContext;
}

export function Fase2Deck({ ctx }: Fase2DeckProps) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const slides = useMemo(
    () => [
      { id: "cover", title: "Goberna", node: <SlideCover /> },
      { id: "identity", title: "Tu candidatura", node: <SlideIdentity ctx={ctx} /> },
      { id: "resumen", title: "Resumen jurisdicción", node: <SlideResumen ctx={ctx} /> },
      {
        id: "analisis",
        title: "Análisis electoral",
        node: <SlideAnalisisElectoral ctx={ctx} />,
      },
      {
        id: "partidos",
        title: "Partidos importantes",
        node: <SlidePartidosImportantes ctx={ctx} />,
      },
      { id: "historial", title: "Historial político", node: <SlideHistorialINFOGOB ctx={ctx} /> },
      { id: "quien-es", title: "¿Quién es?", node: <SlideQuienEs ctx={ctx} /> },
      {
        id: "cta",
        title: "Próximo paso",
        node: (
          <SlideCTA
            onContinue={() => router.push("/onboarding/fase-3")}
          />
        ),
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
      className="relative min-h-screen w-full overflow-hidden bg-[#061b3d] text-white"
    >
      {/* Cloud BG layers */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(30,64,175,0.4),transparent_60%),radial-gradient(ellipse_at_bottom,rgba(6,27,61,0.9),#020a1e_80%)]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-30 mix-blend-screen"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.04), transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.03), transparent 35%)",
        }}
      />

      {/* Slide content */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-8 pt-6 pb-32 min-h-screen flex flex-col">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={current.id}
            custom={direction}
            initial={{ opacity: 0, x: direction === 1 ? 60 : -60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction === 1 ? -60 : 60 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="flex-1 flex flex-col"
          >
            {current.node}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer nav bar */}
      <div className="fixed bottom-0 inset-x-0 z-20 bg-gradient-to-t from-[#020a1e] via-[#020a1e]/90 to-transparent backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-8 py-3 flex items-center justify-between gap-3">
          {/* Goberna footer logo */}
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400/70">
            <span className="size-6 rounded-full border border-amber-500/40 bg-amber-500/10 flex items-center justify-center text-amber-400 font-bold text-[10px]">
              G
            </span>
            <span className="hidden sm:inline">Goberna · Consultoría Política</span>
          </div>

          {/* Dot indicator + counter */}
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-1.5">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => goTo(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index
                      ? "w-8 bg-amber-400"
                      : i < index
                        ? "w-3 bg-amber-400/40"
                        : "w-3 bg-gray-700"
                  }`}
                  aria-label={`Ir a slide ${i + 1}: ${s.title}`}
                />
              ))}
            </div>
            <span className="text-xs text-gray-400 tabular-nums ml-2">
              <span className="text-amber-400 font-semibold">{index + 1}</span> / {total}
            </span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={index === 0}
              className="size-10 rounded-full border border-gray-700 hover:border-amber-500/50 bg-black/40 text-gray-300 hover:text-amber-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              aria-label="Anterior"
            >
              <ChevronLeft className="size-5" />
            </button>
            {index === total - 1 ? (
              <button
                type="button"
                onClick={() => router.push("/onboarding/fase-3")}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-black font-semibold shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 transition-all"
              >
                Fase 3
                <ArrowRight className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                className="size-10 rounded-full bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center transition-colors"
                aria-label="Siguiente"
              >
                <ChevronRight className="size-5" />
              </button>
            )}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="hidden sm:flex size-10 rounded-full border border-gray-700 hover:border-amber-500/50 bg-black/40 text-gray-300 hover:text-amber-400 items-center justify-center transition-colors"
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
