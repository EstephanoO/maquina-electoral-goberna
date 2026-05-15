export type AppEnv = {
  nodeEnv: string;
  port: number;
  frontendOrigins: string[];
  databaseUrl: string;
  // DATABASE_URL secundario apuntando a onboarding_fase1. Source of truth para
  // catálogos del geógrafo + candidatos en pipeline + datos externos enriquecedores.
  // Si vacío, los endpoints /onboarding-fase1/* devuelven 503.
  onboardingDatabaseUrl: string;
  redisUrl: string;
  jwtSecret: string;
  jwtAccessExpiresIn: string;
  jwtRefreshExpiresIn: string;
  bcryptRounds: number;
  tegolaBaseUrl: string;
  tegolaMap: string;
  requestTimeoutMs: number;
  upstreamRetries: number;
  logLevel: string;
  rateLimitMaxPerMinute: number;
  rateLimitFormsPerMinute: number;
  rateLimitFormsIpPerMinute: number;
  rateLimitFormsWindowSec: number;
  rateLimitAgentsLocationPerMinute: number;
  rateLimitAgentsLivePerMinute: number;
  rateLimitAgentsStreamPerMinute: number;
  formsBatchRequestLimit: number;
  formsWriteBehindBatchSize: number;
  formsWriteBehindFlushMs: number;
  formsWriteBehindMaxQueue: number;
  agentIngestToken: string;
  // Shared secret for nexus-control → electoral server-to-server provisioning
  // (POST /api/onboarding/provisioned). If empty, that endpoint responds 503.
  onboardingServiceToken: string;
  // Public base URL — usado para armar el dashboard_url que devuelve
  // /api/onboarding/provisioned al wizard.
  publicBaseUrl: string;
  agentStaleAfterMs: number;
  agentStreamHeartbeatMs: number;
  agentStreamBatchFlushMs: number;
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
  uploadsDir: string;
  rateLimitAuthPerMinute: number;
  refreshTokenCleanupIntervalMs: number;
  locationHistoryRetentionDays: number;
  // Default tracking config pushed to mobile clients via WS welcome message
  trackingDefaultIntervalMs: number;
  trackingDefaultDistanceM: number;
  // Health check: max acceptable stream lag before health endpoint degrades
  trackingHealthMaxLag: number;
  // Telegram — notificaciones de leads (opcional)
  telegramBotToken: string;
  telegramChatId: string;
  // Gemini — clasificacion AI de mensajes (opcional, Gemini 2.5 Flash Lite)
  geminiApiKey: string;
  // Telegram — IDs de usuarios autorizados para comandos de escritura (comma-separated)
  telegramAdminIds: number[];
  // ElevenLabs — TTS proxy para notas de voz (opcional)
  elevenlabsApiKey: string;
  // Bot Baileys — secret compartido para autenticar pushes/pulls del bot
  // (POST /api/cms/wa-events, GET /api/cms/active-wa-phones).
  // Si vacío, esos endpoints responden 503 (no configurado).
  botSharedSecret: string;
  // Engagement: nro de interacciones bidireccionales (in + out) para subir
  // un voter_profile a pipeline_status='fidelizado'.
  fidelizadoThreshold: number;
  // Engagement: horas sin inbound tras un outbound antes de marcar 'no_responde'.
  noRespondeAfterHours: number;
  // Firebase Phone Auth — project ID para verificar ID tokens emitidos por
  // Firebase desde mobile. Si vacío, /api/auth/firebase-verify responde 503.
  firebaseProjectId: string;
  // WhatsApp OTP — bot leads-crm que envía códigos por Baileys. URL apunta al
  // server.ts del bot (POST /send/:instanceId), instanceId típicamente "p4".
  // Si whatsappBotUrl está vacío, /api/auth/whatsapp/send responde 503.
  whatsappBotUrl: string;
  whatsappBotInstance: string;
  // Demo bypass para Apple Review — si GOBERNA_DEMO_PHONE está vacío el bypass
  // está completamente deshabilitado y el flujo normal se preserva.
  demoPhone: string;
  demoOtp: string;
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

/**
 * If REDIS_URL has no auth but REDIS_PASSWORD is set, inject the password.
 * Handles the common misconfiguration where docker-compose sets --requirepass
 * but the REDIS_URL doesn't include the password.
 *
 * redis://redis:6379 + REDIS_PASSWORD=secret → redis://:secret@redis:6379
 */
function resolveRedisUrl(): string {
  const raw = (process.env.REDIS_URL ?? "redis://127.0.0.1:6379").trim();
  const redisPassword = (process.env.REDIS_PASSWORD ?? "").trim();

  if (!redisPassword) return raw;

  try {
    const parsed = new URL(raw);
    // If URL already has a password, leave it as-is
    if (parsed.password) return raw;
    parsed.password = redisPassword;
    return parsed.toString();
  } catch {
    // If URL parsing fails, return as-is
    return raw;
  }
}

export function getEnv(): AppEnv {
  const databaseUrl = (process.env.DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL no configurada");
  }
  const redisUrl = resolveRedisUrl();

  const frontendRaw = process.env.FRONTEND_ORIGINS ?? process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

  const jwtSecret = (process.env.JWT_SECRET ?? "").trim();
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error("JWT_SECRET no configurada o demasiado corta (minimo 32 chars)");
  }

  return {
    nodeEnv: process.env.NODE_ENV ?? "development",
    port: toNumber(process.env.BACKEND_PORT ?? process.env.PORT, 3001),
    frontendOrigins: parseOrigins(frontendRaw),
    databaseUrl,
    onboardingDatabaseUrl: (process.env.ONBOARDING_DATABASE_URL ?? "").trim(),
    redisUrl,
    jwtSecret,
    jwtAccessExpiresIn: (process.env.JWT_ACCESS_EXPIRES_IN ?? "365d").trim(),
    jwtRefreshExpiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ?? "365d").trim(),
    bcryptRounds: toNumber(process.env.BCRYPT_ROUNDS, 10),
    tegolaBaseUrl: (process.env.TEGOLA_BASE_URL ?? "http://localhost:8080").replace(/\/$/, ""),
    tegolaMap: process.env.TEGOLA_MAP ?? "peru",
    requestTimeoutMs: toNumber(process.env.REQUEST_TIMEOUT_MS, 5000),
    upstreamRetries: toNumber(process.env.UPSTREAM_RETRIES, 2),
    logLevel: process.env.LOG_LEVEL ?? "info",
    rateLimitMaxPerMinute: toNumber(process.env.RATE_LIMIT_MAX_PER_MINUTE, 500000),
    rateLimitFormsPerMinute: toNumber(process.env.RATE_LIMIT_FORMS_PER_MINUTE, 1200),
    rateLimitFormsIpPerMinute: toNumber(process.env.RATE_LIMIT_FORMS_IP_PER_MINUTE, 12000),
    rateLimitFormsWindowSec: toNumber(process.env.RATE_LIMIT_FORMS_WINDOW_SEC, 60),
    rateLimitAgentsLocationPerMinute: toNumber(process.env.RATE_LIMIT_AGENTS_LOCATION_PER_MINUTE, 12000),
    rateLimitAgentsLivePerMinute: toNumber(process.env.RATE_LIMIT_AGENTS_LIVE_PER_MINUTE, 3000),
    rateLimitAgentsStreamPerMinute: toNumber(process.env.RATE_LIMIT_AGENTS_STREAM_PER_MINUTE, 500),
    formsBatchRequestLimit: toNumber(process.env.FORMS_BATCH_REQUEST_LIMIT, 200),
    formsWriteBehindBatchSize: toNumber(process.env.FORMS_WB_BATCH_SIZE, 200),
    formsWriteBehindFlushMs: toNumber(process.env.FORMS_WB_FLUSH_MS, 300),
    formsWriteBehindMaxQueue: toNumber(process.env.FORMS_WB_MAX_QUEUE, 10000),
    agentIngestToken: (process.env.AGENT_INGEST_TOKEN ?? "").trim(),
    onboardingServiceToken: (process.env.ONBOARDING_SERVICE_TOKEN ?? "").trim(),
    publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? "https://electoral.goberna.club").replace(/\/$/, ""),
    agentStaleAfterMs: toNumber(process.env.AGENT_STALE_AFTER_MS, 120000),
    agentStreamHeartbeatMs: toNumber(process.env.AGENT_STREAM_HEARTBEAT_MS, 25000),
    agentStreamBatchFlushMs: toNumber(process.env.AGENT_STREAM_BATCH_FLUSH_MS, 120),
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
    uploadsDir: (process.env.UPLOADS_DIR ?? "/srv/uploads").trim(),
    rateLimitAuthPerMinute: toNumber(process.env.RATE_LIMIT_AUTH_PER_MINUTE, 10),
    refreshTokenCleanupIntervalMs: toNumber(process.env.REFRESH_TOKEN_CLEANUP_INTERVAL_MS, 3600000),
    locationHistoryRetentionDays: toNumber(process.env.LOCATION_HISTORY_RETENTION_DAYS, 7),
    trackingDefaultIntervalMs: toNumber(process.env.TRACKING_DEFAULT_INTERVAL_MS, 15000),
    trackingDefaultDistanceM: toNumber(process.env.TRACKING_DEFAULT_DISTANCE_M, 5),
    trackingHealthMaxLag: toNumber(process.env.TRACKING_HEALTH_MAX_LAG, 1000),
    telegramBotToken: (process.env.TELEGRAM_BOT_TOKEN ?? "").trim(),
    telegramChatId: (process.env.TELEGRAM_CHAT_ID ?? "").trim(),
    geminiApiKey: (process.env.GEMINI_API_KEY ?? "").trim(),
    telegramAdminIds: (process.env.TELEGRAM_ADMIN_IDS ?? "")
      .split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)),
    elevenlabsApiKey: (process.env.ELEVENLABS_API_KEY ?? "").trim(),
    botSharedSecret: (process.env.BOT_SHARED_SECRET ?? "").trim(),
    fidelizadoThreshold: toNumber(process.env.FIDELIZADO_THRESHOLD, 4),
    noRespondeAfterHours: toNumber(process.env.NO_RESPONDE_AFTER_HOURS, 48),
    firebaseProjectId: (process.env.FIREBASE_PROJECT_ID ?? "").trim(),
    whatsappBotUrl: (process.env.WHATSAPP_BOT_URL ?? "").trim(),
    whatsappBotInstance: (process.env.WHATSAPP_BOT_INSTANCE ?? "p4").trim(),
    demoPhone: (process.env.GOBERNA_DEMO_PHONE ?? '').replace(/\D/g, ''),
    demoOtp: (process.env.GOBERNA_DEMO_OTP ?? '').trim(),
  };
}
