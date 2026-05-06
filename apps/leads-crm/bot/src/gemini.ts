/**
 * Gemini integration: cuando no matchea template y la key está disponible,
 * generamos una respuesta natural usando contexto del prompt_override.
 *
 * Fallback chain:
 *   1. Template match (alta confianza, instant)
 *   2. Gemini con contexto del negocio (si hay key + créditos)
 *   3. Holding template (último recurso, agarra tiempo + flag attention)
 *
 * Si Gemini falla (429 / 401 / network), caemos al holding sin ruido.
 */
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const API_KEY = process.env.GEMINI_API_KEY || "";

export type GeminiResult =
  | { ok: true; text: string; model: string }
  | { ok: false; reason: string; status?: number };

const TIMEOUT_MS = 8_000;

export async function generateReply(opts: {
  systemPrompt: string;
  userMessage: string;
  history?: Array<{ role: "user" | "model"; text: string }>;
}): Promise<GeminiResult> {
  if (!API_KEY) return { ok: false, reason: "no_api_key" };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const contents: any[] = [];
  if (opts.history) {
    for (const h of opts.history) contents.push({ role: h.role, parts: [{ text: h.text }] });
  }
  contents.push({ role: "user", parts: [{ text: opts.userMessage }] });

  const payload = {
    systemInstruction: { parts: [{ text: opts.systemPrompt }] },
    contents,
    generationConfig: {
      thinkingConfig: { thinkingBudget: 0 },     // Lite/Flash: thinking off para latencia baja
      maxOutputTokens: 400,
      temperature: 0.6,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ],
  };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      return { ok: false, reason: j?.error?.message || `http_${r.status}`, status: r.status };
    }
    const j: any = await r.json();
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return { ok: false, reason: "empty_response" };
    return { ok: true, text, model: MODEL };
  } catch (e: any) {
    clearTimeout(t);
    return { ok: false, reason: e?.message || "fetch_failed" };
  }
}

export function geminiAvailable(): boolean {
  return API_KEY.length > 0;
}
