export type AppEnv = {
  nodeEnv: string;
  port: number;
  frontendOrigins: string[];
  databaseUrl: string;
  redisUrl: string;
  tegolaBaseUrl: string;
  tegolaMap: string;
  requestTimeoutMs: number;
  upstreamRetries: number;
  logLevel: string;
  rateLimitMaxPerMinute: number;
  rateLimitFormsPerMinute: number;
  rateLimitAgentsLocationPerMinute: number;
  rateLimitAgentsLivePerMinute: number;
  rateLimitAgentsStreamPerMinute: number;
  formsBatchRequestLimit: number;
  formsWriteBehindBatchSize: number;
  formsWriteBehindFlushMs: number;
  formsWriteBehindMaxQueue: number;
  agentIngestToken: string;
  agentStaleAfterMs: number;
  agentStreamHeartbeatMs: number;
  trackingWriteBehindBatchSize: number;
  trackingWriteBehindFlushMs: number;
  trackingWriteBehindMaxQueue: number;
  dbPoolMax: number;
  dbIdleTimeoutMs: number;
  dbConnectionTimeoutMs: number;
  dbSslMode: string;
  trackingStreamKey: string;
  trackingStreamGroup: string;
  trackingSeqHashKey: string;
  trackingStreamMaxLen: number;
  formsStreamKey: string;
  formsStreamGroup: string;
  formsDedupePrefix: string;
  formsDedupeTtlSec: number;
  formsStreamMaxLen: number;
  streamConsumerBlockMs: number;
  streamClaimIdleMs: number;
  streamClaimBatchSize: number;
  streamDlqMaxAttempts: number;
  trackingDlqStreamKey: string;
  formsDlqStreamKey: string;
};

function toNumber(value: string | undefined, fallback: number): number {
  const next = Number(value ?? fallback);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

function parseOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function getEnv(): AppEnv {
  const databaseUrl = (process.env.DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL no configurada");
  }
  const redisUrl = (process.env.REDIS_URL ?? "redis://127.0.0.1:6379").trim();

  const frontendRaw = process.env.FRONTEND_ORIGINS ?? process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

  return {
    nodeEnv: process.env.NODE_ENV ?? "development",
    port: toNumber(process.env.BACKEND_PORT ?? process.env.PORT, 3001),
    frontendOrigins: parseOrigins(frontendRaw),
    databaseUrl,
    redisUrl,
    tegolaBaseUrl: (process.env.TEGOLA_BASE_URL ?? "http://localhost:8080").replace(/\/$/, ""),
    tegolaMap: process.env.TEGOLA_MAP ?? "peru",
    requestTimeoutMs: toNumber(process.env.REQUEST_TIMEOUT_MS, 5000),
    upstreamRetries: toNumber(process.env.UPSTREAM_RETRIES, 2),
    logLevel: process.env.LOG_LEVEL ?? "info",
    rateLimitMaxPerMinute: toNumber(process.env.RATE_LIMIT_MAX_PER_MINUTE, 500000),
    rateLimitFormsPerMinute: toNumber(process.env.RATE_LIMIT_FORMS_PER_MINUTE, 1200),
    rateLimitAgentsLocationPerMinute: toNumber(process.env.RATE_LIMIT_AGENTS_LOCATION_PER_MINUTE, 12000),
    rateLimitAgentsLivePerMinute: toNumber(process.env.RATE_LIMIT_AGENTS_LIVE_PER_MINUTE, 3000),
    rateLimitAgentsStreamPerMinute: toNumber(process.env.RATE_LIMIT_AGENTS_STREAM_PER_MINUTE, 500),
    formsBatchRequestLimit: toNumber(process.env.FORMS_BATCH_REQUEST_LIMIT, 200),
    formsWriteBehindBatchSize: toNumber(process.env.FORMS_WB_BATCH_SIZE, 200),
    formsWriteBehindFlushMs: toNumber(process.env.FORMS_WB_FLUSH_MS, 300),
    formsWriteBehindMaxQueue: toNumber(process.env.FORMS_WB_MAX_QUEUE, 10000),
    agentIngestToken: (process.env.AGENT_INGEST_TOKEN ?? "").trim(),
    agentStaleAfterMs: toNumber(process.env.AGENT_STALE_AFTER_MS, 120000),
    agentStreamHeartbeatMs: toNumber(process.env.AGENT_STREAM_HEARTBEAT_MS, 25000),
    trackingWriteBehindBatchSize: toNumber(process.env.TRACKING_WB_BATCH_SIZE, 300),
    trackingWriteBehindFlushMs: toNumber(process.env.TRACKING_WB_FLUSH_MS, 250),
    trackingWriteBehindMaxQueue: toNumber(process.env.TRACKING_WB_MAX_QUEUE, 10000),
    dbPoolMax: toNumber(process.env.DB_POOL_MAX, 30),
    dbIdleTimeoutMs: toNumber(process.env.DB_IDLE_TIMEOUT_MS, 30000),
    dbConnectionTimeoutMs: toNumber(process.env.DB_CONNECTION_TIMEOUT_MS, 5000),
    dbSslMode: (process.env.DB_SSL_MODE ?? "auto").trim().toLowerCase(),
    trackingStreamKey: (process.env.TRACKING_STREAM_KEY ?? "tracking:events").trim(),
    trackingStreamGroup: (process.env.TRACKING_STREAM_GROUP ?? "tracking-workers").trim(),
    trackingSeqHashKey: (process.env.TRACKING_SEQ_HASH_KEY ?? "tracking:last-seq").trim(),
    trackingStreamMaxLen: toNumber(process.env.TRACKING_STREAM_MAX_LEN, 200000),
    formsStreamKey: (process.env.FORMS_STREAM_KEY ?? "forms:events").trim(),
    formsStreamGroup: (process.env.FORMS_STREAM_GROUP ?? "forms-workers").trim(),
    formsDedupePrefix: (process.env.FORMS_DEDUPE_PREFIX ?? "forms:dedupe:").trim(),
    formsDedupeTtlSec: toNumber(process.env.FORMS_DEDUPE_TTL_SEC, 604800),
    formsStreamMaxLen: toNumber(process.env.FORMS_STREAM_MAX_LEN, 200000),
    streamConsumerBlockMs: toNumber(process.env.STREAM_CONSUMER_BLOCK_MS, 500),
    streamClaimIdleMs: toNumber(process.env.STREAM_CLAIM_IDLE_MS, 30000),
    streamClaimBatchSize: toNumber(process.env.STREAM_CLAIM_BATCH_SIZE, 200),
    streamDlqMaxAttempts: toNumber(process.env.STREAM_DLQ_MAX_ATTEMPTS, 5),
    trackingDlqStreamKey: (process.env.TRACKING_DLQ_STREAM_KEY ?? "tracking:dlq").trim(),
    formsDlqStreamKey: (process.env.FORMS_DLQ_STREAM_KEY ?? "forms:dlq").trim(),
  };
}
