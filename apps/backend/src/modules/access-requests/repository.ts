import { pool } from "../../db";

// ── Row types ───────────────────────────────────────────────────────

export type AccessRequestRow = {
  id: string;
  user_id: string;
  campaign_id: string;
  status: string;
  requested_at: Date;
  resolved_at: Date | null;
  resolved_by: string | null;
  note: string | null;
  region?: string | null;
  perm_tierra?: boolean;
  perm_digital?: boolean;
  // Joined fields
  user_email?: string;
  user_full_name?: string;
  user_phone?: string;
  campaign_name?: string;
  campaign_cargo?: string;
  campaign_numero?: number;
};

// ── Queries ─────────────────────────────────────────────────────────

const SELECT_WITH_JOINS = `
  SELECT
    ar.id, ar.user_id, ar.campaign_id, ar.status,
    ar.requested_at, ar.resolved_at, ar.resolved_by, ar.note,
    ar.region, ar.perm_tierra, ar.perm_digital,
    u.email     AS user_email,
    u.full_name AS user_full_name,
    u.phone     AS user_phone,
    c.name      AS campaign_name,
    c.cargo     AS campaign_cargo,
    c.numero    AS campaign_numero
  FROM access_requests ar
  JOIN users u     ON u.id = ar.user_id
  JOIN campaigns c ON c.id = ar.campaign_id
`;

export async function findPendingByUser(userId: string): Promise<AccessRequestRow[]> {
  const { rows } = await pool.query<AccessRequestRow>(
    `${SELECT_WITH_JOINS}
     WHERE ar.user_id = $1 AND ar.status = 'pending'
     ORDER BY ar.requested_at DESC`,
    [userId],
  );
  return rows;
}

export async function findByUser(userId: string): Promise<AccessRequestRow[]> {
  const { rows } = await pool.query<AccessRequestRow>(
    `${SELECT_WITH_JOINS}
     WHERE ar.user_id = $1
     ORDER BY ar.requested_at DESC`,
    [userId],
  );
  return rows;
}

export async function listPending(): Promise<AccessRequestRow[]> {
  const { rows } = await pool.query<AccessRequestRow>(
    `${SELECT_WITH_JOINS}
     WHERE ar.status = 'pending'
     ORDER BY ar.requested_at ASC`,
  );
  return rows;
}

/**
 * List pending access requests for specific campaigns.
 * Used by non-admin roles who only have access to certain campaigns.
 */
export async function listPendingByCampaigns(campaignIds: string[]): Promise<AccessRequestRow[]> {
  if (campaignIds.length === 0) return [];
  
  const { rows } = await pool.query<AccessRequestRow>(
    `${SELECT_WITH_JOINS}
     WHERE ar.status = 'pending' AND ar.campaign_id = ANY($1)
     ORDER BY ar.requested_at ASC`,
    [campaignIds],
  );
  return rows;
}

/**
 * List pending access requests for specific campaigns AND region.
 * Used by brigadistas zonales who only see requests from their region.
 */
export async function listPendingByCampaignsAndRegion(
  campaignIds: string[],
  region: string,
): Promise<AccessRequestRow[]> {
  if (campaignIds.length === 0) return [];
  
  const { rows } = await pool.query<AccessRequestRow>(
    `${SELECT_WITH_JOINS}
     WHERE ar.status = 'pending' 
       AND ar.campaign_id = ANY($1)
       AND ar.region = $2
     ORDER BY ar.requested_at ASC`,
    [campaignIds, region],
  );
  return rows;
}

export async function listAll(): Promise<AccessRequestRow[]> {
  const { rows } = await pool.query<AccessRequestRow>(
    `${SELECT_WITH_JOINS}
     ORDER BY ar.requested_at DESC`,
  );
  return rows;
}

export async function findById(id: string): Promise<AccessRequestRow | null> {
  const { rows } = await pool.query<AccessRequestRow>(
    `${SELECT_WITH_JOINS}
     WHERE ar.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function create(
  userId: string,
  campaignId: string,
  permTierra = true,
  permDigital = true,
): Promise<AccessRequestRow | null> {
  // Uses ON CONFLICT on the partial unique index (user_id, campaign_id WHERE pending).
  // If a pending request already exists, do nothing and return null.
  const { rows } = await pool.query<AccessRequestRow>(
    `INSERT INTO access_requests (user_id, campaign_id, perm_tierra, perm_digital)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, campaign_id) WHERE status = 'pending'
     DO NOTHING
     RETURNING id, user_id, campaign_id, status, requested_at, resolved_at, resolved_by, note, perm_tierra, perm_digital`,
    [userId, campaignId, permTierra, permDigital],
  );
  return rows[0] ?? null;
}

export async function resolve(
  id: string,
  status: "approved" | "rejected",
  resolvedBy: string,
  note?: string,
  role = "agente_campo",
  permTierra = true,
  permDigital = true,
): Promise<AccessRequestRow | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Get the access request
    const { rows: selectRows } = await client.query<AccessRequestRow>(
      `SELECT id, user_id, campaign_id, status
       FROM access_requests
       WHERE id = $1 AND status = 'pending'`,
      [id],
    );

    const request = selectRows[0];
    if (!request) {
      await client.query("ROLLBACK");
      return null;
    }

    // 2) Update the access request with the resolved permissions
    const { rows } = await client.query<AccessRequestRow>(
      `UPDATE access_requests
       SET status = $1, resolved_at = now(), resolved_by = $2, note = $3, perm_tierra = $4, perm_digital = $5
       WHERE id = $6
       RETURNING id, user_id, campaign_id, status, requested_at, resolved_at, resolved_by, note, perm_tierra, perm_digital`,
      [status, resolvedBy, note ?? null, permTierra, permDigital, id],
    );

    const row = rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return null;
    }

    // 3) If approved, grant campaign access with admin-specified permissions and role
    if (status === "approved") {
      await client.query(
        `INSERT INTO user_campaigns (user_id, campaign_id, role, status, perm_tierra, perm_digital)
         VALUES ($1, $2, $3, 'active', $4, $5)
         ON CONFLICT (user_id, campaign_id)
         DO UPDATE SET role = $3, status = 'active', perm_tierra = $4, perm_digital = $5, assigned_at = now()`,
        [row.user_id, row.campaign_id, role, permTierra, permDigital],
      );
    }

    await client.query("COMMIT");
    return row;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
