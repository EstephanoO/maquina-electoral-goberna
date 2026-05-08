"use client";

import { motion } from "motion/react";
import { ArrowRight, Globe, MapPin, Wallet } from "lucide-react";

import { ESTRATEGIA_CATALOGO, type EstrategiaIntensidades } from "@/lib/mocks/estrategia-mock";
import { CountUp } from "@/app/onboarding/fase-2/_components/slides/CountUp";

interface SlideResumenPresupuestoProps {
  total: number;
  digital: number;
  territorial: number;
  intensidades: EstrategiaIntensidades;
  onContinue: () => void;
}

export function SlideResumenPresupuesto({
  total,
  digital,
  territorial,
  intensidades,
  onContinue,
}: SlideResumenPresupuestoProps) {
  const pctDigital = total > 0 ? Math.round((digital / total) * 100) : 0;
  const pctTerritorial = total > 0 ? Math.round((territorial / total) * 100) : 0;

  // Para el breakdown por categoría
  const allCategorias = ESTRATEGIA_CATALOGO.flatMap((track) =>
    track.categorias.map((cat) => ({
      ...cat,
      trackId: track.id,
      intensidad: intensidades[cat.id] ?? 0,
      costo: (intensidades[cat.id] ?? 0) * cat.costoPorPuntoPen,
    })),
  ).sort((a, b) => b.costo - a.costo);

  const maxCosto = Math.max(...allCategorias.map((c) => c.costo), 1);

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[calc(100vh-180px)] px-4 sm:px-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <p className="text-xs sm:text-sm uppercase tracking-[0.4em] text-amber-400/80 font-semibold mb-3">
          Tu campaña arranca con
        </p>
        <div className="relative">
          <div className="text-6xl sm:text-8xl md:text-[10rem] font-black text-white tabular-nums tracking-tight leading-none">
            S/{" "}
            <CountUp
              to={total}
              duration={1500}
              format={(n) => n.toLocaleString("es-PE")}
              className="text-amber-400"
            />
          </div>
        </div>
        <p className="mt-3 text-sm sm:text-base text-gray-400">
          Después podés ajustar todo desde la plataforma.
        </p>
      </motion.div>

      {/* Breakdown Digital vs Territorial */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-5xl mb-8">
        <BreakdownCard
          icon={<Globe className="size-6" />}
          label="Digital"
          tagline="Percepción y pauta"
          amount={digital}
          pct={pctDigital}
          delay={0.2}
        />
        <BreakdownCard
          icon={<MapPin className="size-6" />}
          label="Territorial"
          tagline="Operación de campo"
          amount={territorial}
          pct={pctTerritorial}
          delay={0.3}
        />
      </div>

      {/* Bar chart por categoría */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="w-full max-w-5xl rounded-2xl border-2 border-amber-400/20 bg-[#0a1e4a]/60 backdrop-blur-sm p-5 sm:p-6"
      >
        <p className="text-[10px] uppercase tracking-[0.3em] text-amber-400/70 font-semibold mb-4">
          Distribución por palanca
        </p>

        <div className="space-y-3">
          {allCategorias.map((cat, i) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + i * 0.05 }}
              className="space-y-1"
            >
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-white font-medium truncate">{cat.nombre}</span>
                <span className="shrink-0 text-amber-400 font-bold tabular-nums">
                  {formatPen(cat.costo)}
                </span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(cat.costo / maxCosto) * 100}%` }}
                  transition={{ delay: 0.6 + i * 0.05, duration: 0.6, ease: "easeOut" }}
                  className={`h-full rounded-full bg-gradient-to-r ${
                    cat.trackId === "digital"
                      ? "from-blue-500 to-blue-400"
                      : "from-amber-500 to-amber-400"
                  }`}
                />
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0 }}
        className="mt-10"
      >
        <motion.button
          type="button"
          onClick={onContinue}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          className="inline-flex items-center gap-3 px-10 py-4 rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-[#0a1e4a] font-black text-lg uppercase tracking-wider shadow-[0_15px_50px_rgba(251,191,36,0.5)] hover:shadow-[0_20px_70px_rgba(251,191,36,0.7)] transition-shadow"
        >
          Crear mi contraseña
          <ArrowRight className="size-5" />
        </motion.button>
        <p className="mt-3 text-center text-xs uppercase tracking-[0.3em] text-amber-400/60">
          Último paso para entrar a tu plataforma
        </p>
      </motion.div>
    </div>
  );
}

interface BreakdownCardProps {
  icon: React.ReactNode;
  label: string;
  tagline: string;
  amount: number;
  pct: number;
  delay?: number;
}

function BreakdownCard({ icon, label, tagline, amount, pct, delay = 0 }: BreakdownCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-2xl border-2 border-amber-400/20 bg-[#0a1e4a]/60 backdrop-blur-sm p-5 flex items-center gap-4"
    >
      <div className="shrink-0 size-14 rounded-2xl bg-amber-400/10 border border-amber-400/30 text-amber-400 flex items-center justify-center">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[10px] uppercase tracking-[0.3em] text-amber-400/70">{label}</p>
          <p className="text-xs text-amber-400/80 font-semibold tabular-nums">{pct}%</p>
        </div>
        <p className="text-2xl sm:text-3xl text-white font-black tabular-nums leading-tight">
          {formatPen(amount)}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">{tagline}</p>
      </div>
    </motion.div>
  );
}

function formatPen(n: number): string {
  if (n >= 1_000_000) return `S/ ${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `S/ ${(n / 1_000).toFixed(0)}K`;
  return `S/ ${n}`;
}
