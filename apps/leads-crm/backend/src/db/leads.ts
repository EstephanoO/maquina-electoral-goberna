import { sql } from "../sql.js";
import { deriveCountry, detectCountryFromPhone } from "../lib/country.js";
import type { Lead, LeadInput, Stage, Priority } from "./types.js";
import {
  LEAD_COLS, mapLead, phoneDigits, sanitizeContactName, getPrefixes,
} from "./shared.js";
import { addInteraction } from "./interactions.js";

/**
 * Repository de leads: CRUD + recordMessage (lookup-or-create + add inbound).
 * Mantiene la lógica histórica de:
 *   - dedup por phone (regexp_replace digits-only)
 *   - country derivation desde nombre (legacy paste con país) + fallback al prefix
 *   - cap de 15 dígitos en phone (E.164)
 *   - update oportunista de assigned_to + name placeholder en cada inbound
 */

export async function list(filters: {
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
}

export async function count(filters: {
  q?: string; stage?: string; buyer_tier?: string; country?: string; year?: string;
} = {}) {
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
  const byCountry: Record<string, number> = {};
  for (const cr of countryRows) byCountry[cr.country] = cr.n;
  return {
    total: r.total, revenue: Number(r.revenue),
    vips: r.vips, repeats: r.repeats, buyers: r.buyers, noname: r.noname,
    byCountry,
  };
}

export async function get(id: number): Promise<Lead | undefined> {
  const rows = await sql`SELECT ${LEAD_COLS} FROM leads l WHERE l.id = ${id} LIMIT 1`;
  return rows[0] ? mapLead(rows[0]) : undefined;
}

export async function findByPhone(phone: string): Promise<Lead | undefined> {
  const digits = phoneDigits(phone);
  if (!digits) return undefined;
  const rows = await sql`
    SELECT ${LEAD_COLS} FROM leads l
    WHERE regexp_replace(coalesce(l.phone,''), '[^0-9]', '', 'g') = ${digits}
    LIMIT 1`;
  return rows[0] ? mapLead(rows[0]) : undefined;
}

export async function create(input: LeadInput): Promise<Lead> {
  const interests = input.interests ?? (input.course ? [input.course] : []);
  const parsed = deriveCountry(input.name ?? null);
  let finalName = parsed.name || "Sin nombre";
  if (/^\+?\d[\d\s()-]{5,}$/.test(finalName)) finalName = "Sin nombre";
  if (/^\([^)]+\)$/.test(finalName.trim())) finalName = "Sin nombre";
  let finalCountry = input.country ?? parsed.country ?? null;
  if (!finalCountry && input.phone) {
    finalCountry = detectCountryFromPhone(input.phone, await getPrefixes());
  }
  // Cap 15 dígitos (E.164). Si vinieron 2 phones concatenados con +, agarra el primero.
  let pd = phoneDigits(input.phone);
  if (pd.length > 15) {
    const raw = input.phone ?? "";
    const i2 = raw.indexOf("+", raw.indexOf("+") + 1);
    if (i2 > 0) {
      input.phone = raw.substring(raw.indexOf("+"), i2);
      pd = phoneDigits(input.phone);
    } else {
      pd = pd.slice(0, 15);
      input.phone = "+" + pd;
    }
  }

  let id: number;
  try {
    const rows = await sql`
      INSERT INTO leads (name,phone,course,interests,level,last_purchase_year,stage,priority,notes,tags,next_follow_up_at,source,assigned_to,captured_by_phone,country)
      VALUES (${finalName},${input.phone??null},${input.course??null},${interests},${input.level??null},${input.last_purchase_year??null},${(input.stage as Stage)??"new"},${(input.priority as Priority)??"medium"},${input.notes??null},${input.tags??[]},${input.next_follow_up_at??null},${input.source??"whatsapp"},${input.assigned_to??null},${input.captured_by_phone??null},${finalCountry})
      RETURNING id`;
    id = rows[0].id;
  } catch (e: any) {
    // Conflicto unique constraint: si phone ya existe, hacer update sobre el row existente.
    if (e?.code === "23505" && pd) {
      const existing = await sql`SELECT id FROM leads WHERE regexp_replace(phone, '[^0-9]', '', 'g') = ${pd} LIMIT 1`;
      if (existing[0]) return (await update(existing[0].id, input))!;
    }
    throw e;
  }

  if (input.last_activity_at) {
    const ts = new Date(input.last_activity_at);
    if (!isNaN(ts.getTime())) {
      await sql`
        INSERT INTO interactions (lead_id, kind, meta, by_user, created_at)
        VALUES (${id}, 'message_out', ${sql.json({ source: "import", backfilled: true })}, ${input.assigned_to ?? null}, ${ts.toISOString()})`;
    }
  }
  await sql`UPDATE leads SET updated_at = now() WHERE id = ${id}`;
  return (await get(id))!;
}

export async function update(id: number, input: Partial<LeadInput>): Promise<Lead | undefined> {
  const cur = await get(id);
  if (!cur) return undefined;
  if (input.stage && input.stage !== cur.stage) {
    await sql`
      INSERT INTO interactions (lead_id, kind, meta, by_user)
      VALUES (${id}, 'stage_change', ${sql.json({ from_stage: cur.stage, to_stage: input.stage })}, ${input.assigned_to ?? cur.assigned_to})`;
  }
  const interests = input.interests ?? cur.interests;
  const parsed = input.name ? deriveCountry(input.name) : null;
  const finalName = (parsed?.name ?? input.name) || cur.name;
  const finalCountry = input.country ?? parsed?.country ?? cur.country;
  await sql`
    UPDATE leads SET
      name=${finalName},phone=${input.phone??cur.phone},course=${input.course??cur.course},interests=${interests},
      level=${input.level??cur.level},last_purchase_year=${input.last_purchase_year??cur.last_purchase_year},
      stage=${(input.stage as Stage)??cur.stage},priority=${(input.priority as Priority)??cur.priority},
      notes=${input.notes!==undefined?input.notes:cur.notes},tags=${input.tags??cur.tags},
      next_follow_up_at=${input.next_follow_up_at??cur.next_follow_up_at},source=${input.source??cur.source},
      assigned_to=${input.assigned_to??cur.assigned_to},country=${finalCountry},updated_at=now()
    WHERE id = ${id}`;
  return get(id);
}

export async function remove(id: number): Promise<boolean> {
  const r = await sql`DELETE FROM leads WHERE id = ${id} RETURNING id`;
  if (r.length > 0) {
    await sql`DELETE FROM interactions WHERE lead_id = ${id}`;
    return true;
  }
  return false;
}

/** Lookup-or-create por phone + agrega inbound interaction. Sanitiza pushName.
 *  Hace updates oportunistas en el lead existente:
 *    - assigned_to si cambió de línea
 *    - name si todavía es placeholder (= phone) y llegó uno bueno */
export async function recordMessage(input: {
  phone: string; body: string; name?: string;
  kind?: string; by?: string; meta?: any; assigned_to?: string;
}): Promise<{
  lead: Lead;
  interaction: Awaited<ReturnType<typeof addInteraction>>;
  /** ISO timestamp del último message_out manual (auto_reply≠true) en los
   *  últimos 10 min, o null. Sprint 2 hotfix F2: bot debe NO interrumpir
   *  conversación activa del operador. */
  recent_manual_out_at: string | null;
} | null> {
  const cleanName = sanitizeContactName(input.name, input.phone);

  let lead = await findByPhone(input.phone);
  if (!lead) {
    const initialName = cleanName || input.phone;
    const rows = await sql`
      INSERT INTO leads (phone, name, country, source, assigned_to)
      VALUES (${input.phone}, ${initialName}, 'Unknown', 'crm_import', ${input.assigned_to ?? null})
      RETURNING *
    `;
    if (!rows || !rows[0]) return null;
    lead = mapLead(rows[0]);
  } else {
    const namePlaceholder = lead.name === lead.phone || lead.name === "" || /^\+?\d{8,15}$/.test(lead.name);
    const shouldUpdateAssigned = !!input.assigned_to && lead.assigned_to !== input.assigned_to;
    const shouldUpdateName = !!cleanName && namePlaceholder;

    if (shouldUpdateAssigned || shouldUpdateName) {
      const newAssigned = shouldUpdateAssigned ? input.assigned_to! : lead.assigned_to;
      const newName = shouldUpdateName ? cleanName : lead.name;
      await sql`
        UPDATE leads SET
          assigned_to = ${newAssigned},
          name        = ${newName},
          updated_at  = now()
        WHERE id = ${lead.id}
      `;
      if (shouldUpdateAssigned) lead.assigned_to = input.assigned_to!;
      if (shouldUpdateName) lead.name = cleanName;
    }
  }

  const interaction = await addInteraction(lead.id, {
    kind: input.kind ?? "message_in",
    body: input.body,
    meta: input.meta,
    by: input.by,
  });

  // Sprint 2 hotfix F2: timestamp del último message_out MANUAL (no del bot)
  // en últimos 10 min. Si está presente, el bot debe skipear auto-reply
  // — está activa una conversación con operador y no queremos interrumpirla.
  const recentRows = await sql<Array<{ ts: string }>>`
    SELECT created_at AS ts
      FROM interactions
     WHERE lead_id = ${lead.id}
       AND kind = 'message_out'
       AND COALESCE((meta->>'auto_reply')::bool, false) = false
       AND created_at > now() - interval '10 minutes'
     ORDER BY created_at DESC
     LIMIT 1
  `;
  const recent_manual_out_at = recentRows[0]?.ts ?? null;

  return { lead, interaction, recent_manual_out_at };
}
