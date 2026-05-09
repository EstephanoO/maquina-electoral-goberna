/**
 * WhatsApp OTP — generación, almacenamiento, envío y verificación.
 *
 * Flujo:
 *   1. send(phone) → genera código de 6 dígitos, guarda hash en Redis con TTL
 *      5 min y attempts=0, llama al bot leads-crm (POST /send/:instance) para
 *      que despache el mensaje por Baileys.
 *   2. verify(phone, code) → lee hash, compara con timing-safe equal,
 *      incrementa attempts, borra entrada si OK o si attempts >= 3.
 *
 * Rate limit: 1 send cada 60s por número (lock en Redis), endpoints también
 * tienen rate limit por IP via fastify-rate-limit.
 *
 * Phone normalization: aceptamos los mismos formatos que repository.findUserByPhone:
 *   - "987654321" (9 dígitos PE)
 *   - "51987654321" (E.164 PE sin +)
 *   - "+51987654321" → se normaliza a "51987654321"
 *   El hash en Redis usa SIEMPRE la forma normalizada (solo dígitos).
 */
import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { redisClient } from "../../infra/redis";

const OTP_TTL_SECONDS = 300; // 5 minutos
const SEND_LOCK_SECONDS = 60; // 1 minuto entre sends al mismo número
const MAX_ATTEMPTS = 3;

export type OtpSendResult =
  | { ok: true; expiresIn: number }
  | { ok: false; code: "RATE_LIMITED"; retryAfterSeconds: number }
  | { ok: false; code: "BOT_NOT_CONFIGURED" }
  | { ok: false; code: "BOT_SEND_FAILED"; detail: string };

export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; code: "OTP_NOT_FOUND" }
  | { ok: false; code: "OTP_EXPIRED" }
  | { ok: false; code: "OTP_INVALID"; attemptsLeft: number }
  | { ok: false; code: "OTP_LOCKED" };

export function normalizePhone(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * E.164 sin `+` para Baileys. Para PE asume `51` cuando el número parece local
 * (9 dígitos empezando con 9). El bot construye JID como `${digits}@s.whatsapp.net`,
 * por lo que un 9 dígitos sin código país produciría un JID inválido.
 */
export function toE164ForBot(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 9 && digits.startsWith("9")) {
    return `51${digits}`;
  }
  return digits;
}

function otpKey(phone: string): string {
  return `otp:wa:${phone}`;
}

function lockKey(phone: string): string {
  return `otp:wa:lock:${phone}`;
}

function hashCode(code: string, phone: string): string {
  // Salt with phone para que no sirva un hash precomputado.
  return createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

function generateCode(): string {
  // 6 dígitos con padding (e.g. "012345").
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Send OTP via WhatsApp bot.
 */
export async function sendOtp(
  phone: string,
  options: {
    botUrl: string;
    botInstance: string;
    botToken?: string;
    log?: (msg: string, payload?: unknown) => void;
  },
): Promise<OtpSendResult> {
  const normalized = normalizePhone(phone);
  if (normalized.length < 9 || normalized.length > 15) {
    return { ok: false, code: "BOT_SEND_FAILED", detail: "phone inválido" };
  }

  if (!options.botUrl) {
    return { ok: false, code: "BOT_NOT_CONFIGURED" };
  }

  // Rate limit: 1 send cada 60s.
  const lockSet = await redisClient.set(lockKey(normalized), "1", {
    NX: true,
    EX: SEND_LOCK_SECONDS,
  });
  if (!lockSet) {
    const ttl = await redisClient.ttl(lockKey(normalized));
    return {
      ok: false,
      code: "RATE_LIMITED",
      retryAfterSeconds: ttl > 0 ? ttl : SEND_LOCK_SECONDS,
    };
  }

  const code = generateCode();
  const hash = hashCode(code, normalized);

  // Store hash + attempts=0. Reuse mismo TTL.
  await redisClient.set(
    otpKey(normalized),
    JSON.stringify({ hash, attempts: 0 }),
    { EX: OTP_TTL_SECONDS },
  );

  // Send via bot HTTP.
  const message = `*Goberna Territorio*\n\nTu código de acceso es: *${code}*\n\nVálido por 5 minutos. No lo compartas con nadie.`;

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (options.botToken) headers["Authorization"] = `Bearer ${options.botToken}`;

    const url = `${options.botUrl.replace(/\/$/, "")}/send/${encodeURIComponent(options.botInstance)}`;
    // Bot construye JID como `${digits}@s.whatsapp.net` — necesita E.164 con
    // código país, no el número local de 9 dígitos.
    const botPhone = toE164ForBot(normalized);
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ phone: botPhone, message }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // Cleanup OTP and lock so user puede retentar inmediatamente.
      await redisClient.del([otpKey(normalized), lockKey(normalized)]);
      options.log?.("whatsapp-otp: bot send failed", { status: res.status, body: text.slice(0, 200) });
      return { ok: false, code: "BOT_SEND_FAILED", detail: `bot ${res.status}` };
    }
  } catch (err) {
    await redisClient.del([otpKey(normalized), lockKey(normalized)]);
    const detail = err instanceof Error ? err.message : "unknown";
    options.log?.("whatsapp-otp: bot fetch error", { detail });
    return { ok: false, code: "BOT_SEND_FAILED", detail: detail.slice(0, 120) };
  }

  return { ok: true, expiresIn: OTP_TTL_SECONDS };
}

/**
 * Verify a 6-digit code against the stored hash. Increments attempts; deletes
 * the entry on success or after MAX_ATTEMPTS failures.
 */
export async function verifyOtp(phone: string, code: string): Promise<OtpVerifyResult> {
  const normalized = normalizePhone(phone);
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, code: "OTP_INVALID", attemptsLeft: 0 };
  }

  const raw = await redisClient.get(otpKey(normalized));
  if (!raw) {
    return { ok: false, code: "OTP_NOT_FOUND" };
  }

  let stored: { hash: string; attempts: number };
  try {
    stored = JSON.parse(raw);
  } catch {
    await redisClient.del(otpKey(normalized));
    return { ok: false, code: "OTP_NOT_FOUND" };
  }

  if (stored.attempts >= MAX_ATTEMPTS) {
    await redisClient.del(otpKey(normalized));
    return { ok: false, code: "OTP_LOCKED" };
  }

  const expected = Buffer.from(stored.hash, "hex");
  const actual = Buffer.from(hashCode(code, normalized), "hex");
  const match = expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!match) {
    const newAttempts = stored.attempts + 1;
    if (newAttempts >= MAX_ATTEMPTS) {
      await redisClient.del(otpKey(normalized));
      return { ok: false, code: "OTP_LOCKED" };
    }
    // Re-set con TTL preservado (approx — usamos pTtl para no extender).
    const remainingTtl = await redisClient.ttl(otpKey(normalized));
    await redisClient.set(
      otpKey(normalized),
      JSON.stringify({ hash: stored.hash, attempts: newAttempts }),
      { EX: remainingTtl > 0 ? remainingTtl : OTP_TTL_SECONDS },
    );
    return { ok: false, code: "OTP_INVALID", attemptsLeft: MAX_ATTEMPTS - newAttempts };
  }

  // Match: borrar entrada (one-shot use) y release lock.
  await redisClient.del([otpKey(normalized), lockKey(normalized)]);
  return { ok: true };
}
