"use client";

import { motion } from "motion/react";

import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";

import { SlideChromeData } from "../chrome/SlideChromeData";

interface Props {
  ctx: CandidatoContext;
  f2: ConsultorFormFase2;
}

/**
 * Slide "Ficha técnica" — tabla 2-col label/value con los datos básicos
 * del candidato (DNI, edad, cargo, jurisdicción, partido, etc.).
 * Inspirada en el formato tabla del deck Goberna (pp.2 del PDF). Skipea
 * campos vacíos para no dejar huecos.
 */
export function SlideFichaTecnica({ ctx, f2 }: Props) {
  const rows = buildRows(ctx, f2);

  return (
    <SlideChromeData
      title="FICHA TÉCNICA"
      subtitle="Datos básicos del candidato"
      chapter={1}
      chapterHint="presentación"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 md:gap-x-14 gap-y-4">
        {rows.map((row, i) => (
          <motion.div
            key={row.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 + i * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-1 border-b border-slate-200 pb-3"
          >
            <span className="text-[10px] uppercase tracking-[0.3em] font-black text-slate-500">
              {row.label}
            </span>
            <span className="text-lg md:text-xl font-bold text-[#0a1f4a]">
              {row.value}
            </span>
          </motion.div>
        ))}
      </div>
    </SlideChromeData>
  );
}

interface Row {
  label: string;
  value: string;
}

function buildRows(ctx: CandidatoContext, f2: ConsultorFormFase2): Row[] {
  const n1 = f2.perfil_candidato?.n1_identidad;
  const n2 = f2.perfil_candidato?.n2_trayectoria;
  const fb = f2.ficha_basica;
  // Fase 1 rápida — fuente principal cuando perfil_candidato no está lleno
  const f1c = f2.fase1_rapida?.candidato;
  const f1p = f2.fase1_rapida?.postulacion;

  const out: Row[] = [];
  const push = (label: string, raw: string | number | null | undefined) => {
    if (raw === null || raw === undefined) return;
    const s = String(raw).trim();
    if (s.length === 0) return;
    out.push({ label, value: s });
  };

  // Apodo / nombre de campaña
  push("Apodo / Campaña", f1c?.apodo ?? n1?.apodo);

  // DNI / Documento
  const dni = f1c?.documento_numero ?? n1?.documento_numero ?? fb?.dni;
  push("DNI", dni);

  // Edad — f1c.fecha_nacimiento → n1.fecha_nacimiento → fb.edad
  const edadCalc = computeEdad(f1c?.fecha_nacimiento ?? n1?.fecha_nacimiento);
  const edad = edadCalc ?? fb?.edad;
  push("Edad", typeof edad === "number" ? `${edad} años` : undefined);

  // Sexo — f1c primero
  const sexo = f1c?.sexo ?? n1?.sexo;
  if (sexo === "M") push("Sexo", "Masculino");
  else if (sexo === "F") push("Sexo", "Femenino");

  // Profesión / ocupación — f1c primero
  push("Profesión", n2?.profesion ?? fb?.profesion ?? f1c?.ocupacion_actual);

  // Estado civil
  push("Estado civil", n1?.estado_civil);

  // Hijos
  if (typeof n1?.hijos === "number") push("Hijos", String(n1.hijos));

  // Cargo (siempre disponible desde ctx o f1p)
  push("Cargo", ctx.cargo.nombre ?? f1p?.cargo_codigo);

  // Jurisdicción — concat país/depto/prov/distrito, fallback a f1p.nombre_territorio
  const juris = buildJurisdiccion(ctx);
  push("Jurisdicción", juris || f1p?.nombre_territorio);

  // Partido — ctx primero, fallback a f1p.nombre_organizacion
  push(
    "Partido",
    ctx.organizacion_politica?.siglas ??
      ctx.organizacion_politica?.nombre ??
      f1p?.nombre_organizacion,
  );

  // Fecha de elección
  push("Elección", f1p?.fecha_eleccion);

  // Slogan
  push("Slogan", f2.fase1_rapida?.branding?.slogan);

  // Bio corta — al final (puede ser larga)
  const bio = f1c?.bio_corta ?? n1?.bio_corta;
  if (bio?.trim()) {
    out.push({ label: "Perfil", value: bio.trim() });
  }

  return out;
}

function computeEdad(fechaNacimiento?: string): number | undefined {
  if (!fechaNacimiento) return undefined;
  const d = new Date(fechaNacimiento);
  if (Number.isNaN(d.getTime())) return undefined;
  const now = new Date();
  let edad = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) edad -= 1;
  return edad >= 0 && edad < 130 ? edad : undefined;
}

function buildJurisdiccion(ctx: CandidatoContext): string {
  const partes: string[] = [];
  const { distrito, provincia, departamento, pais } = ctx.jurisdiccion;
  if (distrito?.nombre) partes.push(distrito.nombre);
  if (provincia?.nombre) partes.push(provincia.nombre);
  if (departamento?.nombre) partes.push(departamento.nombre);
  if (pais?.nombre) partes.push(pais.nombre);
  return partes.join(", ");
}
