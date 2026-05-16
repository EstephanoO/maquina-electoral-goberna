"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { SECTION_INTROS } from "./section-intros";

interface WizardSection {
  id:       string;
  label:    string;
  icon:     React.ReactNode;
  category: "minimo" | "extendido";
}

interface WizardShellProps {
  slug:            string;
  sections:        WizardSection[];
  activeSection:   number;
  onSectionChange: (idx: number) => void;
  onNext:          () => Promise<void>;
  saving:          boolean;
  saved:           boolean;
  children:        React.ReactNode;
}

export function WizardShell({
  slug,
  sections,
  activeSection,
  onSectionChange,
  onNext,
  saving,
  saved,
  children,
}: WizardShellProps) {
  const section = sections[activeSection]!;
  const intro   = SECTION_INTROS[section.id];
  const isLast  = activeSection === sections.length - 1;
  const isFirst = activeSection === 0;
  const dotsRef = useRef<HTMLDivElement>(null);

  // Scroll active dot into view
  useEffect(() => {
    const container = dotsRef.current;
    if (!container) return;
    const active = container.querySelector("[data-active='true']") as HTMLElement | null;
    active?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeSection]);

  return (
    <div className="min-h-screen bg-[#020a1e] text-white flex flex-col">
      {/* Top bar */}
      <header className="fixed top-0 inset-x-0 z-40 bg-[#020a1e]/90 backdrop-blur-md border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Logo + label */}
          <div className="flex items-center gap-3 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/branding/goberna-escudo.svg" alt="Goberna" className="h-7 w-auto" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-amber-400/60 font-semibold hidden sm:block">
              Fase 1 · Onboarding
            </span>
          </div>

          {/* Save indicator */}
          <AnimatePresence>
            {(saving || saved) && (
              <motion.span
                key={saving ? "saving" : "saved"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-[10px] uppercase tracking-[0.15em] text-amber-400/50 shrink-0"
              >
                {saving ? "Guardando…" : "✓ Guardado"}
              </motion.span>
            )}
          </AnimatePresence>

          {/* Ver mi deck */}
          <a
            href={`/onboarding/${slug}/fase-2`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-600 text-[#0a1e4a] px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] font-black shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 transition-all"
          >
            <Eye className="size-3.5" />
            Ver mi deck
          </a>
        </div>

        {/* Section dots navigation */}
        <div
          ref={dotsRef}
          className="flex items-center gap-1.5 overflow-x-auto scrollbar-none px-4 sm:px-6 pb-2.5 max-w-4xl mx-auto"
        >
          {sections.map((s, i) => {
            const isActive = i === activeSection;
            const isPast   = i < activeSection;
            return (
              <button
                key={s.id}
                data-active={isActive}
                onClick={() => onSectionChange(i)}
                className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all ${
                  isActive
                    ? "bg-amber-400 text-[#0a1e4a] shadow-md shadow-amber-400/30"
                    : isPast
                    ? "bg-white/10 text-white/60 hover:bg-white/15"
                    : "bg-white/5 text-white/30 hover:bg-white/10 hover:text-white/50"
                }`}
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 pt-36 pb-28">
        <AnimatePresence mode="wait">
          <motion.div
            key={section.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Section header */}
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-1">
                <span className="size-9 rounded-xl bg-amber-400/15 border border-amber-400/30 text-amber-400 flex items-center justify-center">
                  {section.icon}
                </span>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-amber-400/60 font-semibold">
                    Sección {String(activeSection + 1).padStart(2, "0")} de {sections.length}
                  </p>
                  <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
                    {section.label}
                  </h2>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-0.5 bg-white/5 rounded-full mt-4">
                <motion.div
                  className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full"
                  initial={false}
                  animate={{ width: `${((activeSection + 1) / sections.length) * 100}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
            </div>

            {/* Intro / guidance card */}
            {intro && (
              <div className="mb-6 bg-[#0a1e4a]/60 border border-amber-400/10 rounded-2xl p-4 sm:p-5 space-y-3">
                <p className="text-sm text-white/60 leading-relaxed">{intro.subtitle}</p>

                {intro.tip && (
                  <p className="text-xs text-amber-400/60 italic">💡 {intro.tip}</p>
                )}

                {intro.fuentes && intro.fuentes.length > 0 && (
                  <div className="space-y-2 pt-1 border-t border-white/5">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-semibold">
                      ¿Dónde lo encontrás?
                    </p>
                    {intro.fuentes.map((f, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <a
                          href={f.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-[10px] font-bold text-amber-400/70 hover:text-amber-400 underline underline-offset-2 transition-colors"
                        >
                          {f.label} ↗
                        </a>
                        {f.pasos && (
                          <p className="text-[10px] text-white/30 leading-relaxed">
                            {f.pasos.join(" → ")}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Section form content */}
            <div className="space-y-6">
              {children}
            </div>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom navigation */}
      <footer className="fixed bottom-0 inset-x-0 z-40 bg-[#020a1e]/95 backdrop-blur-md border-t border-white/5">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Anterior */}
          <button
            type="button"
            onClick={() => onSectionChange(Math.max(0, activeSection - 1))}
            disabled={isFirst}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-white/10 text-sm font-semibold text-white/60 hover:text-white hover:border-white/20 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft className="size-4" />
            Anterior
          </button>

          {/* Section label */}
          <p className="text-[11px] text-white/25 hidden sm:block truncate">
            {activeSection + 1} / {sections.length} · {section.label}
          </p>

          {/* Siguiente / Finalizar */}
          <button
            type="button"
            onClick={onNext}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-600 text-[#0a1e4a] text-sm font-black shadow-md shadow-amber-500/20 hover:shadow-amber-500/40 disabled:opacity-50 transition-all"
          >
            {saving ? "Guardando…" : isLast ? "Finalizar" : "Siguiente"}
            {!isLast && <ChevronRight className="size-4" />}
          </button>
        </div>
      </footer>
    </div>
  );
}
