"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { onboardingApi, type CandidatoContext } from "@/lib/onboarding-api";
import type { EstrategiaIntensidades } from "@/lib/mocks/estrategia-mock";

import { Fase3Deck } from "./Fase3Deck";
import { PasswordFinalStep } from "./PasswordFinalStep";

type Stage = "deck" | "password";

export function Fase3Client() {
  const router = useRouter();
  const [ctx, setCtx] = useState<CandidatoContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("deck");
  const [strategy, setStrategy] = useState<{
    intensidades: EstrategiaIntensidades;
    total: number;
  } | null>(null);

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
        if (data.user.has_password) {
          router.replace("/inicio");
          return;
        }
        setCtx(data);
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020a1e] text-amber-400">
        <Loader2 className="size-10 animate-spin" />
      </div>
    );
  }

  if (error || !ctx) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020a1e] text-white">
        <div className="max-w-md text-center px-6">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => router.push("/onboarding")}
            className="px-6 py-2.5 rounded-full bg-amber-400 text-[#0a1e4a] font-semibold"
          >
            Volver al onboarding
          </button>
        </div>
      </div>
    );
  }

  if (stage === "password" && strategy) {
    return (
      <PasswordFinalStep
        ctx={ctx}
        presupuestoTotal={strategy.total}
        intensidades={strategy.intensidades}
        onBack={() => setStage("deck")}
        onSuccess={() => router.push("/inicio")}
      />
    );
  }

  return (
    <Fase3Deck
      ctx={ctx}
      onFinishStrategy={(data) => {
        setStrategy(data);
        setStage("password");
      }}
    />
  );
}
