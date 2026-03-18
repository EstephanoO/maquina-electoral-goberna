// blast-handlers.js — background handlers for multi-number WhatsApp blast.
// Sources: form_submissions (brigadistas data) + conversations (CMS).

import { apiFetch } from './api-client.js';

// ── BLAST_GET_FORM_CONTACTS ───────────────────────────────────────────
// Primary source: form_submissions (12,258 persons with phone + nombre + distrito)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'BLAST_GET_FORM_CONTACTS') return;

  const { limit = 200, offset = 0, status = 'nuevo', district, own_number } = msg;
  const qs = new URLSearchParams({ limit, offset, status });
  if (district) qs.set('district', district);

  (async () => {
    try {
      const result = await apiFetch(`/api/blast/form-contacts?${qs}`, {
        headers: own_number ? { 'x-wa-number': own_number } : {},
      });
      if (!result.ok) {
        sendResponse({ ok: false, error: result.message || result.error || 'Failed' });
        return;
      }
      console.log(`[WSPP BLAST] form-contacts: ${result.contacts?.length} / ${result.total}`);
      sendResponse({ ok: true, contacts: result.contacts, total: result.total });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true;
});

// ── BLAST_MARK_HABLADO ────────────────────────────────────────────────
// ids      → cms_status='hablado' (enviados con éxito)
// no_wa_ids → cms_status='no_wa'  (sin WhatsApp, reintentables mañana)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'BLAST_MARK_HABLADO') return;

  const { ids, no_wa_ids, own_number } = msg;
  if (!ids?.length && !no_wa_ids?.length) { sendResponse({ ok: true, updated: 0 }); return true; }

  (async () => {
    try {
      const body = { ids: ids ?? [] };
      if (no_wa_ids?.length) body.no_wa_ids = no_wa_ids;
      const result = await apiFetch('/api/blast/mark-hablado', {
        method: 'PUT',
        headers: own_number ? { 'x-wa-number': own_number } : {},
        body: JSON.stringify(body),
      });
      console.log(`[WSPP BLAST] marked hablado: ${result.updated} | no_wa: ${no_wa_ids?.length ?? 0}`);
      sendResponse({ ok: result.ok, updated: result.updated || 0, error: result.error });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true;
});

// ── BLAST_RETRY_NO_WA ─────────────────────────────────────────────────
// Resetea contactos sin WhatsApp de +24h a 'nuevo' para reintentarlos.
// Fire-and-forget — no bloquea el arranque del blast.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'BLAST_RETRY_NO_WA') return;
  const { own_number } = msg;
  apiFetch('/api/blast/retry-no-wa', {
    method: 'POST',
    headers: own_number ? { 'x-wa-number': own_number } : {},
    body: JSON.stringify({}),
  }).then(r => {
    if (r.reset > 0) console.log(`[WSPP BLAST] retry-no-wa: ${r.reset} contactos reseteados`);
  }).catch(() => {});
  sendResponse({ ok: true });
  return false;
});

// ── BLAST_GET_CONTACTS (CMS conversations — legacy) ───────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'BLAST_GET_CONTACTS') return;

  const { limit = 200, offset = 0, own_number } = msg;
  const qs = new URLSearchParams({ limit, offset });
  if (own_number) qs.set('own_number', own_number);

  (async () => {
    try {
      const result = await apiFetch(`/api/blast/contacts?${qs}`);
      sendResponse(result.ok
        ? { ok: true, contacts: result.contacts, total: result.total }
        : { ok: false, error: result.message || result.error });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true;
});

// ── BLAST_REPORT ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'BLAST_REPORT') return;

  const { results } = msg;
  if (!results?.length) { sendResponse({ ok: true, saved: 0 }); return true; }

  (async () => {
    try {
      const result = await apiFetch('/api/blast/report', {
        method: 'POST',
        body: JSON.stringify({ results }),
      });
      sendResponse({ ok: result.ok, saved: result.saved || 0 });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true;
});

// ── BLAST_GET_STATS ───────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'BLAST_GET_STATS') return;

  (async () => {
    try {
      const result = await apiFetch('/api/blast/stats');
      sendResponse({ ok: result.ok, stats: result.stats || {}, by_number: result.by_number || {} });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true;
});

// ── BLAST_GET_NUMBER_CONFIG ────────────────────────────────────────────
// Returns segment config for the active WA number.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'BLAST_GET_NUMBER_CONFIG') return;
  const { own_number } = msg;
  if (!own_number) { sendResponse({ ok: true, config: null }); return true; }

  (async () => {
    try {
      const result = await apiFetch('/api/blast/number-config', {
        headers: { 'x-wa-number': own_number },
      });
      sendResponse({ ok: result.ok, config: result.config || null });
    } catch (err) {
      sendResponse({ ok: false, config: null, error: err.message });
    }
  })();
  return true;
});

// ── BLAST_GET_NUMBER_HEALTH ───────────────────────────────────────────
// Returns health/limits for the calling WA number (hourly, daily, warm-up).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'BLAST_GET_NUMBER_HEALTH') return;
  const { own_number } = msg;
  if (!own_number) { sendResponse({ ok: false, error: 'No own_number', can_send: false }); return true; }

  (async () => {
    try {
      const result = await apiFetch('/api/blast/number-health', {
        headers: { 'x-wa-number': own_number },
      });
      sendResponse(result);
    } catch (err) {
      sendResponse({ ok: false, error: err.message, can_send: true }); // fail open
    }
  })();
  return true;
});
