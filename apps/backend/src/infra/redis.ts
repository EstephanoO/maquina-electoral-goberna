import { createClient } from "redis";

import { getEnv } from "../config/env";

const env = getEnv();

export const redisClient = createClient({
  url: env.redisUrl,
  socket: {
    reconnectStrategy: (retries) => Math.min(1000 + retries * 50, 5000),
    keepAlive: 5000,
  },
});

redisClient.on("error", () => {
  // error logging is handled by callers to avoid noisy duplicates
});

export async function connectRedis() {
  if (redisClient.isOpen) return;
  await redisClient.connect();
}

export async function disconnectRedis() {
  if (!redisClient.isOpen) return;
  await redisClient.quit();
}

export async function ensureConsumerGroup(stream: string, group: string) {
  try {
    await redisClient.xGroupCreate(stream, group, "$", {
      MKSTREAM: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("BUSYGROUP")) {
      throw error;
    }
  }
}

const trackingEnqueueScript = `
local seqHashKey = KEYS[1]
local streamKey = KEYS[2]
local agentId = ARGV[1]
local seq = tonumber(ARGV[2])
local payload = ARGV[3]
local maxLen = tonumber(ARGV[4])

local current = redis.call('HGET', seqHashKey, agentId)
if current and tonumber(current) >= seq then
  return 0
end

redis.call('HSET', seqHashKey, agentId, seq)
redis.call('XADD', streamKey, 'MAXLEN', '~', maxLen, '*', 'payload', payload)
return 1
`;

const formsEnqueueScript = `
local dedupeKey = KEYS[1]
local streamKey = KEYS[2]
local payload = ARGV[1]
local ttlSec = tonumber(ARGV[2])
local maxLen = tonumber(ARGV[3])

local ok = redis.call('SET', dedupeKey, '1', 'NX', 'EX', ttlSec)
if not ok then
  return 0
end

redis.call('XADD', streamKey, 'MAXLEN', '~', maxLen, '*', 'payload', payload)
return 1
`;

const weightedRateLimitScript = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local cost = tonumber(ARGV[2])
local ttlSec = tonumber(ARGV[3])

local current = redis.call('GET', key)
if not current then
  redis.call('SET', key, cost, 'EX', ttlSec)
  return cost
end

current = tonumber(current)
if (current + cost) > limit then
  return -1
end

return redis.call('INCRBY', key, cost)
`;

const dualWeightedRateLimitScript = `
local actorKey = KEYS[1]
local ipKey = KEYS[2]
local actorLimit = tonumber(ARGV[1])
local ipLimit = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local ttlSec = tonumber(ARGV[4])

local actorCurrent = tonumber(redis.call('GET', actorKey) or '0')
local ipCurrent = tonumber(redis.call('GET', ipKey) or '0')

if (actorCurrent + cost) > actorLimit then
  return 0
end

if (ipCurrent + cost) > ipLimit then
  return -1
end

if actorCurrent == 0 then
  redis.call('SET', actorKey, cost, 'EX', ttlSec)
else
  redis.call('INCRBY', actorKey, cost)
end

if ipCurrent == 0 then
  redis.call('SET', ipKey, cost, 'EX', ttlSec)
else
  redis.call('INCRBY', ipKey, cost)
end

return 1
`;

export async function enqueueTrackingEvent(params: {
  seqHashKey: string;
  streamKey: string;
  agentId: string;
  seq: number;
  payload: string;
  maxLen: number;
}): Promise<boolean> {
  const result = await redisClient.eval(trackingEnqueueScript, {
    keys: [params.seqHashKey, params.streamKey],
    arguments: [params.agentId, String(params.seq), params.payload, String(params.maxLen)],
  });

  return Number(result ?? 0) === 1;
}

export async function enqueueFormEvent(params: {
  dedupeKey: string;
  streamKey: string;
  payload: string;
  ttlSec: number;
  maxLen: number;
}): Promise<boolean> {
  const result = await redisClient.eval(formsEnqueueScript, {
    keys: [params.dedupeKey, params.streamKey],
    arguments: [params.payload, String(params.ttlSec), String(params.maxLen)],
  });

  return Number(result ?? 0) === 1;
}

export async function consumeWeightedRateLimit(params: {
  key: string;
  limit: number;
  cost: number;
  ttlSec: number;
}): Promise<boolean> {
  const result = await redisClient.eval(weightedRateLimitScript, {
    keys: [params.key],
    arguments: [String(params.limit), String(params.cost), String(params.ttlSec)],
  });

  return Number(result ?? -1) >= 0;
}

export async function consumeDualWeightedRateLimit(params: {
  actorKey: string;
  ipKey: string;
  actorLimit: number;
  ipLimit: number;
  cost: number;
  ttlSec: number;
}): Promise<boolean> {
  const result = await redisClient.eval(dualWeightedRateLimitScript, {
    keys: [params.actorKey, params.ipKey],
    arguments: [String(params.actorLimit), String(params.ipLimit), String(params.cost), String(params.ttlSec)],
  });

  return Number(result ?? -1) >= 0;
}

export type StreamMessage = {
  id: string;
  values: Record<string, string>;
};

function parseStreamRows(raw: unknown): StreamMessage[] {
  if (!Array.isArray(raw)) return [];
  const rows = raw as Array<[string, string[]]>;
  const out: StreamMessage[] = [];

  for (const row of rows) {
    const id = row?.[0];
    const values = row?.[1];
    if (typeof id !== "string" || !Array.isArray(values)) continue;
    const dict: Record<string, string> = {};
    for (let i = 0; i < values.length; i += 2) {
      const key = values[i];
      const value = values[i + 1];
      if (typeof key === "string" && typeof value === "string") {
        dict[key] = value;
      }
    }
    out.push({ id, values: dict });
  }

  return out;
}

export async function xReadGroupBatch(params: {
  streamKey: string;
  group: string;
  consumer: string;
  count: number;
  blockMs: number;
}): Promise<StreamMessage[]> {
  const response = (await redisClient.xReadGroup(params.group, params.consumer, [{ key: params.streamKey, id: ">" }], {
    COUNT: params.count,
    BLOCK: params.blockMs,
  })) as Array<{ name: string; messages: Array<{ id: string; message: Record<string, string> }> }> | null;

  if (!response || response.length === 0) return [];
  const messages = response[0]?.messages ?? [];
  return messages.map((m) => ({ id: m.id, values: m.message }));
}

export async function xAutoClaimBatch(params: {
  streamKey: string;
  group: string;
  consumer: string;
  minIdleMs: number;
  startId?: string;
  count: number;
}): Promise<{ nextId: string; messages: StreamMessage[] }> {
  const raw = (await redisClient.sendCommand([
    "XAUTOCLAIM",
    params.streamKey,
    params.group,
    params.consumer,
    String(params.minIdleMs),
    params.startId ?? "0-0",
    "COUNT",
    String(params.count),
  ])) as unknown;

  if (!Array.isArray(raw) || raw.length < 2) {
    return { nextId: "0-0", messages: [] };
  }

  const nextId = typeof raw[0] === "string" ? raw[0] : "0-0";
  const messages = parseStreamRows(raw[1]);
  return { nextId, messages };
}

export async function xAddDlq(params: {
  streamKey: string;
  payload: string;
  error: string;
  sourceStream: string;
  sourceId: string;
  maxLen: number;
}) {
  await redisClient.xAdd(
    params.streamKey,
    "*",
    {
      payload: params.payload,
      error: params.error,
      source_stream: params.sourceStream,
      source_id: params.sourceId,
      ts: new Date().toISOString(),
    },
    {
      TRIM: {
        strategy: "MAXLEN",
        strategyModifier: "~",
        threshold: params.maxLen,
      },
    },
  );
}

// ─── Session-based agent presence (login/logout only) ──────────────

const PRESENCE_SET_KEY = "agents:online";

/** Mark a user as online (called on login). No TTL — persists until explicit logout. */
export async function markAgentOnline(userId: string): Promise<void> {
  await redisClient.sAdd(PRESENCE_SET_KEY, userId);
}

/** Mark a user as offline (called on logout). */
export async function markAgentOffline(userId: string): Promise<void> {
  await redisClient.sRem(PRESENCE_SET_KEY, userId);
}

/** Check if a user has an active session. */
export async function isAgentOnline(userId: string): Promise<boolean> {
  return redisClient.sIsMember(PRESENCE_SET_KEY, userId);
}

/** Get all online user IDs. */
export async function getOnlineAgentIds(): Promise<string[]> {
  return redisClient.sMembers(PRESENCE_SET_KEY);
}

/** Count of users with active sessions. */
export async function countOnlineAgents(): Promise<number> {
  return redisClient.sCard(PRESENCE_SET_KEY);
}

/**
 * Seed the agents:online set from the database on backend startup.
 * Adds all user_ids that have at least one non-revoked, non-expired refresh token.
 * This ensures agents who were already logged in before a deploy/restart
 * appear as "connected" without needing to re-login.
 */
export async function seedOnlineAgentsFromDb(pool: { query: (sql: string) => Promise<{ rows: Array<{ user_id: string }> }> }): Promise<number> {
  const { rows } = await pool.query(
    `SELECT DISTINCT user_id::text AS user_id
     FROM refresh_tokens
     WHERE revoked_at IS NULL AND expires_at > now()`,
  );

  if (rows.length === 0) return 0;

  const userIds = rows.map((r) => r.user_id);
  await redisClient.sAdd(PRESENCE_SET_KEY, userIds);
  return userIds.length;
}

export async function getStreamLag(streamKey: string, group: string): Promise<number> {
  const raw = (await redisClient.sendCommand(["XINFO", "GROUPS", streamKey])) as unknown;
  if (!Array.isArray(raw)) return 0;

  for (const groupRow of raw) {
    if (!Array.isArray(groupRow)) continue;
    const entries = groupRow as Array<string | number>;
    let name: string | null = null;
    let lag = 0;
    for (let i = 0; i < entries.length; i += 2) {
      const key = entries[i];
      const val = entries[i + 1];
      if (key === "name" && typeof val === "string") {
        name = val;
      }
      if (key === "lag" && (typeof val === "number" || typeof val === "string")) {
        lag = Number(val);
      }
    }
    if (name === group) {
      return Number.isFinite(lag) ? lag : 0;
    }
  }

  return 0;
}
