"use client";

import { motion } from "motion/react";
import { AlertCircle, ChevronLeft, Loader2, RefreshCw, UserX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api-client";
import type { OnboardingContext } from "@/types/onboarding";

interface StepProvisioningProps {
  title: string;
  subtitle?: string;
  data: OnboardingContext;
  onCompleted: (output: { dashboard_url: string; campaign_id: string; slug: string }) => void;
  onGoBack?: () => void;
  onGoToStart?: () => void;
}

type WizardResponse = {
  ok: true;
  campaign_id: string;
  candidato_id: number;
  postulacion_id: number;
  user_id: string;
  slug: string;
  dashboard_url: string;
};

export function StepProvisioning({ title, subtitle, data, onCompleted, onGoBack, onGoToStart }: StepProvisioningProps) {
  const [error, setError] = useState<string | null>(null);
  const [isDniConflict, setIsDniConflict] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef(false);

  const submit = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setIsDniConflict(false);

    const datos = data.datos ?? {};
    const cargo = data.cargoApi;
    if (!cargo?.cargo) {
      setError("Falta el cargo seleccionado.");
      inFlight.current = false;
      return;
    }

    const password = data.credenciales?.password;

    const body: Record<string, unknown> = {
      first_name: datos.firstName ?? "",
      last_name: datos.lastName ?? "",
      country: datos.country ?? "PE",
      ...(datos.documentoNumero && { documento_numero: datos.documentoNumero }),
      ...(datos.phone && { phone: datos.phone }),
      rol_campana_codigo: data.actor === "strategist" ? "estratega" : "candidato",
      cargo_codigo: cargo.cargo.codigo,
      ...(data.organizacionApi?.codigo && {
        organizacion_politica_codigo: data.organizacionApi.codigo,
      }),
      ...(cargo.departamento?.id && { id_departamento: cargo.departamento.id }),
      ...(cargo.provincia?.id && { id_provincia: cargo.provincia.id }),
      ...(cargo.distrito?.id && { id_distrito: cargo.distrito.id }),
      ...(password && { password }),
      ...(data.foto && typeof data.foto === "string" && { foto_url: data.foto }),
    };

    try {
      const res = await api.post<WizardResponse>("/api/onboarding/wizard", body);
      if (!res.ok || !res.data) {
        const errCode = (res.error as { code?: string } | undefined)?.code;
        if (errCode === "DNI_ALREADY_REGISTERED") {
          setIsDniConflict(true);
          setError(res.error?.message ?? "Este DNI ya está registrado.");
        } else {
          setError(res.error?.message ?? "Error al crear la cuenta.");
        }
        return;
      }
      onCompleted({
        dashboard_url: res.data.dashboard_url,
        campaign_id: res.data.campaign_id,
        slug: res.data.slug,
      });
    } catch {
      setError("Error de conexión. Intentá de nuevo.");
    } finally {
      inFlight.current = false;
    }
  }, [data, onCompleted]);

  useEffect(() => {
    submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.4 }}
      className="mx-auto w-full max-w-xl text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        className="mb-6 flex justify-center"
      >
        <div className="relative">
          <motion.div
            className="absolute inset-0 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 blur-2xl opacity-60"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="relative flex size-20 items-center justify-center rounded-full border-2 border-amber-500/50 bg-gradient-to-br from-amber-500/30 to-amber-600/30 shadow-xl shadow-amber-500/30 backdrop-blur-sm sm:size-24">
            <Loader2 className="size-8 animate-spin text-amber-400 sm:size-10" />
          </div>
        </div>
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-3xl sm:text-5xl md:text-6xl mb-3 sm:mb-4 text-white leading-[0.95] font-black tracking-tight"
      >
        {title}
      </motion.h2>

      {subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-base sm:text-lg text-gray-400 mb-6"
        >
          {subtitle}
        </motion.p>
      )}

      {error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 flex flex-col gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200"
        >
          <div className="flex items-start gap-2">
            {isDniConflict
              ? <UserX className="mt-0.5 size-4 shrink-0 text-red-400" />
              : <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
            }
            <span className="text-left">{error}</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            {isDniConflict && onGoToStart ? (
              <button
                onClick={onGoToStart}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-red-300 transition hover:bg-red-500/20"
              >
                <ChevronLeft className="size-3.5" />
                Corregir DNI
              </button>
            ) : (
              <>
                {onGoBack && (
                  <button
                    onClick={onGoBack}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-gray-600 bg-gray-800/40 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-300 transition hover:bg-gray-800/60"
                  >
                    <ChevronLeft className="size-3.5" />
                    Volver a corregir
                  </button>
                )}
                <button
                  onClick={() => setAttempt((a) => a + 1)}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-amber-300 transition hover:bg-amber-500/20"
                >
                  <RefreshCw className="size-3.5" />
                  Reintentar
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
