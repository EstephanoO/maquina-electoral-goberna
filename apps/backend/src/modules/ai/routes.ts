import type { FastifyPluginAsync } from "fastify";
import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import { classifySchema, spamCheckSchema } from "./schemas";

// ═══════════════════════════════════════════════════════════════════════
// AI MODULE — Gemini 2.5 Flash Lite proxy for message classification
// Token-saving strategy:
//   - Extension regex classifies first (free). Only ambiguous cases reach here.
//   - In-memory LRU cache (5 min TTL, max 500 entries) deduplicates similar messages.
//   - System prompt is ~200 tokens, response ~50 tokens. ~300 tokens/call.
//   - Rate limited per-user to prevent runaway costs.
// ═══════════════════════════════════════════════════════════════════════

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ── LRU Cache ────────────────────────────────────────────────────────
const CACHE_MAX = 500;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type CacheEntry = { result: ClassifyResult; ts: number };
const classifyCache = new Map<string, CacheEntry>();

function cacheKey(text: string): string {
  // Normalize: lowercase, strip whitespace runs, truncate to 300 chars
  return text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 300);
}

function getCached(key: string): ClassifyResult | null {
  const entry = classifyCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    classifyCache.delete(key);
    return null;
  }
  return entry.result;
}

function setCache(key: string, result: ClassifyResult): void {
  if (classifyCache.size >= CACHE_MAX) {
    // Evict oldest
    const oldest = classifyCache.keys().next().value;
    if (oldest !== undefined) classifyCache.delete(oldest);
  }
  classifyCache.set(key, { result, ts: Date.now() });
}

// ── Types ────────────────────────────────────────────────────────────
type ClassifyResult = {
  vote_class: string;
  status: string;
  confidence: number;
  category: string;
  reason: string;
};

// ── System prompt — compact, focused, minimal tokens ─────────────────
const SYSTEM_PROMPT = `Eres un clasificador de mensajes de WhatsApp para campañas políticas en Perú.
Clasifica el mensaje del votante en EXACTAMENTE una categoría.

Categorías (vote_class / status):
- duro/respondido: apoyo genuino, militantes, coordinadores, voluntarios organizados, sector salud apoyando, piden material de campaña para repartir
- blando/respondido: apoyo condicionado a obras, deportes, infraestructura
- flotante/respondido: consultas, indecisos, interés sin compromiso
- invalido: piden dinero/Yape/trabajo/publicidad pagada, spam

Responde SOLO JSON (sin markdown):
{"vote_class":"duro|blando|flotante","status":"respondido|invalido","confidence":0.0-1.0,"category":"keyword_corto","reason":"1 frase"}

Si no puedes clasificar con confianza >0.5, responde:
{"vote_class":"","status":"","confidence":0,"category":"no_clasificable","reason":"contexto insuficiente"}`;

// ── Gemini API call ──────────────────────────────────────────────────
async function callGemini(
  apiKey: string,
  text: string,
  conversationContext?: string,
): Promise<ClassifyResult | null> {
  const userMessage = conversationContext
    ? `Contexto de conversación reciente:\n${conversationContext}\n\nMensaje a clasificar:\n${text}`
    : `Mensaje a clasificar:\n${text}`;

  const body = {
    contents: [
      { role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\n" + userMessage }] },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 150,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000), // 8s timeout
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = await res.json();
  const rawText =
    json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  if (!rawText) return null;

  try {
    const parsed = JSON.parse(rawText);
    // Validate shape
    if (typeof parsed.confidence !== "number") parsed.confidence = 0;
    if (!parsed.vote_class) parsed.vote_class = "";
    if (!parsed.status) parsed.status = "";
    if (!parsed.category) parsed.category = "ai_classified";
    if (!parsed.reason) parsed.reason = "";
    parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));
    return parsed as ClassifyResult;
  } catch {
    // Gemini returned non-JSON despite responseMimeType
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════

export function buildAiRoutes(env: AppEnv): FastifyPluginAsync {
  return async function aiRoutes(app) {
    if (!env.geminiApiKey) {
      app.log.warn("GEMINI_API_KEY not set — AI classification endpoints disabled");
    }

    // ── POST /api/ai/classify ──────────────────────────────────────
    // Extension calls this when regex is ambiguous (confidence < 0.85 or null).
    // Returns Gemini classification with caching.
    app.post(
      "/api/ai/classify",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["admin", "candidato", "consultor", "agente_digital"] }),
        ],
        config: {
          rateLimit: {
            max: 60,       // 60 calls per minute per user
            timeWindow: 60000,
            keyGenerator: (req: AuthenticatedRequest) => `ai:${req.userId ?? req.ip}`,
          },
        },
      },
      async (request, reply) => {
        const requestId = String(request.id);

        if (!env.geminiApiKey) {
          return reply.code(503).send(
            errorPayload(requestId, "UPSTREAM_ERROR", "AI classification not configured"),
          );
        }

        const parsed = classifySchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send(
            errorPayload(requestId, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "invalid body"),
          );
        }

        const { text, conversation_context } = parsed.data;
        const key = cacheKey(text);

        // Check cache first
        const cached = getCached(key);
        if (cached) {
          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            classification: cached,
            cached: true,
          });
        }

        try {
          const result = await callGemini(env.geminiApiKey, text, conversation_context);

          if (!result) {
            return reply.code(200).send({
              ok: true,
              request_id: requestId,
              classification: null,
              reason: "gemini_no_result",
            });
          }

          // Cache the result
          setCache(key, result);

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            classification: result,
            cached: false,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "unknown";
          request.log.error({ err, requestId }, "Gemini classify error");
          return reply.code(502).send(
            errorPayload(requestId, "UPSTREAM_ERROR", `AI classification failed: ${msg.slice(0, 100)}`),
          );
        }
      },
    );

    // ── POST /api/ai/spam-check ────────────────────────────────────
    // Extension sends recent outgoing messages for spam pattern detection.
    // Runs locally in-process (no Gemini call) — fast and free.
    app.post(
      "/api/ai/spam-check",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["admin", "candidato", "consultor", "agente_digital"] }),
        ],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const parsed = spamCheckSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send(
            errorPayload(requestId, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "invalid body"),
          );
        }

        const { messages, own_number } = parsed.data;
        const analysis = analyzeSpamPatterns(messages);

        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          own_number,
          ...analysis,
        });
      },
    );
  };
}

// ═══════════════════════════════════════════════════════════════════════
// SPAM PATTERN ANALYZER — server-side validation of outgoing messages
// Detects repetition, velocity spikes, and template abuse that could
// trigger WhatsApp anti-spam and get the number banned.
// ═══════════════════════════════════════════════════════════════════════

type SpamMessage = { text: string; timestamp: number; to_phone?: string };

type SpamAnalysis = {
  risk_level: "low" | "medium" | "high" | "critical";
  risk_score: number;          // 0-100
  warnings: string[];
  recommendations: string[];
  metrics: {
    total_messages: number;
    unique_recipients: number;
    unique_texts: number;
    repetition_rate: number;   // 0-1
    velocity_per_minute: number;
    max_burst_per_minute: number;
    avg_interval_sec: number;
  };
};

function analyzeSpamPatterns(messages: SpamMessage[]): SpamAnalysis {
  const warnings: string[] = [];
  const recommendations: string[] = [];
  let riskScore = 0;

  if (messages.length < 2) {
    return {
      risk_level: "low",
      risk_score: 0,
      warnings: [],
      recommendations: [],
      metrics: {
        total_messages: messages.length,
        unique_recipients: new Set(messages.map((m) => m.to_phone).filter(Boolean)).size,
        unique_texts: new Set(messages.map((m) => m.text.toLowerCase().trim())).size,
        repetition_rate: 0,
        velocity_per_minute: 0,
        max_burst_per_minute: 0,
        avg_interval_sec: 0,
      },
    };
  }

  // ── Normalize texts for comparison ──────────────────────────────
  const normalizedTexts = messages.map((m) =>
    m.text.toLowerCase().replace(/\s+/g, " ").trim(),
  );
  const uniqueTexts = new Set(normalizedTexts);
  const uniqueRecipients = new Set(messages.map((m) => m.to_phone).filter(Boolean));

  // ── Repetition rate ─────────────────────────────────────────────
  const repetitionRate = 1 - uniqueTexts.size / messages.length;

  if (repetitionRate > 0.8) {
    riskScore += 40;
    warnings.push(`Repetición extrema: ${Math.round(repetitionRate * 100)}% mensajes idénticos`);
    recommendations.push("Varía el contenido de los mensajes. WhatsApp detecta copiar-pegar masivo.");
  } else if (repetitionRate > 0.5) {
    riskScore += 20;
    warnings.push(`Repetición alta: ${Math.round(repetitionRate * 100)}% mensajes similares`);
    recommendations.push("Intenta personalizar los mensajes con el nombre del contacto.");
  } else if (repetitionRate > 0.3) {
    riskScore += 10;
  }

  // ── Velocity (messages per minute) ──────────────────────────────
  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const timeSpanMs = (last.timestamp - first.timestamp) * 1000;
  const timeSpanMin = Math.max(timeSpanMs / 60000, 1);
  const velocityPerMin = messages.length / timeSpanMin;

  // Burst detection: sliding 60s window
  let maxBurst = 0;
  for (let i = 0; i < sorted.length; i++) {
    let count = 0;
    const base = sorted[i]!;
    for (let j = i; j < sorted.length; j++) {
      if (sorted[j]!.timestamp - base.timestamp <= 60) {
        count++;
      } else break;
    }
    if (count > maxBurst) maxBurst = count;
  }

  if (maxBurst > 30) {
    riskScore += 35;
    warnings.push(`Ráfaga peligrosa: ${maxBurst} mensajes en 1 minuto`);
    recommendations.push("DETENER envíos. Máximo 20-25 mensajes por minuto para evitar bloqueo.");
  } else if (maxBurst > 20) {
    riskScore += 20;
    warnings.push(`Velocidad alta: ${maxBurst} mensajes en 1 minuto`);
    recommendations.push("Reducir velocidad a ~15 mensajes por minuto.");
  } else if (maxBurst > 15) {
    riskScore += 10;
    warnings.push(`Velocidad moderada: ${maxBurst} msg/min`);
  }

  // ── Average interval between messages ───────────────────────────
  let totalInterval = 0;
  for (let i = 1; i < sorted.length; i++) {
    totalInterval += sorted[i]!.timestamp - sorted[i - 1]!.timestamp;
  }
  const avgIntervalSec = sorted.length > 1 ? totalInterval / (sorted.length - 1) : 0;

  if (avgIntervalSec < 2 && messages.length > 5) {
    riskScore += 15;
    warnings.push(`Intervalo promedio muy bajo: ${avgIntervalSec.toFixed(1)}s entre mensajes`);
    recommendations.push("Esperar al menos 3-5 segundos entre mensajes.");
  }

  // ── Same text to many different recipients ──────────────────────
  const textToRecipients = new Map<string, Set<string>>();
  for (let i = 0; i < messages.length; i++) {
    const t = normalizedTexts[i] ?? "";
    const r = messages[i]?.to_phone;
    if (!r) continue;
    let set = textToRecipients.get(t);
    if (!set) {
      set = new Set();
      textToRecipients.set(t, set);
    }
    set.add(r);
  }

  let maxSameTextRecipients = 0;
  for (const [, recipients] of textToRecipients) {
    if (recipients.size > maxSameTextRecipients) {
      maxSameTextRecipients = recipients.size;
    }
  }

  if (maxSameTextRecipients > 20) {
    riskScore += 25;
    warnings.push(`Mismo mensaje enviado a ${maxSameTextRecipients} contactos diferentes`);
    recommendations.push("WhatsApp penaliza mensajes idénticos a muchos contactos. Personalizar cada mensaje.");
  } else if (maxSameTextRecipients > 10) {
    riskScore += 15;
    warnings.push(`Mismo mensaje a ${maxSameTextRecipients} contactos`);
  }

  // ── Determine risk level ────────────────────────────────────────
  riskScore = Math.min(100, riskScore);
  const risk_level: SpamAnalysis["risk_level"] =
    riskScore >= 70 ? "critical" :
    riskScore >= 45 ? "high" :
    riskScore >= 25 ? "medium" : "low";

  if (risk_level === "critical") {
    recommendations.unshift("⚠️ RIESGO CRÍTICO DE BLOQUEO. Detener envíos inmediatamente y esperar 30 minutos.");
  }

  return {
    risk_level,
    risk_score: riskScore,
    warnings,
    recommendations,
    metrics: {
      total_messages: messages.length,
      unique_recipients: uniqueRecipients.size,
      unique_texts: uniqueTexts.size,
      repetition_rate: Math.round(repetitionRate * 100) / 100,
      velocity_per_minute: Math.round(velocityPerMin * 10) / 10,
      max_burst_per_minute: maxBurst,
      avg_interval_sec: Math.round(avgIntervalSec * 10) / 10,
    },
  };
}
