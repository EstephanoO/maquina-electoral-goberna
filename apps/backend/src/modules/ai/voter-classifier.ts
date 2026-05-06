/**
 * Voter Profile auto-classifier — pipeline two-stage.
 *
 * Filosofía (ver docs/CLASSIFICATION_STRATEGY.md):
 *   - PROGRAMÁTICO siempre corre primero (sub-ms, gratis, hard tags).
 *   - GEMINI solo si el programmatic no decide Y los gates pasan.
 *   - Tags hard: `interés:X`, `sector:X`, `pide:X`, `tipo:X`, `país:X`, `intent:X`.
 *   - Tags soft (Gemini): prefijo `ai:` para que el operador sepa quién las puso.
 *
 * Usado fire-and-forget desde wa-events. Cualquier error solo loguea.
 */

import type { AppEnv } from "../../config/env";
import * as voterProfileRepo from "../voter-profiles/repository";
import { classifyWithCache, type ClassifyResult } from "./classifier";

// ─── Constantes ──────────────────────────────────────────────────────

/** Confianza mínima del Gemini para escribir vote_class al perfil. Debajo de
 *  esto el output de Gemini se ignora (pero los tags hard del programmatic
 *  sí se persisten igual). */
const GEMINI_MIN_CONFIDENCE = 0.55;

/** Confianza del programmatic a partir de la cual ya no llamamos Gemini. */
const PROGRAMMATIC_HIGH_CONFIDENCE = 0.85;

/** Texto demasiado corto: no vale la pena ni programmatic intent ni Gemini. */
const MIN_TEXT_LENGTH_FOR_AI = 15;

// ─── Capa 1: Programmatic ────────────────────────────────────────────

/**
 * Hard tags por keyword scan. Si la regex matchea, la tag se asigna con
 * confianza ~1.0 (es match exacto, no inferencia). Cada match es independiente,
 * un mensaje puede activar varios.
 *
 * Convención: tags llevan prefijo del tipo (`sector:`, `pide:`, `intent:`).
 * Eso facilita filtros en el CMS y diferencia tags duras de soft.
 */
const KEYWORD_TAGS: ReadonlyArray<{ patterns: RegExp[]; tag: string }> = [
  // Sectores (relevante para campañas políticas + Escuela)
  { patterns: [/sector salud/i, /enferm[ae]r/i, /\bm[eé]dic[oa]\b/i, /hospital/i, /cesfam/i, /posta\s*m[eé]dic/i], tag: "sector:salud" },
  { patterns: [/educaci[oó]n/i, /\bdocente/i, /maestr[oa]/i, /profesor/i, /\bescuela\b/i, /colegio/i], tag: "sector:educacion" },
  { patterns: [/seguridad/i, /delincuen/i, /\brobo\b/i, /asalt/i], tag: "sector:seguridad" },
  { patterns: [/\bobra\b/i, /\bpista\b/i, /vereda/i, /pavimentaci[oó]n/i, /agua\s*potable/i, /desag[üu]e/i], tag: "sector:obras" },
  { patterns: [/\bdeport/i, /losa deportiva/i, /cancha de/i], tag: "sector:deportes" },

  // Tipo de pedido — flags de spam comercial vs apoyo genuino
  { patterns: [/\byape\b/i, /\bplin\b/i, /\bbim\b/i, /apoyo econ[oó]mico/i, /me\s*pueden\s*pasar\s*plata/i], tag: "pide:dinero" },
  { patterns: [/busco trabajo/i, /\bempleo\b/i, /\bcv\b/i, /curr[ií]culum/i, /vacante/i], tag: "pide:trabajo" },
  { patterns: [/publicidad/i, /promoci[oó]n\s*pagada/i, /\bspot\s*pol[ií]tic/i, /pauta\s*pagada/i], tag: "pide:publicidad" },
  { patterns: [/material\s*(de\s*campa[ñn]a|publicitario)/i, /banderol/i, /\bposter/i, /volante/i, /chaleco/i, /gorr[oa]\s*de\s*campa[ñn]a/i], tag: "pide:material" },

  // Roles dentro de campaña
  { patterns: [/voluntari[oa]/i, /quiero ayudar/i, /me sumo/i, /\bmilitante\b/i], tag: "rol:voluntario" },
  { patterns: [/coordinad[oa]r/i, /jef[ae] de zona/i], tag: "rol:coordinador" },

  // Consultas administrativas
  { patterns: [/cuando\s+vot/i, /lugar de votaci[oó]n/i, /local\s+de\s+votaci[oó]n/i, /\bpadr[oó]n\b/i], tag: "consulta:votacion" },
  { patterns: [/horario\s*de\s*atenci[oó]n/i, /\bd[oó]nde\s+est[aá]/i, /direcci[oó]n/i], tag: "consulta:logistica" },

  // Sentiment shortcuts (alta confianza, frase explícita)
  { patterns: [/\bgracias\b/i, /\bagradec/i, /\bfelicit/i, /excelente trabajo/i], tag: "intent:positivo" },
  { patterns: [/no\s+vot/i, /no\s+apoy/i, /no\s+me\s+interesa/i, /\bbasur[ao]\b/i, /\bcorrupt/i, /\bladr[oó]n\b/i], tag: "intent:negativo" },
];

/**
 * Intent básico por regex. NO hace inferencia, solo matchea verbos /
 * patrones explícitos. Si nada matchea devuelve "unknown".
 */
const INTENT_PATTERNS: ReadonlyArray<{ patterns: RegExp[]; intent: string }> = [
  { patterns: [/^(hola|buen[oa]s?|saludos|hi|hey)\b[!.,]*$/i], intent: "greeting" },
  { patterns: [/inscri[bp]/i, /matric[uú]l/i, /\bcomprar\b/i, /quiero el (curso|diploma)/i], intent: "enrollment" },
  { patterns: [/cu[aá]nto cuesta/i, /\bprecio\b/i, /\bcosto\b/i, /forma\s*de\s*pago/i, /pagar/i], intent: "payment" },
  { patterns: [/queja/i, /reclam/i, /no funcion/i, /problema con/i, /no me lleg/i], intent: "complaint" },
  { patterns: [/info/i, /\bdetalles\b/i, /\bm[aá]s\s*informaci[oó]n/i, /me\s*pod[eé]is?\s*decir/i], intent: "inquiry" },
];

export type ProgrammaticResult = {
  tags: string[];               // hard tags con prefijos
  intent: string;               // greeting | enrollment | payment | complaint | inquiry | unknown
  confidence: number;           // 0..1, basado en cuántas señales matchearon
  is_short: boolean;            // texto demasiado corto para análisis profundo
  has_letters: boolean;         // texto contiene letras (descarta emoji-only)
};

export function programmaticAnalyze(text: string): ProgrammaticResult {
  const tags = new Set<string>();
  let intent = "unknown";

  const trimmed = text.trim();
  const isShort = trimmed.length < MIN_TEXT_LENGTH_FOR_AI;
  const hasLetters = /[a-záéíóúñü]/i.test(trimmed);

  // 1. Keyword scan — cada match es una "señal".
  let signalCount = 0;
  for (const { patterns, tag } of KEYWORD_TAGS) {
    if (patterns.some((p) => p.test(text))) {
      tags.add(tag);
      signalCount++;
    }
  }

  // 2. Intent scan — primer match gana.
  for (const { patterns, intent: i } of INTENT_PATTERNS) {
    if (patterns.some((p) => p.test(text))) {
      intent = i;
      tags.add(`intent:${i}`);
      signalCount++;
      break;
    }
  }

  // 3. Confidence heurística:
  //    - 3+ señales o más → 0.85+ (alta, no necesita Gemini)
  //    - 1-2 señales → 0.5-0.7 (parcial, Gemini puede ayudar)
  //    - 0 señales → 0.0 (Gemini decide o queda sin clasificar)
  let confidence = 0;
  if (signalCount >= 3) confidence = 0.9;
  else if (signalCount === 2) confidence = 0.7;
  else if (signalCount === 1) confidence = 0.5;
  // intent=greeting es alta confianza per se, aunque no haya otros tags
  if (intent === "greeting" && confidence < 0.85) confidence = 0.85;

  return {
    tags: Array.from(tags),
    intent,
    confidence,
    is_short: isShort,
    has_letters: hasLetters,
  };
}

// ─── Capa 3: Gates para Gemini ────────────────────────────────────────

export type GeminiGateInput = {
  text: string;
  programmatic: ProgrammaticResult;
};

export function shouldUseGemini(input: GeminiGateInput): { ok: boolean; reason: string } {
  if (input.programmatic.is_short) return { ok: false, reason: "text_too_short" };
  if (!input.programmatic.has_letters) return { ok: false, reason: "no_letters" };
  if (input.programmatic.intent === "greeting") return { ok: false, reason: "greeting_skip" };
  if (input.programmatic.confidence >= PROGRAMMATIC_HIGH_CONFIDENCE) {
    return { ok: false, reason: "programmatic_high_confidence" };
  }
  return { ok: true, reason: "ok" };
}

// ─── Capa 4: Merge ───────────────────────────────────────────────────

/**
 * Combina tags hard del programmatic con tags soft del Gemini.
 * Las soft llevan prefijo `ai:` para que el operador distinga.
 */
export function mergeTags(programmatic: ProgrammaticResult, gemini: ClassifyResult | null): string[] {
  const tags = new Set<string>(programmatic.tags);

  if (gemini) {
    if (gemini.category && gemini.category !== "no_clasificable" && gemini.category !== "ai_classified") {
      tags.add(`ai:${gemini.category}`);
    }
    if (gemini.vote_class) tags.add(`ai:voto_${gemini.vote_class}`);
    if (gemini.status === "invalido") tags.add("ai:invalido");
  }

  return Array.from(tags);
}

// ─── Entry point ─────────────────────────────────────────────────────

export type ClassifyTrace = {
  programmatic: ProgrammaticResult;
  gemini_used: boolean;
  gemini_skip_reason: string | null;
  gemini_result: ClassifyResult | null;
  final_tags: string[];
};

/**
 * Pipeline completo. Programmatic siempre, Gemini gateado.
 *
 * Comportamiento:
 *   - Si programmatic tiene confidence ≥ 0.85 → persiste tags hard, skip Gemini.
 *   - Si shouldUseGemini falla → persiste solo tags hard.
 *   - Si Gemini responde con confidence ≥ 0.55 → persiste tags hard + ai_classification + ai: tags.
 *   - Si Gemini responde con confidence < 0.55 → persiste solo tags hard (Gemini se descarta).
 *   - Si no hay tags útiles → no escribe nada (no contamina el perfil).
 *
 * Fire-and-forget: nunca tira. Devuelve un trace para observabilidad.
 */
export async function classifyAndTagVoterProfile(
  env: Pick<AppEnv, "geminiApiKey">,
  profileId: string,
  text: string,
): Promise<ClassifyTrace> {
  // Paso 1 — Programmatic (siempre).
  const programmatic = programmaticAnalyze(text);

  const trace: ClassifyTrace = {
    programmatic,
    gemini_used: false,
    gemini_skip_reason: null,
    gemini_result: null,
    final_tags: programmatic.tags,
  };

  // Paso 2 — Decisión de Gemini.
  const gate = shouldUseGemini({ text, programmatic });
  if (!gate.ok) {
    trace.gemini_skip_reason = gate.reason;
  } else if (!env.geminiApiKey) {
    trace.gemini_skip_reason = "no_api_key";
  } else {
    // Paso 3 — Llamada a Gemini (con cache LRU 5 min ya en classifier.ts).
    let result: ClassifyResult | null = null;
    try {
      result = await classifyWithCache(env.geminiApiKey, text);
    } catch {
      trace.gemini_skip_reason = "gemini_error";
    }
    trace.gemini_used = true;
    trace.gemini_result = result;
  }

  // Paso 4 — Merge tags + decidir si vale la pena escribir.
  const useGeminiPayload = trace.gemini_result && trace.gemini_result.confidence >= GEMINI_MIN_CONFIDENCE;
  const finalTags = mergeTags(programmatic, useGeminiPayload ? trace.gemini_result : null);
  trace.final_tags = finalTags;

  if (finalTags.length === 0) return trace; // nada que persistir

  await voterProfileRepo.setAiClassification(
    profileId,
    useGeminiPayload && trace.gemini_result
      ? {
          category: trace.gemini_result.category,
          vote_class: trace.gemini_result.vote_class,
          confidence: trace.gemini_result.confidence,
          reason: trace.gemini_result.reason,
          model: "gemini-2.5-flash-lite",
        }
      : {
          category: programmatic.intent !== "unknown" ? programmatic.intent : "",
          vote_class: "",
          confidence: programmatic.confidence,
          reason: trace.gemini_skip_reason
            ? `programmatic_only:${trace.gemini_skip_reason}`
            : "programmatic_only:high_confidence",
          model: "programmatic",
        },
    finalTags,
  );

  return trace;
}
