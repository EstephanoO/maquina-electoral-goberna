/**
 * Instance config: fetcha la configuración de la instancia del bot
 * (bot_instances + templates + bank_accounts) desde leads-crm-api
 * y la cachea 60s. Permite que el operador edite la config en /settings
 * sin redeploy.
 */
import { CONFIG } from "./config.js";

export type Template = {
  id: number; name: string; body: string;
  category: string; uses_count: number;
  image_url?: string | null;
  document_url?: string | null;
  document_filename?: string | null;
  document_mime?: string | null;
  video_url?: string | null;
  product_sku?: string | null;
  media_kind?: "text" | "image" | "video" | "document" | null;
  sequence_after?: number | null;
};

export type BotInstance = {
  id: number; slug: string; display_name: string;
  phone: string | null; agent_name: string;
  agent_signature: string | null;
  product_skus: string[] | null;
  cuenta_bancaria: string | null; yape_numero: string | null;
  extra_prompt: string | null; rule_ids: number[] | null;
  enabled: boolean; auto_reply: boolean;
  /** Phone que recibe notificaciones cuando el bot escala un intent
   *  sensible (credenciales, datos personales). Default +51955135507. */
  escalation_phone: string | null;
  /** Si está set (no vacío), el bot solo auto-responde a estos teléfonos.
   *  Útil para testing del cascade sin afectar leads reales. NULL/[] = all. */
  auto_reply_whitelist: string[] | null;
  notes: string | null;
};

const TTL_MS = 60_000;
let cache: { instances: BotInstance[]; templates: Template[]; ts: number } | null = null;

async function fetchAll(): Promise<{ instances: BotInstance[]; templates: Template[] }> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (CONFIG.apiToken) headers.Authorization = `Bearer ${CONFIG.apiToken}`;

  const [iRes, tRes] = await Promise.all([
    fetch(`${CONFIG.apiUrl}/config/instances`, { headers }),
    fetch(`${CONFIG.apiUrl}/templates`, { headers }),
  ]);

  const iJson = iRes.ok ? await iRes.json().catch(() => ({ instances: [] })) : { instances: [] };
  const tJson = tRes.ok ? await tRes.json().catch(() => []) : [];

  return {
    instances: (iJson.instances ?? []) as BotInstance[],
    templates: (Array.isArray(tJson) ? tJson : []) as Template[],
  };
}

async function getCached() {
  if (!cache || Date.now() - cache.ts > TTL_MS) {
    try {
      const data = await fetchAll();
      cache = { ...data, ts: Date.now() };
    } catch (e) {
      console.warn("[instance-config] fetch failed, using stale or empty cache:", (e as Error).message);
      if (!cache) cache = { instances: [], templates: [], ts: Date.now() };
    }
  }
  return cache;
}

/** Lookup instance by phone (e.g. "+51944531711") or slug ("p4"). */
export async function getInstanceFor(phoneOrSlug: string): Promise<BotInstance | null> {
  const { instances } = await getCached();
  const norm = phoneOrSlug.replace(/\D/g, "");
  return instances.find(
    (i) => i.slug === phoneOrSlug || (i.phone && i.phone.replace(/\D/g, "") === norm)
  ) ?? null;
}

export async function getTemplatesByCategory(): Promise<Map<string, Template[]>> {
  const { templates } = await getCached();
  const m = new Map<string, Template[]>();
  for (const t of templates) {
    const cat = t.category || "general";
    if (!m.has(cat)) m.set(cat, []);
    m.get(cat)!.push(t);
  }
  // Sort each category by uses_count desc so the most-used template is first
  for (const list of m.values()) list.sort((a, b) => b.uses_count - a.uses_count);
  return m;
}

export function clearCache() { cache = null; }
