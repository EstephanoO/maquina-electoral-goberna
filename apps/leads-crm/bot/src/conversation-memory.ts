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

// ─────────────────────────────────────────────────────────────────────
// Semantic-relevant history — distinto a getRecentHistory (cronológico).
// Recupera las K interacciones más SIMILARES al mensaje actual del lead.
//
// Caso de uso: lead pregunta "¿el de marketing cuándo empieza?" y el RAG
// trae el mensaje viejo donde le dijiste "el curso de marketing arranca el
// 15". El AI tiene contexto preciso vs. el reciente cronológico que puede
// ser irrelevante (saludos, agradecimientos).
//
// Llamado SOLO desde el path de AI generative (Gemini) — no desde el path
// de templates. En templates no aporta porque la respuesta es canned.
// ─────────────────────────────────────────────────────────────────────

export type RelevantHistoryItem = {
  interaction_id: number;
  body: string;
  ts: string;
  kind: "message_in" | "message_out" | string;
  score: number;
};

export async function getRelevantHistory(leadId: number, query: string, topK = 3): Promise<RelevantHistoryItem[]> {
  if (!query || query.length < 8) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(`${CONFIG.apiUrl}/leads/${leadId}/relevant-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, topK }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return [];
    const j: any = await r.json();
    return Array.isArray(j.history) ? j.history : [];
  } catch {
    clearTimeout(timer);
    return [];
  }
}

/** Format relevant snippets para inyectar al system prompt. */
export function formatRelevantForPrompt(items: RelevantHistoryItem[]): string {
  if (items.length === 0) return "";
  const lines = items.map(it => {
    const role = it.kind === "message_in" ? "Lead" : "Tú";
    const date = it.ts ? ` (${new Date(it.ts).toISOString().slice(0, 10)})` : "";
    return `${role}${date}: ${it.body.slice(0, 300)}`;
  });
  return lines.join("\n");
}
