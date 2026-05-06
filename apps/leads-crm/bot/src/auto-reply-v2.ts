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
import { pickTemplate, applyTemplate } from "./template-picker.js";

const COOLDOWN_MS = 30 * 60 * 1000;
const recentReplies = new Map<string, number>();

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
  instanceSlug: string;          // p4, p3, etc — used to find bot_instance
  ownPhone: string;              // bot's own phone (e.g. +51944531711)
  fromPhone: string;             // lead phone
  body: string;                  // inbound message body
  classifiedProducts: string[];
  customTags: string[];
};

export type AutoReplyMessage = {
  template_id: number;
  template_name: string;
  body: string;
  image_url?: string | null;
  media_kind: "text" | "image" | "video" | "document";
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
    };

export async function decideAutoReply(input: AutoReplyInput): Promise<AutoReplyResult> {
  // 1. Find instance — by phone or slug (whichever matches)
  let instance: BotInstance | null = await getInstanceFor(input.ownPhone);
  if (!instance) instance = await getInstanceFor(input.instanceSlug);

  if (!instance) return { sent: false, reason: `no instance for ${input.instanceSlug} / ${input.ownPhone}` };
  if (!instance.enabled) return { sent: false, reason: `instance ${instance.slug} disabled` };
  if (!instance.auto_reply) return { sent: false, reason: `auto_reply OFF for ${instance.slug}` };

  // 2. Cooldown check
  if (inCooldown(input.fromPhone)) {
    return { sent: false, reason: `cooldown for ${input.fromPhone}` };
  }

  // 3. Pick template
  const cats = await getTemplatesByCategory();
  const allTemplates = [...cats.values()].flat();
  const tpl = pickTemplate(
    { body: input.body, classifiedProducts: input.classifiedProducts, customTags: input.customTags },
    allTemplates
  );
  if (!tpl) return { sent: false, reason: "no template matched" };

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

  return {
    sent: true,
    template_id: tpl.id,
    template_name: tpl.name,
    body,
    image_url: tpl.image_url ?? null,
    sequence: sequence.length > 0 ? sequence : undefined,
  };
}

/** Simulate human typing delay based on body length (≈ 30 chars/sec). */
export function typingDelayFor(body: string): number {
  const base = 1500;
  const perChar = 25;
  return Math.min(base + body.length * perChar, 8_000);
}

/** Manual cooldown clear (for testing). */
export function clearCooldown(phone?: string) {
  if (phone) recentReplies.delete(phone);
  else recentReplies.clear();
}

// Re-export legacy symbols so wa-instance.ts imports keep working
export { CONFIG };
