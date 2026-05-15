"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Clock, RefreshCw } from "lucide-react";

import { onboardingApi, type CandidatoContext, type Fase2DeckMeta } from "@/lib/onboarding-api";
import { Fase2F1Deck } from "./Fase2F1Deck";

function WaitingScreen({ slug, onRefresh }: { slug: string; onRefresh: () => void }) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#020a1e] px-6">
      <div className="max-w-lg w-full text-center space-y-8">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="size-20 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
              <Clock className="size-9 text-amber-400" />
            </div>
            <div className="absolute inset-0 rounded-full border border-amber-400/20 animate-ping" />
          </div>
        </div>

        {/* Copy */}
        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Tu presentación está siendo preparada
          </h1>
          <p className="text-gray-400 text-sm leading-relaxed max-w-sm mx-auto">
            El equipo Goberna está completando tu perfil y estrategia de campaña.
            Recibirás acceso en cuanto esté lista.
          </p>
        </div>

        {/* Progress dots — purely decorative */}
        <div className="flex justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-2 rounded-full bg-amber-400/40"
              style={{ animationDelay: `${i * 0.3}s` }}
            />
          ))}
        </div>

        {/* Refresh */}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-gray-700 text-gray-300 text-sm font-medium hover:border-amber-400/50 hover:text-amber-400 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Verificando…" : "Verificar estado"}
        </button>
      </div>
    </div>
  );
}

export function Fase2SlugClient({ slug }: { slug: string }) {
  const router = useRouter();
  const [ctx, setCtx] = useState<CandidatoContext | null>(null);
  const [deck, setDeck] = useState<Fase2DeckMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await onboardingApi.getFase2BySlug(slug);
      if (!result) {
        setError("No se encontró la candidatura. Verificá el slug o iniciá el onboarding.");
        return;
      }
      setCtx(result.ctx);
      setDeck(result.deck);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020a1e]">
        <Loader2 className="size-10 animate-spin text-amber-400" />
      </div>
    );
  }

  if (error || !ctx || !deck) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020a1e] text-white">
        <div className="max-w-md text-center px-6">
          <p className="text-red-400 mb-4 text-sm">{error ?? "Error al cargar la presentación."}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => router.push(`/onboarding/${slug}/fase-1`)}
              className="px-6 py-2.5 rounded-full bg-amber-500 text-black font-semibold text-sm"
            >
              Ir a Fase 1
            </button>
            <button
              onClick={() => router.push("/onboarding")}
              className="px-6 py-2.5 rounded-full border border-gray-700 text-gray-300 font-semibold text-sm"
            >
              Volver al inicio
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (deck.status !== "published") {
    return <WaitingScreen slug={slug} onRefresh={load} />;
  }

  return <Fase2F1Deck slug={slug} ctx={ctx} deck={deck} />;
}
