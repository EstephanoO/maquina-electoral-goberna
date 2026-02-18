import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getEnv } from "./config/env";

const env = getEnv();

function resolveSslOption() {
  const mode = env.dbSslMode;
  if (mode === "disable" || mode === "false" || mode === "off") {
    return false;
  }

  if (mode === "require") {
    return { rejectUnauthorized: false };
  }

  if (mode === "verify" || mode === "verify-full") {
    return { rejectUnauthorized: true };
  }

  if (/sslmode=(verify|verify-full)/i.test(env.databaseUrl)) {
    return { rejectUnauthorized: true };
  }

  if (/sslmode=require/i.test(env.databaseUrl)) {
    return { rejectUnauthorized: false };
  }

  return false;
}

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.dbPoolMax,
  idleTimeoutMillis: env.dbIdleTimeoutMs,
  connectionTimeoutMillis: env.dbConnectionTimeoutMs,
  ssl: resolveSslOption(),
  keepAlive: true,
});

export const db = drizzle(pool);
