"use client";

import { motion } from "motion/react";

import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";

import { SlideChromeCinematic } from "../chrome/SlideChromeCinematic";
import { TagTilt } from "../chrome/TagTilt";

interface Props {
  ctx: CandidatoContext;
  f2?: ConsultorFormFase2;
}

/**
 * Slide cinematic de apertura. Layout 2-col con foto + nombre + tags.
 * Si `f2.fase1_rapida.branding.slogan` está disponible, se muestra como
 * quote bajo el bloque de partido en lugar del genérico "RUMBO · A LA".
 */
export function SlideHero({ ctx, f2 }: Props) {
  const fullName = ctx.user.full_name;
  const fotoUrl = ctx.user.foto_url;
  const eleccionLabel = deriveEleccionLabel(
    ctx.cargo.codigo,
    ctx.cargo.nombre,
  );
  const [firstName, lastName] = splitName(fullName);
  const initials = getInitials(fullName);
  const partidoLine = formatPartidoLine(ctx);
  const slogan = f2?.fase1_rapida?.branding?.slogan?.trim() || null;

  return (
    <SlideChromeCinematic accent="amber">
      <div className="relative flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 h-full items-center px-6 sm:px-10 lg:px-14 py-10 lg:py-12">
        {/* IZQUIERDA — Foto del candidato */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          className="relative flex items-center justify-center lg:justify-start h-full"
        >
          {fotoUrl ? (
            <div
              className="relative w-full max-w-[480px] aspect-[4/5] drop-shadow-[0_24px_48px_rgba(245,158,11,0.18)]"
              style={{
                clipPath: "polygon(0 0, 90% 0, 100% 100%, 0 100%)",
              }}
            >
              <img
                src={fotoUrl}
                alt={fullName}
                className="absolute inset-0 w-full h-full object-cover object-top"
              />
              {/* Overlay sutil amber en el borde diagonal */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(135deg, transparent 60%, rgba(245,158,11,0.15) 100%)",
                }}
              />
            </div>
          ) : (
            <div className="relative w-48 h-48 sm:w-56 sm:h-56 lg:w-64 lg:h-64 flex items-center justify-center">
              {/* Anillo amber rotando */}
              <motion.div
                aria-hidden
                className="absolute inset-0 rounded-full border-2 border-amber-400/60"
                style={{
                  borderTopColor: "#fbbf24",
                  borderRightColor: "rgba(251, 191, 36, 0.25)",
                  borderBottomColor: "rgba(251, 191, 36, 0.25)",
                  borderLeftColor: "rgba(251, 191, 36, 0.25)",
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
              />
              {/* Núcleo navy con iniciales */}
              <div
                className="relative w-[88%] h-[88%] rounded-full flex items-center justify-center"
                style={{
                  background:
                    "linear-gradient(160deg, #0a1f4a 0%, #020a1e 100%)",
                  boxShadow:
                    "inset 0 2px 24px rgba(0,0,0,0.4), 0 12px 32px rgba(2,10,30,0.6)",
                }}
              >
                <span className="text-white text-7xl font-black tracking-tight">
                  {initials}
                </span>
              </div>
            </div>
          )}
        </motion.div>

        {/* DERECHA — Nombre + tags + slogan */}
        <div className="relative flex flex-col justify-center h-full">
          {/* Nombre H1 en dos líneas */}
          <motion.h1
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="text-white font-black uppercase tracking-tight leading-[0.92]"
            style={{ textShadow: "0 6px 32px rgba(2,10,30,0.7)" }}
          >
            <span className="block text-5xl sm:text-6xl lg:text-7xl">
              {firstName}
            </span>
            {lastName ? (
              <span className="block text-5xl sm:text-6xl lg:text-7xl">
                {lastName}
              </span>
            ) : null}
          </motion.h1>

          {/* Tags en cascada con indent progresivo */}
          <div className="relative mt-8 flex flex-col items-start gap-3 sm:gap-4">
            <motion.div
              initial={{ opacity: 0, x: 40, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{
                delay: 0.4,
                duration: 0.55,
                ease: [0.34, 1.4, 0.64, 1],
              }}
            >
              <TagTilt label="RUMBO" tone="white" size="lg" rotate={-3} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 40, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{
                delay: 0.7,
                duration: 0.55,
                ease: [0.34, 1.4, 0.64, 1],
              }}
              style={{ marginLeft: "40px" }}
            >
              <TagTilt label="A LA" tone="amber" size="md" rotate={-1} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 40, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{
                delay: 1.0,
                duration: 0.55,
                ease: [0.34, 1.4, 0.64, 1],
              }}
              style={{ marginLeft: "80px" }}
            >
              <TagTilt
                label={eleccionLabel}
                tone="white"
                size="xl"
                rotate={-5}
              />
            </motion.div>
          </div>

          {/* Slogan + partido */}
          <div className="mt-8 space-y-3">
            {slogan ? (
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.3, duration: 0.6 }}
                className="text-base sm:text-lg font-bold text-amber-400 tracking-wide leading-snug"
              >
                &ldquo;{slogan}&rdquo;
              </motion.p>
            ) : null}
            {partidoLine ? (
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 0.75, y: 0 }}
                transition={{ delay: slogan ? 1.6 : 1.3, duration: 0.6 }}
                className="italic text-sm text-slate-300/80 font-light tracking-wide"
              >
                {partidoLine}
              </motion.p>
            ) : null}
          </div>
        </div>
      </div>
    </SlideChromeCinematic>
  );
}

/**
 * Derivar etiqueta de elección desde el código + nombre del cargo.
 * Devuelve siempre uppercase. Heurística por substring para tolerar
 * variantes (alcalde_distrital, alcalde_provincial, presidente_regional, etc.).
 */
export function deriveEleccionLabel(
  cargoCodigo: string | null | undefined,
  cargoNombre: string | null | undefined,
): string {
  const codigo = (cargoCodigo ?? "").toLowerCase();
  if (codigo.includes("presiden")) return "PRESIDENCIA";
  if (codigo.includes("alcald")) return "ALCALDÍA";
  if (codigo.includes("gobern")) return "GOBERNACIÓN";
  if (codigo.includes("congres")) return "CONGRESO";
  if (codigo.includes("regidor")) return "REGIDURÍA";
  if (codigo.includes("consejer")) return "CONSEJERÍA";
  if (codigo.includes("senador")) return "SENADO";
  if (codigo.includes("diputado")) return "DIPUTACIÓN";
  const nombre = cargoNombre?.toUpperCase().trim();
  return nombre && nombre.length > 0 ? nombre : "ELECCIÓN";
}

/** Split full_name por el primer espacio. Devuelve [nombre, apellidos]. */
function splitName(fullName: string): [string, string] {
  const trimmed = fullName.trim();
  const idx = trimmed.indexOf(" ");
  if (idx === -1) return [trimmed, ""];
  return [trimmed.slice(0, idx), trimmed.slice(idx + 1)];
}

function getInitials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0] ?? "")
    .join("")
    .toUpperCase();
}

/** "PNP · Movimiento por la Justicia Social" — siglas + nombre completo. */
function formatPartidoLine(ctx: CandidatoContext): string | null {
  const op = ctx.organizacion_politica;
  if (!op) return null;
  const siglas = op.siglas?.trim();
  const nombre = op.nombre?.trim();
  if (siglas && nombre && siglas !== nombre) return `${siglas} · ${nombre}`;
  return siglas || nombre || null;
}
