"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Lock, Shield } from "lucide-react";

import { onboardingApi, type CandidatoContext } from "@/lib/onboarding-api";
import type { EstrategiaIntensidades } from "@/lib/mocks/estrategia-mock";

interface PasswordFinalStepProps {
  ctx: CandidatoContext;
  presupuestoTotal: number;
  intensidades: EstrategiaIntensidades;
  onBack: () => void;
  onSuccess: () => void;
}

const MIN_LEN = 8;

export function PasswordFinalStep({ ctx, presupuestoTotal, onBack, onSuccess }: PasswordFinalStepProps) {
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const pwdError =
    pwd.length === 0
      ? "Ingresá una contraseña."
      : pwd.length < MIN_LEN
        ? `Mínimo ${MIN_LEN} caracteres.`
        : null;
  const confirmError = confirm !== pwd ? "Las contraseñas no coinciden." : null;
  const isValid = !pwdError && !confirmError;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!isValid) return;
    setSubmitting(true);
    setError(null);
    const res = await onboardingApi.setInitialPassword(pwd);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? "No se pudo guardar la contraseña.");
      return;
    }
    onSuccess();
  }

  return (
    <div className="relative min-h-screen w-full bg-black text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.12),transparent_55%)]" />

      <div className="relative z-10 mx-auto max-w-xl px-4 py-12 sm:py-20">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-8"
        >
          <ArrowLeft className="size-4" />
          Volver a la estrategia
        </button>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-black to-black p-6 sm:p-10"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="size-12 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-center justify-center">
              <Shield className="size-6 text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-amber-400/80">Último paso</p>
              <h1 className="text-2xl text-white font-semibold leading-tight">
                Asegurá tu Máquina Electoral
              </h1>
            </div>
          </div>

          <p className="text-gray-400 text-sm sm:text-base mb-6">
            Hola <span className="text-white font-medium">{firstName(ctx.user.full_name)}</span>,
            tu campaña está lista para arrancar con un presupuesto estimado de{" "}
            <span className="text-amber-400 font-semibold">{formatPen(presupuestoTotal)}</span>.{" "}
            Definí una contraseña para entrar a tu plataforma.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="pwd" className="block text-xs uppercase tracking-widest text-amber-400/70 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-500" />
                <input
                  id="pwd"
                  type={show ? "text" : "password"}
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  onBlur={() => setTouched(true)}
                  autoComplete="new-password"
                  autoFocus
                  className={`w-full bg-black/50 border-2 rounded-xl pl-10 pr-11 py-3 text-white placeholder:text-gray-600 focus:outline-none transition-colors ${
                    touched && pwdError
                      ? "border-red-500/50 focus:border-red-500"
                      : "border-gray-700/50 focus:border-amber-500/50"
                  }`}
                  placeholder={`Mínimo ${MIN_LEN} caracteres`}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-amber-400"
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {touched && pwdError && (
                <p className="mt-1 text-xs text-red-400">{pwdError}</p>
              )}
            </div>

            <div>
              <label htmlFor="confirm" className="block text-xs uppercase tracking-widest text-amber-400/70 mb-1.5">
                Repetí la contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-500" />
                <input
                  id="confirm"
                  type={show ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onBlur={() => setTouched(true)}
                  autoComplete="new-password"
                  className={`w-full bg-black/50 border-2 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-gray-600 focus:outline-none transition-colors ${
                    touched && confirmError
                      ? "border-red-500/50 focus:border-red-500"
                      : "border-gray-700/50 focus:border-amber-500/50"
                  }`}
                  placeholder="Tiene que coincidir"
                />
              </div>
              {touched && confirmError && (
                <p className="mt-1 text-xs text-red-400">{confirmError}</p>
              )}
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || (touched && !isValid)}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-black font-semibold text-base shadow-xl shadow-amber-500/30 hover:shadow-amber-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-5 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  Entrar a mi plataforma
                  <ArrowRight className="size-5" />
                </>
              )}
            </button>
          </form>

          <p className="text-[11px] text-gray-600 mt-5 text-center">
            Cifrada con bcrypt. Solo vos la conocés.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function firstName(full: string): string {
  return full.split(/\s+/)[0] ?? full;
}

function formatPen(n: number): string {
  if (n >= 1_000_000) return `S/ ${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `S/ ${(n / 1_000).toFixed(0)}K`;
  return `S/ ${n}`;
}
