"use client";

import { motion } from "motion/react";

import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";

import { CheckList } from "../chrome/CheckList";
import { SlideChromeData } from "../chrome/SlideChromeData";

interface Props {
  ctx: CandidatoContext;
  f2: ConsultorFormFase2;
}

/**
 * Slide "¿Quién es <primer nombre>?" — usa chrome data (header navy +
 * franja amber + cuerpo blanco). Cuerpo 2 columnas: narrativa libre +
 * checklist de logros y formación. Inspirado en pp. 4 del deck Goberna.
 */
export function SlideQuienEs({ ctx, f2 }: Props) {
  const firstName = (ctx.user.full_name.split(/\s+/)[0] ?? ctx.user.full_name).toUpperCase();

  const bioLibre = f2.quien_es?.texto_libre?.trim();
  const bioCorta = f2.perfil_candidato?.n1_identidad?.bio_corta?.trim();
  const bio = bioLibre && bioLibre.length > 0 ? bioLibre : bioCorta ?? "";

  const logros = (f2.perfil_candidato?.n2_trayectoria?.logros_principales ?? []).filter(
    (l): l is string => typeof l === "string" && l.trim().length > 0,
  );
  const formacion = (f2.perfil_candidato?.n2_trayectoria?.formacion ?? []).filter(
    (f) => f && (f.titulo ?? f.nivel ?? f.institucion),
  );

  return (
    <SlideChromeData title={`¿QUIÉN ES ${firstName}?`} chapter={2} chapterHint="narrativa del candidato">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
        {/* Columna izquierda — narrativa libre */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-4"
        >
          {bio.length > 0 ? (
            bio
              .split(/\n\s*\n/)
              .filter((p) => p.trim().length > 0)
              .map((paragraph, i) => (
                <p
                  key={i}
                  className="text-base md:text-lg leading-relaxed text-slate-700 font-medium text-justify"
                >
                  {paragraph.trim()}
                </p>
              ))
          ) : (
            <p className="text-base md:text-lg leading-relaxed text-slate-400 italic">
              Bio pendiente — el consultor completará esta sección en el
              formulario de Fase 2.
            </p>
          )}
        </motion.div>

        {/* Columna derecha — logros + formación */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-7"
        >
          {logros.length > 0 ? (
            <section>
              <h3 className="text-[10px] uppercase tracking-[0.3em] font-black text-[#0a1f4a] mb-3">
                Trayectoria · Logros principales
              </h3>
              <CheckList
                items={logros.map((text) => ({ text }))}
                iconColor="amber"
              />
            </section>
          ) : null}

          {formacion.length > 0 ? (
            <section>
              <h3 className="text-[10px] uppercase tracking-[0.3em] font-black text-[#0a1f4a] mb-3">
                Formación académica
              </h3>
              <ul className="space-y-2 text-sm md:text-base text-slate-700 font-medium">
                {formacion.map((f, i) => {
                  const partes: string[] = [];
                  if (f.titulo && f.titulo.trim()) partes.push(f.titulo.trim());
                  else if (f.nivel && f.nivel.trim()) partes.push(f.nivel.trim());
                  if (f.institucion && f.institucion.trim()) partes.push(f.institucion.trim());
                  if (typeof f.anio === "number") partes.push(String(f.anio));
                  return (
                    <li key={i} className="flex items-baseline gap-2">
                      <span className="size-1.5 rounded-full bg-amber-400 shrink-0 translate-y-[-2px]" />
                      <span>{partes.join(" · ")}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </motion.div>
      </div>
    </SlideChromeData>
  );
}

/**
 * Helper para decidir si la slide tiene datos suficientes para mostrarse.
 * Útil para deck que filtra slides sin contenido. Exportado como named.
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
