"use client";

/**
 * /admin/fase2/[slug] — pantalla de revisión para admin (proyecto@grupogoberna).
 *
 * Carga el Fase 2 deck del candidato (snapshot + consultor_form) y permite
 * aprobar (→ published) o rechazar (→ rejected, con motivo) cuando el
 * status es pending_review o draft. Si está published, muestra el deck en
 * solo lectura.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Clock, Loader2, Pencil, Eye, Save, AlertCircle } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api-client";
import {
  onboardingApi,
  type CandidatoContext,
  type ConsultorFormFase2,
  type Fase2DeckMeta,
} from "@/lib/onboarding-api";
import { Fase2Deck } from "@/app/onboarding/fase-2/_components/Fase2Deck";
import {
  EditingProvider,
  useEditing,
} from "@/app/onboarding/fase-2/_components/EditingContext";

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
  const [editing, setEditing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number>(Date.now());
  const [syncing, setSyncing] = useState(false);
  // Ref para evitar pisar el form local (que el user está editando) con
  // el resultado del polling. Solo aceptamos updates del server si NO
  // estamos editando inline OR si pasaron más de N ms desde el último
  // patchField local.
  const lastLocalEditAt = useRef<number>(0);

  const isAdmin = user?.role === "admin";

  /**
   * Carga el snapshot completo desde el server. Si `silent=true`, no
   * setea loading (usado por el polling cada 8s).
   */
  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) {
        setLoading(true);
        setError(null);
      } else {
        setSyncing(true);
      }
      try {
        const res = await onboardingApi.getFase2BySlug(slug);
        if (!res) {
          if (!opts.silent) setError("No se encontró el deck Fase 2 de este candidato.");
          return;
        }
        // Si el user está en modo edición o tocó algo en los últimos 3s,
        // NO machacamos su working state. Solo refrescamos status/deck
        // (no el form).
        const sinceLastLocal = Date.now() - lastLocalEditAt.current;
        const preserveLocalForm = editing && sinceLastLocal < 3000;
        setCtx((prev) =>
          preserveLocalForm && prev
            ? { ...res.ctx, consultor_form: prev.consultor_form }
            : res.ctx,
        );
        setDeck(res.deck);
        setLastSyncAt(Date.now());
      } catch (e) {
        if (!opts.silent) setError((e as Error).message);
      } finally {
        if (!opts.silent) setLoading(false);
        setSyncing(false);
      }
    },
    [slug, editing],
  );

  useEffect(() => {
    if (!user) return;
    if (!isAdmin) {
      router.push("/home");
      return;
    }
    load();
  }, [user, isAdmin, router, load]);

  // Hot-refresh: poll cada 4s para captar cambios del MCP / Claude.
  // Cuando la pestaña vuelve a foreground también refresca inmediato.
  const ctxLoaded = !!ctx;
  useEffect(() => {
    if (!ctxLoaded) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        load({ silent: true });
      }
    }, 4000);
    const onVisible = () => {
      if (document.visibilityState === "visible") load({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ctxLoaded, load]);

  // Cuando el provider hace un patch optimista, lo propagamos al ctx
  // del admin page para que los slides vean el cambio inmediatamente.
  const handleFormChange = useCallback(
    (form: ConsultorFormFase2) => {
      lastLocalEditAt.current = Date.now();
      setCtx((prev) => (prev ? { ...prev, consultor_form: form } : prev));
    },
    [],
  );

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

  const handleReject = async (reason: string) => {
    if (!deck) return;
    const trimmed = reason.trim();
    if (trimmed.length < 2) {
      alert("Escribí un motivo de rechazo (mínimo 2 chars).");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ ok: boolean }>(`/api/admin/decks/${deck.id}/reject`, {
        reason: trimmed,
      });
      if (res.ok) {
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
  // Solo se puede editar inline si el deck no está publicado ni rechazado.
  const canEdit = deck.status === "draft" || deck.status === "pending_review";

  return (
    <EditingProvider
      editing={editing && canEdit}
      slug={slug}
      initialForm={ctx.consultor_form ?? {}}
      onFormChange={handleFormChange}
    >
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
              <SaveStatusBadge />
              <SyncBadge syncing={syncing} lastSyncAt={lastSyncAt} />
            </div>

            <div className="ml-auto flex items-center gap-2">
              {canEdit && (
                <button
                  onClick={() => setEditing((e) => !e)}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-md font-bold text-sm transition-colors ${
                    editing
                      ? "bg-amber-400 text-[#0a1e4a]"
                      : "bg-white/10 hover:bg-white/15 text-white border border-white/20"
                  }`}
                >
                  {editing ? <Eye className="size-4" /> : <Pencil className="size-4" />}
                  {editing ? "Ver" : "Editar"}
                </button>
              )}
              {showActions ? (
                <>
                  <button
                    onClick={handleApprove}
                    disabled={busy}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm disabled:opacity-50"
                  >
                    <CheckCircle2 className="size-4" />
                    Publicar al candidato
                  </button>
                  <button
                    onClick={() => {
                      const reason = prompt("Motivo de rechazo (qué hace falta corregir):");
                      if (reason && reason.trim().length >= 2) {
                        handleReject(reason);
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

        {/* Tip de modo edición */}
        {editing && canEdit && (
          <div className="bg-amber-400/10 border-b border-amber-400/30">
            <div className="max-w-7xl mx-auto px-4 sm:px-8 py-2 text-xs text-amber-200/90 flex items-center gap-2">
              <Pencil className="size-3.5" />
              Modo edición · Click cualquier texto con borde discontinuo amber para
              modificarlo. Enter o blur guarda. Esc cancela. Los campos auto-derivados
              del onboarding (nombre, cargo, jurisdicción) no se editan acá.
            </div>
          </div>
        )}

        {/* El deck Fase 2 completo */}
        <Fase2Deck ctx={ctx} />
      </div>
    </EditingProvider>
  );
}

/** Indicador "vivo" — verde pulsante mientras polling fluye. */
function SyncBadge({ syncing, lastSyncAt }: { syncing: boolean; lastSyncAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const secondsAgo = Math.floor((now - lastSyncAt) / 1000);
  return (
    <span
      className="hidden md:inline-flex items-center gap-1.5 text-[10px] text-white/40 uppercase tracking-wider"
      title={`Sincronización en vivo cada 4s con cambios del MCP / consultor`}
    >
      <span
        className={`size-1.5 rounded-full ${
          syncing ? "bg-emerald-400 animate-pulse" : "bg-emerald-400/60"
        }`}
      />
      {syncing ? "Sincronizando" : `Vivo · hace ${secondsAgo}s`}
    </span>
  );
}

/** Pequeño badge que muestra el estado del save inline. */
function SaveStatusBadge() {
  const { status, errorMessage } = useEditing();
  if (status === "idle") return null;
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-white/70">
        <Loader2 className="size-3 animate-spin" />
        Guardando…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
        <Save className="size-3" />
        Guardado
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-red-300"
      title={errorMessage ?? "Error"}
    >
      <AlertCircle className="size-3" />
      Error al guardar
    </span>
  );
}
