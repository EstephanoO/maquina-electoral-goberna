import { sql } from "drizzle-orm";

import { db, pool } from "../../db";
import type { AgentLiveState } from "./types";

type PersistedLiveRow = {
  agent_id: string;
  seq: number;
  ts: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  battery: number | null;
  campaign_id: string | null;
  updated_at: string;
};

type BatchResult = {
  attempted: number;
  accepted: number;
};

export async function ensureAgentLocationsLiveTable() {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.agent_locations_live (
      agent_id text PRIMARY KEY,
      seq bigint NOT NULL,
      ts timestamptz NOT NULL,
      lat double precision NOT NULL,
      lng double precision NOT NULL,
      accuracy double precision,
      speed double precision,
      heading double precision,
      battery double precision,
      campaign_id uuid REFERENCES campaigns(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_agent_locations_live_seq ON public.agent_locations_live (seq DESC)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_agent_locations_live_updated_at ON public.agent_locations_live (updated_at DESC)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_agent_locations_live_campaign ON public.agent_locations_live (campaign_id)`);
}

export async function loadAllLiveAgentLocations(): Promise<AgentLiveState[]> {
  const result = (await pool.query(`
    SELECT agent_id, seq, ts, lat, lng, accuracy, speed, heading, battery, campaign_id, updated_at
    FROM public.agent_locations_live
  `)) as { rows: PersistedLiveRow[] };

  return result.rows.map((row) => ({
    agentId: row.agent_id,
    seq: Number(row.seq),
    ts: new Date(row.ts).toISOString(),
    lat: row.lat,
    lng: row.lng,
    accuracy: row.accuracy,
    speed: row.speed,
    heading: row.heading,
    battery: row.battery,
    campaignId: row.campaign_id,
    receivedAt: new Date(row.updated_at).toISOString(),
    lastSeenAtMs: new Date(row.updated_at).getTime(),
  }));
}

export async function upsertLatestAgentLocationsBatch(states: AgentLiveState[]): Promise<BatchResult> {
  if (states.length === 0) {
    return { attempted: 0, accepted: 0 };
  }

  const payload = JSON.stringify(
    states.map((state) => ({
      agent_id: state.agentId,
      seq: state.seq,
      ts: state.ts,
      lat: state.lat,
      lng: state.lng,
      accuracy: state.accuracy,
      speed: state.speed,
      heading: state.heading,
      battery: state.battery,
      campaign_id: state.campaignId,
    })),
  );

  const result = (await pool.query(
    `
      WITH incoming AS (
        SELECT *
        FROM jsonb_to_recordset($1::jsonb) AS x(
          agent_id text,
          seq bigint,
          ts timestamptz,
          lat double precision,
          lng double precision,
          accuracy double precision,
          speed double precision,
          heading double precision,
          battery double precision,
          campaign_id uuid
        )
      ),
      collapsed AS (
        SELECT DISTINCT ON (agent_id)
          agent_id, seq, ts, lat, lng, accuracy, speed, heading, battery, campaign_id
        FROM incoming
        ORDER BY agent_id, seq DESC, ts DESC
      ),
      upserted AS (
        INSERT INTO public.agent_locations_live AS t (
          agent_id, seq, ts, lat, lng, accuracy, speed, heading, battery, campaign_id
        )
        SELECT
          c.agent_id, c.seq, c.ts, c.lat, c.lng, c.accuracy, c.speed, c.heading, c.battery, c.campaign_id
        FROM collapsed c
        ON CONFLICT (agent_id) DO UPDATE
          SET
            seq = EXCLUDED.seq,
            ts = EXCLUDED.ts,
            lat = EXCLUDED.lat,
            lng = EXCLUDED.lng,
            accuracy = EXCLUDED.accuracy,
            speed = EXCLUDED.speed,
            heading = EXCLUDED.heading,
            battery = EXCLUDED.battery,
            campaign_id = COALESCE(EXCLUDED.campaign_id, t.campaign_id),
            updated_at = now()
          WHERE EXCLUDED.seq > t.seq
        RETURNING agent_id
      )
      SELECT
        (SELECT count(*)::bigint FROM collapsed) AS attempted,
        (SELECT count(*)::bigint FROM upserted) AS accepted
    `,
    [payload],
  )) as { rows: Array<{ attempted: string | number; accepted: string | number }> };

  const row = result.rows[0] ?? { attempted: 0, accepted: 0 };

  // Also insert into agent_location_history for GPS track retention
  if (states.length > 0) {
    try {
      await insertLocationHistory(states);
    } catch {
      // Non-fatal: history is best-effort, don't break live tracking
    }
  }

  return {
    attempted: Number(row.attempted ?? 0),
    accepted: Number(row.accepted ?? 0),
  };
}

/**
 * Insert location data into the history table (append-only, 7-day rolling).
 * This is best-effort and should not block the live tracking pipeline.
 */
async function insertLocationHistory(states: AgentLiveState[]): Promise<void> {
  const payload = JSON.stringify(
    states.map((s) => ({
      agent_id: s.agentId,
      campaign_id: s.campaignId ?? null,
      ts: s.ts,
      lat: s.lat,
      lng: s.lng,
      accuracy: s.accuracy,
      speed: s.speed,
      heading: s.heading,
      battery: s.battery,
    })),
  );

  await pool.query(
    `INSERT INTO agent_location_history (agent_id, campaign_id, ts, lat, lng, accuracy, speed, heading, battery)
     SELECT x.agent_id, x.campaign_id, x.ts, x.lat, x.lng, x.accuracy, x.speed, x.heading, x.battery
     FROM jsonb_to_recordset($1::jsonb) AS x(
       agent_id text,
       campaign_id uuid,
       ts timestamptz,
       lat double precision,
       lng double precision,
       accuracy double precision,
       speed double precision,
       heading double precision,
       battery double precision
     )`,
    [payload],
  );
}

/**
 * Cleanup location history older than retention period (7 days by default).
 * Call from a periodic timer/cron.
 */
export async function cleanupLocationHistory(retentionDays = 7): Promise<number> {
  const result = await pool.query(
    `DELETE FROM agent_location_history WHERE created_at < now() - ($1 || ' days')::interval`,
    [retentionDays.toString()],
  );
  return result.rowCount ?? 0;
}
