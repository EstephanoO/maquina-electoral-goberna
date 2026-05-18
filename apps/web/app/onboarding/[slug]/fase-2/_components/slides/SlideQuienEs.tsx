"use client";

import { motion } from "motion/react";

import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";
import { SlideLabel } from "../_ui/critico";

interface Props {
  ctx: CandidatoContext;
  f2: ConsultorFormFase2;
}

/**
 * Slide "¿Quién es?" — estilo CRÍTICO (navy + gold).
 * Layout 2-col: izquierda foto/initials, derecha bio + valores + trayectoria.
 */
export function SlideQuienEs({ ctx, f2 }: Props) {
  const fullName =
    f2.fase1_rapida?.candidato?.nombre_completo?.trim() ||
    ctx.user.full_name;

  const fotoUrl =
    f2.fase1_rapida?.candidato?.foto_url ||
    f2.perfil_candidato?.n1_identidad?.foto_url ||
    ctx.user.foto_url;

  const initials = getInitials(fullName);
  const firstName = (fullName.split(/\s+/)[0] ?? fullName).toUpperCase();

  // Bio: texto_libre → bio_corta → fallback generado
  const bioLibre = f2.quien_es?.texto_libre?.trim();
  const bioCorta =
    f2.fase1_rapida?.candidato?.bio_corta?.trim() ||
    f2.perfil_candidato?.n1_identidad?.bio_corta?.trim();

  const territorio =
    f2.fase1_rapida?.postulacion?.nombre_territorio?.trim() ||
    ctx.jurisdiccion.distrito?.nombre ||
    ctx.jurisdiccion.provincia?.nombre ||
    ctx.jurisdiccion.departamento?.nombre;

  const cargoNombre = ctx.cargo.nombre;

  const bio =
    bioLibre && bioLibre.length > 0
      ? bioLibre
      : bioCorta && bioCorta.length > 0
        ? bioCorta
        : `Político con trayectoria en ${cargoNombre}. Candidato comprometido con el desarrollo de ${territorio ?? "su territorio"}.`;

  const valores = f2.quien_es?.valores?.filter((v) => v?.trim().length > 0) ?? [];
  const trayectoria = f2.quien_es?.trayectoria?.trim();

  const logros =
    f2.perfil_candidato?.n2_trayectoria?.logros_principales?.filter(
      (l): l is string => typeof l === "string" && l.trim().length > 0,
    ) ?? [];

  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden bg-[#020a1e]">
      {/* Izquierda: foto o initials (compacto) */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="lg:w-1/3 relative bg-[#0a1e4a] flex items-center justify-center overflow-hidden min-h-[200px] lg:min-h-0 lg:flex-1"
      >
        {fotoUrl ? (
          <>
            <img
              src={fotoUrl}
              alt={fullName}
              className="absolute inset-0 w-full h-full object-cover object-top"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#020a1e]/50 pointer-events-none" />
          </>
        ) : (
          <div className="flex items-center justify-center w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-[#0a1e4a] border-2 border-amber-400/30 shadow-[0_0_40px_rgba(255,200,0,0.06)]">
            <span className="text-white text-5xl sm:text-6xl font-black tracking-tight select-none">
              {initials}
            </span>
          </div>
        )}
        {/* Gradient bottom */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#020a1e] to-transparent pointer-events-none" />
        {/* Línea dorada vertical derecha */}
        <div className="absolute top-0 right-0 bottom-0 w-[3px] bg-gradient-to-b from-amber-400/0 via-amber-400/50 to-amber-400/0" />
      </motion.div>

      {/* Derecha: bio + valores + trayectoria */}
      <div className="lg:w-2/3 flex flex-col justify-start px-8 py-10 gap-6 overflow-y-auto">
        {/* Título */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <SlideLabel>Perfil del candidato</SlideLabel>
          <h2 className="text-2xl lg:text-3xl font-black uppercase text-white tracking-tight leading-none">
            &iquest;Qui&eacute;n es{" "}
            <span className="text-amber-400">{firstName}</span>?
          </h2>
        </motion.div>

        {/* Bio */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-3"
        >
          {bio
            .split(/\n\s*\n/)
            .filter((p) => p.trim().length > 0)
            .map((paragraph, i) => (
              <p
                key={i}
                className="text-base leading-relaxed text-white/75 font-medium"
              >
                {paragraph.trim()}
              </p>
            ))}
        </motion.div>

        {/* Trayectoria */}
        {trayectoria && trayectoria.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <SlideLabel>Trayectoria</SlideLabel>
            <p className="text-sm leading-relaxed text-white/65 font-medium">
              {trayectoria}
            </p>
          </motion.div>
        )}

        {/* Logros principales (si no hay trayectoria libre) */}
        {logros.length > 0 && !trayectoria && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <SlideLabel>Logros principales</SlideLabel>
            <ul className="space-y-1.5">
              {logros.slice(0, 4).map((logro, i) => (
                <li key={i} className="flex items-baseline gap-2.5">
                  <span className="size-1.5 rounded-full bg-amber-400 shrink-0 translate-y-[-1px]" />
                  <span className="text-sm text-white/70 font-medium">{logro}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        {/* Valores */}
        {valores.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <SlideLabel>Valores</SlideLabel>
            <div className="flex flex-wrap gap-2">
              {valores.map((valor, i) => (
                <span
                  key={i}
                  className="bg-amber-400/10 text-amber-400 border border-amber-400/20 px-3 py-1 rounded-full text-xs font-semibold"
                >
                  {valor}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
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

/**
 * Helper para decidir si la slide tiene datos suficientes para mostrarse.
 * Util para deck que filtra slides sin contenido. Exportado como named.
 */
export function isSlideQuienEsVisible(ctx: CandidatoContext, f2: ConsultorFormFase2): boolean {
  const bioLibre = f2.quien_es?.texto_libre?.trim();
  const bioCorta = f2.perfil_candidato?.n1_identidad?.bio_corta?.trim();
  const logros = f2.perfil_candidato?.n2_trayectoria?.logros_principales ?? [];
  return (
    (bioLibre !== undefined && bioLibre.length > 0) ||
    (bioCorta !== undefined && bioCorta.length > 0) ||
    logros.length > 0
  );
}
