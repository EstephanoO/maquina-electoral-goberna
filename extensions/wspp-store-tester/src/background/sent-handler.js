// ═══════════════════════════════════════════════════════════════════════
// SENT EVENT DEDUP — WSPP_SENT (DOM) vs WSPP_SENT_RICH (MsgCollection)
// Both fire for the same outgoing message. WSPP_SENT_RICH has better
// phone resolution (from JID + resolvePhoneFromLid). Strategy:
//   - WSPP_SENT buffers for DEDUP_WINDOW_MS before processing
//   - If WSPP_SENT_RICH arrives within the window, it supersedes WSPP_SENT
//   - If only WSPP_SENT arrives, it processes normally after the window
//   - WSPP_SENT_RICH also marks a key so late WSPP_SENT is dropped
// Key: own_number + Math.floor(timestamp / 2) — groups events within 2s
// ═══════════════════════════════════════════════════════════════════════

import { apiFetch } from './api-client.js';
import { recordOutgoing } from './spam-detector.js';
import { recordConversation } from './gemini-fallback.js';
import { reportConversation } from './received-handler.js';

const DEDUP_WINDOW_MS = 600;
const _sentDedup = new Map(); // dedupKey → { timer, processed }
const SENT_DEDUP_MAX = 100;   // prevent unbounded growth

export function makeSentDedupKey(own_number, timestamp) {
  // Group by 2-second buckets to handle slight timestamp differences
  return (own_number || 'unk') + ':' + Math.floor((timestamp || 0) / 2);
}

/**
 * Core logic: increment counter + report to backend.
 * Shared by both WSPP_SENT and WSPP_SENT_RICH handlers.
 */
export function processSentEvent(payload, source) {
  const { phone, own_number, contact_name, timestamp, body: msgBody } = payload;
  const messageText = msgBody || '';

  // 1. Increment local counter
  chrome.storage.local.get(['wspp_count'], (data) => {
    const next = (parseInt(data.wspp_count, 10) || 0) + 1;
    chrome.storage.local.set({ wspp_count: next });
  });

  // 2. Record for spam detection + conversation context
  // BUG FIX v7.1.0: pass actual message text instead of contact_name
  recordOutgoing(messageText || phone || '?', timestamp || Math.floor(Date.now() / 1000), phone, own_number);
  recordConversation(phone, messageText || '(sent)', 'out');

  // 3. Report to backend if there's something to report
  if (phone || contact_name) {
    const eventBody = {
      type:         'message_sent',
      phone:        phone || undefined,
      contact_name: contact_name || undefined,
      own_number:   own_number || undefined,
      detected_at:  (timestamp || Math.floor(Date.now() / 1000)) * 1000,
    };
    console.log(`[WSPP] → sent event (${source}):`, JSON.stringify(eventBody));
    apiFetch('/api/cms/extension-event', {
      method: 'POST',
      body:   JSON.stringify(eventBody),
    }).then(j => {
      if (j.ok) console.log('[WSPP backend] ✓', j.matched ? 'matched' : (j.filtered ? 'filtered' : 'ok'));
      else      console.warn('[WSPP backend] ✗', j.error || j.message || j.code);
    });
  }

  // 4. Report to conversations module (requires to_jid from WSPP_SENT_RICH)
  // BUG FIX v7.1.0: pass actual message text instead of placeholder
  const toJid = payload.to_jid;
  if (toJid) {
    reportConversation(toJid, own_number, 'out', messageText || '(mensaje enviado)', phone, contact_name);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// WSPP_SENT — DOM-based (click/Enter). Buffers briefly to allow
// WSPP_SENT_RICH to supersede with better phone data.
// ═══════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'WSPP_SENT') return;

  const { phone, own_number, contact_name, timestamp } = msg.payload;
  const dedupKey = makeSentDedupKey(own_number, timestamp);

  // Check if WSPP_SENT_RICH already processed this event
  const existing = _sentDedup.get(dedupKey);
  if (existing?.processed) {
    console.log('[WSPP DEDUP] WSPP_SENT dropped — already processed by WSPP_SENT_RICH');
    sendResponse({ ok: true, deduped: true });
    return;
  }

  // Buffer: wait DEDUP_WINDOW_MS for a potential WSPP_SENT_RICH
  // Evict oldest if at capacity
  if (_sentDedup.size >= SENT_DEDUP_MAX && !_sentDedup.has(dedupKey)) {
    const oldestKey = _sentDedup.keys().next().value;
    const oldest = _sentDedup.get(oldestKey);
    if (oldest?.timer) clearTimeout(oldest.timer);
    _sentDedup.delete(oldestKey);
  }

  const entry = {
    payload: msg.payload,
    processed: false,
    timer: setTimeout(() => {
      // Window closed without WSPP_SENT_RICH — process DOM-based event
      const e = _sentDedup.get(dedupKey);
      if (e && !e.processed) {
        e.processed = true;
        processSentEvent(e.payload, 'DOM');
        // Clean up after a bit
        setTimeout(() => _sentDedup.delete(dedupKey), 2000);
      }
    }, DEDUP_WINDOW_MS),
  };
  _sentDedup.set(dedupKey, entry);

  // Acknowledge immediately — actual counter increment happens in processSentEvent
  // Return current count (will update asynchronously once processed)
  chrome.storage.local.get(['wspp_count'], (data) => {
    sendResponse({ ok: true, count: data.wspp_count ?? 0 });
  });

  return true; // keep sendResponse alive for async storage callback
});

// ═══════════════════════════════════════════════════════════════════════
// WSPP_SENT_RICH — MsgCollection-based (higher fidelity phone resolution)
// Supersedes any buffered WSPP_SENT for the same message.
// ═══════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'WSPP_SENT_RICH') return;

  const { phone, own_number, contact_name, to_jid, timestamp } = msg.payload;
  const dedupKey = makeSentDedupKey(own_number, timestamp);

  // Check if WSPP_SENT already fully processed (rare — would mean DOM was faster + window closed)
  const existing = _sentDedup.get(dedupKey);
  if (existing?.processed) {
    console.log('[WSPP DEDUP] WSPP_SENT_RICH arrived late — DOM event already processed');
    // Still worth sending if RICH has a phone and DOM didn't
    if (phone && !existing.payload?.phone) {
      console.log('[WSPP DEDUP] RICH has phone, DOM didn\'t — sending supplemental event');
      processSentEvent(msg.payload, 'RICH-supplement');
    }
    sendResponse({ ok: true, deduped: true });
    return;
  }

  // Cancel the buffered WSPP_SENT timer — RICH supersedes it
  if (existing?.timer) {
    clearTimeout(existing.timer);
    console.log('[WSPP DEDUP] WSPP_SENT_RICH supersedes buffered WSPP_SENT',
      '| DOM phone:', existing.payload?.phone ?? 'null',
      '| RICH phone:', phone ?? 'null');
  }

  // Mark as processed and fire
  _sentDedup.set(dedupKey, { processed: true, payload: msg.payload });
  processSentEvent(msg.payload, 'RICH');

  // Clean up after 3s
  setTimeout(() => _sentDedup.delete(dedupKey), 3000);

  sendResponse({ ok: true, source: 'rich' });
  return true;
});

// ═══════════════════════════════════════════════════════════════════════
// TAB DETECTION — detectar si WA está abierto
// ═══════════════════════════════════════════════════════════════════════

chrome.tabs.onUpdated?.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && tab.url?.includes('web.whatsapp.com')) {
    chrome.storage.local.set({ wspp_wa_active: true });
  }
});
chrome.tabs.onRemoved?.addListener(() => {
  chrome.tabs.query({ url: '*://web.whatsapp.com/*' }, (tabs) => {
    chrome.storage.local.set({ wspp_wa_active: tabs.length > 0 });
  });
});
