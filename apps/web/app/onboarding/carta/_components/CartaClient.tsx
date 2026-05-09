"use client";

/**
 * Carta del candidato — pantalla cinematográfica que cierra fase 1 y
 * sirve también como vista de admin para revisar candidatos existentes.
 *
 * Layout:
 *   [mapa de jurisdicción full-bleed con zoom-in animado]
 *   [vignette navy + cielo dorado overlay]
 *   [card flotante: foto + nombre + cargo + partido + progress bars]
 *   [acciones: editar perfil · continuar →]
 */

import { use, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Edit3, ArrowRight, MapPin, Building2, Search } from "lucide-react";

import { api } from "@/lib/api-client";
import { EditProfileModal } from "./EditProfileModal";

const JurisdictionMap = dynamic(
  () => import("./JurisdictionMap").then((m) => m.JurisdictionMap),
  { ssr: false, loading: () => null },
);

type Snapshot = {
  user: {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    foto_url: string | null;
    has_password: boolean;
  };
  campaign: { id: string; slug: string; name: string };
  cargo: { codigo: string; nombre: string; ambito: string };
  jurisdiccion: {
    pais: { id: number; nombre: string; iso2: string };
    departamento: { id: number; nombre: string } | null;
    provincia: { id: number; nombre: string } | null;
    distrito: { id: number; nombre: string } | null;
  };
  organizacion_politica: { codigo: string; nombre: string; siglas: string | null } | null;
  geojson: GeoJSON.Geometry | null;
  bbox: [number, number, number, number] | null;
  centroid: [number, number] | null;
  progress: {
    onboarding: number;
    territorio: number;
    digital: number;
    datos: number;
  };
  missing_fields: string[];
};

type CampaignOption = { id: string; name: string; slug: string };

export function CartaClient({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ campaign_id?: string }>;
}) {
  const router = useRouter();
  const initialParams = use(searchParamsPromise);

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdminView, setIsAdminView] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    initialParams.campaign_id ?? null,
  );
  const [editing, setEditing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const path = selectedCampaignId
        ? `/api/onboarding/snapshot/${selectedCampaignId}`
        : "/api/onboarding/snapshot";
      const res = await api.get<{ ok: boolean; snapshot: Snapshot }>(path);
      if (cancelled) return;
      if (res.ok && res.data) {
        setSnapshot(res.data.snapshot);
      } else {
        setError("No pudimos cargar la carta. Verificá tu sesión.");
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedCampaignId, reloadKey]);

  // Trigger del stub diagnóstico una vez que tenemos snapshot.
  // Idempotente — el backend devuelve el deck existente si ya hay uno.
  // Solo se dispara para "mi propia carta" (no cuando admin ve a otro).
  useEffect(() => {
    if (!snapshot || selectedCampaignId) return;
    let cancelled = false;
    (async () => {
      try {
        await api.post("/api/onboarding/seed-deck");
      } catch {
        // silencioso — el seed es best-effort, no bloquea la UX
      }
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [snapshot, selectedCampaignId]);

  // Si es admin, traemos la lista de candidatos para selector
  useEffect(() => {
    let cancelled = false;
    async function check() {
      const res = await api.get<{ ok: boolean; user?: { role: string } }>(
        "/api/auth/me",
      );
      if (cancelled) return;
      if (res.ok && res.data?.user?.role === "admin") {
        setIsAdminView(true);
        const cRes = await api.get<{
          ok: boolean;
          campaigns: Array<{ id: string; name: string; slug: string }>;
        }>("/api/campaigns");
        if (!cancelled && cRes.ok && cRes.data) {
          setCampaigns(cRes.data.campaigns ?? []);
        }
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  const jurisdiccionLabel =
    snapshot?.jurisdiccion.distrito?.nombre ??
    snapshot?.jurisdiccion.provincia?.nombre ??
    snapshot?.jurisdiccion.departamento?.nombre ??
    snapshot?.jurisdiccion.pais.nombre ??
    "—";

  const handleContinue = () => router.push("/onboarding/fase-2");
  const handleEdit = () => setEditing(true);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#020a1e] text-white font-sans">
      {/* Mapa full-bleed */}
      <div className="absolute inset-0">
        <JurisdictionMap
          geojson={snapshot?.geojson ?? null}
          bbox={snapshot?.bbox ?? null}
          centroid={snapshot?.centroid ?? null}
          className="h-full w-full"
        />
      </div>

      {/* Vignette overlay para legibilidad */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 100%, rgba(2,10,30,0.95) 0%, rgba(2,10,30,0.7) 35%, rgba(2,10,30,0.0) 70%), radial-gradient(ellipse 100% 60% at 50% 0%, rgba(10,31,74,0.85) 0%, rgba(2,10,30,0.0) 60%)",
        }}
      />

      {/* Glow gold top */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1/3"
        style={{
          background: "linear-gradient(to bottom, rgba(251,191,36,0.08) 0%, transparent 100%)",
        }}
      />

      {/* Header con selector admin */}
      {isAdminView && campaigns.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="absolute top-6 left-1/2 -translate-x-1/2 z-20"
        >
          <div className="flex items-center gap-2 rounded-full border border-amber-300/30 bg-[#0a1f4a]/85 backdrop-blur-md px-4 py-2 shadow-2xl">
            <Search className="size-3.5 text-amber-300/70" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/80 mr-1">
              Admin
            </span>
            <select
              value={selectedCampaignId ?? ""}
              onChange={(e) => setSelectedCampaignId(e.target.value || null)}
              className="bg-transparent text-xs text-white outline-none cursor-pointer max-w-[280px]"
            >
              <option value="" className="bg-[#0a1f4a]">
                Mi cuenta (logueado)
              </option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id} className="bg-[#0a1f4a]">
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </motion.div>
      )}

      {/* Card central */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.9, delay: 1.2, ease: "easeOut" }}
        className="absolute bottom-12 left-1/2 -translate-x-1/2 z-10 w-full max-w-[640px] px-6"
      >
        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-[#0a1f4a]/85 backdrop-blur-md p-10 text-center">
            <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-amber-300/80">
              Cargando tu carta…
            </div>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/30 bg-[#0a1f4a]/85 backdrop-blur-md p-10 text-center">
            <div className="text-sm text-red-300">{error}</div>
          </div>
        ) : snapshot ? (
          <div className="rounded-2xl border border-amber-300/20 bg-[#0a1f4a]/85 backdrop-blur-xl p-7 shadow-[0_30px_80px_rgba(0,0,0,0.65)]">
            {/* Header: foto + identidad */}
            <div className="flex items-start gap-5 mb-6">
              {snapshot.user.foto_url ? (
                <img
                  src={snapshot.user.foto_url}
                  alt={snapshot.user.full_name}
                  className="size-20 rounded-full object-cover border-2 border-amber-300/40 shadow-lg"
                />
              ) : (
                <div className="size-20 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-2xl font-black text-[#0a1f4a] border-2 border-amber-300/40 shadow-lg">
                  {snapshot.user.full_name
                    .split(" ")
                    .slice(0, 2)
                    .map((n) => n[0])
                    .join("")}
                </div>
              )}
              <div className="flex-1 pt-1">
                <h1 className="text-2xl font-black tracking-tight text-white leading-tight">
                  {snapshot.user.full_name}
                </h1>
                <div className="mt-1 flex items-center gap-3 text-[13px] text-white/80">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5 text-amber-300" />
                    {snapshot.cargo.nombre} · {jurisdiccionLabel}
                  </span>
                </div>
                {snapshot.organizacion_politica ? (
                  <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                    <Building2 className="size-3" />
                    {snapshot.organizacion_politica.siglas ??
                      snapshot.organizacion_politica.nombre}
                  </div>
                ) : (
                  <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-white/60 italic">
                    Sin partido cargado
                  </div>
                )}
              </div>
            </div>

            {/* Progress bars */}
            <div className="space-y-3">
              <ProgressRow label="Onboarding" value={snapshot.progress.onboarding} />
              <ProgressRow label="Territorio" value={snapshot.progress.territorio} />
              <ProgressRow label="Datos" value={snapshot.progress.datos} />
              <ProgressRow label="Digital" value={snapshot.progress.digital} />
            </div>

            {/* Missing fields chips */}
            {snapshot.missing_fields.length > 0 ? (
              <div className="mt-5 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-white/50 mr-1">Faltan:</span>
                {snapshot.missing_fields.map((f) => (
                  <span
                    key={f}
                    className="rounded-full border border-amber-300/30 bg-amber-300/5 px-2 py-0.5 text-amber-300/90"
                  >
                    {labelMissing(f)}
                  </span>
                ))}
              </div>
            ) : null}

            {/* Acciones */}
            <div className="mt-7 flex items-center justify-between gap-3">
              <button
                onClick={handleEdit}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition-colors"
              >
                <Edit3 className="size-3.5" />
                Editar perfil
              </button>
              <button
                onClick={handleContinue}
                className="inline-flex items-center gap-2 rounded-full bg-amber-400 hover:bg-amber-300 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-[#0a1f4a] transition-colors shadow-lg shadow-amber-400/30"
              >
                Continuar
                <ArrowRight className="size-3.5" />
              </button>
            </div>
          </div>
        ) : null}
      </motion.div>

      {snapshot ? (
        <EditProfileModal
          open={editing}
          onClose={() => setEditing(false)}
          onSaved={() => setReloadKey((k) => k + 1)}
          initial={{
            full_name: snapshot.user.full_name,
            email: snapshot.user.email,
            phone: snapshot.user.phone,
            foto_url: snapshot.user.foto_url,
            has_password: snapshot.user.has_password,
            organizacion_politica_codigo: snapshot.organizacion_politica?.codigo ?? null,
          }}
        />
      ) : null}
    </div>
  );
}

function ProgressRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">
          {label}
        </span>
        <span className="text-[11px] font-mono font-bold text-amber-300 tabular-nums">
          {value}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 1.4, delay: 1.6, ease: "easeOut" }}
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-300"
        />
      </div>
    </div>
  );
}

function labelMissing(f: string): string {
  switch (f) {
    case "foto":
      return "Foto";
    case "phone":
      return "Teléfono";
    case "email":
      return "Email";
    case "password":
      return "Contraseña";
    case "organizacion_politica":
      return "Partido";
    default:
      return f;
  }
}
