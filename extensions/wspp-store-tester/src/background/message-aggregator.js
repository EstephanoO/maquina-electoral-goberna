// message-aggregator.js — buffer de mensajes fragmentados por remitente.

import { classifyWithGeminiFallback } from './gemini-fallback.js';

const _msgBuffer = new Map(); // phone → { texts: string[], timer: number, resolve: fn }
const MSG_BUFFER_WINDOW_MS = 12000; // H-2: reduced from 45s to 12s
const MSG_BUFFER_MAX_ENTRIES = 200; // H-2: prevent unbounded growth
const MSG_BUFFER_MAX_TEXTS = 20;   // S-8: max messages aggregated per phone
export const MSG_BUFFER_SUPERSEDED = Object.freeze({ __superseded: true }); // M-5: sentinel value

/**
 * Agrega un mensaje al buffer de un teléfono.
 * Retorna una Promise que resuelve con el texto agregado cuando cierra la ventana,
 * o MSG_BUFFER_SUPERSEDED si fue reemplazado por uno más nuevo.
 */
function bufferMessage(phone, text) {
  if (_msgBuffer.size >= MSG_BUFFER_MAX_ENTRIES && !_msgBuffer.has(phone)) {
    const oldestKey = _msgBuffer.keys().next().value;
    const oldest = _msgBuffer.get(oldestKey);
    if (oldest) {
      clearTimeout(oldest.timer);
      const aggregated = oldest.texts.join(' ');
      _msgBuffer.delete(oldestKey);
      if (oldest.resolve) oldest.resolve(aggregated);
    }
  }

  return new Promise((resolve) => {
    const existing = _msgBuffer.get(phone);

    if (existing) {
      if (existing.texts.length < MSG_BUFFER_MAX_TEXTS) {
        existing.texts.push(text);
      }
      clearTimeout(existing.timer);
      if (existing.resolve) existing.resolve(MSG_BUFFER_SUPERSEDED);
      existing.resolve = resolve;
      existing.timer = setTimeout(() => {
        const aggregated = existing.texts.join(' ');
        _msgBuffer.delete(phone);
        resolve(aggregated);
      }, MSG_BUFFER_WINDOW_MS);
    } else {
      const entry = {
        texts: [text],
        resolve,
        timer: setTimeout(() => {
          _msgBuffer.delete(phone);
          resolve(text);
        }, MSG_BUFFER_WINDOW_MS),
      };
      _msgBuffer.set(phone, entry);
    }
  });
}

/**
 * Clasificación con agregación: usa el buffer si el mensaje es corto.
 * Mensajes largos (>80 chars) se clasifican inmediatamente.
 */
export async function classifyWithAggregation(phone, text, fromJid) {
  if (!text) return null;

  if (text.length > 80) {
    return classifyWithGeminiFallback(phone, text, fromJid);
  }

  const bufferKey = phone || fromJid;
  if (!bufferKey) return classifyWithGeminiFallback(phone, text, fromJid);

  const aggregated = await bufferMessage(bufferKey, text);
  if (aggregated === MSG_BUFFER_SUPERSEDED) return MSG_BUFFER_SUPERSEDED;
  if (!aggregated) return null;
  return classifyWithGeminiFallback(phone, aggregated, fromJid);
}
