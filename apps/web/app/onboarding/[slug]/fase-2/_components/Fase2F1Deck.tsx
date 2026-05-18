"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Edit3, Send, CheckCircle2 } from "lucide-react";

import type { CandidatoContext, Fase2DeckMeta } from "@/lib/onboarding-api";
import { onboardingApi } from "@/lib/onboarding-api";

import { JORGE_VALDEZ_ESTRATEGIA as ESTRAT } from "../lib/estrategia-config";
import { SlideStratPortada }      from "./slides/SlideStratPortada";
import { SlideStratEncuesta }     from "./slides/SlideStratEncuesta";
import { SlideStratDiagnostico }  from "./slides/SlideStratDiagnostico";
import { SlideStratIssues }       from "./slides/SlideStratIssues";
import { SlideStratOportunidad }  from "./slides/SlideStratOportunidad";
import { SlideStratEstrategia }   from "./slides/SlideStratEstrategia";
import { SlideStratHerramientas } from "./slides/SlideStratHerramientas";
import { SlideStratWarRoom }      from "./slides/SlideStratWarRoom";

import { MissingSlidesIndicator } from "./chrome/MissingSlidesIndicator";
import { TooltipProvider } from "./slides/shared/Tooltip";

interface Props {
  slug: string;
  ctx: CandidatoContext;
  deck: Fase2DeckMeta;
}

const STATUS_LABEL: Record<string, string> = {
  draft:            "Borrador",
  pending_review:   "En revisión",
  published:        "Publicada",
  rejected:         "Rechazada",
};

const STATUS_COLOR: Record<string, string> = {
  draft:          "text-gray-500 border-gray-300",
  pending_review: "text-amber-600 border-amber-300",
  published:      "text-green-600 border-green-300",
  rejected:       "text-red-600 border-red-300",
};

export function Fase2F1Deck({ slug, ctx: _ctx, deck }: Props) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const allCatalog = useMemo(() => [
    { id: "portada",      label: "Portada",      visible: true, formSection: null as string | null, node: <SlideStratPortada      data={ESTRAT} /> },
    { id: "encuesta",     label: "Situación",    visible: true, formSection: null as string | null, node: <SlideStratEncuesta     data={ESTRAT} /> },
    { id: "diagnostico",  label: "Diagnóstico",  visible: true, formSection: null as string | null, node: <SlideStratDiagnostico  data={ESTRAT} /> },
    { id: "issues",       label: "Issues",       visible: true, formSection: null as string | null, node: <SlideStratIssues       data={ESTRAT} /> },
    { id: "oportunidad",  label: "Oportunidad",  visible: true, formSection: null as string | null, node: <SlideStratOportunidad  data={ESTRAT} /> },
    { id: "estrategia",   label: "Estrategia",   visible: true, formSection: null as string | null, node: <SlideStratEstrategia   data={ESTRAT} /> },
    { id: "herramientas", label: "Herramientas", visible: true, formSection: null as string | null, node: <SlideStratHerramientas data={ESTRAT} /> },
    { id: "war-room",     label: "War Room",     visible: true, formSection: null as string | null, node: <SlideStratWarRoom      data={ESTRAT} /> },
  ], []);

  const slides = useMemo(() => allCatalog.filter((s) => s.visible), [allCatalog]);
  const contentSlides = slides;

  const missing: never[] = [];

  const TOTAL_CATALOG = 8;
  const total = slides.length;
  const contentTotal = contentSlides.length;
  const current = slides[Math.min(index, total - 1)]!;

  const goNext = useCallback(() => {
    setDirection(1);
    setIndex((i) => Math.min(i + 1, total - 1));
  }, [total]);

  const goPrev = useCallback(() => {
    setDirection(-1);
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  const goTo = useCallback((target: number) => {
    setDirection(target > index ? 1 : -1);
    setIndex(Math.max(0, Math.min(target, total - 1)));
  }, [index, total]);

  // Keyboard nav
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault(); goNext();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault(); goPrev();
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
    let sx = 0, sy = 0;
    const onStart = (e: TouchEvent) => { sx = e.touches[0]!.clientX; sy = e.touches[0]!.clientY; };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0]!.clientX - sx;
      const dy = e.changedTouches[0]!.clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        dx < 0 ? goNext() : goPrev();
      }
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => { el.removeEventListener("touchstart", onStart); el.removeEventListener("touchend", onEnd); };
  }, [goNext, goPrev]);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onboardingApi.submitFase2ForReview(slug);
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  const deckStatus = deck.status;
  const isDraft = deckStatus === "draft";
  const isPublished = deckStatus === "published";

  return (
    <div ref={containerRef} className="relative h-screen w-full overflow-hidden bg-gray-50">
      <TooltipProvider />

      {/* Top bar — navy, fixed, h-14 */}
      <div
        className="fixed top-0 inset-x-0 z-30 h-14 flex items-center justify-between gap-3 px-4 sm:px-8"
        style={{ background: "linear-gradient(to right, #061633, #0a1f4a, #061633)" }}
      >
        {/* Gold bottom stripe */}
        <div className="absolute bottom-0 inset-x-0 h-[3px] bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500" />

        {/* Left: Fase1 link + status badge */}
        <div className="flex items-center gap-2 z-10">
          <a
            href={`/onboarding/${slug}/fase-1`}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-white/5 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-amber-400 hover:text-amber-300 hover:border-amber-400/60 transition-colors font-semibold"
          >
            <Edit3 className="size-3.5" />
            Fase 1
          </a>
          <span
            className={`rounded-full border bg-white/5 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] font-semibold ${STATUS_COLOR[deckStatus] ?? "text-gray-500 border-gray-300"}`}
          >
            {STATUS_LABEL[deckStatus] ?? deckStatus}
          </span>
        </div>

        {/* Center: deck title */}
        <div className="z-10 rounded-full border border-amber-400/20 bg-white/5 px-4 py-1.5 text-[10px] uppercase tracking-[0.3em] text-amber-400 font-semibold">
          Fase 2 · Presentación
        </div>

        {/* Right: submit / status */}
        <div className="z-10">
          {isDraft && !submitted && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-[#0a1f4a] px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] font-black shadow-lg hover:from-amber-300 hover:to-amber-400 transition-all disabled:opacity-60"
            >
              {submitting ? (
                <span>Enviando...</span>
              ) : (
                <>
                  <Send className="size-3.5" />
                  Publicar
                </>
              )}
            </button>
          )}
          {(submitted || deckStatus === "pending_review" || isPublished) && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-green-400/40 bg-white/5 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-green-400 font-semibold">
              <CheckCircle2 className="size-3.5" />
              {isPublished ? "Publicada" : "Enviada a revisión"}
            </span>
          )}
        </div>
      </div>

      {/* Slide content area — fills between top bar (56px) and footer (64px) */}
      <div
        className="fixed inset-x-0 z-10 overflow-hidden"
        style={{ top: "56px", bottom: "64px" }}
      >
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={current.id}
            custom={direction}
            initial={{ opacity: 0, x: direction === 1 ? 80 : -80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction === 1 ? -80 : 80 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="h-full"
          >
            {current.node}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer nav bar — white, fixed, h-16 */}
      <div className="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-gray-200 h-16 flex items-center">
        <div className="w-full px-4 sm:px-8 flex items-center justify-between gap-3">

          {/* Dot nav */}
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
                      ? "w-10 bg-[#0a1f4a]"
                      : isPast
                      ? "w-3 bg-amber-400"
                      : "w-3 bg-gray-200"
                  }`}
                  aria-label={`Slide ${i + 1}`}
                />
              );
            })}
          </div>

          {/* Counter + missing indicator */}
          <span className="text-xs text-gray-500 tabular-nums flex items-center gap-2">
            <span className="text-[#0a1f4a] font-bold">{index + 1}</span>
            <span className="text-gray-400">/</span>
            <span>{total}</span>
            {contentTotal < TOTAL_CATALOG ? (
              <span className="hidden sm:inline text-[10px] uppercase tracking-[0.15em] text-amber-600/70 ml-2">
                · Mostrando {total} de {TOTAL_CATALOG}
              </span>
            ) : null}
            <span className="ml-2">
              <MissingSlidesIndicator missing={missing} totalCatalog={TOTAL_CATALOG} />
            </span>
          </span>

          {/* Prev / Next / Fullscreen */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={index === 0}
              className="size-10 rounded-full border border-gray-300 text-gray-600 hover:border-amber-400 hover:text-amber-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              aria-label="Anterior"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={index === total - 1}
              className="size-10 rounded-full bg-[#0a1f4a] hover:bg-[#1a2c5e] text-amber-400 flex items-center justify-center transition-colors shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Siguiente"
            >
              <ChevronRight className="size-5" />
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="hidden sm:flex size-10 rounded-full border border-gray-300 text-gray-600 hover:border-gray-400 items-center justify-center transition-colors"
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
