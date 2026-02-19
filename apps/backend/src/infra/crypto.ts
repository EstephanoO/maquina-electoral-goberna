/**
 * GOBERNA — Crypto helpers (AES-256-GCM)
 *
 * Usado para cifrar/descifrar credenciales sensibles (ej. Twilio auth_token)
 * antes de guardarlas en la base de datos.
 *
 * Formato del ciphertext almacenado (base64):
 *   iv(12 bytes) | authTag(16 bytes) | encrypted(N bytes)
 *
 * La clave maestra se lee de TWILIO_ENCRYPTION_KEY (64 hex chars = 32 bytes).
 * Si la clave no está configurada, las funciones lanzan error en runtime.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getMasterKey(): Buffer {
  const hex = (process.env.TWILIO_ENCRYPTION_KEY ?? "").trim();
  if (!hex || hex.length !== 64) {
    throw new Error(
      "TWILIO_ENCRYPTION_KEY no configurada o inválida (debe ser 64 chars hex = 32 bytes). " +
      "Generarla con: openssl rand -hex 32",
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Cifra un texto plano con AES-256-GCM.
 * Devuelve base64: iv(12) + tag(16) + encrypted.
 */
export function encrypt(plaintext: string): string {
  const key = getMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/**
 * Descifra un ciphertext base64 generado por `encrypt`.
 * Lanza si el ciphertext está corrupto o la clave es incorrecta.
 */
export function decrypt(ciphertext: string): string {
  const key = getMasterKey();
  const buf = Buffer.from(ciphertext, "base64");

  if (buf.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error("Ciphertext inválido: demasiado corto");
  }

  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Devuelve los últimos N chars de un token para mostrar como hint.
 * Ej: maskToken("abcdefgh1234", 4) → "****1234"
 */
export function maskToken(token: string, visibleChars = 4): string {
  if (!token || token.length <= visibleChars) return "****";
  return `****${token.slice(-visibleChars)}`;
}
