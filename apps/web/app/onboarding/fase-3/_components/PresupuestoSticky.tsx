"use client";

import { motion } from "motion/react";
import { Wallet } from "lucide-react";

interface PresupuestoStickyProps {
  total: number;
  digital: number;
  territorial: number;
}

/**
 * Barra inferior fija con el total presupuestado en vivo.
 * En mobile se compacta; en desktop muestra el desglose.
 */
export function PresupuestoSticky({ total, digital, territorial }: PresupuestoStickyProps) {
  return (
    <motion.div
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      className="fixed bottom-0 inset-x-0 z-20"
    >
      <div className="bg-gradient-to-t from-black via-black/95 to-black/80 border-t-2 border-amber-500/30 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 size-10 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Wallet className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-amber-400/70">
                Presupuesto estimado
              </p>
              <p className="text-xl sm:text-2xl text-white font-bold tabular-nums leading-tight">
                {formatPen(total)}
                <span className="ml-1 text-xs font-normal text-gray-500">/ campaña</span>
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-6 text-xs">
            <div className="text-right">
              <p className="text-amber-400/70 uppercase tracking-widest text-[10px]">Digital</p>
              <p className="text-white font-medium tabular-nums">{formatPen(digital)}</p>
            </div>
            <div className="h-8 w-px bg-gray-800" />
            <div className="text-right">
              <p className="text-amber-400/70 uppercase tracking-widest text-[10px]">Territorial</p>
              <p className="text-white font-medium tabular-nums">{formatPen(territorial)}</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function formatPen(n: number): string {
  if (n >= 1_000_000) return `S/ ${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `S/ ${(n / 1_000).toFixed(0)}K`;
  return `S/ ${n}`;
}
