"use client";

import { motion } from "motion/react";

import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";
import { CriticoSello } from "../_ui/critico";
import { EditorialHeader } from "./shared/EditorialHeader";

interface Props {
  ctx: CandidatoContext;
  f2: ConsultorFormFase2;
}

/**
 * Slide "Ficha técnica" — estilo CRÍTICO (navy + gold).
 * Tabla label/value en fondo oscuro #020a1e.
 * Si hay nivel_riesgo_global → sello visual en encabezado derecho.
 */
export function SlideFichaTecnica({ ctx, f2 }: Props) {
  const rows = buildRows(ctx, f2);
  const nivelRiesgo = f2.perfil_candidato?.n3_riesgo?.nivel_riesgo_global;
  const cargoLabel = ctx.cargo.nombre;

  const selloTipo =
    nivelRiesgo === "critico" || nivelRiesgo === "alto"
      ? "critico"
      : nivelRiesgo === "medio"
        ? "atencion"
        : nivelRiesgo === "bajo"
          ? "ok"
          : null;

  return (
    <div className="w-full h-full min-h-[560px] flex flex-col bg-[#020a1e] px-8 py-10">
      {/* Encabezado */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-start justify-between gap-4 mb-8"
      >
        <div>
          <EditorialHeader
            microLabel="ACTO I · FICHA DEL CANDIDATO"
            headline={`${cargoLabel} · ${ctx.jurisdiccion.distrito?.nombre ?? ctx.jurisdiccion.provincia?.nombre ?? ""}`}
            accentColor="#fbbf24"
          />
        </div>
        {selloTipo && (
          <div className="shrink-0 mt-1">
            <CriticoSello tipo={selloTipo} />
          </div>
        )}
      </motion.div>

      {/* Tabla de filas */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-0">
        {rows.map((row, i) => (
          <motion.div
            key={row.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.05 + i * 0.04,
              duration: 0.4,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="flex flex-col gap-0.5 border-b border-white/5 py-3"
          >
            <span className="text-[10px] uppercase tracking-[0.3em] font-semibold text-amber-400/50">
              {row.label}
            </span>
            <span className="text-base md:text-lg font-semibold text-white">
              {row.value}
            </span>
          </motion.div>
        ))}
      </div>

      {/* Footer decorativo */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        className="mt-6 pt-4 border-t border-white/5 flex items-center gap-2"
      >
        <div className="h-[2px] w-8 bg-amber-400/40 rounded-full" />
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/20 font-semibold">
          Goberna · Ficha confidencial
        </p>
      </motion.div>
    </div>
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

  const out: Row[] = [];
  const push = (label: string, raw: string | number | null | undefined) => {
    if (raw === null || raw === undefined) return;
    const s = String(raw).trim();
    if (s.length === 0) return;
    out.push({ label, value: s });
  };

  // DNI / Documento
  const dni = n1?.documento_numero ?? fb?.dni;
  push("DNI", dni);

  // Edad — preferir n1.fecha_nacimiento, fallback a fb.edad
  const edadCalc = computeEdad(n1?.fecha_nacimiento);
  const edad = edadCalc ?? fb?.edad;
  push("Edad", typeof edad === "number" ? `${edad} años` : undefined);

  // Sexo
  if (n1?.sexo === "M") push("Sexo", "Masculino");
  else if (n1?.sexo === "F") push("Sexo", "Femenino");

  // Profesión — preferir n2.profesion, fallback a fb.profesion
  push("Profesión", n2?.profesion ?? fb?.profesion);

  // Estado civil
  push("Estado civil", n1?.estado_civil);

  // Hijos
  if (typeof n1?.hijos === "number") push("Hijos", String(n1.hijos));

  // Religión
  push("Religión", n1?.religion);

  // Cargo (siempre disponible)
  push("Cargo", ctx.cargo.nombre);

  // Jurisdicción — concat país/depto/prov/distrito
  push("Jurisdicción", buildJurisdiccion(ctx));

  // Partido
  push(
    "Partido",
    ctx.organizacion_politica?.siglas ?? ctx.organizacion_politica?.nombre,
  );

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
