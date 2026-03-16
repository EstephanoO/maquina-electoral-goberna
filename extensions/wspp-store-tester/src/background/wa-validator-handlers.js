// wa-validator-handlers.js — background handlers for WA phone number validation.
// Receives batches from inject.js, stores results to backend.

import { apiFetch } from './api-client.js';

// ── WA_VALIDATOR_GET_CONTACTS ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'WA_VALIDATOR_GET_CONTACTS') return;

  const { limit = 500, offset = 0 } = msg;
  const qs = new URLSearchParams({ limit, offset, pending: 'true' });

  (async () => {
    try {
      const result = await apiFetch(`/api/wa-validator/contacts?${qs}`);
      sendResponse(result.ok
        ? { ok: true, contacts: result.contacts, total: result.total }
        : { ok: false, error: result.message || result.error });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true;
});

// ── WA_VALIDATOR_SAVE_RESULTS ─────────────────────────────────────────
// Extension sends batches of { id, wa_valid } to persist to DB.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'WA_VALIDATOR_SAVE_RESULTS') return;

  const { results, own_number } = msg;
  if (!results?.length) { sendResponse({ ok: true, updated: 0 }); return true; }

  (async () => {
    try {
      const result = await apiFetch('/api/wa-validator/results', {
        method: 'POST',
        headers: own_number ? { 'x-wa-number': own_number } : {},
        body: JSON.stringify({ results }),
      });
      console.log(`[WA VALIDATOR] saved ${result.updated} results`);
      sendResponse({ ok: result.ok, updated: result.updated || 0 });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true;
});

// ── WA_VALIDATOR_GET_STATS ────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'WA_VALIDATOR_GET_STATS') return;

  (async () => {
    try {
      const result = await apiFetch('/api/wa-validator/stats');
      sendResponse({ ok: result.ok, summary: result.summary, by_brigadista: result.by_brigadista });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true;
});
