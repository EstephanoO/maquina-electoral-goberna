"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { onboardingApi, type CandidatoContext, type Fase2DeckMeta } from "@/lib/onboarding-api";
import { Fase2F1Deck } from "./Fase2F1Deck";

export function Fase2SlugClient({ slug }: { slug: string }) {
  const router = useRouter();
  const [ctx, setCtx] = useState<CandidatoContext | null>(null);
  const [deck, setDeck] = useState<Fase2DeckMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await onboardingApi.getFase2BySlug(slug);
        if (cancelled) return;
        if (!result) {
          setError("No se encontró la candidatura. Verificá el slug o iniciá el onboarding.");
          return;
        }
        setCtx(result.ctx);
        setDeck(result.deck);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

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

  return <Fase2F1Deck slug={slug} ctx={ctx} deck={deck} />;
}
