"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Lock, Shield, Sparkles } from "lucide-react";

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

  const firstName = ctx.user.full_name.split(/\s+/)[0] ?? ctx.user.full_name;

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#020a1e] text-white">
      {/* Cloud sky bg igual al deck */}
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-[#0a1e4a] via-[#061b3d] to-[#020a1e]" />
      <div
        className="pointer-events-none fixed inset-0 opacity-60"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 60% 40% at 15% 20%, rgba(59, 130, 246, 0.15), transparent 60%),
            radial-gradient(ellipse 70% 50% at 85% 30%, rgba(30, 64, 175, 0.20), transparent 65%),
            radial-gradient(ellipse 80% 50% at 50% 80%, rgba(15, 23, 42, 0.6), transparent 70%)
          `,
        }}
      />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-1/3 bg-gradient-to-b from-amber-400/[0.06] to-transparent" />

      {/* Top section pill */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-30 hidden sm:block">
        <div className="rounded-full bg-[#020a1e]/80 backdrop-blur-md border border-amber-400/20 px-4 py-1.5 text-[10px] uppercase tracking-[0.3em] text-amber-400/90 font-semibold">
          Último paso · Tu Máquina Electoral
        </div>
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-4 py-12 sm:py-20 min-h-screen flex flex-col">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400/70 hover:text-amber-400 mb-12 self-start"
        >
          <ArrowLeft className="size-4" />
          Volver al resumen
        </button>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-1 flex flex-col justify-center"
        >
          {/* Sparkle icon */}
          <motion.div
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 180, delay: 0.1 }}
            className="mx-auto size-20 rounded-2xl border-2 border-amber-400 bg-amber-400/10 flex items-center justify-center mb-8 shadow-[0_0_60px_rgba(251,191,36,0.4)]"
          >
            <Shield className="size-10 text-amber-400" />
          </motion.div>

          {/* Headline gigante */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-4xl sm:text-6xl md:text-7xl font-black text-white text-center uppercase tracking-tight leading-[0.95]"
          >
            Asegurá tu <span className="text-amber-400">máquina</span>
          </motion.h1>

          {/* Resumen mini */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-8 mx-auto rounded-2xl border border-amber-400/30 bg-[#0a1e4a]/60 backdrop-blur-sm px-5 py-4 max-w-md text-center"
          >
            <p className="text-sm text-gray-300">
              <span className="text-amber-400 font-bold">{firstName}</span>, tu campaña arranca con
            </p>
            <p className="mt-1 text-3xl font-black text-amber-400 tabular-nums">
              {formatPen(presupuestoTotal)}
            </p>
          </motion.div>

          {/* Form */}
          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
            onSubmit={handleSubmit}
            className="mt-10 space-y-4 max-w-md mx-auto w-full"
          >
            <div>
              <label htmlFor="pwd" className="block text-[10px] uppercase tracking-[0.3em] text-amber-400/70 font-semibold mb-2">
                Contraseña nueva
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-gray-500" />
                <input
                  id="pwd"
                  type={show ? "text" : "password"}
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  onBlur={() => setTouched(true)}
                  autoComplete="new-password"
                  autoFocus
                  className={`w-full bg-[#0a1e4a]/60 border-2 rounded-2xl pl-11 pr-12 py-4 text-white placeholder:text-gray-600 focus:outline-none transition-colors ${
                    touched && pwdError
                      ? "border-red-500/50 focus:border-red-500"
                      : "border-amber-400/20 focus:border-amber-400"
                  }`}
                  placeholder={`Mínimo ${MIN_LEN} caracteres`}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  tabIndex={-1}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-amber-400"
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {touched && pwdError && (
                <p className="mt-2 text-xs text-red-400">{pwdError}</p>
              )}
            </div>

            <div>
              <label htmlFor="confirm" className="block text-[10px] uppercase tracking-[0.3em] text-amber-400/70 font-semibold mb-2">
                Repetí la contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-gray-500" />
                <input
                  id="confirm"
                  type={show ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onBlur={() => setTouched(true)}
                  autoComplete="new-password"
                  className={`w-full bg-[#0a1e4a]/60 border-2 rounded-2xl pl-11 pr-4 py-4 text-white placeholder:text-gray-600 focus:outline-none transition-colors ${
                    touched && confirmError
                      ? "border-red-500/50 focus:border-red-500"
                      : "border-amber-400/20 focus:border-amber-400"
                  }`}
                  placeholder="Tiene que coincidir"
                />
              </div>
              {touched && confirmError && (
                <p className="mt-2 text-xs text-red-400">{confirmError}</p>
              )}
            </div>

            {error && (
              <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={submitting || (touched && !isValid)}
              className="w-full inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-[#0a1e4a] font-black text-lg uppercase tracking-wider shadow-[0_15px_50px_rgba(251,191,36,0.4)] hover:shadow-[0_20px_70px_rgba(251,191,36,0.6)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-5 animate-spin" />
                  Activando...
                </>
              ) : (
                <>
                  <Sparkles className="size-5" />
                  Entrar a mi plataforma
                  <ArrowRight className="size-5" />
                </>
              )}
            </motion.button>
          </motion.form>

          <p className="mt-8 text-center text-[10px] uppercase tracking-[0.3em] text-gray-500">
            Cifrada con bcrypt · Solo tú la conoces
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function formatPen(n: number): string {
  if (n >= 1_000_000) return `S/ ${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `S/ ${(n / 1_000).toFixed(0)}K`;
  return `S/ ${n}`;
}
