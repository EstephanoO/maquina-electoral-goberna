/**
 * geo-listener — Listens to PostgreSQL pg_notify('geo_change') and:
 *   1. Bumps geo:version:{campaignId} in Redis (used for tile ETag invalidation)
 *   2. Publishes event to Redis pub/sub channel "geo:updated" (consumed by SSE endpoint)
 *
 * This enables near-realtime propagation of QGIS edits to the dashboard map:
 *   QGIS save → PostGIS trigger → pg_notify → this listener → Redis → SSE → browser refetch
 *
 * Uses a dedicated pg.Client (not the pool) because LISTEN requires a persistent connection.
 */
import { Client } from "pg";

import { redisClient } from "../../infra/redis";

let listenClient: Client | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

type GeoListenerLogger = {
  info: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
};

let logger: GeoListenerLogger = {
  info: (_obj, msg) => console.log(`[geo-listener] ${msg}`),
  error: (_obj, msg) => console.error(`[geo-listener] ${msg}`),
  warn: (_obj, msg) => console.warn(`[geo-listener] ${msg}`),
};

/**
 * Start listening for geo_change notifications from PostgreSQL.
 * Should be called once at server startup.
 */
export async function startGeoListener(
  databaseUrl: string,
  log?: GeoListenerLogger,
): Promise<void> {
  if (log) logger = log;

  // Clean up any existing connection
  await stopGeoListener();

  try {
    listenClient = new Client({ connectionString: databaseUrl });
    await listenClient.connect();
    await listenClient.query("LISTEN geo_change");

    logger.info({}, "connected and listening on channel geo_change");

    listenClient.on("notification", (msg) => {
      if (!msg.payload) return;
      void handleNotification(msg.payload);
    });

    listenClient.on("error", (err) => {
      logger.error({ err: err.message }, "connection error — will reconnect in 3s");
      scheduleReconnect(databaseUrl);
    });

    listenClient.on("end", () => {
      logger.warn({}, "connection ended — will reconnect in 3s");
      scheduleReconnect(databaseUrl);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    logger.error({ err: message }, "failed to connect — will retry in 3s");
    scheduleReconnect(databaseUrl);
  }
}

/**
 * Stop the geo listener and clean up resources.
 * Should be called during graceful shutdown.
 */
export async function stopGeoListener(): Promise<void> {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (listenClient) {
    try {
      await listenClient.end();
    } catch {
      // Connection may already be broken
    }
    listenClient = null;
  }
}

// ── Internal ────────────────────────────────────────────────────────

async function handleNotification(payload: string): Promise<void> {
  // Payload format: "campaign_id:table_name:operation"
  const [campaignId, table, op] = payload.split(":");
  if (!campaignId) return;

  try {
    // Bump version in Redis (timestamp as version)
    const version = Date.now().toString();
    await redisClient.set(`geo:version:${campaignId}`, version);

    // Publish to Redis pub/sub so all backend instances can emit SSE
    await redisClient.publish(
      "geo:updated",
      JSON.stringify({
        campaignId,
        table: table ?? "unknown",
        operation: op ?? "unknown",
        version,
      }),
    );

    logger.info(
      { campaignId, table, op, version },
      `${op} on ${table} for campaign ${campaignId} — version bumped to ${version}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    logger.error({ err: message, campaignId }, "failed to process geo notification");
  }
}

function scheduleReconnect(databaseUrl: string): void {
  // Avoid scheduling multiple reconnects
  if (reconnectTimer) return;

  // Clean up the broken client
  if (listenClient) {
    try { listenClient.removeAllListeners(); } catch { /* ignore */ }
    try { void listenClient.end(); } catch { /* ignore */ }
    listenClient = null;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void startGeoListener(databaseUrl);
  }, 3000);
}
