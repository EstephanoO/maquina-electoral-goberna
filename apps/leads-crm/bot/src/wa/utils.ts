import type { proto } from "baileys";

/**
 * Helpers puros del WhatsApp pipeline. Sin dependencias del WASocket ni de la
 * instancia — testeable en isolation, importable desde donde sea necesario.
 */

/**
 * Slug normalizado para tags. "Consultor Político" → "consultor-politico".
 * Mantiene los tags consistentes (sin acentos, espacios, mayúsculas) para
 * que el filtro/búsqueda en CRM no se rompa por variaciones de escritura.
 */
export function slugifyTag(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Normaliza un JID quitando el sufijo de device (`:N`) antes del `@`.
 * Los retries de WhatsApp vienen addressed a JIDs device-specific
 * (ej. `51955135507:11@s.whatsapp.net`) pero cacheamos por base user JID.
 */
export function normalizeJid(jid: string): string {
  if (!jid) return jid;
  const at = jid.indexOf("@");
  if (at <= 0) return jid;
  const user = jid.slice(0, at);
  const server = jid.slice(at);
  const colon = user.indexOf(":");
  const bareUser = colon >= 0 ? user.slice(0, colon) : user;
  return bareUser + server;
}

/**
 * Detecta el tipo de mensaje desde el shape de msg.message. Devuelve un
 * label compartido con electoral wa-events. El bot lo usa en `meta.message_type`
 * de la interaction de leads-crm para que el chat panel sepa qué renderizar.
 */
export function detectMessageType(msg: any):
  "text" | "image" | "audio" | "video" | "document" | "sticker" | "location" | "contact" | "system" {
  const m = msg.message;
  if (!m) return "system";
  if (m.imageMessage) return "image";
  if (m.videoMessage) return "video";
  if (m.audioMessage) return "audio";
  if (m.documentMessage) return "document";
  if (m.stickerMessage) return "sticker";
  if (m.locationMessage || m.liveLocationMessage) return "location";
  if (m.contactMessage || m.contactsArrayMessage) return "contact";
  return "text";
}

/**
 * Extrae el texto del mensaje. Maneja:
 *   - texto plano (conversation, extendedTextMessage)
 *   - captions de media (image/video/document)
 *   - replies a botones / lists / templates / interactives
 * Devuelve null si no encontró texto (ej. audio sin transcribir, sticker, location).
 */
export function extractText(msg: any): string | null {
  const m = msg.message;
  if (!m) return null;
  // Texto plano
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  // Captions de media
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  if (m.documentMessage?.caption) return m.documentMessage.caption;
  // Replies de botones / lists / templates
  if (m.buttonsResponseMessage?.selectedDisplayText) return m.buttonsResponseMessage.selectedDisplayText;
  if (m.listResponseMessage?.title) return m.listResponseMessage.title;
  if (m.templateButtonReplyMessage?.selectedDisplayText) return m.templateButtonReplyMessage.selectedDisplayText;
  // Interactive responses
  if (m.interactiveResponseMessage?.body?.text) return m.interactiveResponseMessage.body.text;
  return null;
}

/** Promise-based sleep helper. */
export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/** Re-export por conveniencia. */
export type { proto };
