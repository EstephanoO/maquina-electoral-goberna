"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Edit3, Send, CheckCircle2 } from "lucide-react";

import type { CandidatoContext, Fase2DeckMeta } from "@/lib/onboarding-api";
import { onboardingApi } from "@/lib/onboarding-api";
import { CloudSkyBg } from "@/components/cloud-sky-bg";

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
  draft:           "text-gray-400 border-gray-700",
  pending_review:  "text-amber-400 border-amber-400/40",
  published:       "text-green-400 border-green-400/40",
  rejected:        "text-red-400 border-red-400/40",
};

export function Fase2F1Deck({ slug, ctx, deck }: Props) {
  const router = useRouter();
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
    <div ref={containerRef} className="relative min-h-screen w-full overflow-hidden bg-[#020a1e] text-white">
      <CloudSkyBg />
      <TooltipProvider />

      {/* Top bar — back + status + actions */}
      <div className="fixed top-0 inset-x-0 z-30 px-4 sm:px-8 pt-4 sm:pt-5 flex items-center justify-between gap-3 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2">
          <a
            href={`/onboarding/${slug}/fase-1`}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-[#020a1e]/60 backdrop-blur-md px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-amber-400/80 hover:text-amber-400 hover:border-amber-400/40 transition-colors font-semibold"
          >
            <Edit3 className="size-3.5" />
            Fase 1
          </a>
          {/* Status badge */}
          <span
            className={`rounded-full border bg-[#020a1e]/60 backdrop-blur-md px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] font-semibold ${STATUS_COLOR[deckStatus] ?? "text-gray-400 border-gray-700"}`}
          >
            {STATUS_LABEL[deckStatus] ?? deckStatus}
          </span>
        </div>

        <div className="pointer-events-auto rounded-full bg-[#020a1e]/80 backdrop-blur-md border border-amber-400/20 px-4 py-1.5 text-[10px] uppercase tracking-[0.3em] text-amber-400/90 font-semibold">
          Fase 2 · Presentación
        </div>

        <div className="pointer-events-auto">
          {isDraft && !submitted && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-600 text-[#0a1e4a] px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] font-black shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 transition-all disabled:opacity-60"
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
            <span className="inline-flex items-center gap-1.5 rounded-full border border-green-400/40 bg-[#020a1e]/60 backdrop-blur-md px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-green-400 font-semibold">
              <CheckCircle2 className="size-3.5" />
              {isPublished ? "Publicada" : "Enviada a revisión"}
            </span>
          )}
        </div>
      </div>

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
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400/70">
            <span className="size-7 rounded-full border border-amber-400/40 bg-amber-400/10 flex items-center justify-center text-amber-400 font-black text-xs">G</span>
            <span className="hidden sm:inline font-semibold">Goberna · Consultoría Política</span>
          </div>

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
                      isActive ? "w-10 bg-amber-400" : isPast ? "w-3 bg-amber-400/40" : "w-3 bg-gray-700"
                    }`}
                    aria-label={`Slide ${i + 1}`}
                  />
                );
              })}
            </div>
            <span className="text-xs text-gray-400 tabular-nums flex items-center gap-2">
              <span className="text-amber-400 font-semibold">{index + 1}</span> / {total}
              {contentTotal < TOTAL_CATALOG ? (
                <span className="hidden sm:inline text-[10px] uppercase tracking-[0.15em] text-amber-400/50 ml-2">
                  · Mostrando {total} de {TOTAL_CATALOG}
                </span>
              ) : null}
              <span className="ml-2">
                <MissingSlidesIndicator missing={missing} totalCatalog={TOTAL_CATALOG} />
              </span>
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
            <button
              type="button"
              onClick={goNext}
              disabled={index === total - 1}
              className="size-10 rounded-full bg-amber-400 hover:bg-amber-300 text-[#0a1e4a] flex items-center justify-center transition-colors shadow-lg shadow-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Siguiente"
            >
              <ChevronRight className="size-5" />
            </button>
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
