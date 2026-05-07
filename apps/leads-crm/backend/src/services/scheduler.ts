/**
 * Scheduler simple para jobs periódicos. Sin dependencias externas — un
 * setInterval que checkea cada CHECK_INTERVAL si toca correr cada job.
 *
 * Decisión: NO usamos node-cron / agenda / bullmq. Para 1-2 jobs diarios
 * el overhead de una dep no vale la pena, y un setInterval es testeable
 * + visible en logs.
 *
 * Jobs registrados:
 *   - mining-review @ 09:00 hora Lima (UTC-5)
 */
import { runMiningReview } from "./mining-review.js";

const CHECK_INTERVAL_MS = 30 * 60 * 1000;       // 30 min
const LIMA_UTC_OFFSET_MIN = -5 * 60;            // Lima = UTC-5 (sin DST)

interface DailyJob {
  name: string;
  /** Hora de Lima a la que debe correr (0-23). */
  hourLima: number;
  /** Última vez que corrió (timestamp). null = nunca. */
  lastRunAt: number | null;
  run: () => Promise<unknown>;
}

const jobs: DailyJob[] = [
  {
    name: "mining-review",
    hourLima: 9,
    lastRunAt: null,
    run: () => runMiningReview("cron"),
  },
];

/** Hora actual en Lima (UTC-5), formato {hour, dateStr}. dateStr para tracking last-run-day. */
function nowLima(): { hour: number; dateStr: string; ts: number } {
  const ts = Date.now();
  const limaTs = ts + LIMA_UTC_OFFSET_MIN * 60 * 1000;
  const d = new Date(limaTs);
  return {
    hour: d.getUTCHours(),  // ya está offsetado a Lima
    dateStr: d.toISOString().slice(0, 10),
    ts,
  };
}

async function tick() {
  const { hour, ts } = nowLima();
  for (const job of jobs) {
    if (hour < job.hourLima) continue;
    // Si ya corrió hoy (en las últimas 23h), saltar
    if (job.lastRunAt && ts - job.lastRunAt < 23 * 60 * 60 * 1000) continue;
    console.log(`[scheduler] running ${job.name} (lima hour=${hour})`);
    job.lastRunAt = ts;
    try {
      const result = await job.run();
      console.log(`[scheduler] ✓ ${job.name} ok:`, JSON.stringify(result).slice(0, 300));
    } catch (e: any) {
      console.error(`[scheduler] ✗ ${job.name} failed:`, e?.message ?? e);
    }
  }
}

let timer: NodeJS.Timeout | null = null;

export function startScheduler(): void {
  if (timer) return;
  console.log(`[scheduler] starting (check every ${CHECK_INTERVAL_MS / 60_000}min, ${jobs.length} job(s))`);
  // Tick inmediato al startup para no perder un slot si el server reinició
  // justo en la ventana de un job. Pero envolvemos en setTimeout(0) para no
  // bloquear el inicio si algo del job dispara queries pesadas.
  setTimeout(tick, 1000);
  timer = setInterval(tick, CHECK_INTERVAL_MS);
}

export function stopScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
