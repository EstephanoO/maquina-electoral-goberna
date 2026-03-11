// jid-resolver.js — JID→phone cache e indexes para resolución O(1).

import { _ownNumber } from './bootstrap.js';

// ─── JID→phone cache ──────────────────────────────────────────────────────
// Persists successful @lid→phone resolutions so we don't re-resolve every time.
// Max 2000 entries, LRU-ish (oldest entries dropped when full).
const _jidPhoneCache = new Map();
const JID_CACHE_MAX = 2000;

// PERF v7.1.0: JID→model indexes for O(1) lookups (was O(n) .find() per message)
let _contactIndex = null; // Map<serialized_jid, ContactModel>
let _chatIndex = null;    // Map<serialized_jid, ChatModel>
let _indexBuiltAt = 0;
const INDEX_REFRESH_MS = 60000; // rebuild every 60s

export function getContactIndex() {
  const now = Date.now();
  if (_contactIndex && (now - _indexBuiltAt) < INDEX_REFRESH_MS) return _contactIndex;
  try {
    const { ContactCollection } = window.require('WAWebContactCollection');
    if (ContactCollection && ContactCollection._models) {
      _contactIndex = new Map();
      for (const c of ContactCollection._models) {
        const key = c.id?._serialized;
        if (key) _contactIndex.set(key, c);
      }
      _indexBuiltAt = now;
    }
  } catch (_) { /* module not ready yet */ }
  return _contactIndex;
}

export function getChatIndex() {
  const now = Date.now();
  if (_chatIndex && (now - _indexBuiltAt) < INDEX_REFRESH_MS) return _chatIndex;
  try {
    const { ChatCollection } = window.require('WAWebChatCollection');
    if (ChatCollection && ChatCollection._models) {
      _chatIndex = new Map();
      for (const c of ChatCollection._models) {
        const key = c.id?._serialized;
        if (key) _chatIndex.set(key, c);
      }
    }
  } catch (_) { /* module not ready yet */ }
  return _chatIndex;
}

function cachePhone(jid, phone) {
  if (!jid || !phone) return;
  if (_jidPhoneCache.size >= JID_CACHE_MAX) {
    // Drop oldest entry
    const first = _jidPhoneCache.keys().next().value;
    _jidPhoneCache.delete(first);
  }
  _jidPhoneCache.set(jid, phone);
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** Extrae número de un JID de WA ("5198765432@c.us" → "5198765432"). Filtra grupos. */
export function jidToNumber(jid) {
  if (!jid || typeof jid !== 'string') return null;
  if (jid.includes('@g.us') || jid.includes('@broadcast') || jid.includes('@newsletter')) return null;
  if (jid.includes('@lid')) return null; // nuevo formato WA — no tiene teléfono en el JID
  const num = jid.replace(/@.+$/, '').replace(/\D/g, '');
  return (num.length >= 10 && num.length <= 13) ? num : null;
}

/**
 * Resuelve el número de teléfono para un JID @lid usando WA's internal models.
 * WA internally keeps a mapping from @lid to @c.us JIDs in multiple places:
 *   - Contact model: .userid, .number, .phoneNumber properties
 *   - Chat model: .contact?.userid
 *   - WAWebWidFactory.createWid / numberToLid reverse-lookup
 *
 * Returns the phone number string (digits only) or null.
 */
export function resolvePhoneFromLid(lidJid) {
  if (!lidJid || !lidJid.includes('@lid')) return null;

  // Strategy 0: Check cache first
  const cached = _jidPhoneCache.get(lidJid);
  if (cached) return cached;

  let resolved = null;

  try {
    // Strategy 1: Look up contact by @lid JID — check multiple phone properties
    // PERF v7.1.0: Use indexed Map instead of linear scan
    const contactIdx = getContactIndex();
    if (contactIdx) {
      const contact = contactIdx.get(lidJid);
      if (contact) {
        const candidates = [
          contact.userid,
          contact.number,
          contact.phoneNumber,
          contact.jid?.user,
          contact.plaintextDisabled, // some WA versions store phone here
        ];
        for (const val of candidates) {
          if (val && typeof val === 'string') {
            const digits = val.replace(/\D/g, '');
            if (digits.length >= 9 && digits.length <= 15) { resolved = digits; break; }
          }
        }
      }
    }
  } catch (e) { console.warn('[WSPP] resolvePhoneFromLid S1 error:', e.message); }

  if (!resolved) try {
    // Strategy 2: Look up chat by @lid JID — chat.contact might have the phone
    // PERF v7.1.0: Use indexed Map instead of linear scan
    const chatIdx = getChatIndex();
    if (chatIdx) {
      const chat = chatIdx.get(lidJid);
      if (chat) {
        const contact = chat.contact;
        if (contact) {
          const candidates = [contact.userid, contact.number, contact.phoneNumber];
          for (const val of candidates) {
            if (val && typeof val === 'string') {
              const digits = val.replace(/\D/g, '');
              if (digits.length >= 9 && digits.length <= 15) { resolved = digits; break; }
            }
          }
        }
        if (!resolved && chat.formattedUser) {
          const digits = chat.formattedUser.replace(/\D/g, '');
          if (digits.length >= 9 && digits.length <= 15) resolved = digits;
        }
      }
    }
  } catch (e) { console.warn('[WSPP] resolvePhoneFromLid S2 error:', e.message); }

  if (!resolved) try {
    // Strategy 3: WAWebWidFactory — numberForLid / createUserWid
    const wid = window.require('WAWebWidFactory');
    if (wid && typeof wid.numberForLid === 'function') {
      const num = wid.numberForLid(lidJid);
      if (num) {
        const digits = String(num).replace(/\D/g, '');
        if (digits.length >= 9 && digits.length <= 15) resolved = digits;
      }
    }
  } catch (e) { console.warn('[WSPP] resolvePhoneFromLid S3 error:', e.message); }

  if (!resolved) try {
    // Strategy 4: Scan the active chat header DOM for phone subtitle
    // WA shows "~+51 987 654 321" under the contact name in the chat header
    const header = document.querySelector('#main header');
    if (header) {
      const spans = header.querySelectorAll('span[title], span[dir]');
      for (const s of spans) {
        const txt = (s.getAttribute('title') || s.textContent || '').trim();
        const digits = txt.replace(/[^0-9]/g, '');
        if (digits.length >= 9 && digits.length <= 15) { resolved = digits; break; }
      }
    }
  } catch (e) { console.warn('[WSPP] resolvePhoneFromLid S4 error:', e.message); }

  // Cache successful resolution
  if (resolved) {
    cachePhone(lidJid, resolved);
    console.log('[WSPP] @lid resolved:', lidJid.substring(0, 15) + '…', '→', resolved, '(cached)');
  }

  return resolved;
}

/**
 * Extrae el nombre del contacto activo desde el item seleccionado en la lista de chats.
 * El div con aria-selected="true" en #pane-side siempre tiene span[title] con el nombre.
 * Fallback: aria-label del composer del chat (NO del buscador).
 */
export function getActiveContactName() {
  // ── 1. aria-selected en la lista de chats (más confiable) ────────────────
  try {
    const selected = document.querySelector('#pane-side [aria-selected="true"]')
      ?? document.querySelector('[aria-selected="true"]');
    if (selected) {
      const spans = selected.querySelectorAll('span[title]');
      for (const s of spans) {
        const t = (s.getAttribute('title') || '').trim();
        // Ignorar strings vacíos, puntos invisibles y separadores
        if (t && t.length > 1 && !/^[\u200e\u200f\u202a-\u202e\s.]+$/.test(t)) {
          return t;
        }
      }
    }
  } catch (_) {}

  // ── 2. aria-label del composer del chat (NO del buscador) ────────────────
  try {
    // El composer del chat tiene data-tab o está dentro de #main / .two
    // El buscador tiene aria-label que contiene "búsqueda" / "search"
    const allComposers = document.querySelectorAll('[role="textbox"][contenteditable="true"]');
    for (const composer of allComposers) {
      const aria = composer.getAttribute('aria-label') || '';
      if (/búsqueda|search|buscar/i.test(aria)) continue; // saltar buscador
      const m = aria.match(/^(?:Escribe a|Type a message to)\s+(.+?)\.?$/i);
      if (m) return m[1].trim();
    }
  } catch (_) {}

  return null;
}

// M-7: Removed findOwnJidInCache() — used dead webpack reference (__wr).

/**
 * Número propio del celular.
 * Fuente de verdad: storage (via content.js → WSPP_SET_OWN_NUMBER).
 * M-7: Removed webpack fallback — WA uses Metro, not webpack.
 */
export function getOwnNumber() {
  return _ownNumber || null;
}

/**
 * Normaliza un string con número de teléfono a solo dígitos.
 * "+51 980 493 473" → "51980493473"
 */
export function normalizePhone(raw) {
  if (!raw) return null;
  const n = raw.replace(/\D/g, '');
  return (n.length >= 10 && n.length <= 13) ? n : null;
}

/**
 * Teléfono del contacto en el chat actualmente abierto.
 *
 * WA Web 2026 NO expone el número en el header ni en span[title] del chat activo.
 * Solo expone el nombre. Estrategias en orden:
 *
 * 1. aria-selected en #pane-side → span[title] que sea un número de teléfono
 *    (contactos no guardados muestran su número como nombre)
 * 2. webpack cache: chat activo con JID válido (no @lid, no @g.us)
 */
export function getActivePhone() {
  // ── 1. aria-selected en la lista → span[title] con número ─────────────
  try {
    const selected = document.querySelector('#pane-side [aria-selected="true"]')
      ?? document.querySelector('[aria-selected="true"]');
    if (selected) {
      const spans = selected.querySelectorAll('span[title]');
      for (const s of spans) {
        const n = normalizePhone(s.getAttribute('title'));
        if (n) return n;
      }
    }
  } catch (_) {}

  // M-7: Removed webpack cache scan — WA uses Metro. Use ChatCollection instead.
  try {
    const { ChatCollection } = window.require('WAWebChatCollection');
    if (ChatCollection && ChatCollection._models) {
      const active = ChatCollection._models.find(c => c.active);
      if (active && active.id?._serialized) {
        const n = jidToNumber(active.id._serialized);
        if (n) return n;
        // Try resolving @lid to phone
        if (active.id._serialized.includes('@lid')) {
          const resolved = resolvePhoneFromLid(active.id._serialized);
          if (resolved) return resolved;
        }
      }
    }
  } catch (_) {}

  return null;
}
