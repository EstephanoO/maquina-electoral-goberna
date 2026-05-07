/**
 * OpenAI integration: respuesta natural cuando no matchea template.
 * Modelo por default: gpt-4o-mini (rápido, barato, calidad alta).
 *
 * Vars de entorno:
 *   OPENAI_API_KEY  — sk-...
 *   OPENAI_MODEL    — default "gpt-4o-mini"
 *
 * Si la key está vacía o falla, los callers deben caer al holding template.
 */
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const API_KEY = process.env.OPENAI_API_KEY || "";
const TIMEOUT_MS = 8_000;

export type AiResult =
  | { ok: true; text: string; model: string }
  | { ok: false; reason: string; status?: number };

export async function generateReply(opts: {
  systemPrompt: string;
  userMessage: string;
  history?: Array<{ role: "user" | "assistant"; text: string }>;
  maxTokens?: number;
  temperature?: number;
}): Promise<AiResult> {
  if (!API_KEY) return { ok: false, reason: "no_api_key" };

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: opts.systemPrompt },
  ];
  if (opts.history) {
    for (const h of opts.history) messages.push({ role: h.role, content: h.text });
  }
  messages.push({ role: "user", content: opts.userMessage });

  const body = {
    model: MODEL,
    messages,
    max_tokens: opts.maxTokens ?? 400,
    temperature: opts.temperature ?? 0.6,
  };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      return { ok: false, reason: j?.error?.message || `http_${r.status}`, status: r.status };
    }
    const j: any = await r.json();
    const text = j?.choices?.[0]?.message?.content?.trim();
    if (!text) return { ok: false, reason: "empty_response" };
    return { ok: true, text, model: MODEL };
  } catch (e: any) {
    clearTimeout(t);
    return { ok: false, reason: e?.message || "fetch_failed" };
  }
}

export function aiAvailable(): boolean {
  return API_KEY.length > 0;
}
