/**
 * Construye SQL dinámico desde un JSONB segment_filter para campaigns.
 * Las claves soportadas:
 *   buyer_tier:        string | { in: string[] }
 *   stage:             string | { in: string[] }
 *   country:           string
 *   n_purchases:       number | { gte / lte / eq }
 *   last_purchase_year:number | { gte / lte }
 *   days_since_contact:{ gte / lte }
 *   days_since_purchase:{ lte }
 *   tags:              { contains: string }
 *   has_phone:         true (implícito; siempre incluido)
 *   escuela_client_id_not_null: true
 *
 * Devuelve { where, params } para `sql.unsafe(... WHERE ${where}, params)`.
 */
export function buildSegmentSQL(filter: any): { where: string; params: any[] } {
  const conds: string[] = ["l.phone IS NOT NULL"];
  const params: any[] = [];
  const f = filter || {};

  function add(cond: string, ...p: any[]) {
    conds.push(cond);
    params.push(...p);
  }

  if (f.buyer_tier) {
    if (typeof f.buyer_tier === "string") add(`l.buyer_tier = $${params.length + 1}`, f.buyer_tier);
    else if (f.buyer_tier.in) add(`l.buyer_tier = ANY($${params.length + 1}::text[])`, f.buyer_tier.in);
  }
  if (f.stage) {
    if (typeof f.stage === "string") add(`l.stage = $${params.length + 1}`, f.stage);
    else if (f.stage.in) add(`l.stage = ANY($${params.length + 1}::text[])`, f.stage.in);
  }
  if (f.country) add(`l.country = $${params.length + 1}`, f.country);
  if (f.escuela_client_id_not_null) conds.push("l.escuela_client_id IS NOT NULL");

  if (f.n_purchases !== undefined) {
    if (typeof f.n_purchases === "number") add(`l.n_purchases = $${params.length + 1}`, f.n_purchases);
    else {
      if (f.n_purchases.gte !== undefined) add(`l.n_purchases >= $${params.length + 1}`, f.n_purchases.gte);
      if (f.n_purchases.lte !== undefined) add(`l.n_purchases <= $${params.length + 1}`, f.n_purchases.lte);
    }
  }

  if (f.last_purchase_year) {
    if (typeof f.last_purchase_year === "number") {
      add(`l.last_purchase_year = $${params.length + 1}`, f.last_purchase_year);
    } else {
      if (f.last_purchase_year.gte !== undefined) add(`l.last_purchase_year >= $${params.length + 1}`, f.last_purchase_year.gte);
      if (f.last_purchase_year.lte !== undefined) add(`l.last_purchase_year <= $${params.length + 1}`, f.last_purchase_year.lte);
    }
  }

  if (f.days_since_contact) {
    const d = f.days_since_contact;
    if (d.gte !== undefined) {
      add(
        `(SELECT MAX(created_at) FROM interactions WHERE lead_id = l.id AND kind = 'message_in') < now() - ($${params.length + 1} || ' days')::interval`,
        String(d.gte),
      );
    }
    if (d.lte !== undefined) {
      add(
        `(SELECT MAX(created_at) FROM interactions WHERE lead_id = l.id AND kind = 'message_in') > now() - ($${params.length + 1} || ' days')::interval`,
        String(d.lte),
      );
    }
  }

  if (f.days_since_purchase?.lte !== undefined) {
    add(
      `l.first_purchase_at > now() - ($${params.length + 1} || ' days')::interval`,
      String(f.days_since_purchase.lte),
    );
  }

  if (f.tags?.contains) add(`$${params.length + 1} = ANY(l.tags)`, f.tags.contains);

  return { where: conds.join(" AND "), params };
}
