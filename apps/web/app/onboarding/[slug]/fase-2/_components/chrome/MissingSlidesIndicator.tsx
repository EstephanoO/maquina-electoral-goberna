"use client";

import { useState } from "react";
import { ArrowUpRight, Lock, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

/**
 * Indicador en el footer del deck que muestra cuántas slides hay
 * pendientes de desbloquear y, al hacer click, expone un popover con
 * la lista + link directo a la sección del form que la alimenta.
 *
 * Cierra el loop fase-1 ↔ fase-2: el consultor ve qué le falta llenar
 * sin tener que navegar al form a investigar.
 */

export type MissingSlide = {
  /** ID de la slide (el mismo del catálogo en Fase2F1Deck). */
  id: string;
  /** Label legible para mostrar. */
  label: string;
  /** Sección del form que la desbloquea (anchor o etiqueta corta). */
  unlocks: string;
  /** href al form. Anchor opcional para scrollar a la sección. */
  href: string;
};

interface Props {
  missing: MissingSlide[];
  totalCatalog: number;
}

export function MissingSlidesIndicator({ missing, totalCatalog }: Props) {
  const [open, setOpen] = useState(false);

  if (missing.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 hover:bg-amber-400/20 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-amber-300 font-bold transition-colors"
        title={`Faltan ${missing.length} slides por desbloquear`}
      >
        <Lock className="size-3" />
        +{missing.length} por desbloquear
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#020a1e]/80 backdrop-blur-sm p-4"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.97 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-lg rounded-2xl border border-amber-400/30 bg-gradient-to-br from-[#0a1f4a] to-[#020a1e] shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="relative px-6 py-5 border-b border-white/10">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="absolute right-4 top-4 size-7 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-colors"
                  aria-label="Cerrar"
                >
                  <X className="size-4" />
                </button>
                <div className="text-[10px] uppercase tracking-[0.3em] text-amber-400/80 font-bold mb-1">
                  Slides bloqueadas
                </div>
                <h3 className="text-xl font-black uppercase tracking-tight text-white">
                  {missing.length} de {totalCatalog} por desbloquear
                </h3>
                <p className="mt-2 text-sm text-white/60">
                  Estas slides aparecen automáticamente cuando llenás la sección correspondiente del form.
                </p>
              </div>

              {/* Lista de slides faltantes */}
              <ul className="px-3 py-3 space-y-1 max-h-[60vh] overflow-y-auto">
                {missing.map((m) => (
                  <li key={m.id}>
                    <a
                      href={m.href}
                      className="group flex items-center justify-between gap-3 rounded-xl px-3 py-3 hover:bg-amber-400/10 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Lock className="size-3 text-amber-400/60 shrink-0" />
                          <span className="font-bold text-white truncate">
                            {m.label}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-white/50 pl-5">
                          Completá <span className="text-amber-300 font-semibold">{m.unlocks}</span>
                        </div>
                      </div>
                      <ArrowUpRight className="size-4 text-amber-400/40 group-hover:text-amber-400 transition-colors shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
