// ═══════════════════════════════════════════════════════════════════════
// SPAM / REPETITION DETECTOR — monitors outgoing messages to detect
// patterns that could trigger WhatsApp anti-spam and get numbers banned.
// Runs locally in the extension (no network calls). Shows warnings.
// ═══════════════════════════════════════════════════════════════════════

import { apiFetch } from './api-client.js';

const _outgoingLog = []; // {text, timestamp, to_phone, own_number}
const SPAM_LOG_MAX = 200;
const SPAM_CHECK_INTERVAL_MS = 60000;    // check every 60s
const SPAM_REPORT_INTERVAL_MS = 300000;  // report to backend every 5 min

// Thresholds
const SPAM_MAX_BURST_PER_MIN = 25;
const SPAM_REPETITION_WARN = 0.5;  // 50% same messages → warning
const SPAM_REPETITION_CRIT = 0.8;  // 80% → critical
const SPAM_MIN_INTERVAL_SEC = 2;

/**
 * Record an outgoing message for spam analysis.
 */
export function recordOutgoing(text, timestamp, toPhone, ownNumber) {
  if (!text) return;
  _outgoingLog.push({
    text: text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 500),
    timestamp,
    to_phone: toPhone || null,
    own_number: ownNumber || null,
  });
  // Trim old entries (keep last 200)
  while (_outgoingLog.length > SPAM_LOG_MAX) _outgoingLog.shift();
}

/**
 * Analyze recent outgoing messages for spam patterns.
 * Returns { risk_level, warnings } or null if not enough data.
 */
export function localSpamCheck() {
  // Only check last 10 minutes
  const cutoff = Math.floor(Date.now() / 1000) - 600;
  const recent = _outgoingLog.filter(m => m.timestamp >= cutoff);
  if (recent.length < 5) return null;

  const warnings = [];
  let riskScore = 0;

  // Repetition check
  const texts = recent.map(m => m.text);
  const unique = new Set(texts).size;
  const repetitionRate = 1 - unique / texts.length;

  if (repetitionRate >= SPAM_REPETITION_CRIT) {
    riskScore += 40;
    warnings.push(`⚠️ ${Math.round(repetitionRate * 100)}% mensajes idénticos en últimos 10 min. Alto riesgo de bloqueo.`);
  } else if (repetitionRate >= SPAM_REPETITION_WARN) {
    riskScore += 20;
    warnings.push(`${Math.round(repetitionRate * 100)}% mensajes repetidos. Variá el contenido.`);
  }

  // Burst check (messages in last 60s)
  const lastMinute = recent.filter(m => m.timestamp >= Math.floor(Date.now() / 1000) - 60);
  if (lastMinute.length > SPAM_MAX_BURST_PER_MIN) {
    riskScore += 35;
    warnings.push(`⚠️ ${lastMinute.length} mensajes en el último minuto. DETENER envíos.`);
  } else if (lastMinute.length > 15) {
    riskScore += 15;
    warnings.push(`${lastMinute.length} msg/min. Reducir velocidad.`);
  }

  // Interval check
  if (recent.length >= 3) {
    const sorted = [...recent].sort((a, b) => a.timestamp - b.timestamp);
    let tooFast = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].timestamp - sorted[i - 1].timestamp < SPAM_MIN_INTERVAL_SEC) tooFast++;
    }
    if (tooFast > sorted.length * 0.5) {
      riskScore += 15;
      warnings.push('Enviando muy rápido. Esperar 3-5s entre mensajes.');
    }
  }

  // Same text to many different contacts
  const textToContacts = new Map();
  for (const m of recent) {
    if (!m.to_phone) continue;
    if (!textToContacts.has(m.text)) textToContacts.set(m.text, new Set());
    textToContacts.get(m.text).add(m.to_phone);
  }
  let maxBroadcast = 0;
  for (const [, contacts] of textToContacts) {
    if (contacts.size > maxBroadcast) maxBroadcast = contacts.size;
  }
  if (maxBroadcast > 15) {
    riskScore += 25;
    warnings.push(`Mismo mensaje a ${maxBroadcast} contactos. Personalizar cada mensaje.`);
  }

  riskScore = Math.min(100, riskScore);
  const risk_level = riskScore >= 70 ? 'critical' : riskScore >= 45 ? 'high' : riskScore >= 25 ? 'medium' : 'low';

  return { risk_level, risk_score: riskScore, warnings, message_count: recent.length };
}

// Periodic spam check — notifies all WA tabs with a content script message
let _lastSpamAlert = 0;
setInterval(() => {
  const result = localSpamCheck();
  if (!result || result.risk_level === 'low') return;

  // Don't spam alerts — max once per 3 minutes for medium, immediately for high/critical
  const now = Date.now();
  const minInterval = result.risk_level === 'critical' ? 30000 : result.risk_level === 'high' ? 60000 : 180000;
  if (now - _lastSpamAlert < minInterval) return;
  _lastSpamAlert = now;

  console.warn('[WSPP SPAM]', result.risk_level.toUpperCase(), '| Score:', result.risk_score,
    '| Warnings:', result.warnings.join(' | '));

  // Notify WA tabs to show warning overlay
  chrome.tabs.query({ url: '*://web.whatsapp.com/*' }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'WSPP_SPAM_WARNING',
          payload: result,
        }).catch(() => {}); // Tab might not have content script
      }
    }
  });
}, SPAM_CHECK_INTERVAL_MS);

// Periodic backend report (every 5 min, only if there's data)
setInterval(() => {
  if (_outgoingLog.length < 5) return;
  const cutoff = Math.floor(Date.now() / 1000) - 300; // last 5 min
  const recent = _outgoingLog.filter(m => m.timestamp >= cutoff);
  if (recent.length < 3) return;

  apiFetch('/api/ai/spam-check', {
    method: 'POST',
    body: JSON.stringify({
      own_number: recent[0]?.own_number || undefined,
      messages: recent.map(m => ({ text: m.text, timestamp: m.timestamp, to_phone: m.to_phone || undefined })),
    }),
  }).then(res => {
    if (res.ok && res.risk_level !== 'low') {
      console.warn('[WSPP SPAM-SERVER]', res.risk_level.toUpperCase(),
        '| Score:', res.risk_score, '| Warnings:', (res.warnings || []).join(' | '));
    }
  }).catch(() => {});
}, SPAM_REPORT_INTERVAL_MS);
