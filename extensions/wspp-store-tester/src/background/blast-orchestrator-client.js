// blast-orchestrator-client.js
// Background module: polls the orchestrator backend every 30s
// for phone state, limits, and flags. Stores in chrome.storage.session
// for fast access by blast-panel.js and sidebar.js.
//
// See: docs/BLAST-V2-ARCHITECTURE.md §2.2

import { apiFetch } from './api-client.js';

// ── State ───────────────────────────────────────────────────────────
let _pollTimer = null;
let _lastState = null;
let _ownNumber = null;
const POLL_INTERVAL_MS = 30_000; // 30 seconds

// ── Public API ──────────────────────────────────────────────────────

/** Get the last known orchestrator state (may be null if not yet polled). */
export function getOrchestratorState() {
  return _lastState;
}

/** Start polling the orchestrator for a specific WA number. */
export function startOrchestratorPolling(waNumber) {
  if (!waNumber) return;
  _ownNumber = waNumber;
  _poll(); // immediate first poll
  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = setInterval(_poll, POLL_INTERVAL_MS);
}

/** Stop polling and heartbeat. */
export function stopOrchestratorPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  // FIX: Also stop heartbeat timer — previously it kept firing with _ownNumber=null
  if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
  _ownNumber = null;
  _lastState = null;
}

// ── Polling ─────────────────────────────────────────────────────────

async function _poll() {
  if (!_ownNumber) return;
  try {
    const result = await apiFetch(`/api/blast-orchestrator/phone-state/${_ownNumber}`);
    if (result?.ok) {
      _lastState = {
        registered: result.registered,
        state: result.state,
        daily_limit: result.daily_limit,
        hourly_limit: result.hourly_limit,
        sent_today: result.sent_today,
        failed_today: result.failed_today,
        replied_today: result.replied_today,
        no_wa_today: result.no_wa_today,
        spam_score: result.spam_score,
        reply_rate_7d: result.reply_rate_7d,
        quality_rating: result.quality_rating,
        warmup_day: result.warmup_day,
        in_operating_hours: result.in_operating_hours,
        can_send: result.can_send,
        polled_at: Date.now(),
      };
      // Persist to session storage for survival across SW wake cycles
      try {
        chrome.storage.session.set({ blast_orchestrator_state: _lastState });
      } catch (_) { /* session storage might not be available */ }
    }
  } catch (err) {
    console.warn('[ORCH] Poll failed:', err?.message || err);
    // Don't clear _lastState — use stale data, fail open
  }
}

// ── Restore state on SW wake ────────────────────────────────────────
// MV3 service workers can be evicted; restore last known state.
try {
  chrome.storage.session.get('blast_orchestrator_state', (data) => {
    if (data?.blast_orchestrator_state) {
      _lastState = data.blast_orchestrator_state;
    }
  });
} catch (_) { /* not critical */ }

// ── Signal sender ───────────────────────────────────────────────────

/** Send a signal to the orchestrator (state transition). */
export async function sendOrchestratorSignal(waNumber, signalType, extra = {}) {
  try {
    const result = await apiFetch('/api/blast-orchestrator/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wa_number: waNumber, type: signalType, ...extra }),
    });
    if (result?.ok && result.new_state) {
      // Update local state with new values
      if (_lastState) {
        _lastState.state = result.new_state;
        _lastState.sent_today = result.sent_today ?? _lastState.sent_today;
        _lastState.can_send = result.can_send ?? _lastState.can_send;
        _lastState.daily_limit = result.daily_limit ?? _lastState.daily_limit;
      }
    }
    return result;
  } catch (err) {
    console.warn('[ORCH] Signal failed:', err?.message || err);
    return null;
  }
}

/** Report counter increments to the orchestrator. */
export async function reportCounters(waNumber, counters) {
  try {
    await apiFetch('/api/blast-orchestrator/counter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wa_number: waNumber, ...counters }),
    });
  } catch (err) {
    console.warn('[ORCH] Counter report failed:', err?.message || err);
  }
}

/** Send operator heartbeat. */
export async function sendHeartbeat(waNumber, role = 'sender', activeConversations = 0) {
  try {
    await apiFetch('/api/blast-orchestrator/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wa_number: waNumber, role, active_conversations: activeConversations }),
    });
  } catch (err) {
    console.warn('[ORCH] Heartbeat failed:', err?.message || err);
  }
}

/** Report a blast reply received. */
export async function reportReply(waNumber, contactPhone, jid) {
  try {
    await apiFetch('/api/blast-orchestrator/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wa_number: waNumber, contact_phone: contactPhone, jid }),
    });
  } catch (err) {
    console.warn('[ORCH] Reply report failed:', err?.message || err);
  }
}

// ── Message handlers ────────────────────────────────────────────────

// ORCH_GET_STATE: inject asks for the current orchestrator state
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'ORCH_GET_STATE') return;
  sendResponse({ ok: true, state: _lastState });
  return false;
});

// ORCH_START_POLLING: inject tells background to start polling
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'ORCH_START_POLLING') return;
  startOrchestratorPolling(msg.wa_number);
  sendResponse({ ok: true });
  return false;
});

// ORCH_SEND_SIGNAL: inject asks to send a signal
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'ORCH_SEND_SIGNAL') return;
  (async () => {
    const result = await sendOrchestratorSignal(msg.wa_number, msg.signal_type, msg.extra || {});
    sendResponse({ ok: true, result });
  })();
  return true; // async
});

// ORCH_REPORT_COUNTERS: inject reports batch counters
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'ORCH_REPORT_COUNTERS') return;
  reportCounters(msg.wa_number, msg.counters).then(() => sendResponse({ ok: true }));
  return true;
});

// ORCH_HEARTBEAT: inject triggers a heartbeat
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'ORCH_HEARTBEAT') return;
  sendHeartbeat(msg.wa_number, msg.role, msg.active_conversations).then(() => sendResponse({ ok: true }));
  return true;
});

// ORCH_REPORT_REPLY: inject reports a blast reply
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'ORCH_REPORT_REPLY') return;
  reportReply(msg.wa_number, msg.contact_phone, msg.jid).then(() => sendResponse({ ok: true }));
  return true;
});

// ── Auto-start heartbeat every 60s if polling is active ─────────────
let _heartbeatTimer = null;
function _startHeartbeat() {
  if (_heartbeatTimer) return;
  _heartbeatTimer = setInterval(() => {
    if (_ownNumber) sendHeartbeat(_ownNumber, 'sender', 0);
  }, 60_000);
}

// Start heartbeat when polling starts
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'ORCH_START_POLLING' && !_heartbeatTimer) {
    _startHeartbeat();
  }
});
