import "dotenv/config";

import { pool } from "./db";
import { buildApp } from "./app";
import { getEnv } from "./config/env";
import { connectRedis, disconnectRedis } from "./infra/redis";
import { ensureAgentLocationsLiveTable, cleanupLocationHistory } from "./modules/agents/repository";
import { ensureFormsTable } from "./modules/forms/repository";
import { AuthRepository } from "./modules/auth/repository";

const env = getEnv();
const app = buildApp(env);

await connectRedis();
await ensureFormsTable();
await ensureAgentLocationsLiveTable();

await app.listen({ host: "0.0.0.0", port: env.port });

// ── Periodic cleanup cron ─────────────────────────────────────────────
const authRepo = new AuthRepository(pool);
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

async function runCleanup() {
  try {
    const deletedTokens = await authRepo.cleanExpiredTokens();
    if (deletedTokens > 0) {
      app.log.info({ deleted: deletedTokens }, "cleanup: expired refresh tokens removed");
    }
  } catch (err) {
    app.log.error({ err }, "cleanup: refresh token cleanup failed");
  }

  try {
    const deletedLocations = await cleanupLocationHistory(env.locationHistoryRetentionDays);
    if (deletedLocations > 0) {
      app.log.info({ deleted: deletedLocations }, "cleanup: old location history removed");
    }
  } catch (err) {
    app.log.error({ err }, "cleanup: location history cleanup failed");
  }
}

// Run once at startup (non-blocking), then periodically
void runCleanup();
cleanupTimer = setInterval(() => void runCleanup(), env.refreshTokenCleanupIntervalMs);

// ── Shutdown ──────────────────────────────────────────────────────────
const shutdown = async () => {
  if (cleanupTimer) clearInterval(cleanupTimer);
  await app.close();
  await disconnectRedis();
  await pool.end();
};

process.on("SIGTERM", () => {
  void shutdown();
});

process.on("SIGINT", () => {
  void shutdown();
});
