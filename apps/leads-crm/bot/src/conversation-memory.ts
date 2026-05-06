/**
 * Conversation memory: trae los últimos N mensajes (in/out) de un lead
 * y los formatea para usar como contexto en LLM prompts.
 *
 * Cache: 5min por lead (TTL corto porque mensajes nuevos llegan rápido).
 *
 * Uso típico:
 *   const history = await getRecentHistory(leadId, 10);
 *   await aiReply({ systemPrompt, userMessage, history });
 */
import { CONFIG } from "./config.js";

export type HistoryMessage = {
  role: "user" | "assistant";
  text: string;
};

const cache = new Map<number, { msgs: HistoryMessage[]; ts: number }>();
const TTL_MS = 5 * 60_000;

export async function getRecentHistory(leadId: number, limit = 10): Promise<HistoryMessage[]> {
  const cached = cache.get(leadId);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.msgs;

  try {
    const r = await fetch(`${CONFIG.apiUrl}/leads/${leadId}/interactions`);
    if (!r.ok) return [];
    const interactions: any[] = await r.json();

    // Filter solo mensajes (no notes/stage_change), order chronological,
    // tomar últimos N. Skip mensajes muy largos (> 800 chars) para no
    // explotar el context window.
    const msgs = interactions
      .filter(i => i.kind === "message_in" || i.kind === "message_out")
      .filter(i => i.body && i.body.length > 0 && i.body.length < 800)
      .slice(-limit)
      .map<HistoryMessage>(i => ({
        role: i.kind === "message_in" ? "user" : "assistant",
        text: i.body,
      }));

    cache.set(leadId, { msgs, ts: Date.now() });
    return msgs;
  } catch {
    return [];
  }
}

/** Limpia cache cuando llega un mensaje nuevo (forces refresh next call). */
export function invalidateMemory(leadId: number) {
  cache.delete(leadId);
}

/** Format history compacto para prompts (trim si > 1500 chars). */
export function formatHistoryForPrompt(msgs: HistoryMessage[]): string {
  const lines: string[] = [];
  for (const m of msgs) {
    const role = m.role === "user" ? "Lead" : "Tú (Kathy)";
    lines.push(`${role}: ${m.text}`);
  }
  let out = lines.join("\n");
  if (out.length > 1500) out = "…\n" + out.slice(-1500);
  return out;
}
