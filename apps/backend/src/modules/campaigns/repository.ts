import { pool } from "../../db";
import type { CreateCampaignInput, UpdateCampaignInput } from "./schemas";

// ── Row types ───────────────────────────────────────────────────────

export type CampaignConfig = {
  meta_datos?: number;
  meta_votos?: number;
  color_primario?: string;
  color_secundario?: string;
  [key: string]: unknown;
};

export type CampaignRow = {
  id: string;
  name: string;
  slug: string;
  config: Record<string, unknown>;
  status: string;
  cargo: string | null;
  numero: number | null;
  partido: string | null;
  foto_url: string | null;
  created_at: Date;
  updated_at: Date;
};

export type CampaignStats = CampaignRow & {
  agente_campo_count: number;
  brigadista_zonal_count: number;
  jefe_campana_count: number;
  consultor_count: number;
  admin_count: number;
};

// ── Queries ─────────────────────────────────────────────────────────

export async function findById(id: string): Promise<CampaignRow | null> {
  const { rows } = await pool.query<CampaignRow>(
    `SELECT id, name, slug, config, status, cargo, numero, partido, foto_url, created_at, updated_at
     FROM campaigns WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findBySlug(slug: string): Promise<CampaignRow | null> {
  const { rows } = await pool.query<CampaignRow>(
    `SELECT id, name, slug, config, status, cargo, numero, partido, foto_url, created_at, updated_at
     FROM campaigns WHERE slug = $1`,
    [slug],
  );
  return rows[0] ?? null;
}

export async function listForUser(userId: string): Promise<CampaignRow[]> {
  const { rows } = await pool.query<CampaignRow>(
    `SELECT c.id, c.name, c.slug, c.config, c.status, c.cargo, c.numero, c.partido, c.foto_url, c.created_at, c.updated_at
     FROM campaigns c
     JOIN user_campaigns uc ON uc.campaign_id = c.id
     WHERE uc.user_id = $1 AND uc.status = 'active' AND c.status != 'archived'
     ORDER BY c.name`,
    [userId],
  );
  return rows;
}

export async function listAll(): Promise<CampaignStats[]> {
  const { rows } = await pool.query<CampaignStats>(
    `SELECT
       c.id, c.name, c.slug, c.config, c.status, c.cargo, c.numero, c.partido, c.foto_url, c.created_at, c.updated_at,
       COUNT(CASE WHEN uc.role = 'agente_campo'     AND uc.status = 'active' THEN 1 END)::int AS agente_campo_count,
       COUNT(CASE WHEN uc.role = 'brigadista_zonal'  AND uc.status = 'active' THEN 1 END)::int AS brigadista_zonal_count,
       COUNT(CASE WHEN uc.role = 'jefe_campana'      AND uc.status = 'active' THEN 1 END)::int AS jefe_campana_count,
       COUNT(CASE WHEN uc.role = 'consultor'         AND uc.status = 'active' THEN 1 END)::int AS consultor_count,
       COUNT(CASE WHEN uc.role = 'admin'             AND uc.status = 'active' THEN 1 END)::int AS admin_count
     FROM campaigns c
     LEFT JOIN user_campaigns uc ON uc.campaign_id = c.id
     GROUP BY c.id
     ORDER BY c.name`,
  );
  return rows;
}

export async function listActive(): Promise<CampaignRow[]> {
  const { rows } = await pool.query<CampaignRow>(
    `SELECT id, name, slug, config, status, cargo, numero, partido, foto_url, created_at, updated_at
     FROM campaigns WHERE status = 'active'
     ORDER BY name`,
  );
  return rows;
}

export async function create(input: CreateCampaignInput): Promise<CampaignRow> {
  const { rows } = await pool.query<CampaignRow>(
    `INSERT INTO campaigns (name, slug, config, cargo, numero, partido, foto_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, name, slug, config, status, cargo, numero, partido, foto_url, created_at, updated_at`,
    [input.name, input.slug, JSON.stringify(input.config), input.cargo ?? null, input.numero ?? null, input.partido ?? null, input.foto_url ?? null],
  );
  return rows[0]!;
}

export async function update(id: string, input: UpdateCampaignInput): Promise<CampaignRow | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (input.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    values.push(input.name);
  }
  if (input.config !== undefined) {
    setClauses.push(`config = $${paramIndex++}`);
    values.push(JSON.stringify(input.config));
  }
  if (input.status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`);
    values.push(input.status);
  }
  if (input.cargo !== undefined) {
    setClauses.push(`cargo = $${paramIndex++}`);
    values.push(input.cargo);
  }
  if (input.numero !== undefined) {
    setClauses.push(`numero = $${paramIndex++}`);
    values.push(input.numero);
  }
  if (input.partido !== undefined) {
    setClauses.push(`partido = $${paramIndex++}`);
    values.push(input.partido);
  }
  if (input.foto_url !== undefined) {
    setClauses.push(`foto_url = $${paramIndex++}`);
    values.push(input.foto_url);
  }

  if (setClauses.length === 0) return findById(id);

  setClauses.push(`updated_at = now()`);
  values.push(id);

  const { rows } = await pool.query<CampaignRow>(
    `UPDATE campaigns SET ${setClauses.join(", ")} WHERE id = $${paramIndex}
     RETURNING id, name, slug, config, status, cargo, numero, partido, foto_url, created_at, updated_at`,
    values,
  );
  return rows[0] ?? null;
}

export async function addUserToCampaign(userId: string, campaignId: string, role: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_campaigns (user_id, campaign_id, role, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (user_id, campaign_id)
     DO UPDATE SET role = EXCLUDED.role, status = 'active', assigned_at = now()`,
    [userId, campaignId, role],
  );
}

export async function removeUserFromCampaign(userId: string, campaignId: string): Promise<void> {
  await pool.query(
     `UPDATE user_campaigns SET status = 'revoked'
     WHERE user_id = $1 AND campaign_id = $2`,
    [userId, campaignId],
  );
}

// ── Stats queries ───────────────────────────────────────────────────

export type TopAgent = {
  id: string;
  name: string;
  forms_count: number;
  forms_today: number;
};

export type FormsTotals = {
  forms_count: number;
  forms_today: number;
  forms_week: number;
};

export type AgentFormsData = {
  id: string;
  name: string;
  count: number;
};

export async function getFormsTotals(campaignId: string): Promise<FormsTotals> {
  const { rows } = await pool.query<{ forms_count: string; forms_today: string; forms_week: string }>(
    `SELECT
       COUNT(*)::text AS forms_count,
       COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::text AS forms_today,
       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::text AS forms_week
     FROM form_submissions
     WHERE campaign_id = $1`,
    [campaignId],
  );
  const row = rows[0];
  return {
    forms_count: parseInt(row?.forms_count ?? "0", 10),
    forms_today: parseInt(row?.forms_today ?? "0", 10),
    forms_week: parseInt(row?.forms_week ?? "0", 10),
  };
}

export async function getTopAgents(campaignId: string, limit = 10): Promise<TopAgent[]> {
  // Uses submitted_by for new submissions; falls back to data->>'encuestador_id' for legacy migrated rows
  const { rows } = await pool.query<{ id: string; name: string; forms_count: string; forms_today: string }>(
    `SELECT
       COALESCE(fs.submitted_by::text, fs.data->>'encuestador_id') AS id,
       COALESCE(u.full_name, fs.data->>'encuestador', 'Agente') AS name,
       COUNT(*)::text AS forms_count,
       COUNT(*) FILTER (WHERE fs.created_at >= CURRENT_DATE)::text AS forms_today
     FROM form_submissions fs
     LEFT JOIN users u ON u.id = fs.submitted_by
     WHERE fs.campaign_id = $1
       AND (fs.submitted_by IS NOT NULL OR fs.data->>'encuestador_id' IS NOT NULL)
     GROUP BY COALESCE(fs.submitted_by::text, fs.data->>'encuestador_id'),
              COALESCE(u.full_name, fs.data->>'encuestador', 'Agente')
     ORDER BY COUNT(*) DESC
     LIMIT $2`,
    [campaignId, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    forms_count: parseInt(r.forms_count, 10),
    forms_today: parseInt(r.forms_today, 10),
  }));
}

export async function getAgentFormsForPeriod(
  campaignId: string,
  period: "day" | "week",
): Promise<AgentFormsData[]> {
  const interval = period === "day" ? "24 hours" : "7 days";
  // Uses submitted_by for new submissions; falls back to data->>'encuestador_id' for legacy migrated rows
  const { rows } = await pool.query<{ id: string; name: string; count: string }>(
    `SELECT
       COALESCE(fs.submitted_by::text, fs.data->>'encuestador_id') AS id,
       COALESCE(u.full_name, fs.data->>'encuestador', 'Agente') AS name,
       COUNT(*)::text AS count
     FROM form_submissions fs
     LEFT JOIN users u ON u.id = fs.submitted_by
     WHERE fs.campaign_id = $1 
       AND fs.created_at >= NOW() - $2::interval
       AND (fs.submitted_by IS NOT NULL OR fs.data->>'encuestador_id' IS NOT NULL)
     GROUP BY COALESCE(fs.submitted_by::text, fs.data->>'encuestador_id'),
              COALESCE(u.full_name, fs.data->>'encuestador', 'Agente')
     ORDER BY COUNT(*) DESC`,
    [campaignId, interval],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    count: parseInt(r.count, 10),
  }));
}

export type CampaignMember = {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  user_status: string;
};

export async function updateMemberRole(
  userId: string,
  campaignId: string,
  role: string,
): Promise<CampaignMember | null> {
  const { rows } = await pool.query<CampaignMember>(
    `UPDATE user_campaigns uc
     SET role = $3, assigned_at = now()
     FROM users u
     WHERE uc.user_id = $1 AND uc.campaign_id = $2 AND uc.status = 'active' AND u.id = uc.user_id
     RETURNING uc.user_id, u.full_name, u.email, uc.role, u.status AS user_status`,
    [userId, campaignId, role],
  );
  return rows[0] ?? null;
}

export async function getCampaignMembers(campaignId: string): Promise<CampaignMember[]> {
  const { rows } = await pool.query<CampaignMember>(
    `SELECT uc.user_id, u.full_name, u.email, uc.role, u.status AS user_status
     FROM user_campaigns uc
     JOIN users u ON u.id = uc.user_id
     WHERE uc.campaign_id = $1 AND uc.status = 'active'
     ORDER BY
       CASE uc.role WHEN 'admin' THEN 1 WHEN 'consultor' THEN 2 WHEN 'jefe_campana' THEN 3 WHEN 'brigadista_zonal' THEN 4 WHEN 'agente_campo' THEN 5 ELSE 6 END,
       u.full_name`,
    [campaignId],
  );
  return rows;
}
