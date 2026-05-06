/**
 * Data access layer backed by Postgres. All methods are async.
 */
import { sql } from "./sql.js";
import {
  deriveCountry, detectCountryFromPhone,
  DEFAULT_COUNTRY_PREFIXES, type CountryPrefix,
} from "./lib/country.js";

let _prefixCache: CountryPrefix[] = DEFAULT_COUNTRY_PREFIXES;
let _prefixLoaded = false;
async function getPrefixes(): Promise<CountryPrefix[]> {
  if (_prefixLoaded) return _prefixCache;
  const rows = await sql`SELECT value FROM settings WHERE key = 'country_prefixes'`;
  if (rows[0]?.value && Array.isArray(rows[0].value)) {
    _prefixCache = rows[0].value as CountryPrefix[];
  }
  _prefixLoaded = true;
  return _prefixCache;
}
export function invalidatePrefixCache() { _prefixLoaded = false; }

/**
 * Filtra el `pushName` de WhatsApp para decidir si lo guardamos como name del lead.
 * Devuelve el name limpio si pasa los filtros, o "" si es junk/inválido.
 *
 * Filtros:
 *   - Trim + colapsa whitespace.
 *   - Mínimo 2 chars no-whitespace.
 *   - No coincide con el phone del contacto (algunos users ponen su número como pushName).
 *   - No es solo dígitos / + + dígitos (otro número).
 *   - No es solo emojis o símbolos.
 *   - Truncado a 120 chars (límite razonable para leads.name).
 */
function sanitizeContactName(rawName: string | undefined | null, phone: string): string {
  if (!rawName) return "";
  const trimmed = rawName.replace(/\s+/g, " ").trim();
  if (trimmed.length < 2) return "";
  // Mismo phone (con o sin +): descarta.
  const digitsOfName = trimmed.replace(/\D/g, "");
  const digitsOfPhone = phone.replace(/\D/g, "");
  if (digitsOfName === digitsOfPhone) return "";
  // Solo dígitos / +dígitos = otro número, no un nombre.
  if (/^\+?\d+$/.test(trimmed)) return "";
  // Solo emojis o símbolos (sin letras).
  if (!/[a-záéíóúñü]/i.test(trimmed)) return "";
  return trimmed.slice(0, 120);
}

export type Stage = "new" | "contacted" | "interested" | "sold" | "delivered" | "follow_up" | "recontact" | "resold" | "lost";
export type Priority = "high" | "medium" | "low";

export type Lead = {
  id: number; name: string; phone: string | null; course: string | null;
  interests: string[]; level: string | null; last_purchase_year: number | null;
  stage: Stage; priority: Priority; notes: string | null; tags: string[];
  next_follow_up_at: string | null; source: string; assigned_to: string | null;
  captured_by_phone: string | null; country: string | null; email: string | null;
  total_usd_spent: number; n_purchases: number; first_purchase_at: string | null;
  buyer_tier: string | null; created_at: string; updated_at: string;
  last_contacted_at?: string | null; days_since_contact?: number | null;
  was_previously_interested?: boolean;
};
export type LeadInput = Partial<Omit<Lead, "id" | "created_at" | "updated_at">> & { name?: string; last_activity_at?: string | null; };
export type InteractionKind = "note" | "message_in" | "message_out" | "stage_change" | "lead_created";
export type Interaction = { id: number; lead_id: number; kind: InteractionKind; body: string | null; meta: Record<string, unknown> | null; by: string | null; created_at: string; };
export type Template = { id: number; name: string; body: string; image_url: string | null; category: string | null; uses_count: number; product_sku: string | null; media_kind: string | null; sequence_after: number | null; created_at: string; updated_at: string; };
export type SendStatus = "pending" | "sent" | "failed" | "cancelled";
export type Send = { id: number; lead_id: number; body: string; body_parts: string[] | null; image_url: string | null; status: SendStatus; error: string | null; assigned_to: string | null; scheduled_at: string | null; created_at: string; sent_at: string | null; };
export type Operator = { id: number; email: string; name: string; phone: string | null; role: "operator" | "admin"; };

function toISO(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

const LEAD_COLS = sql`
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

function mapLead(r: any): Lead {
  return {
    id: r.id, name: r.name ?? "Sin nombre", phone: r.phone, course: r.course,
    interests: r.interests ?? [], level: r.level, last_purchase_year: r.last_purchase_year,
    stage: r.stage, priority: r.priority ?? "medium", notes: r.notes, tags: r.tags ?? [],
    next_follow_up_at: toISO(r.next_follow_up_at), source: r.source ?? "whatsapp",
    assigned_to: r.assigned_to, captured_by_phone: r.captured_by_phone, country: r.country,
    email: r.email, total_usd_spent: Number(r.total_usd_spent) ?? 0, n_purchases: r.n_purchases ?? 0,
    first_purchase_at: toISO(r.first_purchase_at), buyer_tier: r.buyer_tier,
    created_at: toISO(r.created_at)!, updated_at: toISO(r.updated_at)!,
    last_contacted_at: toISO(r.last_contacted_at), days_since_contact: r.days_since_contact,
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
function mapInteraction(r: any): Interaction {
  return { id: r.id, lead_id: r.lead_id, kind: r.kind, body: r.body, meta: r.meta, by: r.by ?? r.by_user, created_at: toISO(r.created_at)! };
}
function mapTemplate(r: any): Template {
  return { id: r.id, name: r.name, body: r.body, image_url: r.image_url, category: r.category ?? null, uses_count: r.uses_count ?? 0, product_sku: r.product_sku ?? null, media_kind: r.media_kind ?? null, sequence_after: r.sequence_after ?? null, created_at: toISO(r.created_at)!, updated_at: toISO(r.updated_at)! };
}
function mapSend(r: any): Send {
  return { id: r.id, lead_id: r.lead_id, body: r.body, body_parts: r.body_parts, image_url: r.image_url, status: r.status, error: r.error, assigned_to: r.assigned_to, scheduled_at: toISO(r.scheduled_at), created_at: toISO(r.created_at)!, sent_at: toISO(r.sent_at) };
}

function phoneDigits(phone: string | null | undefined): string {
  return (phone ?? "").replace(/[^0-9]/g, "");
}

export const db = {
  // ===== LEADS =====
  async list(filters: {
    q?: string; stage?: string; course?: string; interest?: string;
    level?: string; year?: string; tag?: string; assigned_to?: string;
    priority?: Priority; follow_up_due?: boolean; buyer_tier?: string;
    country?: string; limit?: number; offset?: number;
  } = {}): Promise<Lead[]> {
    const q = filters.q?.toLowerCase() ?? null;
    const year = filters.year ? Number(filters.year) : null;
    const lim = Math.min(filters.limit || 5000, 10000);
    const off = filters.offset || 0;
    const rows = await sql`
      SELECT ${LEAD_COLS} FROM leads l
      WHERE (${filters.stage ?? null}::text IS NULL OR l.stage = ${filters.stage ?? null})
        AND (${filters.course ?? null}::text IS NULL OR l.course = ${filters.course ?? null})
        AND (${filters.interest ?? null}::text IS NULL OR ${filters.interest ?? null} = ANY(l.interests))
        AND (${filters.level ?? null}::text IS NULL OR l.level = ${filters.level ?? null})
        AND (${year}::int IS NULL OR l.last_purchase_year = ${year} OR extract(year from l.first_purchase_at) = ${year})
        AND (${filters.tag ?? null}::text IS NULL OR ${filters.tag ?? null} = ANY(l.tags))
        AND (${filters.assigned_to ?? null}::text IS NULL OR l.assigned_to = ${filters.assigned_to ?? null})
        AND (${filters.priority ?? null}::text IS NULL OR l.priority = ${filters.priority ?? null})
        AND (${filters.buyer_tier ?? null}::text IS NULL OR l.buyer_tier = ${filters.buyer_tier ?? null})
        AND (${filters.country ?? null}::text IS NULL OR l.country = ${filters.country ?? null})
        AND (${filters.follow_up_due ? true : null}::bool IS NULL OR (l.next_follow_up_at IS NOT NULL AND l.next_follow_up_at <= now()))
        AND (${q}::text IS NULL OR lower(l.name) LIKE '%' || ${q} || '%' OR lower(coalesce(l.phone,'')) LIKE '%' || ${q} || '%' OR lower(coalesce(l.email,'')) LIKE '%' || ${q} || '%' OR lower(coalesce(l.country,'')) LIKE '%' || ${q} || '%')
      ORDER BY l.total_usd_spent DESC NULLS LAST, l.updated_at DESC
      LIMIT ${lim} OFFSET ${off}`;
    return rows.map(mapLead);
  },

  async count(filters: { q?: string; stage?: string; buyer_tier?: string; country?: string; year?: string } = {}) {
    const q = filters.q?.toLowerCase() ?? null;
    const year = filters.year ? Number(filters.year) : null;
    const rows = await sql`
      SELECT count(*)::int as total, coalesce(sum(l.total_usd_spent),0)::numeric as revenue,
        count(*) FILTER (WHERE l.buyer_tier='vip')::int as vips,
        count(*) FILTER (WHERE l.buyer_tier='repeat')::int as repeats,
        count(*) FILTER (WHERE coalesce(l.n_purchases,0)>0)::int as buyers,
        count(*) FILTER (WHERE l.name IS NULL OR l.name='Sin nombre')::int as noname
      FROM leads l
      WHERE (${filters.stage ?? null}::text IS NULL OR l.stage = ${filters.stage ?? null})
        AND (${filters.buyer_tier ?? null}::text IS NULL OR l.buyer_tier = ${filters.buyer_tier ?? null})
        AND (${filters.country ?? null}::text IS NULL OR l.country = ${filters.country ?? null})
        AND (${year}::int IS NULL OR l.last_purchase_year = ${year} OR extract(year from l.first_purchase_at) = ${year})
        AND (${q}::text IS NULL OR lower(l.name) LIKE '%'||${q}||'%' OR lower(coalesce(l.phone,'')) LIKE '%'||${q}||'%')`;
    const countryRows = await sql`
      SELECT coalesce(l.country,'Otro') as country, count(*)::int as n FROM leads l
      WHERE (${filters.stage ?? null}::text IS NULL OR l.stage = ${filters.stage ?? null})
        AND (${filters.buyer_tier ?? null}::text IS NULL OR l.buyer_tier = ${filters.buyer_tier ?? null})
      GROUP BY coalesce(l.country,'Otro') ORDER BY n DESC`;
    const r = rows[0];
    const byCountry: Record<string,number> = {};
    for (const cr of countryRows) byCountry[cr.country] = cr.n;
    return { total: r.total, revenue: Number(r.revenue), vips: r.vips, repeats: r.repeats, buyers: r.buyers, noname: r.noname, byCountry };
  },

  async get(id: number): Promise<Lead | undefined> {
    const rows = await sql`SELECT ${LEAD_COLS} FROM leads l WHERE l.id = ${id} LIMIT 1`;
    return rows[0] ? mapLead(rows[0]) : undefined;
  },

  async findByPhone(phone: string): Promise<Lead | undefined> {
    const digits = phoneDigits(phone);
    if (!digits) return undefined;
    const rows = await sql`SELECT ${LEAD_COLS} FROM leads l WHERE regexp_replace(coalesce(l.phone,''), '[^0-9]', '', 'g') = ${digits} LIMIT 1`;
    return rows[0] ? mapLead(rows[0]) : undefined;
  },

  async create(input: LeadInput): Promise<Lead> {
    const interests = input.interests ?? (input.course ? [input.course] : []);
    const parsed = deriveCountry(input.name ?? null);
    let finalName = parsed.name || "Sin nombre";
    if (/^\+?\d[\d\s()-]{5,}$/.test(finalName)) finalName = "Sin nombre";
    if (/^\([^)]+\)$/.test(finalName.trim())) finalName = "Sin nombre";
    let finalCountry = input.country ?? parsed.country ?? null;
    if (!finalCountry && input.phone) finalCountry = detectCountryFromPhone(input.phone, await getPrefixes());
    let pd = phoneDigits(input.phone);
    if (pd.length > 15) {
      const raw = input.phone ?? "";
      const i2 = raw.indexOf("+", raw.indexOf("+") + 1);
      if (i2 > 0) { input.phone = raw.substring(raw.indexOf("+"), i2); pd = phoneDigits(input.phone); }
      else { pd = pd.slice(0, 15); input.phone = "+" + pd; }
    }
    let id: number;
    try {
      const rows = await sql`
        INSERT INTO leads (name,phone,course,interests,level,last_purchase_year,stage,priority,notes,tags,next_follow_up_at,source,assigned_to,captured_by_phone,country)
        VALUES (${finalName},${input.phone??null},${input.course??null},${interests},${input.level??null},${input.last_purchase_year??null},${(input.stage as Stage)??"new"},${(input.priority as Priority)??"medium"},${input.notes??null},${input.tags??[]},${input.next_follow_up_at??null},${input.source??"whatsapp"},${input.assigned_to??null},${input.captured_by_phone??null},${finalCountry})
        RETURNING id`;
      id = rows[0].id;
    } catch (e: any) {
      if (e?.code === "23505" && pd) {
        const existing = await sql`SELECT id FROM leads WHERE regexp_replace(phone, '[^0-9]', '', 'g') = ${pd} LIMIT 1`;
        if (existing[0]) return (await this.update(existing[0].id, input))!;
      }
      throw e;
    }
    if (input.last_activity_at) {
      const ts = new Date(input.last_activity_at);
      if (!isNaN(ts.getTime())) {
        await sql`INSERT INTO interactions (lead_id,kind,meta,by_user,created_at) VALUES (${id},'message_out',${sql.json({source:"import",backfilled:true})},${input.assigned_to??null},${ts.toISOString()})`;
      }
    }
    await sql`UPDATE leads SET updated_at = now() WHERE id = ${id}`;
    return (await this.get(id))!;
  },

  async update(id: number, input: Partial<LeadInput>): Promise<Lead | undefined> {
    const cur = await this.get(id);
    if (!cur) return undefined;
    if (input.stage && input.stage !== cur.stage) {
      await sql`INSERT INTO interactions (lead_id,kind,meta,by_user) VALUES (${id},'stage_change',${sql.json({from_stage:cur.stage,to_stage:input.stage})},${input.assigned_to??cur.assigned_to})`;
    }
    const interests = input.interests ?? cur.interests;
    const parsed = input.name ? deriveCountry(input.name) : null;
    const finalName = (parsed?.name ?? input.name) || cur.name;
    const finalCountry = input.country ?? parsed?.country ?? cur.country;
    await sql`
      UPDATE leads SET name=${finalName},phone=${input.phone??cur.phone},course=${input.course??cur.course},interests=${interests},
        level=${input.level??cur.level},last_purchase_year=${input.last_purchase_year??cur.last_purchase_year},
        stage=${(input.stage as Stage)??cur.stage},priority=${(input.priority as Priority)??cur.priority},
        notes=${input.notes!==undefined?input.notes:cur.notes},tags=${input.tags??cur.tags},
        next_follow_up_at=${input.next_follow_up_at??cur.next_follow_up_at},source=${input.source??cur.source},
        assigned_to=${input.assigned_to??cur.assigned_to},country=${finalCountry},updated_at=now()
      WHERE id = ${id}`;
    return this.get(id);
  },

  async remove(id: number): Promise<boolean> {
    const r = await sql`DELETE FROM leads WHERE id = ${id} RETURNING id`;
    if (r.length > 0) { await sql`DELETE FROM interactions WHERE lead_id = ${id}`; return true; }
    return false;
  },
  async delete(id: number) { return this.remove(id); },

  // ===== INTERACTIONS =====
  async listInteractions(leadId: number): Promise<Interaction[]> {
    const rows = await sql`SELECT * FROM interactions WHERE lead_id = ${leadId} ORDER BY created_at DESC LIMIT 200`;
    return rows.map(mapInteraction);
  },

  async addInteraction(leadId: number, input: { kind?: InteractionKind; body?: string | null; meta?: any; by?: string | null } | any): Promise<Interaction | null> {
    const lead = await this.get(leadId);
    if (!lead) return null;
    const kind = input.kind ?? "note";
    const body = input.body ?? null;
    const meta = input.meta ?? null;
    const by = input.by ?? input.by_user ?? null;
    const rows = await sql`INSERT INTO interactions (lead_id,kind,body,meta,by_user) VALUES (${leadId},${kind},${body},${sql.json(meta)},${by}) RETURNING *`;
    await sql`UPDATE leads SET updated_at = now() WHERE id = ${leadId}`;
    return mapInteraction(rows[0]);
  },

  async addInteractionsBulk(leadId: number, items: Array<{ kind: string; body?: string; meta?: any; by?: string; created_at?: string }>): Promise<{ inserted: number }> {
    let inserted = 0;
    for (const item of items) {
      const ts = item.created_at ? new Date(item.created_at) : new Date();
      await sql`INSERT INTO interactions (lead_id,kind,body,meta,by_user,created_at) VALUES (${leadId},${item.kind},${item.body??null},${sql.json(item.meta??null)},${item.by??null},${ts.toISOString()})`;
      inserted++;
    }
    await sql`UPDATE leads SET updated_at = now() WHERE id = ${leadId}`;
    return { inserted };
  },

  async recordMessage(input: { phone: string; body: string; name?: string; kind?: string; by?: string; meta?: any; assigned_to?: string }): Promise<{ lead: Lead; interaction: Interaction | null } | null> {
    // Sanitiza el nombre que viene del bot (msg.pushName de Baileys). Si el
    // user puso su propio número como pushName, o es solo emojis/símbolos,
    // o muy corto, lo descartamos. Si pasa, lo usamos como name del lead
    // tanto en el INSERT inicial como en el UPDATE si lead.name = phone.
    const cleanName = sanitizeContactName(input.name, input.phone);

    let lead = await this.findByPhone(input.phone);
    if (!lead) {
      // Auto-create. Si no hay name válido, fallback al phone (legacy behavior).
      const initialName = cleanName || input.phone;
      const rows = await sql`
        INSERT INTO leads (phone, name, country, source, assigned_to)
        VALUES (${input.phone}, ${initialName}, 'Unknown', 'crm_import', ${input.assigned_to ?? null})
        RETURNING *
      `;
      if (!rows || !rows[0]) return null;
      lead = mapLead(rows[0]);
    } else {
      // Updates oportunistas en el lead existente:
      // - assigned_to si cambió de línea (legacy behavior)
      // - name si todavía es placeholder (= phone) y llegó uno bueno (fix #5)
      const updates: string[] = [];
      if (input.assigned_to && lead.assigned_to !== input.assigned_to) {
        updates.push("assigned_to_change");
      }
      const namePlaceholder = lead.name === lead.phone || lead.name === "" || /^\+?\d{8,15}$/.test(lead.name);
      if (cleanName && namePlaceholder) {
        updates.push("name_set");
      }
      if (updates.length > 0) {
        await sql`
          UPDATE leads SET
            assigned_to = ${input.assigned_to && lead.assigned_to !== input.assigned_to ? input.assigned_to : lead.assigned_to},
            name        = ${cleanName && namePlaceholder ? cleanName : lead.name},
            updated_at  = now()
          WHERE id = ${lead.id}
        `;
        if (input.assigned_to && lead.assigned_to !== input.assigned_to) lead.assigned_to = input.assigned_to;
        if (cleanName && namePlaceholder) lead.name = cleanName;
      }
    }
    const interaction = await this.addInteraction(lead.id, { kind: input.kind ?? "message_in", body: input.body, meta: input.meta, by: input.by });
    return { lead, interaction };
  },

  // ===== TEMPLATES =====
  async listTemplates(): Promise<Template[]> {
    const rows = await sql`SELECT * FROM templates ORDER BY name`;
    return rows.map(mapTemplate);
  },
  async getTemplate(id: number): Promise<Template | undefined> {
    const rows = await sql`SELECT * FROM templates WHERE id = ${id} LIMIT 1`;
    return rows[0] ? mapTemplate(rows[0]) : undefined;
  },
  async createTemplate(input: { name: string; body: string; image_url?: string | null }): Promise<Template> {
    const rows = await sql`INSERT INTO templates (name,body,image_url) VALUES (${input.name},${input.body},${input.image_url??null}) RETURNING *`;
    return mapTemplate(rows[0]);
  },
  async updateTemplate(id: number, input: { name?: string; body?: string; image_url?: string | null }): Promise<Template | undefined> {
    const cur = await this.getTemplate(id);
    if (!cur) return undefined;
    const rows = await sql`UPDATE templates SET name=${input.name??cur.name}, body=${input.body??cur.body}, image_url=${input.image_url!==undefined?input.image_url:cur.image_url}, updated_at=now() WHERE id=${id} RETURNING *`;
    return rows[0] ? mapTemplate(rows[0]) : undefined;
  },
  async removeTemplate(id: number): Promise<boolean> {
    const r = await sql`DELETE FROM templates WHERE id = ${id} RETURNING id`;
    return r.length > 0;
  },

  // ===== SENDS =====
  async listSends(filters: any = {}): Promise<Send[]> {
    const leadId = typeof filters === "number" ? filters : null;
    const status = typeof filters === "object" ? filters.status ?? null : null;
    const assignedTo = typeof filters === "object" ? filters.assigned_to ?? null : null;
    const availableNow = typeof filters === "object" && filters.availableNow;
    const rows = await sql`
      SELECT s.*, l.name as lead_name, l.phone as lead_phone FROM sends s JOIN leads l ON l.id = s.lead_id
      WHERE (${leadId}::int IS NULL OR s.lead_id = ${leadId})
        AND (${status}::text IS NULL OR s.status = ${status})
        AND (${assignedTo}::text IS NULL OR s.assigned_to = ${assignedTo})
        AND (${availableNow ? true : null}::bool IS NULL OR (s.scheduled_at IS NULL OR s.scheduled_at <= now()))
      ORDER BY s.created_at DESC LIMIT 200`;
    return rows.map(mapSend);
  },

  async createSend(input: { lead_id: number; body: string; body_parts?: string[]; image_url?: string | null; scheduled_at?: string | null; assigned_to?: string | null }): Promise<Send> {
    const rows = await sql`INSERT INTO sends (lead_id,body,body_parts,image_url,status,scheduled_at,assigned_to) VALUES (${input.lead_id},${input.body},${input.body_parts??null},${input.image_url??null},'pending',${input.scheduled_at??null},${input.assigned_to??null}) RETURNING *`;
    return mapSend(rows[0]);
  },

  async createSendsMulti(input: { rows: Array<{ lead_id: number; body: string; body_parts: string[]; image_url?: string | null }>; assigned_to?: string; scheduled_at?: string | null }): Promise<Send[]> {
    const results: Send[] = [];
    for (const row of input.rows) {
      const s = await this.createSend({ lead_id: row.lead_id, body: row.body, body_parts: row.body_parts, image_url: row.image_url, scheduled_at: input.scheduled_at, assigned_to: input.assigned_to });
      results.push(s);
    }
    return results;
  },

  async updateSend(id: number, input: { status?: SendStatus; error?: string | null; sent_at?: string | null }): Promise<Send | undefined> {
    const cur = await sql`SELECT * FROM sends WHERE id = ${id} LIMIT 1`;
    if (cur.length === 0) return undefined;
    const current = cur[0];
    const sentAt = input.status === "sent" ? sql`COALESCE(${input.sent_at ?? null}, now())` : sql`sent_at`;
    const rows = await sql`UPDATE sends SET status=COALESCE(${input.status??null},status), error=${input.error!==undefined?input.error:sql`error`}, sent_at=${sentAt} WHERE id=${id} RETURNING *`;
    const updated = mapSend(rows[0]);
    if (input.status === "sent") {
      await sql`INSERT INTO interactions (lead_id,kind,body,meta,by_user) VALUES (${current.lead_id},'message_out',${current.body},${sql.json({via:"queue",send_id:current.id})},${current.assigned_to})`;
      await sql`UPDATE leads SET updated_at = now() WHERE id = ${current.lead_id}`;
    }
    return updated;
  },

  async cancelSend(id: number): Promise<boolean> { return !!(await this.updateSend(id, { status: "cancelled" })); },

  async pendingSends(): Promise<Send[]> {
    const rows = await sql`SELECT s.*, l.name as lead_name, l.phone as lead_phone FROM sends s JOIN leads l ON l.id=s.lead_id WHERE s.status='pending' AND (s.scheduled_at IS NULL OR s.scheduled_at<=now()) ORDER BY s.scheduled_at ASC LIMIT 100`;
    return rows.map(mapSend);
  },

  // ===== STATS =====
  async stats() {
    const [total] = await sql`SELECT COUNT(*)::int AS c FROM leads`;
    const byStage = await sql`SELECT stage, COUNT(*)::int AS c FROM leads GROUP BY stage`;
    const byCourse = await sql`SELECT course, COUNT(*)::int AS c FROM leads WHERE course IS NOT NULL GROUP BY course`;
    const byPriority = await sql`SELECT priority, COUNT(*)::int AS c FROM leads GROUP BY priority`;
    return { total: total.c, byStage: byStage.map((r:any)=>({stage:r.stage,c:r.c})), byCourse: byCourse.map((r:any)=>({course:r.course,c:r.c})), byPriority: byPriority.map((r:any)=>({priority:r.priority,c:r.c})) };
  },

  // ===== SETTINGS =====
  async getSetting<T = unknown>(key: string): Promise<T | null> {
    const rows = await sql`SELECT value FROM settings WHERE key = ${key}`;
    return rows[0] ? (rows[0].value as T) : null;
  },
  async setSetting(key: string, value: unknown): Promise<void> {
    await sql`INSERT INTO settings (key,value,updated_at) VALUES (${key},${sql.json(value as any)},now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`;
  },

  async backfillActivity(leadId: number, isoTs: string, byUser: string | null): Promise<void> {
    const t = new Date(isoTs);
    if (isNaN(t.getTime())) return;
    await sql`INSERT INTO interactions (lead_id,kind,meta,by_user,created_at) VALUES (${leadId},'message_out',${sql.json({source:"import",backfilled:true})},${byUser},${t.toISOString()})`;
  },

  // ===== OPERATORS =====
  async listOperators(): Promise<Operator[]> {
    const rows = await sql`SELECT id,email,name,phone,role FROM users ORDER BY name ASC`;
    return rows.map((r:any) => ({ id:r.id, email:r.email, name:r.name, phone:r.phone??null, role:r.role }));
  },
};

// ===== AI CLASSIFY =====
export async function classifyMessage(body: string): Promise<{ tier: string | null; interests: string[] }> {
  const text = (body ?? "").toLowerCase();
  let tier: string | null = null;
  if (/vip|premium|exclusive|elite|black|gold|platinum/i.test(text)) tier = "vip";
  else if (/ya soy cliente|ya compr|ya tengo|repit|segunda/i.test(text)) tier = "repeat";
  const interests: string[] = [];
  const kw: Record<string, string[]> = {
    "certificacion":["certificacion","certificado"], "curso":["curso","cursos"], "diplomado":["diplomado"],
    "master":["master","máster"], "posgrado":["posgrado"], "beca":["beca","becas"],
    "online":["online","virtual"], "presencial":["presencial"], "precio":["precio","costo","cuánto","cuanto"],
  };
  for (const [interest, words] of Object.entries(kw)) {
    if (words.some(w => text.includes(w))) interests.push(interest);
  }
  return { tier, interests };
}
