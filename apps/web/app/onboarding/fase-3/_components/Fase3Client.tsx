"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Loader2, Globe, MapPin, ArrowRight, Wallet } from "lucide-react";

import { onboardingApi, type CandidatoContext } from "@/lib/onboarding-api";
import {
  ESTRATEGIA_CATALOGO,
  intensidadesInicial,
  calcularPresupuesto,
  calcularSubtotal,
  type EstrategiaIntensidades,
} from "@/lib/mocks/estrategia-mock";

import { TrackCard } from "./TrackCard";
import { PresupuestoSticky } from "./PresupuestoSticky";
import { PasswordFinalStep } from "./PasswordFinalStep";

type Stage = "estrategia" | "password" | "done";

export function Fase3Client() {
  const router = useRouter();
  const [ctx, setCtx] = useState<CandidatoContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [intensidades, setIntensidades] = useState<EstrategiaIntensidades>(intensidadesInicial());
  const [stage, setStage] = useState<Stage>("estrategia");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await onboardingApi.getMe();
        if (cancelled) return;
        if (!data) {
          setError("No se encontró tu candidatura. Volvé a empezar el onboarding.");
          return;
        }
        setCtx(data);
        // Si ya tiene password, no debería estar acá — mandalo al inicio
        if (data.user.has_password) {
          router.replace("/inicio");
          return;
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const presupuestoTotal = useMemo(() => calcularPresupuesto(intensidades), [intensidades]);
  const subtotalDigital = useMemo(() => calcularSubtotal("digital", intensidades), [intensidades]);
  const subtotalTerritorial = useMemo(
    () => calcularSubtotal("territorial", intensidades),
    [intensidades],
  );

  function handleSlider(catId: string, value: number) {
    setIntensidades((prev) => ({ ...prev, [catId]: value }));
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-amber-400">
        <Loader2 className="size-10 animate-spin" />
      </div>
    );
  }

  if (error || !ctx) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="max-w-md text-center px-6">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => router.push("/onboarding")}
            className="px-6 py-2.5 rounded-full bg-amber-500 text-black font-semibold"
          >
            Volver al onboarding
          </button>
        </div>
      </div>
    );
  }

  if (stage === "password") {
    return (
      <PasswordFinalStep
        ctx={ctx}
        presupuestoTotal={presupuestoTotal}
        intensidades={intensidades}
        onBack={() => setStage("estrategia")}
        onSuccess={() => {
          setStage("done");
          router.push("/inicio");
        }}
      />
    );
  }

  return (
    <div className="relative min-h-screen w-full bg-black text-white pb-32">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.12),transparent_55%)]" />

      <div className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 space-y-8">
        {/* HEADER */}
        <header>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400/80 mb-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1">
              <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
              Fase 3 · Tu estrategia
            </span>
            <span>de 3</span>
          </div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl sm:text-4xl md:text-5xl text-white leading-tight font-semibold tracking-tight"
          >
            Diseñá tu <span className="text-amber-400">máquina electoral</span>.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-2 text-base sm:text-lg text-gray-400"
          >
            Subí o bajá la intensidad de cada palanca. El presupuesto se ajusta solo.
          </motion.p>
        </header>

        {/* TRACKS */}
        <div className="space-y-6">
          <TrackCard
            track={ESTRATEGIA_CATALOGO[0]!}
            icon={<Globe className="size-5" />}
            subtotal={subtotalDigital}
            intensidades={intensidades}
            onChange={handleSlider}
          />

          <TrackCard
            track={ESTRATEGIA_CATALOGO[1]!}
            icon={<MapPin className="size-5" />}
            subtotal={subtotalTerritorial}
            intensidades={intensidades}
            onChange={handleSlider}
          />
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent p-6 sm:p-8 text-center"
        >
          <Wallet className="size-8 text-amber-400 mx-auto mb-3" />
          <h3 className="text-2xl sm:text-3xl text-white font-semibold mb-2">
            Tu campaña arranca con {formatPen(presupuestoTotal)}
          </h3>
          <p className="text-gray-400 text-sm sm:text-base mb-6">
            Después podés ajustar todo dentro de la plataforma. Falta un paso para entrar.
          </p>
          <button
            onClick={() => setStage("password")}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-black font-semibold text-base shadow-xl shadow-amber-500/30 hover:shadow-amber-500/50 transition-all"
          >
            Crear mi contraseña y entrar
            <ArrowRight className="size-5" />
          </button>
        </motion.div>
      </div>

      {/* PRESUPUESTO STICKY */}
      <PresupuestoSticky
        total={presupuestoTotal}
        digital={subtotalDigital}
        territorial={subtotalTerritorial}
      />
    </div>
  );
}

function formatPen(n: number): string {
  if (n >= 1_000_000) return `S/ ${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `S/ ${(n / 1_000).toFixed(0)}K`;
  return `S/ ${n}`;
}
