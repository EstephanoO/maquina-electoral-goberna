"use client";

/**
 * Live preview del slide del deck Fase 2 que cada sección del form
 * alimenta. Se monta a la derecha del form, oculto en screens < xl.
 *
 * Para cada sección renderiza el componente real del slide envuelto en
 * un contenedor escalado (transform: scale 0.42, origin top-left) — así
 * vemos el slide real, mismo lenguaje visual, sin duplicar markup.
 */
import type { ReactNode } from "react";
import { Eye } from "lucide-react";

import type {
  CandidatoContext,
  ConsultorFormFase2,
  Fase1Rapida,
} from "@/lib/onboarding-api";

import { SlideFichaTecnica }      from "../../fase-2/_components/slides/SlideFichaTecnica";
import { SlideHero }              from "../../fase-2/_components/slides/SlideHero";
import { SlideFoda }              from "../../fase-2/_components/slides/SlideFoda";
import { SlidePropuestas }        from "../../fase-2/_components/slides/SlidePropuestas";
import { SlideArquitectura }      from "../../fase-2/_components/slides/SlideArquitectura";
import { SlideQuienEs }           from "../../fase-2/_components/slides/SlideQuienEs";
import { SlidePresenciaDigital }  from "../../fase-2/_components/slides/SlidePresenciaDigital";
import { SlideDebilidades }       from "../../fase-2/_components/slides/SlideDebilidades";
import { SlideVotosNecesarios }   from "../../fase-2/_components/slides/SlideVotosNecesarios";
import { SlideSegmentos }         from "../../fase-2/_components/slides/SlideSegmentos";
import { SlideReorganizar }       from "../../fase-2/_components/slides/SlideReorganizar";

type ExtendedFields = Pick<
  ConsultorFormFase2,
  | "quien_es"
  | "presencia_digital"
  | "redes_sociales"
  | "debilidades"
  | "votos_para_ganar"
  | "historial"
  | "territorio_ecd"
  | "recorrido_estrategico"
  | "formula_electoral"
>;

interface Props {
  /** ID de la sección activa del form. */
  sectionId: string;
  /** Estado actual del form fase1_rapida. */
  form: Fase1Rapida;
  /** Estado actual de los campos extendidos. */
  extended: ExtendedFields;
  /** Contexto del candidato (snapshot del backend). */
  ctx: CandidatoContext | null;
}

const PREVIEW_WIDTH = 1280;   // ancho "real" del slide
const PREVIEW_HEIGHT = 880;   // alto "real" del slide
const SCALE = 0.42;           // escala visual

const SCALED_WIDTH = PREVIEW_WIDTH * SCALE;   // ~538
const SCALED_HEIGHT = PREVIEW_HEIGHT * SCALE; // ~370

export function Fase1LivePreview({ sectionId, form, extended, ctx }: Props) {
  const f2: ConsultorFormFase2 = { fase1_rapida: form, ...extended };

  const previewCtx = ctx ?? buildFallbackCtx(form);
  const ctxWithForm: CandidatoContext = { ...previewCtx, consultor_form: f2 };

  const slide = pickSlide(sectionId, ctxWithForm, f2);

  return (
    <div className="hidden xl:flex flex-col gap-3 w-[560px] flex-shrink-0 pl-4 pt-8 sticky top-20 self-start">
      <header className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-amber-400/70 font-bold">
        <Eye className="size-3.5" />
        Live preview · slide del deck
      </header>
      <div
        className="relative rounded-2xl overflow-hidden border border-amber-400/15 bg-[#020a1e] shadow-2xl"
        style={{
          width: `${SCALED_WIDTH}px`,
          height: `${SCALED_HEIGHT}px`,
        }}
      >
        {slide ? (
          <div
            className="absolute top-0 left-0 pointer-events-none"
            style={{
              width: `${PREVIEW_WIDTH}px`,
              height: `${PREVIEW_HEIGHT}px`,
              transform: `scale(${SCALE})`,
              transformOrigin: "top left",
            }}
          >
            <div className="relative w-full h-full flex flex-col p-4">
              {slide}
            </div>
          </div>
        ) : (
          <EmptyPreview />
        )}
      </div>
      <p className="text-[10px] text-white/40 italic leading-relaxed">
        Lo que llenes acá actualiza este slide del deck Fase 2 en tiempo real.
      </p>
    </div>
  );
}

function pickSlide(
  sectionId: string,
  ctx: CandidatoContext,
  f2: ConsultorFormFase2,
): ReactNode | null {
  // Mínimo (escribe a fase1_rapida)
  if (sectionId === "candidato")           return <SlideFichaTecnica ctx={ctx} f2={f2} />;
  if (sectionId === "postulacion")         return <SlideHero ctx={ctx} />;
  if (sectionId === "estrategia")          return <SlideArquitectura f2={f2} />;
  if (sectionId === "diagnostico_inicial") return <SlideFoda f2={f2} />;
  if (sectionId === "propuestas")          return <SlidePropuestas f2={f2} />;
  // Extendido (top-level del consultor_form)
  if (sectionId === "quien_es")            return <SlideQuienEs ctx={ctx} f2={f2} />;
  if (sectionId === "presencia")           return <SlidePresenciaDigital f2={f2} />;
  if (sectionId === "debilidades")         return <SlideDebilidades ctx={ctx} f2={f2} />;
  if (sectionId === "votos")               return <SlideVotosNecesarios f2={f2} />;
  if (sectionId === "segmentos")           return <SlideSegmentos f2={f2} />;
  if (sectionId === "recorrido")           return <SlideReorganizar f2={f2} />;
  return null;
}

function EmptyPreview() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
      <div className="size-12 rounded-full border border-amber-400/30 bg-amber-400/5 flex items-center justify-center">
        <Eye className="size-5 text-amber-400/60" />
      </div>
      <p className="text-[11px] text-white/40 leading-snug">
        Esta sección no tiene un slide directo todavía. Aparecerá cuando esté listo el form extendido.
      </p>
    </div>
  );
}

/** Construye un ctx mínimo desde el form si el snapshot del backend no llegó. */
function buildFallbackCtx(form: Fase1Rapida): CandidatoContext {
  const c = form.candidato ?? {};
  const p = form.postulacion ?? {};
  return {
    user: {
      id: "preview",
      full_name: c.nombre_completo ?? "Candidato",
      email: "preview@local",
      phone: null,
      has_password: false,
      foto_url: c.foto_url ?? null,
    },
    campaign: { id: "preview", slug: "preview", name: "Preview" },
    cargo: {
      codigo: p.cargo_codigo ?? "candidato",
      nombre: p.cargo_codigo ?? "Candidato",
      ambito: "departamento",
      nivel_codigo: p.nivel_territorio ?? "regional",
      nivel_nombre: "Regional",
    },
    jurisdiccion: {
      pais: { id: 1, nombre: "Perú", iso2: "PE" },
      departamento: null,
      provincia: null,
      distrito: null,
    },
    organizacion_politica: p.nombre_organizacion
      ? { codigo: "preview", nombre: p.nombre_organizacion, siglas: null }
      : null,
    consultor_form: null,
  };
}
