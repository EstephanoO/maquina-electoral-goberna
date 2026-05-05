/**
 * Voter Profile auto-classifier — usado por wa-events para clasificar y
 * etiquetar perfiles automáticamente cuando llega un inbound nuevo.
 *
 * Pipeline:
 *   1. classifyWithCache(text)   → category + vote_class + confidence + reason
 *   2. Derive tags desde la respuesta (category + vote_class + keyword scan)
 *   3. voterProfileRepo.setAiClassification(...) persiste todo en una sola write.
 *
 * Solo persiste si confidence >= MIN_CONFIDENCE — el ruido baja el calor de los
 * dashboards. La clasificación se hace fire-and-forget desde wa-events, así
 * que cualquier error solo loguea sin propagar.
 */

import type { AppEnv } from "../../config/env";
import * as voterProfileRepo from "../voter-profiles/repository";
import { classifyWithCache, type ClassifyResult } from "./classifier";

const MIN_CONFIDENCE = 0.55;

// Keywords → tag map. Aplica además del category devuelto por Gemini.
// Cada match agrega su tag — un mensaje puede activar varios.
const KEYWORD_TAGS: ReadonlyArray<{ patterns: RegExp[]; tag: string }> = [
  { patterns: [/voluntari[oa]/i, /quiero ayudar/i, /me sumo/i, /militante/i], tag: "voluntario" },
  { patterns: [/coordinad[oa]r/i, /jef[ae] de zona/i], tag: "coordinador" },
  { patterns: [/material/i, /banderol/i, /poster/i, /volante/i, /chaleco/i, /gorr[oa]/i], tag: "pide_material" },
  { patterns: [/sector salud/i, /enferm[ae]r/i, /m[eé]dic[oa]/i, /hospital/i, /cesfam/i, /posta/i], tag: "sector_salud" },
  { patterns: [/educaci[oó]n/i, /docente/i, /maestr[oa]/i, /profesor/i, /escuela/i, /colegio/i], tag: "sector_educacion" },
  { patterns: [/seguridad/i, /delincuen/i, /robo/i, /asalt/i], tag: "seguridad" },
  { patterns: [/obra/i, /pista/i, /vereda/i, /pavimentaci[oó]n/i, /agua/i, /desag[üu]e/i], tag: "obras" },
  { patterns: [/deport/i, /losa deportiva/i, /cancha/i], tag: "deportes" },
  { patterns: [/yape/i, /\bbim\b/i, /plata/i, /dinero/i, /apoyo econ[oó]mico/i], tag: "pide_dinero" },
  { patterns: [/trabajo/i, /empleo/i, /\bcv\b/i, /curr[ií]culum/i], tag: "pide_trabajo" },
  { patterns: [/publicidad/i, /promoci[oó]n/i, /\bspot\b/i, /pauta/i], tag: "pide_publicidad" },
  { patterns: [/cuando\s+vot/i, /lugar de votaci[oó]n/i, /\blocal\s+de\s+votaci[oó]n\b/i, /padr[oó]n/i], tag: "consulta_votacion" },
  { patterns: [/agradec/i, /gracias/i, /felicit/i], tag: "positivo" },
  { patterns: [/no\s+vot/i, /no\s+apoy/i, /no\s+me\s+interesa/i, /\bbas[ut][a]?\b/i], tag: "negativo" },
];

function deriveTags(text: string, classified: ClassifyResult): string[] {
  const tags = new Set<string>();

  // Tag por categoría devuelta por Gemini (siempre, ya viene normalizada en lower-snake).
  if (classified.category && classified.category !== "no_clasificable" && classified.category !== "ai_classified") {
    tags.add(classified.category);
  }

  // Tag por vote_class (duro/blando/flotante) — útil para filtros del CMS.
  if (classified.vote_class) tags.add(`voto_${classified.vote_class}`);

  // Tag por status (invalido/respondido) cuando es informativo.
  if (classified.status === "invalido") tags.add("invalido");

  // Keyword scan — agrega tags adicionales desde el texto crudo.
  for (const { patterns, tag } of KEYWORD_TAGS) {
    if (patterns.some((p) => p.test(text))) tags.add(tag);
  }

  return Array.from(tags);
}

/**
 * Clasifica el texto de un inbound, deriva tags y persiste todo en el perfil.
 * No tira excepciones — fire-and-forget. Devuelve true si actualizó el perfil.
 */
export async function classifyAndTagVoterProfile(
  env: Pick<AppEnv, "geminiApiKey">,
  profileId: string,
  text: string,
): Promise<boolean> {
  if (!env.geminiApiKey) return false;
  if (!text || text.trim().length < 4) return false;

  let classification: ClassifyResult | null;
  try {
    classification = await classifyWithCache(env.geminiApiKey, text);
  } catch {
    return false;
  }

  if (!classification || classification.confidence < MIN_CONFIDENCE) {
    // Caso: clasificación insuficiente. Aún así corre el keyword scan para
    // capturar tags obvias (ej. "yape" → invalido) sin tocar vote_class.
    const baseClassified: ClassifyResult = classification ?? {
      vote_class: "",
      status: "",
      confidence: 0,
      category: "",
      reason: "",
    };
    const tags = deriveTags(text, baseClassified);
    if (tags.length === 0) return false;

    await voterProfileRepo.setAiClassification(
      profileId,
      {
        category: baseClassified.category || "",
        vote_class: "",
        confidence: baseClassified.confidence,
        reason: baseClassified.reason || "low_confidence_keyword_only",
        model: "keyword-fallback",
      },
      tags,
    );
    return true;
  }

  const tags = deriveTags(text, classification);

  await voterProfileRepo.setAiClassification(
    profileId,
    {
      category: classification.category,
      vote_class: classification.vote_class,
      confidence: classification.confidence,
      reason: classification.reason,
      model: "gemini-2.5-flash-lite",
    },
    tags,
  );
  return true;
}
