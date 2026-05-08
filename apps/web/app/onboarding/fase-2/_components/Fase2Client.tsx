"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { onboardingApi, type CandidatoContext } from "@/lib/onboarding-api";

import { Fase2Deck } from "./Fase2Deck";

export function Fase2Client() {
  const router = useRouter();
  const [ctx, setCtx] = useState<CandidatoContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#061b3d] text-amber-400">
        <Loader2 className="size-10 animate-spin" />
      </div>
    );
  }

  if (error || !ctx) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#061b3d] text-white">
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

  return <Fase2Deck ctx={ctx} />;
}
