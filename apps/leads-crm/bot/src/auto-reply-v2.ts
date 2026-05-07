/**
 * Auto-reply v2 — usa DB-driven config (bot_instances + templates).
 *
 * Flujo:
 *   tryAutoReply({ instanceSlug, phone, body, classifiedProducts, customTags })
 *     1. Lookup instance via /config/instances (cache 60s).
 *     2. Si instance.auto_reply === false → skip.
 *     3. Cooldown 30min por phone.
 *     4. pickTemplate(...) → template object o null.
 *     5. Si match: typing simulation 2-4s, sendMessage, log a /interactions
 *        como message_out con meta.auto_reply=true.
 *
 * Kill-switch: editar bot_instances.auto_reply en /settings → next refresh
 * (≤60s) corta el envío.
 */
import { CONFIG } from "./config.js";
import { getInstanceFor, getTemplatesByCategory, type BotInstance, type Template } from "./instance-config.js";
import { pickTemplate, pickTemplateWithSemantic, applyTemplate } from "./template-picker.js";
import { detectCountry } from "./classifier.js";
import { generateReply as openaiReply, aiAvailable as openaiAvailable } from "./openai.js";
import { generateReply as geminiReply, geminiAvailable } from "./gemini.js";
import { getRecentHistory, formatHistoryForPrompt, getRelevantHistory, formatRelevantForPrompt } from "./conversation-memory.js";

/** AI provider chain: OpenAI primero (default), Gemini como fallback. */
async function aiReply(opts: { systemPrompt: string; userMessage: string }) {
  if (openaiAvailable()) {
    const r = await openaiReply(opts);
    if (r.ok) return r;
    console.warn(`[ai] openai failed: ${r.reason}${"status" in r && r.status ? ` (${r.status})` : ""}`);
  }
  if (geminiAvailable()) return geminiReply(opts);
  return { ok: false as const, reason: "no_ai_provider" };
}
function aiProviderAvailable(): boolean { return openaiAvailable() || geminiAvailable(); }

const COOLDOWN_MS = 30 * 60 * 1000;
const recentReplies = new Map<string, number>();

// ─── Detector de intents sensibles ──────────────────────────────────────
// El bot NUNCA debe responder con credenciales/contraseñas/datos personales
// del lead. Cuando detectamos uno de estos patrones escalamos a humano:
//   1. mandamos un holding al lead ("un momento, te confirmo enseguida")
//   2. avisamos al escalation_phone con el contexto
//
// Patrones intencionalmente conservadores. Falsos positivos (escala algo
// que no era sensible) son aceptables — solo demoran un par de minutos.
// Falsos negativos (responde con un password real) son catastróficos.
const SENSITIVE_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  // Pidiendo contraseñas/credenciales explícito
  { re: /\b(contrase[ñn]a|password|clave\s*(de\s*acceso|de\s*ingreso)?|credencial(es)?)\b/i, reason: "credentials" },
  // No puede ingresar / olvidó / quiere recuperar
  { re: /\b(olvid[eé]|no\s*recuerdo|recuper(ar|en?\s*mi)|restablec(er|en?\s*mi)|reset(ear)?)\b.{0,30}\b(contrase[ñn]a|password|clave|cuenta|acceso|usuario)\b/i, reason: "credentials" },
  { re: /\bno\s*(me\s*)?(deja|puedo|consigo)\s*(ingresar|entrar|acceder|loguear)/i, reason: "credentials" },
  // Acceso al campus/plataforma
  { re: /\b(acces(o|ar)|ingres(ar|o))\s*(al?\s*)?(campus|plataforma|aula|moodle|portal)\b/i, reason: "campus_access" },
  // Datos personales sensibles del lead — DNI, número de cuenta del cliente
  { re: /\b(mi\s*)?dni\s*(es|:)?\s*\d{6,9}/i, reason: "sensitive_personal_data" },
];

/** Devuelve el motivo si el body matchea un intent sensible, o null. */
export function detectSensitiveIntent(body: string): string | null {
  if (!body) return null;
  for (const { re, reason } of SENSITIVE_PATTERNS) {
    if (re.test(body)) return reason;
  }
  return null;
}

function inCooldown(phone: string): boolean {
  const last = recentReplies.get(phone);
  return last !== undefined && Date.now() - last < COOLDOWN_MS;
}

function markReplied(phone: string) {
  recentReplies.set(phone, Date.now());
  // garbage collect
  if (recentReplies.size > 5000) {
    const cutoff = Date.now() - COOLDOWN_MS * 2;
    for (const [k, v] of recentReplies.entries()) if (v < cutoff) recentReplies.delete(k);
  }
}

export type AutoReplyInput = {
  instanceSlug: string;
  ownPhone: string;
  fromPhone: string;
  body: string;
  classifiedProducts: string[];
  customTags: string[];
  leadId?: number;               // si presente, se trae conversation memory
};

export type AutoReplyMessage = {
  template_id: number;
  template_name: string;
  body: string;
  image_url?: string | null;
  document_url?: string | null;
  document_filename?: string | null;
  document_mime?: string | null;
  video_url?: string | null;
  media_kind: "text" | "image" | "video" | "document";
};

/** Si está presente, el bot debe POST a /escalations + WhatsApp al operador
 *  con esta info, además de mandar el holding al lead. */
export type Escalation = {
  reason: string;          // 'credentials' | 'sensitive_personal_data' | etc.
  notify_phone: string;    // a quién avisar (escalation_phone de la instancia)
  bot_instance_id: number; // para auditoría
};

export type AutoReplyResult =
  | { sent: false; reason: string }
  | {
      sent: true;
      // Primary message (compat with v1 caller — single image+text or text)
      template_id: number;
      template_name: string;
      body: string;
      image_url?: string | null;
      // Sequence: messages to send IN ORDER after the primary one (0..N).
      // Each is sent with a 1.5-3s delay between them.
      sequence?: AutoReplyMessage[];
      // True si el template es de tipo "holding" — significa que el bot no
      // sabe responder y está comprando tiempo. El operador debe atender.
      needs_human_attention?: boolean;
      attention_reason?: string;
      // Si presente, el caller debe notificar al operador humano además de
      // enviar el body al lead. El bot NO debe intentar responder con la
      // info real — la maneja siempre un humano.
      escalation?: Escalation;
    };

export async function decideAutoReply(input: AutoReplyInput): Promise<AutoReplyResult> {
  // 1. Find instance — by phone or slug (whichever matches)
  let instance: BotInstance | null = await getInstanceFor(input.ownPhone);
  if (!instance) instance = await getInstanceFor(input.instanceSlug);

  if (!instance) return { sent: false, reason: `no instance for ${input.instanceSlug} / ${input.ownPhone}` };
  if (!instance.enabled) return { sent: false, reason: `instance ${instance.slug} disabled` };
  if (!instance.auto_reply) return { sent: false, reason: `auto_reply OFF for ${instance.slug}` };

  // 1b. Whitelist (testing mode). Si auto_reply_whitelist está set, solo
  //     responde a esos números. Útil para probar nuevos cascades/prompts
  //     sin spammear leads reales.
  const whitelist = instance.auto_reply_whitelist ?? [];
  if (whitelist.length > 0) {
    const fromDigits = input.fromPhone.replace(/\D/g, "");
    const allowed = whitelist.some(w => w.replace(/\D/g, "") === fromDigits);
    if (!allowed) {
      return { sent: false, reason: `whitelist active — ${input.fromPhone} not allowed (${instance.slug})` };
    }
  }

  // 1c. Body mínimo. Inbounds vacíos (audio sin transcribir, reactions,
  //     sticker), o demasiado cortos ("ok", "si") no deben gatillar el
  //     cascade ni consumir el cooldown — el operador los maneja a mano.
  //     Si caen acá, podríamos terminar respondiendo con AI genérico que
  //     bloquea las queries reales que vienen después por 30min.
  if (!input.body || input.body.trim().length < 5) {
    return { sent: false, reason: `body too short (${(input.body ?? "").length} chars)` };
  }

  // 2. Cooldown check
  if (inCooldown(input.fromPhone)) {
    return { sent: false, reason: `cooldown for ${input.fromPhone}` };
  }

  // 2b. Intent sensible (credenciales/datos personales) → escalar a humano
  //     ANTES de matchear templates / learned_replies / IA. Si dejamos que
  //     el LLM o un learned_reply respondan a "olvidé mi contraseña", podría
  //     decir cualquier cosa. Mejor mandar holding + ping al operador.
  const sensitiveReason = detectSensitiveIntent(input.body);
  if (sensitiveReason) {
    const allCats = await getTemplatesByCategory();
    const holdings = allCats.get("holding") ?? [];
    const holdingBody = holdings.length > 0
      ? holdings[Math.floor(Math.random() * holdings.length)].body
      : "Un momento por favor, le confirmo enseguida con un asesor 🙏";
    const holdingTpl = holdings.length > 0
      ? holdings[Math.floor(Math.random() * holdings.length)]
      : null;
    markReplied(input.fromPhone);
    const notifyPhone = instance.escalation_phone || "+51955135507";
    return {
      sent: true,
      template_id: holdingTpl?.id ?? 0,
      template_name: holdingTpl?.name ?? `escalation:${sensitiveReason}`,
      body: holdingBody,
      image_url: null,
      needs_human_attention: true,
      attention_reason: `${sensitiveReason}: "${input.body.slice(0, 100)}"`,
      escalation: {
        reason: sensitiveReason,
        notify_phone: notifyPhone,
        bot_instance_id: instance.id,
      },
    };
  }

  // 3. Pick template — cascade rule-based + semantic fallback (~80ms latency
  //    extra solo si todas las reglas fallaron; cubre paráfrasis y mensajes
  //    que la regex no atrapa).
  const cats = await getTemplatesByCategory();
  const allTemplates = [...cats.values()].flat();
  // detectCountry from phone prefix (+51 → Perú, +52/+521 → México) — pasamos
  // a learned_replies search para que no traiga respuestas con $MXN a un PE.
  const country = detectCountry(input.fromPhone);
  const picked = await pickTemplateWithSemantic(
    { body: input.body, classifiedProducts: input.classifiedProducts, customTags: input.customTags, country },
    allTemplates
  );
  const tpl = picked?.template ?? null;
  const pickerMethod = picked?.method ?? "none";
  const pickerScore = picked?.score;
  void pickTemplate; // referenced para evitar dead-code warning, sigue exportada para tests

  // 3b. Si NO hay match con templates, intentamos Gemini primero (si la key
  //     está configurada y el proyecto tiene créditos). Si Gemini falla,
  //     caemos al holding template.
  if (!tpl) {
    if (aiProviderAvailable()) {
      const baseSystemPrompt = buildSystemPrompt(instance);
      // ── CONVERSATION MEMORY (cronológico) + RAG (semántico) ──
      // Las dos cosas en paralelo: el cronológico da continuidad de la conver-
      // sación reciente; el RAG trae menciones viejas relevantes al mensaje
      // actual ("¿cuándo empezaba el de marketing?" → mensaje de hace 2 sema-
      // nas con la fecha exacta). Total ~150ms en paralelo.
      let systemPrompt = baseSystemPrompt;
      if (input.leadId) {
        const [history, relevant] = await Promise.all([
          getRecentHistory(input.leadId, 10),
          getRelevantHistory(input.leadId, input.body, 3),
        ]);
        if (history.length > 0) {
          systemPrompt += `\n\n--- Historial reciente con este lead ---\n${formatHistoryForPrompt(history)}\n--- Fin historial ---`;
        }
        // Si hay relevantes que NO están ya en el cronológico, agregarlos.
        const recentIds = new Set(history.map(h => h.text.slice(0, 60)));
        const novel = relevant.filter(r => !recentIds.has(r.body.slice(0, 60)));
        if (novel.length > 0) {
          systemPrompt += `\n\n--- Mensajes anteriores relevantes a la consulta actual ---\n${formatRelevantForPrompt(novel)}\n--- Fin relevantes ---`;
        }
      }
      const ai = await aiReply({
        systemPrompt,
        userMessage: input.body,
      });
      if (ai.ok) {
        markReplied(input.fromPhone);
        return {
          sent: true,
          template_id: 0,
          template_name: `gemini:${ai.model}`,
          body: ai.text,
          image_url: null,
          // Aún flagear para que el operador revise lo que la IA respondió
          needs_human_attention: true,
          attention_reason: `gemini_response: "${input.body.slice(0, 80)}"`,
        };
      }
      // Gemini falló (429 sin créditos, 401 key inválida, etc) — log y caer a holding
      console.warn(`[auto-reply] gemini fallback: ${ai.reason}${ai.status ? ` (${ai.status})` : ""}`);
    }

    // Holding template (mensaje humano comprando tiempo)
    const holdings = cats.get("holding") ?? [];
    if (holdings.length === 0) return { sent: false, reason: "no template matched, no holding" };
    const holding = holdings[Math.floor(Math.random() * holdings.length)];
    markReplied(input.fromPhone);
    return {
      sent: true,
      template_id: holding.id,
      template_name: holding.name,
      body: holding.body,
      image_url: null,
      needs_human_attention: true,
      attention_reason: `bot_no_match: "${input.body.slice(0, 100)}"`,
    };
  }

  // 4. Apply variable substitution
  const curso = input.classifiedProducts[0];
  const body = applyTemplate(tpl, instance, { curso });

  // 5. Mark cooldown BEFORE sending so retries don't double-send
  markReplied(input.fromPhone);

  // 6. Build sequence: si el template es flyer y tiene product_sku con
  //    temario, agregamos el TEMARIO image como segundo mensaje (replicando
  //    el patrón de Kathy: flyer → temario).
  const sequence: AutoReplyMessage[] = [];
  if (tpl.category === "flyer" && tpl.product_sku) {
    const allTemplates = [...cats.values()].flat();
    const temario = allTemplates.find(t => t.category === "temario" && t.product_sku === tpl.product_sku);
    if (temario && temario.image_url) {
      sequence.push({
        template_id: temario.id,
        template_name: temario.name,
        body: temario.body,
        image_url: temario.image_url,
        media_kind: "image",
      });
    }
  }

  // Cuando viene de learned_reply el "template" es sintético (id negativo).
  // No persistimos ese id como template_id real — usamos 0 + learned_reply_id
  // por separado para que el log/dashboard no haga JOIN roto a templates(id).
  const isLearned = pickerMethod === "learned_reply";
  return {
    sent: true,
    template_id: isLearned ? 0 : tpl.id,
    template_name: tpl.name,
    body,
    image_url: isLearned ? null : (tpl.image_url ?? null),
    document_url: isLearned ? null : (tpl.document_url ?? null),
    document_filename: isLearned ? null : (tpl.document_filename ?? null),
    document_mime: isLearned ? null : (tpl.document_mime ?? null),
    video_url: isLearned ? null : (tpl.video_url ?? null),
    sequence: sequence.length > 0 ? sequence : undefined,
    picker_method: pickerMethod,
    picker_score: pickerScore,
    learned_reply_id: picked?.learned_reply_id,
    learned_query: picked?.learned_query,
  } as any;
}

/** Simulate human typing delay based on body length (≈ 30 chars/sec). */
export function typingDelayFor(body: string): number {
  const base = 1500;
  const perChar = 25;
  return Math.min(base + body.length * perChar, 8_000);
}

/**
 * Build el system prompt para Gemini usando el contexto de la instancia.
 * Incluye nombre del agente, productos, cuenta bancaria, y reglas de tono.
 */
function buildSystemPrompt(instance: BotInstance): string {
  const parts = [
    `Eres ${instance.agent_name || "una asesora"}, asesora cálida y profesional de Goberna Escuela. Respondes en español neutro, breve (≤ 60 palabras) y directo. Usa "usted" formal al inicio. NUNCA digas que eres un bot o que vas a derivar a un humano. Si no sabes la respuesta exacta, di "déjame revisar y te confirmo en un momento".`,
    instance.extra_prompt ?? "",
    instance.agent_signature ? `Firma: ${instance.agent_signature}` : "",
    instance.cuenta_bancaria ? `\nCuenta bancaria (compartir solo si preguntan):\n${instance.cuenta_bancaria}` : "",
    `\nNUNCA inventes precios, fechas o links. Si no estás 100% seguro, pide tiempo para revisar.`,
  ];
  return parts.filter(Boolean).join("\n");
}

/** Manual cooldown clear (for testing). */
export function clearCooldown(phone?: string) {
  if (phone) recentReplies.delete(phone);
  else recentReplies.clear();
}

// Re-export legacy symbols so wa-instance.ts imports keep working
export { CONFIG };
