/**
 * GOBERNA — Health Poller
 *
 * Periodically checks DB, Redis, Tegola, CPU, RAM, Disk.
 * Sends Telegram alerts on failure/recovery and critical resource usage.
 * Runs every 60s. Alerts only on state transitions (no spam).
 */

import { statfsSync } from "node:fs";
import os from "node:os";

import type { AppEnv } from "../config/env";
import { db } from "../db";
import { redisClient } from "./redis";
import { fetchWithRetry } from "./upstream";
import { tgServiceDown, tgServiceRecovered, tgSystemResources } from "./telegram";

type ServiceState = { database: boolean; redis: boolean; tegola: boolean };

let prev: ServiceState = { database: true, redis: true, tegola: true };
let resourceAlertCooldown = 0; // skip N cycles after alerting (avoid spam)
let timer: ReturnType<typeof setInterval> | null = null;

const POLL_INTERVAL_MS = 60_000; // 1 minute
const RESOURCE_COOLDOWN_CYCLES = 10; // 10 min cooldown between resource alerts

async function checkDatabase(): Promise<boolean> {
  try {
    const r = await db.execute("SELECT 1 AS ok");
    return r.rowCount === 1;
  } catch { return false; }
}

async function checkRedis(): Promise<boolean> {
  try {
    return (await redisClient.ping()) === "PONG";
  } catch { return false; }
}

async function checkTegola(env: AppEnv): Promise<boolean> {
  try {
    const r = await fetchWithRetry(`${env.tegolaBaseUrl}/capabilities`, env);
    return r.ok;
  } catch { return false; }
}

function getSystemResources(): { cpu: number; mem: number; disk: number | null } {
  const load = os.loadavg()[0] ?? 0;
  const cpuCount = os.cpus().length || 1;
  const cpu = Math.min(100, (load / cpuCount) * 100);

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const mem = totalMem > 0 ? ((totalMem - freeMem) / totalMem) * 100 : 0;

  let disk: number | null = null;
  try {
    const fs = statfsSync("/");
    const blocks = Number(fs.blocks);
    const avail = Number(fs.bavail);
    if (blocks > 0) disk = ((blocks - avail) / blocks) * 100;
  } catch { /* ignore */ }

  return { cpu, mem, disk };
}

async function poll(env: AppEnv) {
  // ── Service health checks ──
  const [dbok, redisok, tegolaok] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkTegola(env),
  ]);

  const current: ServiceState = { database: dbok, redis: redisok, tegola: tegolaok };
  const names: (keyof ServiceState)[] = ["database", "redis", "tegola"];

  for (const svc of names) {
    if (prev[svc] && !current[svc]) tgServiceDown(svc.toUpperCase());
    if (!prev[svc] && current[svc]) tgServiceRecovered(svc.toUpperCase());
  }
  prev = current;

  // ── System resources ──
  if (resourceAlertCooldown > 0) {
    resourceAlertCooldown--;
  } else {
    const { cpu, mem, disk } = getSystemResources();
    if (cpu > 80 || mem > 85 || (disk !== null && disk > 90)) {
      tgSystemResources(cpu, mem, disk);
      resourceAlertCooldown = RESOURCE_COOLDOWN_CYCLES;
    }
  }
}

export function startHealthPoller(env: AppEnv) {
  // Initial check after 10s (let services boot)
  setTimeout(() => void poll(env), 10_000);
  timer = setInterval(() => void poll(env), POLL_INTERVAL_MS);
  timer.unref();
}

export function stopHealthPoller() {
  if (timer) { clearInterval(timer); timer = null; }
}
