"use client";

import { motion } from "motion/react";

import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";

interface Props {
  ctx: CandidatoContext;
  f2?: ConsultorFormFase2;
}

/**
 * Slide de apertura — estilo CRÍTICO (navy + gold + sello rojo).
 * Layout 2-col: izquierda foto (o initials), derecha identidad.
 */
export function SlideHero({ ctx, f2 }: Props) {
  const fullName =
    f2?.fase1_rapida?.candidato?.nombre_completo?.trim() ||
    ctx.user.full_name;

  const fotoUrl =
    f2?.fase1_rapida?.candidato?.foto_url ||
    ctx.user.foto_url;

  const slogan = f2?.fase1_rapida?.branding?.slogan?.trim();

  const cargoLabel = deriveEleccionLabel(ctx.cargo.codigo, ctx.cargo.nombre);
  const [firstName, lastName] = splitName(fullName);
  const initials = getInitials(fullName);
  const partidoLine = formatPartidoLine(ctx);

  const territorio =
    f2?.fase1_rapida?.postulacion?.nombre_territorio?.trim() ||
    ctx.jurisdiccion.distrito?.nombre ||
    ctx.jurisdiccion.provincia?.nombre ||
    ctx.jurisdiccion.departamento?.nombre ||
    ctx.jurisdiccion.pais.nombre;

  return (
    <div className="w-full h-full min-h-[560px] flex flex-col lg:flex-row gap-0 overflow-hidden bg-[#020a1e]">
      {/* Izquierda: foto o initials */}
      <motion.div
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="lg:w-2/5 relative bg-[#0a1e4a] flex items-center justify-center overflow-hidden min-h-[280px] lg:min-h-full"
      >
        {fotoUrl ? (
          <>
            <img
              src={fotoUrl}
              alt={fullName}
              className="absolute inset-0 w-full h-full object-cover object-top"
            />
            {/* Gradient overlay amber-glow lateral a la derecha */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#020a1e]/60 pointer-events-none" />
          </>
        ) : (
          <div className="flex items-center justify-center w-40 h-40 sm:w-52 sm:h-52 rounded-full bg-[#0a1e4a] border-2 border-amber-400/30 shadow-[0_0_60px_rgba(255,200,0,0.08)]">
            <span className="text-white text-6xl sm:text-7xl font-black tracking-tight select-none">
              {initials}
            </span>
          </div>
        )}
        {/* Gradient overlay bottom */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#020a1e] to-transparent pointer-events-none" />
        {/* Línea decorativa dorada vertical en el borde derecho */}
        <div className="absolute top-0 right-0 bottom-0 w-[3px] bg-gradient-to-b from-amber-400/0 via-amber-400/60 to-amber-400/0" />
      </motion.div>

      {/* Derecha: identidad */}
      <div className="lg:w-3/5 flex flex-col justify-center px-8 py-10 gap-6">
        {/* Cargo label */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="text-[11px] uppercase tracking-[0.25em] text-amber-400/60 font-semibold mb-3">
            Candidato a
          </p>
          <div className="inline-block bg-amber-400/10 border border-amber-400/30 rounded px-3 py-1.5 mb-4">
            <span className="text-amber-400 font-black text-sm uppercase tracking-[0.15em]">
              {cargoLabel}
            </span>
          </div>
        </motion.div>

        {/* Nombre */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className="text-5xl lg:text-7xl font-black uppercase leading-none text-white tracking-tight">
            <span className="block">{firstName}</span>
            {lastName ? (
              <span className="block text-amber-400">{lastName}</span>
            ) : null}
          </h1>
        </motion.div>

        {/* Partido + Territorio */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-1.5"
        >
          {partidoLine && (
            <p className="text-white/70 text-sm font-semibold tracking-wide">
              {partidoLine}
            </p>
          )}
          {territorio && (
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-semibold">
              {territorio}
            </p>
          )}
        </motion.div>

        {/* Slogan */}
        {slogan && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.75, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="border-l-2 border-amber-400/50 pl-4"
          >
            <p className="text-white/80 text-base italic font-light leading-snug">
              &ldquo;{slogan}&rdquo;
            </p>
          </motion.div>
        )}

        {/* Fortalezas pills si hay diagnostico_inicial */}
        {(f2?.fase1_rapida?.diagnostico_inicial?.fortalezas?.length ?? 0) > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.5 }}
            className="flex flex-wrap gap-2 pt-2"
          >
            {f2!.fase1_rapida!.diagnostico_inicial!.fortalezas!.slice(0, 3).map((f, i) => (
              <span
                key={i}
                className="bg-amber-400/10 text-amber-400 border border-amber-400/20 px-3 py-1 rounded-full text-xs font-semibold"
              >
                {f}
              </span>
            ))}
          </motion.div>
        )}
      </div>
    </div>
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
