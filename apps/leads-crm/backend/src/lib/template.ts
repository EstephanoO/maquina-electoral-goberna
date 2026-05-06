/**
 * Template engine for anti-spam messaging.
 *
 *  Syntax:
 *    [opt1|opt2|opt3]  → pick one at random per recipient
 *    {{var}}           → replace with context value
 *    ---               → split into multiple consecutive messages
 *
 *  Example:
 *    "[Hola|Buenas] {{nombre}}, ¿tienes 2 min?\n---\n[Avísame|Confírmame] por favor 🙏"
 *
 *  renderTemplate() returns an array of strings, one per message part.
 */

export type RenderContext = Record<string, string | number | null | undefined>;

const SPIN_RE = /\[([^\[\]]+)\]/g;      // non-nested for now (keep simple)
const VAR_RE = /\{\{\s*([\w_]+)\s*\}\}/g;

/**
 * Simple seeded RNG so the same (template, leadId) pair yields the same picks.
 * xmur3 + mulberry32.
 */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function rngFromSeed(seed: string): () => number {
  const s = xmur3(seed);
  let a = s(), b = s(), c = s(), d = s();
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    return ((t + d) >>> 0) / 4294967296;
  };
}

function pickSpin(body: string, rng: () => number): string {
  return body.replace(SPIN_RE, (_, group: string) => {
    const opts = group.split("|").map((s) => s);
    if (opts.length === 0) return "";
    return opts[Math.floor(rng() * opts.length)];
  });
}

function applyVars(body: string, ctx: RenderContext): string {
  return body.replace(VAR_RE, (_, key: string) => {
    const v = ctx[key];
    return v == null ? "" : String(v);
  });
}

/** Split raw template body into parts by `---` on its own line (or surrounded by whitespace). */
export function splitParts(body: string): string[] {
  return body
    .split(/\r?\n?\s*---\s*\r?\n?/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Render a template body for a specific recipient.
 * Returns one or more message parts. Pass a `seed` (e.g. `${leadId}:${templateHash}`)
 * so re-renders produce the same result.
 */
export function renderTemplate(body: string, ctx: RenderContext, seed?: string): string[] {
  const rng = seed ? rngFromSeed(seed) : Math.random;
  return splitParts(body).map((part) => applyVars(pickSpin(part, rng), ctx));
}

/** Quick preview: render N random variants (for the template editor UI). */
export function previewVariants(body: string, ctx: RenderContext, n = 3): string[][] {
  return Array.from({ length: n }, (_, i) => renderTemplate(body, ctx, `preview-${i}-${Math.random()}`));
}

/** Extract the list of unique variable names used in a template. */
export function extractVars(body: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = VAR_RE.exec(body)) !== null) out.add(m[1]);
  VAR_RE.lastIndex = 0;
  return [...out];
}
