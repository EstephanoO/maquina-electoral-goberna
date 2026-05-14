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

/**
 * Pool secundario para `onboarding_fase1` — source of truth del CRM de
 * candidatos, catálogos del geógrafo, geografía PE y datos externos.
 *
 * Lazy: solo se crea si ONBOARDING_DATABASE_URL está configurada. Si no,
 * los repos que lo necesiten deben fallar con 503. Esto permite arrancar
 * el backend aunque onboarding_fase1 no esté disponible (degradación
 * gracilosa — el resto del producto sigue funcionando).
 */
let _onboardingPool: Pool | null = null;
export function getOnboardingPool(): Pool {
  if (_onboardingPool) return _onboardingPool;
  if (!env.onboardingDatabaseUrl) {
    throw new Error("ONBOARDING_DATABASE_URL no configurada");
  }
  _onboardingPool = new Pool({
    connectionString: env.onboardingDatabaseUrl,
    max: env.dbPoolMax,
    idleTimeoutMillis: env.dbIdleTimeoutMs,
    connectionTimeoutMillis: env.dbConnectionTimeoutMs,
    ssl: resolveSslOption(),
    keepAlive: true,
  });
  return _onboardingPool;
}

/** True si `ONBOARDING_DATABASE_URL` está disponible. */
export function isOnboardingEnabled(): boolean {
  return Boolean(env.onboardingDatabaseUrl);
}
