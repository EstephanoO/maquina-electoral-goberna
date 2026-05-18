"use client";

import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";
import { CriticoSello } from "../_ui/critico";
import { EditorialHeader } from "./shared/EditorialHeader";
import { StatMega } from "./shared/StatMega";

interface Props {
  ctx: CandidatoContext;
  f2: ConsultorFormFase2;
}

/**
 * Slide "Ficha técnica" — 3-col grid, estilo CRÍTICO (navy + gold).
 * Col 1: datos personales (DNI, edad, profesión, cargo)
 * Col 2: jurisdicción + partido
 * Col 3: bio + valores
 */
export function SlideFichaTecnica({ ctx, f2 }: Props) {
  // ---------- data derivation (unchanged logic) ----------
  const n1 = f2.perfil_candidato?.n1_identidad;
  const n2 = f2.perfil_candidato?.n2_trayectoria;
  const fb = f2.ficha_basica;

  const nivelRiesgoGlobal = f2.perfil_candidato?.n3_riesgo?.nivel_riesgo_global;
  const cargoLabel = ctx.cargo.nombre;

  const selloTipo =
    nivelRiesgoGlobal === "critico" || nivelRiesgoGlobal === "alto"
      ? "critico"
      : nivelRiesgoGlobal === "medio"
        ? "atencion"
        : nivelRiesgoGlobal === "bajo"
          ? "ok"
          : null;

  const dni = n1?.documento_numero ?? fb?.dni ?? null;

  const edadCalc = computeEdad(n1?.fecha_nacimiento);
  const edad = edadCalc ?? fb?.edad ?? null;

  const profesion = n2?.profesion ?? fb?.profesion ?? null;

  const bio =
    f2.quien_es?.texto_libre ??
    n1?.bio_corta ??
    null;

  const valoresRaw = f2.quien_es?.valores;
  const valores: string[] = Array.isArray(valoresRaw) ? valoresRaw : [];

  const jurisdiccionLabel = buildJurisdiccion(ctx);
  const partidoLabel =
    ctx.organizacion_politica?.siglas ?? ctx.organizacion_politica?.nombre ?? null;

  // -------------------------------------------------------

  return (
    <div className="flex-1 flex flex-col rounded-2xl overflow-hidden border border-white/10 bg-[#020a1e]">
      {/* Header */}
      <div className="px-8 pt-8 pb-4 border-b border-white/5 flex items-center justify-between">
        <div>
          <EditorialHeader
            microLabel="ACTO I · PERFIL DEL CANDIDATO"
            headline="Ficha del Candidato"
            accentColor="#fbbf24"
            headlineSize="sm"
          />
          <span className="inline-block mt-2 px-3 py-1 border border-amber-400/40 rounded text-[10px] uppercase tracking-widest text-amber-400 font-bold">
            {cargoLabel}
          </span>
        </div>
        {selloTipo && (
          <div className="shrink-0">
            <CriticoSello tipo={selloTipo} />
          </div>
        )}
      </div>

      {/* 3-col grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-white/5">
        {/* Col 1: personal data */}
        <div className="p-6 flex flex-col gap-5">
          {dni && (
            <StatMega
              label="DNI"
              value={dni}
              mono
              tip={{ title: "RENIEC", body: "Documento Nacional de Identidad del candidato.", fuente: "RENIEC" }}
            />
          )}
          {edad != null && <StatMega label="Edad" value={`${edad} años`} />}
          {profesion && <StatMega label="Profesión" value={profesion} size="sm" />}
          <StatMega label="Cargo postulado" value={ctx.cargo.nombre} size="sm" />
        </div>

        {/* Col 2: jurisdiction + party */}
        <div className="p-6 flex flex-col gap-5">
          <StatMega
            label="Jurisdicción"
            value={jurisdiccionLabel}
            size="sm"
            tip={{ title: "UBIGEO", body: "Circunscripción electoral para las ERM 2026.", fuente: "ONPE" }}
          />
          {partidoLabel && (
            <StatMega label="Organización política" value={partidoLabel} size="sm" />
          )}
        </div>

        {/* Col 3: bio + valores */}
        <div className="p-6 flex flex-col gap-5">
          {bio && (
            <div>
              <p className="text-[9px] uppercase tracking-widest text-white/30 font-semibold mb-2">Bio</p>
              <p className="text-sm text-white/70 leading-relaxed line-clamp-5">{bio}</p>
            </div>
          )}
          {valores.length > 0 && (
            <div>
              <p className="text-[9px] uppercase tracking-widest text-white/30 font-semibold mb-2">Valores</p>
              <div className="flex flex-wrap gap-2">
                {valores.map((v) => (
                  <span key={v} className="px-2.5 py-1 border border-white/15 rounded-full text-[10px] text-white/60">
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}
          {!bio && valores.length === 0 && (
            <p className="text-sm text-white/20 italic">Bio pendiente de completar.</p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-8 py-3 border-t border-white/5 flex items-center gap-3">
        <div className="h-px flex-1 bg-amber-400/20" />
        <span className="text-[9px] uppercase tracking-widest text-white/20">
          Goberna · Ficha Confidencial
        </span>
      </div>
    </div>
  );
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
