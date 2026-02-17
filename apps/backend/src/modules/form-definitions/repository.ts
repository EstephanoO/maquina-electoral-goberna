import { pool } from "../../db";

// ── Row types ───────────────────────────────────────────────────────

export type FormDefinitionRow = {
  id: string;
  campaign_id: string;
  name: string;
  slug: string;
  description: string | null;
  schema: Record<string, unknown>;
  status: "draft" | "active" | "archived";
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  // Joined fields
  campaign_name?: string;
  campaign_slug?: string;
  created_by_name?: string;
};

// ── Queries ─────────────────────────────────────────────────────────

const SELECT_WITH_JOINS = `
  SELECT
    fd.id, fd.campaign_id, fd.name, fd.slug, fd.description,
    fd.schema, fd.status, fd.created_by, fd.created_at, fd.updated_at,
    c.name AS campaign_name,
    c.slug AS campaign_slug,
    u.full_name AS created_by_name
  FROM form_definitions fd
  JOIN campaigns c ON c.id = fd.campaign_id
  LEFT JOIN users u ON u.id = fd.created_by
`;

export async function findById(id: string): Promise<FormDefinitionRow | null> {
  const { rows } = await pool.query<FormDefinitionRow>(
    `${SELECT_WITH_JOINS} WHERE fd.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findByCampaignId(campaignId: string): Promise<FormDefinitionRow[]> {
  const { rows } = await pool.query<FormDefinitionRow>(
    `${SELECT_WITH_JOINS}
     WHERE fd.campaign_id = $1 AND fd.status = 'active'
     ORDER BY fd.name ASC`,
    [campaignId],
  );
  return rows;
}

export async function findAll(): Promise<FormDefinitionRow[]> {
  const { rows } = await pool.query<FormDefinitionRow>(
    `${SELECT_WITH_JOINS}
     ORDER BY fd.created_at DESC`,
  );
  return rows;
}

export async function findByCampaignAndSlug(
  campaignId: string,
  slug: string,
): Promise<FormDefinitionRow | null> {
  const { rows } = await pool.query<FormDefinitionRow>(
    `${SELECT_WITH_JOINS}
     WHERE fd.campaign_id = $1 AND fd.slug = $2 AND fd.status = 'active'`,
    [campaignId, slug],
  );
  return rows[0] ?? null;
}

export async function create(
  campaignId: string,
  name: string,
  slug: string,
  description: string | null,
  schema: Record<string, unknown>,
  createdBy: string,
): Promise<FormDefinitionRow> {
  const { rows } = await pool.query<FormDefinitionRow>(
    `INSERT INTO form_definitions (campaign_id, name, slug, description, schema, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, campaign_id, name, slug, description, schema, status, created_by, created_at, updated_at`,
    [campaignId, name, slug, description, JSON.stringify(schema), createdBy],
  );
  return rows[0]!;
}

export async function update(
  id: string,
  updates: {
    name?: string;
    slug?: string;
    description?: string | null;
    schema?: Record<string, unknown>;
    status?: "draft" | "active" | "archived";
  },
): Promise<FormDefinitionRow | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }
  if (updates.slug !== undefined) {
    setClauses.push(`slug = $${paramIndex++}`);
    values.push(updates.slug);
  }
  if (updates.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    values.push(updates.description);
  }
  if (updates.schema !== undefined) {
    setClauses.push(`schema = $${paramIndex++}`);
    values.push(JSON.stringify(updates.schema));
  }
  if (updates.status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`);
    values.push(updates.status);
  }

  if (setClauses.length === 0) {
    return findById(id);
  }

  values.push(id);

  const { rows } = await pool.query<FormDefinitionRow>(
    `UPDATE form_definitions
     SET ${setClauses.join(", ")}
     WHERE id = $${paramIndex}
     RETURNING id, campaign_id, name, slug, description, schema, status, created_by, created_at, updated_at`,
    values,
  );
  return rows[0] ?? null;
}

export async function remove(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM form_definitions WHERE id = $1`,
    [id],
  );
  return (rowCount ?? 0) > 0;
}

// ── Default form creation ───────────────────────────────────────────

const DEFAULT_FORM_SCHEMA = {
  version: "1.0",
  fields: [
    {
      id: "nombre",
      type: "text",
      label: "Nombre completo",
      placeholder: "Ingresa nombre y apellidos",
      required: true,
      validation: { min: 3, maxLength: 100 },
    },
    {
      id: "telefono",
      type: "phone",
      label: "Telefono",
      placeholder: "999 888 777",
      required: true,
      validation: { pattern: "^[0-9]{9}$" },
    },
    {
      id: "ubicacion",
      type: "location",
      label: "Ubicacion GPS",
      required: true,
    },
  ],
};

/**
 * Creates a default "Formulario Principal" for a campaign if one doesn't already exist.
 * Called automatically when a campaign is created.
 */
export async function createDefaultForCampaign(
  campaignId: string,
  createdBy: string,
): Promise<FormDefinitionRow | null> {
  // Use ON CONFLICT to avoid duplicates
  const { rows } = await pool.query<FormDefinitionRow>(
    `INSERT INTO form_definitions (campaign_id, name, slug, description, schema, status, created_by)
     VALUES ($1, 'Formulario Principal', 'formulario-principal', 'Formulario basico de captura de datos', $2, 'active', $3)
     ON CONFLICT (campaign_id, slug) DO NOTHING
     RETURNING id, campaign_id, name, slug, description, schema, status, created_by, created_at, updated_at`,
    [campaignId, JSON.stringify(DEFAULT_FORM_SCHEMA), createdBy],
  );
  return rows[0] ?? null;
}

export async function findByCampaignIdWithStatus(
  campaignId: string,
  status?: "draft" | "active" | "archived",
): Promise<FormDefinitionRow[]> {
  let query = `${SELECT_WITH_JOINS} WHERE fd.campaign_id = $1`;
  const values: unknown[] = [campaignId];

  if (status) {
    query += ` AND fd.status = $2`;
    values.push(status);
  }

  query += ` ORDER BY fd.name ASC`;

  const { rows } = await pool.query<FormDefinitionRow>(query, values);
  return rows;
}
