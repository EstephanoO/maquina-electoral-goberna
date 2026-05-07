import { sql } from "../sql.js";
import type { Template } from "./types.js";
import { mapTemplate } from "./shared.js";

/**
 * Repository de templates. CRUD básico + delete con DELETE row (no soft).
 * Las operaciones de embedding viven en `db/embeddings.ts` para mantener
 * separadas las queries de ML/semantic search.
 */

export async function listTemplates(): Promise<Template[]> {
  const rows = await sql`SELECT * FROM templates ORDER BY name`;
  return rows.map(mapTemplate);
}

export async function getTemplate(id: number): Promise<Template | undefined> {
  const rows = await sql`SELECT * FROM templates WHERE id = ${id} LIMIT 1`;
  return rows[0] ? mapTemplate(rows[0]) : undefined;
}

export async function createTemplate(input: {
  name: string;
  body: string;
  image_url?: string | null;
}): Promise<Template> {
  const rows = await sql`
    INSERT INTO templates (name, body, image_url)
    VALUES (${input.name}, ${input.body}, ${input.image_url ?? null})
    RETURNING *
  `;
  return mapTemplate(rows[0]);
}

export async function updateTemplate(
  id: number,
  input: { name?: string; body?: string; image_url?: string | null },
): Promise<Template | undefined> {
  const cur = await getTemplate(id);
  if (!cur) return undefined;
  const rows = await sql`
    UPDATE templates SET
      name      = ${input.name ?? cur.name},
      body      = ${input.body ?? cur.body},
      image_url = ${input.image_url !== undefined ? input.image_url : cur.image_url},
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ? mapTemplate(rows[0]) : undefined;
}

export async function removeTemplate(id: number): Promise<boolean> {
  const r = await sql`DELETE FROM templates WHERE id = ${id} RETURNING id`;
  return r.length > 0;
}
