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
import { LRUCache } from "lru-cache";
import { CONFIG } from "./config.js";
import { getInstanceFor, getTemplatesByCategory, type BotInstance, type Template } from "./instance-config.js";
import { pickTemplate, pickTemplateWithSemantic, applyTemplate } from "./template-picker.js";
import { detectCountry } from "./classifier.js";
import { generateReply as openaiReply, aiAvailable as openaiAvailable } from "./openai.js";
import { generateReply as geminiReply, geminiAvailable } from "./gemini.js";
import { getRecentHistory, formatHistoryForPrompt, getRelevantHistory, formatRelevantForPrompt } from "./conversation-memory.js";

/** AI provider chain: OpenAI primero (default), Gemini como fallback.
 *  Devuelve provider además de text+model para que el caller pueda registrar
 *  ai_model en meta sin parsear strings. */
type AiReplyResult =
  | { ok: true; text: string; model: string; provider: "openai" | "gemini" }
  | { ok: false; reason: string };

async function aiReply(opts: { systemPrompt: string; userMessage: string }): Promise<AiReplyResult> {
  if (openaiAvailable()) {
    const r = await openaiReply(opts);
    if (r.ok) return { ok: true, text: r.text, model: r.model, provider: "openai" };
    console.warn(`[ai] openai failed: ${r.reason}${"status" in r && r.status ? ` (${r.status})` : ""}`);
  }
  if (geminiAvailable()) {
    const r = await geminiReply(opts);
    if (r.ok) return { ok: true, text: r.text, model: r.model, provider: "gemini" };
    return { ok: false, reason: r.reason };
  }
  return { ok: false, reason: "no_ai_provider" };
}
function aiProviderAvailable(): boolean { return openaiAvailable() || geminiAvailable(); }

// Cooldown dual (Sprint 2 hotfix F4, post-mortem 2026-05-07):
//   - SHORT_COOLDOWN_MS (15s): se activa SIEMPRE tras enviar — bloquea
//     duplicados burst (ej. lead manda "es costo" 2 veces y bot responde
//     diploma_4_semanas 2 veces en 5s). Aplica también a confident matches.
//   - LONG_COOLDOWN_MS (30min): solo cuando el bot escaló a humano (holding/
//     gemini/sensitive). Mantiene la decisión del user de "responde siempre,
//     y solo cuando no podés esperás" — pero el "esperás" debe ser corto si
//     fue match confiado, largo si necesita humano de verdad.
const SHORT_COOLDOWN_MS = 15 * 1000;
const LONG_COOLDOWN_MS = 30 * 60 * 1000;
// Compatibilidad con clearCooldown() y código antiguo. El TTL del LRU es
// el más largo posible — un timestamp dado puede ser de 15s o 30min, decide
// inCooldown() según el tipo.
const recentReplies = new LRUCache<string, { until: number }>({
  max: 5000,
  ttl: LONG_COOLDOWN_MS,
});

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
  const entry = recentReplies.get(phone);
  if (!entry) return false;
  if (Date.now() < entry.until) return true;
  // Expirada — limpiar para que LRU no sirva una entrada vieja.
  recentReplies.delete(phone);
  return false;
}

/** Cooldown corto: 15s, anti-duplicados burst. Aplica a TODOS los sends. */
function markRepliedShort(phone: string) {
  recentReplies.set(phone, { until: Date.now() + SHORT_COOLDOWN_MS });
}

/** Cooldown largo: 30min, cuando bot pidió humano (holding/gemini/sensitive). */
function markRepliedLong(phone: string) {
  recentReplies.set(phone, { until: Date.now() + LONG_COOLDOWN_MS });
}

export type AutoReplyInput = {
  instanceSlug: string;
  ownPhone: string;
  fromPhone: string;
  body: string;
  classifiedProducts: string[];
  customTags: string[];
  leadId?: number;               // si presente, se trae conversation memory
  /** Stage actual del lead. Sprint 2 hotfix F1: si es 'sold' o 'delivered'
   *  el bot NO debe disparar — el operador está en proceso activo de
   *  inscripción/post-venta y el bot rompería el flujo. */
  leadStage?: string | null;
  /** ISO timestamp del último message_out manual del operador en últimos
   *  10 min, o null. Sprint 2 hotfix F2: skip si presente. */
  recentManualOutAt?: string | null;
  /** País detectado del lead (Sprint 2 hotfix F3). Pasado al system prompt
   *  + filter de learned_replies para evitar mezclar precios y cuentas. */
  leadCountry?: string | null;
  /** Cantidad de message_in/out anteriores al actual. 0 = lead nuevo.
   *  Sprint 2 hotfix F6: bot solo responde a leads nuevos por ahora — si
   *  ya hubo conversación, el operador la maneja. */
  priorMsgCount?: number;
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

/** Cómo se eligió la respuesta — para observabilidad en interactions.meta. */
export type PickerMethod =
  | "product"          // matched a flyer por palabra clave en el body
  | "tag"              // tag → category mapping
  | "learned_reply"    // pgvector match contra learned_replies
  | "regex_body"       // regex genérico (pago/precio/info/saludo)
  | "semantic"         // semantic search sobre templates
  | "ai_gemini"        // fallback Gemini
  | "ai_openai"        // fallback OpenAI
  | "holding"          // ningún match, holding de "compro tiempo"
  | "escalation"       // intent sensible → holding + ping al operador
  | "none";

export type AutoReplyResult =
  | { sent: false; reason: string }
  | {
      sent: true;
      // Primary message (compat with v1 caller — single image+text or text)
      template_id: number;
      template_name: string;
      body: string;
      image_url?: string | null;
      document_url?: string | null;
      document_filename?: string | null;
      document_mime?: string | null;
      video_url?: string | null;
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
      // ── Observabilidad (Sprint 1.3) ─────────────────────────────────
      // Estos campos se persisten en interactions.meta para poder analizar
      // cuál branch del cascade pegó cada vez. SIEMPRE presentes en `sent:true`.
      picker_method: PickerMethod;
      picker_score?: number;            // cosine sim 0..1, solo en learned_reply / semantic
      ai_model?: string;                // 'gemini:gemini-2.5-flash-lite', 'openai:gpt-4o-mini'
      learned_reply_id?: number;
      learned_query?: string;
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

  // 1d. Sprint 2 hotfix F1: skip si el lead ya está en proceso activo de
  //     inscripción/post-venta. stage='sold' = vendido, 'delivered' = curso
  //     entregado. En ambos casos hay un humano (Kathy/operador) atendiendo
  //     y un bot interrumpiendo solo confunde a todos. Caso real 2026-05-07:
  //     lead Leydi (sold) reenvió template de DATOS_REGISTRO al operador,
  //     bot lo interpretó como sensitive y mandó "voy a consultar al equipo"
  //     mientras el operador estaba completando la inscripción.
  const stage = (input.leadStage ?? "").toLowerCase();
  if (stage === "sold" || stage === "delivered") {
    return { sent: false, reason: `skip lead.stage=${stage}` };
  }

  // 1e. Sprint 2 hotfix F2: skip si hay message_out manual del operador en
  //     últimos 10 min — conversación activa, bot no debe interrumpir.
  if (input.recentManualOutAt) {
    const ageMs = Date.now() - new Date(input.recentManualOutAt).getTime();
    if (ageMs < 10 * 60 * 1000) {
      const ageMin = Math.round(ageMs / 60_000);
      return { sent: false, reason: `operator active (manual out ${ageMin}min ago)` };
    }
  }

  // 1f. Sprint 2 hotfix F6 (decisión user 2026-05-07: "que el bot por ahora
  //     solo responda a leads nuevos"). priorMsgCount = mensajes previos al
  //     actual. 0 = primer contacto. Si hay historia → operador maneja.
  //     Toggle vía env: BOT_NEW_LEADS_ONLY=false desactiva este check.
  const newLeadsOnly = (process.env.BOT_NEW_LEADS_ONLY ?? "true").toLowerCase() !== "false";
  if (newLeadsOnly && (input.priorMsgCount ?? 0) > 0) {
    return { sent: false, reason: `skip non-new lead (${input.priorMsgCount} prior msgs)` };
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
      : "Dame un momento por favor, te confirmo enseguida 🙏";
    const holdingTpl = holdings.length > 0
      ? holdings[Math.floor(Math.random() * holdings.length)]
      : null;
    // Sensitive → cooldown largo (necesita humano de verdad).
    markRepliedLong(input.fromPhone);
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
      picker_method: "escalation",
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
      const baseSystemPrompt = buildSystemPrompt(instance, input.leadCountry);
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
        // AI fallback → cooldown largo: el bot no supo, espera humano.
        markRepliedLong(input.fromPhone);
        const aiModel = `${ai.provider}:${ai.model}`;
        return {
          sent: true,
          template_id: 0,
          template_name: aiModel,
          body: ai.text,
          image_url: null,
          // Aún flagear para que el operador revise lo que la IA respondió
          needs_human_attention: true,
          attention_reason: `${ai.provider}_response: "${input.body.slice(0, 80)}"`,
          picker_method: ai.provider === "openai" ? "ai_openai" : "ai_gemini",
          ai_model: aiModel,
        };
      }
      // AI falló (429 sin créditos, 401 key inválida, breaker open, etc) — log y caer a holding
      console.warn(`[auto-reply] ai fallback: ${ai.reason}`);
    }

    // Holding template (mensaje humano comprando tiempo)
    const holdings = cats.get("holding") ?? [];
    if (holdings.length === 0) return { sent: false, reason: "no template matched, no holding" };
    const holding = holdings[Math.floor(Math.random() * holdings.length)];
    // Holding (no hubo template ni AI) → cooldown largo: necesita humano.
    markRepliedLong(input.fromPhone);
    return {
      sent: true,
      template_id: holding.id,
      template_name: holding.name,
      body: holding.body,
      image_url: null,
      needs_human_attention: true,
      attention_reason: `bot_no_match: "${input.body.slice(0, 100)}"`,
      picker_method: "holding",
    };
  }

  // 4. Apply variable substitution
  const curso = input.classifiedProducts[0];
  const body = applyTemplate(tpl, instance, { curso });

  // 5. NO cooldown para matches confiados — el bot responde siempre. Solo
  //    los paths de unconfident match (sensitive/gemini/holding) cool down.
  //    Ver comment en COOLDOWN_MS.

  // 6. Build sequence: replicar el patrón natural de Kathy donde un template
  //    arrastra otro como follow-up obligatorio.
  //    - flyer → temario (imagen del temario del producto)
  //    - pago → datos_registro (formulario de datos para que el lead complete
  //      al hacer el pago — Kathy SIEMPRE manda los dos juntos).
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
  if (tpl.category === "pago") {
    const allTemplates = [...cats.values()].flat();
    // Preferimos el template explícito kathy_datos_registro (categoría datos_registro)
    // sobre el viejo de inscripcion. Si no está, fallback al de inscripcion.
    const datos =
      allTemplates.find(t => t.category === "datos_registro") ??
      allTemplates.find(t => t.category === "inscripcion");
    if (datos) {
      sequence.push({
        template_id: datos.id,
        template_name: datos.name,
        body: applyTemplate(datos, instance, { curso }),
        image_url: null,
        media_kind: "text",
      });
    }
  }

  // Cuando viene de learned_reply el "template" es sintético (id negativo).
  // No persistimos ese id como template_id real — usamos 0 + learned_reply_id
  // por separado para que el log/dashboard no haga JOIN roto a templates(id).
  const isLearned = pickerMethod === "learned_reply";

  // Sprint 2 hotfix F4: cooldown CORTO en confident matches — bloquea
  // duplicados burst (caso real 2026-05-07: lead manda "es costo" 2x →
  // bot responde diploma_4_semanas 2x en 5s). 15s es suficiente para
  // permitir que la sequence (flyer→temario→datos) corra sin re-disparar.
  markRepliedShort(input.fromPhone);

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
    picker_method: pickerMethod as PickerMethod,
    picker_score: pickerScore,
    learned_reply_id: picked?.learned_reply_id,
    learned_query: picked?.learned_query,
  };
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
 *
 * Sprint 2 hotfix F3: si conocemos el país del lead y NO es Perú, omitimos
 * la cuenta bancaria PE (BCP en soles + Yape) e instruimos al modelo a
 * decir "dame un momento para confirmarte los métodos de pago para tu país".
 * Caso real 2026-05-07: lead MX (Juan Gabriel) pidió "Me pasa un número
 * para transferir" → bot dio cuenta BCP en soles. Casi rompe el pago.
 */
function buildSystemPrompt(instance: BotInstance, leadCountry?: string | null): string {
  // Goberna Escuela es PE. Cuenta bancaria del instance es PE-only.
  const isLeadPE = !leadCountry || leadCountry === "Perú";
  const countryNote = leadCountry && !isLeadPE
    ? `\n[CONTEXTO PAÍS] El lead es de ${leadCountry}. NUNCA compartas cuentas bancarias peruanas (BCP, Yape, Plin, soles/PEN) — son inválidas para él. Si pregunta por métodos de pago, responde "dame un momento, te confirmo los métodos de pago disponibles para ${leadCountry}".`
    : "";
  const parts = [
    `Eres ${instance.agent_name || "una asesora"}, asesora cálida y profesional de Goberna Escuela. Respondes en español neutro, breve (≤ 60 palabras) y directo. Usa "usted" formal al inicio. NUNCA digas que eres un bot o que vas a derivar a un humano. Si no sabes la respuesta exacta, di "déjame revisar y te confirmo en un momento".`,
    instance.extra_prompt ?? "",
    instance.agent_signature ? `Firma: ${instance.agent_signature}` : "",
    isLeadPE && instance.cuenta_bancaria
      ? `\nCuenta bancaria (compartir solo si preguntan):\n${instance.cuenta_bancaria}`
      : "",
    countryNote,
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
