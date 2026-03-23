// blast-handlers.js — background handlers for WhatsApp blast.
// Excel-only mode: contacts come from local Excel, no backend fetch.
// Remaining handlers: report results, stats, number config, health, report skips.

import { apiFetch } from './api-client.js';

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

// ── BLAST_REPORT_SKIPS ────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'BLAST_REPORT_SKIPS') return;

  const { skips, own_number } = msg;
  if (!skips?.length) { sendResponse({ ok: true, saved: 0 }); return true; }

  (async () => {
    try {
      const result = await apiFetch('/api/blast/report-skips', {
        method: 'POST',
        headers: own_number ? { 'x-wa-number': own_number } : {},
        body: JSON.stringify({ skips }),
      });
      if (result.ok) console.log(`[WSPP BLAST] report-skips: ${result.saved ?? 0} logged`);
      sendResponse({ ok: result.ok });
    } catch (err) {
      console.warn('[WSPP BLAST] report-skips failed:', err.message);
      sendResponse({ ok: false });
    }
  })();
  return true;
});
