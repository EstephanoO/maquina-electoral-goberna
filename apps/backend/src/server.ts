import "dotenv/config";

import { pool } from "./db";
import { buildApp } from "./app";
import { getEnv } from "./config/env";
import { connectRedis, disconnectRedis } from "./infra/redis";
import { initTelegram } from "./infra/telegram";
import { startHealthPoller, stopHealthPoller } from "./infra/health-poller";
import { startTelegramCommands, stopTelegramCommands } from "./infra/telegram-commands";
import { initSupportTelegramBridge } from "./infra/support-telegram-bridge";
import { ensureAgentLocationsLiveTable, cleanupLocationHistory } from "./modules/agents/repository";
import { ensureFormsTable } from "./modules/forms/repository";
import { AuthRepository } from "./modules/auth/repository";

const env = getEnv();
const app = buildApp(env);

// ── Telegram notifications ────────────────────────────────────────────
initTelegram(env);

await connectRedis();
await ensureFormsTable();
await ensureAgentLocationsLiveTable();

await app.listen({ host: "0.0.0.0", port: env.port });

// ── Health poller (DB/Redis/Tegola + CPU/RAM/Disk) ────────────────────
startHealthPoller(env);

// ── Telegram bot commands (long-polling for /health etc.) ─────────────
startTelegramCommands(env);

// ── Support → Telegram bridge ─────────────────────────────────────────
initSupportTelegramBridge();

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
  stopHealthPoller();
  stopTelegramCommands();
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
