"use client";

/**
 * /admin/fase2/[slug] — pantalla de revisión para admin (proyecto@grupogoberna).
 *
 * Carga el Fase 2 deck del candidato (snapshot + consultor_form) y permite
 * aprobar (→ published) o rechazar (→ rejected, con motivo) cuando el
 * status es pending_review o draft. Si está published, muestra el deck en
 * solo lectura.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api-client";
import {
  onboardingApi,
  type CandidatoContext,
  type Fase2DeckMeta,
} from "@/lib/onboarding-api";
import { Fase2Deck } from "@/app/onboarding/fase-2/_components/Fase2Deck";

const STATUS_PILL: Record<Fase2DeckMeta["status"], { label: string; className: string }> = {
  draft: {
    label: "Borrador",
    className: "bg-gray-500/10 border-gray-400/40 text-gray-300",
  },
  pending_review: {
    label: "Por aprobar",
    className: "bg-amber-500/10 border-amber-400/40 text-amber-300",
  },
  published: {
    label: "Publicado",
    className: "bg-emerald-500/10 border-emerald-400/40 text-emerald-300",
  },
  rejected: {
    label: "Rechazado",
    className: "bg-red-500/10 border-red-400/40 text-red-300",
  },
};

export default function AdminFase2ReviewPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const slug = params.slug;

  const [ctx, setCtx] = useState<CandidatoContext | null>(null);
  const [deck, setDeck] = useState<Fase2DeckMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const isAdmin = user?.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await onboardingApi.getFase2BySlug(slug);
      if (!res) {
        setError("No se encontró el deck Fase 2 de este candidato.");
        return;
      }
      setCtx(res.ctx);
      setDeck(res.deck);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (!user) return;
    if (!isAdmin) {
      router.push("/home");
      return;
    }
    load();
  }, [user, isAdmin, router, load]);

  const handleApprove = async () => {
    if (!deck) return;
    if (!confirm("¿Publicar este deck? El candidato lo verá inmediatamente.")) return;
    setBusy(true);
    try {
      const res = await api.post<{ ok: boolean }>(`/api/admin/decks/${deck.id}/publish`);
      if (res.ok) {
        await load();
      } else {
        alert("No se pudo publicar el deck.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!deck) return;
    if (rejectReason.trim().length < 2) {
      alert("Escribí un motivo de rechazo (mínimo 2 chars).");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ ok: boolean }>(`/api/admin/decks/${deck.id}/reject`, {
        reason: rejectReason.trim(),
      });
      if (res.ok) {
        setRejectReason("");
        await load();
      } else {
        alert("No se pudo rechazar el deck.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#061b3d] text-amber-400">
        <Loader2 className="size-10 animate-spin" />
      </div>
    );
  }

  if (error || !ctx || !deck) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#061b3d] text-white">
        <div className="max-w-md text-center px-6">
          <p className="text-red-400 mb-4">{error ?? "No se pudo cargar el deck."}</p>
          <button
            onClick={() => router.push("/decks")}
            className="px-6 py-2.5 rounded-full bg-amber-500 text-black font-semibold"
          >
            Volver a /decks
          </button>
        </div>
      </div>
    );
  }

  const pill = STATUS_PILL[deck.status];
  const showActions = deck.status === "pending_review" || deck.status === "draft";

  return (
    <div className="relative">
      {/* Banner sticky de admin con status + acciones */}
      <div className="sticky top-0 z-40 bg-[#020a1e]/95 backdrop-blur-md border-b border-amber-400/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-wider ${pill.className}`}
            >
              {deck.status === "pending_review" ? <Clock className="size-3.5" /> : null}
              {pill.label}
            </span>
            <span className="text-sm text-white/80 font-semibold truncate">
              {ctx.user.full_name}
            </span>
            <span className="text-xs text-white/40 hidden sm:inline">
              {ctx.cargo.nombre} · {ctx.campaign.slug}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {showActions ? (
              <>
                <button
                  onClick={handleApprove}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm disabled:opacity-50"
                >
                  <CheckCircle2 className="size-4" />
                  Aprobar y publicar
                </button>
                <button
                  onClick={() => {
                    const reason = prompt("Motivo de rechazo (qué hace falta corregir):");
                    if (reason && reason.trim().length >= 2) {
                      setRejectReason(reason.trim());
                      handleReject();
                    }
                  }}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-400/40 font-bold text-sm disabled:opacity-50"
                >
                  <XCircle className="size-4" />
                  Rechazar
                </button>
              </>
            ) : deck.status === "published" ? (
              <span className="text-xs text-emerald-300/80">
                Publicado {deck.published_at ? new Date(deck.published_at).toLocaleDateString("es-PE") : ""}
              </span>
            ) : deck.status === "rejected" ? (
              <span className="text-xs text-red-300/80 truncate max-w-md">
                Rechazado: {deck.rejection_reason ?? "—"}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* El deck Fase 2 completo */}
      <Fase2Deck ctx={ctx} />
    </div>
  );
}
