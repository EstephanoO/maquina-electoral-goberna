import { createApp } from "./app.js";
import { migrate } from "./migrate.js";
import { sql } from "./sql.js";
import { startScheduler, stopScheduler } from "./services/scheduler.js";

/**
 * Bootstrap del backend:
 *   1. Run migrations (idempotente, abort si falla)
 *   2. Crea Express app + listen()
 *   3. Maneja SIGINT/SIGTERM para cerrar pool de DB con grace timeout 5s
 */

const PORT = Number(process.env.PORT ?? 4000);

async function boot() {
  try {
    await migrate();
  } catch (e) {
    console.error("[api] migration failed, exiting:", e);
    process.exit(1);
  }

  const app = createApp();
  app.listen(PORT, () => {
    console.log(`nexus-backend listening on http://localhost:${PORT}`);
  });

  // Cron jobs (Sprint 2.B): mining-review diario @ 9 AM Lima.
  startScheduler();
}

boot();

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    console.log(`[api] ${sig} received, closing…`);
    stopScheduler();
    await sql.end({ timeout: 5 });
    process.exit(0);
  });
}
