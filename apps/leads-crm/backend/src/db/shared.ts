/**
 * Helpers compartidos entre los repositories del módulo db: mappers (row → domain),
 * SQL fragments reutilizables, sanitización de inputs y cache del catálogo de
 * country prefixes.
 */
import { sql } from "../sql.js";
import {
  DEFAULT_COUNTRY_PREFIXES, type CountryPrefix,
} from "../lib/country.js";
import type { Lead, Interaction, Template, Send } from "./types.js";

// ─── Country prefixes cache ──────────────────────────────────────────
// Cargado al primer uso desde settings.country_prefixes — invalidado por el
// PUT /settings/country_prefixes para que el cambio tome efecto sin restart.
let _prefixCache: CountryPrefix[] = DEFAULT_COUNTRY_PREFIXES;
let _prefixLoaded = false;

export async function getPrefixes(): Promise<CountryPrefix[]> {
  if (_prefixLoaded) return _prefixCache;
  const rows = await sql`SELECT value FROM settings WHERE key = 'country_prefixes'`;
  if (rows[0]?.value && Array.isArray(rows[0].value)) {
    _prefixCache = rows[0].value as CountryPrefix[];
  }
  _prefixLoaded = true;
  return _prefixCache;
}

export function invalidatePrefixCache(): void {
  _prefixLoaded = false;
}

// ─── Sanitization helpers ────────────────────────────────────────────

/**
 * Filtra el `pushName` de WhatsApp para decidir si lo guardamos como name del lead.
 * Devuelve el name limpio si pasa los filtros, o "" si es junk/inválido.
 *
 * Filtros:
 *   - Trim + colapsa whitespace.
 *   - Mínimo 2 chars no-whitespace.
 *   - No coincide con el phone del contacto (algunos users ponen su número como pushName).
 *   - No es solo dígitos / +dígitos (otro número, no un nombre).
 *   - No es solo emojis o símbolos (sin letras).
 *   - Truncado a 120 chars (límite razonable para leads.name).
 */
export function sanitizeContactName(rawName: string | undefined | null, phone: string): string {
  if (!rawName) return "";
  const trimmed = rawName.replace(/\s+/g, " ").trim();
  if (trimmed.length < 2) return "";
  const digitsOfName = trimmed.replace(/\D/g, "");
  const digitsOfPhone = phone.replace(/\D/g, "");
  if (digitsOfName === digitsOfPhone) return "";
  if (/^\+?\d+$/.test(trimmed)) return "";
  if (!/[a-záéíóúñü]/i.test(trimmed)) return "";
  return trimmed.slice(0, 120);
}

export function phoneDigits(phone: string | null | undefined): string {
  return (phone ?? "").replace(/[^0-9]/g, "");
}

export function toISO(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

// ─── Reusable SQL fragments ──────────────────────────────────────────

/** Columnas estándar para SELECT * FROM leads + derivedas (last_contacted_at, etc.). */
export const LEAD_COLS = sql`
  l.id, l.name, l.phone, l.course, l.interests, l.level, l.last_purchase_year,
  l.stage, l.priority, l.notes, l.tags, l.next_follow_up_at, l.source, l.assigned_to,
  l.captured_by_phone, l.country, l.email, l.total_usd_spent, l.n_purchases,
  l.first_purchase_at, l.buyer_tier, l.created_at, l.updated_at,
  l.dni, l.ocupacion, l.fecha_nacimiento, l.last_course,
  l.enrollments_count, l.certificates_count, l.escuela_client_id,
  l.is_group, l.group_subject, l.last_chat_kind,
  l.needs_human_attention, l.attention_reason, l.attention_at,
  (SELECT created_at FROM interactions WHERE lead_id = l.id AND kind = 'message_in' ORDER BY created_at DESC LIMIT 1) as last_contacted_at,
  EXTRACT(DAY FROM now() - (SELECT created_at FROM interactions WHERE lead_id = l.id AND kind = 'message_in' ORDER BY created_at DESC LIMIT 1)) as days_since_contact,
  exists(SELECT 1 FROM interactions WHERE lead_id = l.id AND kind = 'stage_change' AND (meta->>'from_stage')::text = 'interested') as was_previously_interested
`;

// ─── Row → Domain mappers ────────────────────────────────────────────

export function mapLead(r: any): Lead {
  return {
    id: r.id,
    name: r.name ?? "Sin nombre",
    phone: r.phone,
    course: r.course,
    interests: r.interests ?? [],
    level: r.level,
    last_purchase_year: r.last_purchase_year,
    stage: r.stage,
    priority: r.priority ?? "medium",
    notes: r.notes,
    tags: r.tags ?? [],
    next_follow_up_at: toISO(r.next_follow_up_at),
    source: r.source ?? "whatsapp",
    assigned_to: r.assigned_to,
    captured_by_phone: r.captured_by_phone,
    country: r.country,
    email: r.email,
    total_usd_spent: Number(r.total_usd_spent) ?? 0,
    n_purchases: r.n_purchases ?? 0,
    first_purchase_at: toISO(r.first_purchase_at),
    buyer_tier: r.buyer_tier,
    created_at: toISO(r.created_at)!,
    updated_at: toISO(r.updated_at)!,
    last_contacted_at: toISO(r.last_contacted_at),
    days_since_contact: r.days_since_contact,
    was_previously_interested: r.was_previously_interested,
    // Escuela ERP enrichment
    dni: r.dni ?? null,
    ocupacion: r.ocupacion ?? null,
    fecha_nacimiento: toISO(r.fecha_nacimiento),
    last_course: r.last_course ?? null,
    enrollments_count: r.enrollments_count ?? 0,
    certificates_count: r.certificates_count ?? 0,
    escuela_client_id: r.escuela_client_id ?? null,
    // Chat meta
    is_group: r.is_group ?? false,
    group_subject: r.group_subject ?? null,
    last_chat_kind: r.last_chat_kind ?? null,
    // Atención humana
    needs_human_attention: r.needs_human_attention ?? false,
    attention_reason: r.attention_reason ?? null,
    attention_at: toISO(r.attention_at),
  } as any;
}

export function mapInteraction(r: any): Interaction {
  return {
    id: r.id,
    lead_id: r.lead_id,
    kind: r.kind,
    body: r.body,
    meta: r.meta,
    by: r.by ?? r.by_user,
    created_at: toISO(r.created_at)!,
  };
}

export function mapTemplate(r: any): Template {
  return {
    id: r.id,
    name: r.name,
    body: r.body,
    image_url: r.image_url,
    category: r.category ?? null,
    uses_count: r.uses_count ?? 0,
    product_sku: r.product_sku ?? null,
    media_kind: r.media_kind ?? null,
    sequence_after: r.sequence_after ?? null,
    document_url: r.document_url ?? null,
    document_filename: r.document_filename ?? null,
    document_mime: r.document_mime ?? null,
    video_url: r.video_url ?? null,
    created_at: toISO(r.created_at)!,
    updated_at: toISO(r.updated_at)!,
  };
}

export function mapSend(r: any): Send {
  return {
    id: r.id,
    lead_id: r.lead_id,
    body: r.body,
    body_parts: r.body_parts,
    image_url: r.image_url,
    status: r.status,
    error: r.error,
    assigned_to: r.assigned_to,
    scheduled_at: toISO(r.scheduled_at),
    created_at: toISO(r.created_at)!,
    sent_at: toISO(r.sent_at),
  };
}
