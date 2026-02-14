import "dotenv/config";

import { pool } from "./db";
import { buildApp } from "./app";
import { getEnv } from "./config/env";
import { connectRedis, disconnectRedis } from "./infra/redis";
import { ensureAgentLocationsLiveTable } from "./modules/agents/repository";
import { ensureFormsTable } from "./modules/forms/repository";

const env = getEnv();
const app = buildApp(env);

await connectRedis();
await ensureFormsTable();
await ensureAgentLocationsLiveTable();

await app.listen({ host: "0.0.0.0", port: env.port });

const shutdown = async () => {
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
