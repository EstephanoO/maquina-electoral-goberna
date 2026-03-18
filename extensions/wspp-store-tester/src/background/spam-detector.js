// ═══════════════════════════════════════════════════════════════════════
// SPAM / REPETITION DETECTOR — monitors outgoing messages to detect
// patterns that could trigger WhatsApp anti-spam and get numbers banned.
//
// v2 changes:
//   - Window extended to 20 minutes (was 10) — covers full blast sessions
//   - checkSpamNow() exported — called synchronously before each send
//   - Server response now broadcasts to WA tabs (was console.warn only)
//   - Alert history persisted to chrome.storage for popup "Spam" tab
//   - Per-number risk state tracked (ok / medium / high / critical / cooling)
//   - Broadcast throttle is now per-risk-level, not global
// ═══════════════════════════════════════════════════════════════════════

import { apiFetch } from './api-client.js';

// ── Log ───────────────────────────────────────────────────────────────
const _outgoingLog = []; // { text, timestamp, to_phone, own_number }
const SPAM_LOG_MAX       = 500;   // keep last 500 msgs (was 200)
const SPAM_WINDOW_SEC    = 1200;  // analyse last 20 min (was 10)

// ── Periodic checks ───────────────────────────────────────────────────
const SPAM_CHECK_INTERVAL_MS  = 30_000;  // check every 30s (was 60s)
const SPAM_REPORT_INTERVAL_MS = 300_000; // report to backend every 5 min

// ── Thresholds ────────────────────────────────────────────────────────
const SPAM_MAX_BURST_PER_MIN = 20;   // was 25 — tighter
const SPAM_REPETITION_WARN   = 0.40; // was 0.50 — earlier warning
const SPAM_REPETITION_CRIT   = 0.70; // was 0.80
const SPAM_MIN_INTERVAL_SEC  = 3;    // was 2 — WA is stricter now

// ── Alert history (persisted) ─────────────────────────────────────────
const ALERT_HISTORY_KEY  = 'wspp_spam_alerts';
const ALERT_HISTORY_MAX  = 50;

// ── Per-number throttle for UI alerts ────────────────────────────────
// Key = own_number or 'global'. Prevents alert storm.
const _lastAlertTs = new Map(); // number → { critical, high, medium }

function _shouldAlert(ownNumber, level) {
  const key = ownNumber || 'global';
  const m = _lastAlertTs.get(key) || {};
  const minGap = level === 'critical' ? 20_000 : level === 'high' ? 45_000 : 120_000;
  const now = Date.now();
  if ((m[level] || 0) + minGap > now) return false;
  m[level] = now;
  _lastAlertTs.set(key, m);
  return true;
}

// ── Risk state per number ─────────────────────────────────────────────
// Lets the popup show a persistent risk indicator
const _numberRisk = new Map(); // own_number → { level, score, ts }

function _updateNumberRisk(ownNumber, level, score) {
  const key = ownNumber || 'global';
  _numberRisk.set(key, { level, score, ts: Date.now() });
  // Persist to storage so popup can read it
  const obj = {};
  for (const [k, v] of _numberRisk.entries()) obj[k] = v;
  chrome.storage.local.set({ wspp_spam_risk: obj });
}

// ── Persist alert to history ──────────────────────────────────────────
function _persistAlert(ownNumber, result) {
  chrome.storage.local.get([ALERT_HISTORY_KEY], (data) => {
    const history = data[ALERT_HISTORY_KEY] || [];
    history.unshift({
      ts:         Date.now(),
      own_number: ownNumber || null,
      level:      result.risk_level,
      score:      result.risk_score,
      warnings:   result.warnings,
      msg_count:  result.message_count,
    });
    if (history.length > ALERT_HISTORY_MAX) history.length = ALERT_HISTORY_MAX;
    chrome.storage.local.set({ [ALERT_HISTORY_KEY]: history });
  });
}

// ── Broadcast to all WA tabs ──────────────────────────────────────────
function _broadcastToWaTabs(result) {
  chrome.tabs.query({ url: '*://web.whatsapp.com/*' }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'WSPP_SPAM_WARNING',
          payload: result,
        }).catch(() => {});
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════
// PUBLIC: Record an outgoing message for spam analysis.
// Called from sent-handler.js (WSPP_SENT_RICH / WSPP_SENT) and
// from wa-validator-panel.js (conv mode).
// ═══════════════════════════════════════════════════════════════════════
export function recordOutgoing(text, timestamp, toPhone, ownNumber) {
  if (!text) return;
  _outgoingLog.push({
    text:       text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 500),
    timestamp,
    to_phone:   toPhone  || null,
    own_number: ownNumber || null,
  });
  while (_outgoingLog.length > SPAM_LOG_MAX) _outgoingLog.shift();
}

// ═══════════════════════════════════════════════════════════════════════
// CORE: Analyse recent outgoing messages for spam patterns.
// Returns SpamResult or null if not enough data.
// ═══════════════════════════════════════════════════════════════════════
export function localSpamCheck(forceNumber) {
  const cutoff = Math.floor(Date.now() / 1000) - SPAM_WINDOW_SEC;
  const all    = _outgoingLog.filter(m => m.timestamp >= cutoff);

  // If forceNumber is given, narrow to that number (blast/validator uses it)
  const recent = forceNumber
    ? all.filter(m => !m.own_number || m.own_number === forceNumber)
    : all;

  if (recent.length < 5) return null;

  const warnings  = [];
  const actions   = []; // what to actually DO (shown more prominently than warnings)
  let riskScore   = 0;

  // ── 1. Repetition ────────────────────────────────────────────────
  const texts          = recent.map(m => m.text);
  const unique         = new Set(texts).size;
  const repetitionRate = 1 - unique / texts.length;

  if (repetitionRate >= SPAM_REPETITION_CRIT) {
    riskScore += 40;
    warnings.push(`${Math.round(repetitionRate * 100)}% mensajes idénticos en 20 min`);
    actions.push('Variá el contenido — WA detecta copy-paste masivo');
  } else if (repetitionRate >= SPAM_REPETITION_WARN) {
    riskScore += 20;
    warnings.push(`${Math.round(repetitionRate * 100)}% mensajes repetidos`);
    actions.push('Personalizá con {{nombre}} o {{saludo}}');
  }

  // ── 2. Burst (msgs in last 60s) ───────────────────────────────────
  const now       = Math.floor(Date.now() / 1000);
  const last60s   = recent.filter(m => m.timestamp >= now - 60);
  const last5min  = recent.filter(m => m.timestamp >= now - 300);

  if (last60s.length > SPAM_MAX_BURST_PER_MIN) {
    riskScore += 40;
    warnings.push(`${last60s.length} mensajes en el último minuto`);
    actions.push('DETENER envíos ahora — esperá al menos 3 minutos');
  } else if (last60s.length > 12) {
    riskScore += 20;
    warnings.push(`${last60s.length} msgs/min (límite recomendado: 12)`);
    actions.push('Reducí velocidad — aumentá los delays entre mensajes');
  }

  // ── 3. Interval check (too fast = bot-like) ───────────────────────
  if (recent.length >= 4) {
    const sorted = [...recent].sort((a, b) => a.timestamp - b.timestamp);
    let tooFast = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].timestamp - sorted[i - 1].timestamp < SPAM_MIN_INTERVAL_SEC) tooFast++;
    }
    const fastRate = tooFast / (sorted.length - 1);
    if (fastRate > 0.5) {
      riskScore += 20;
      warnings.push(`${Math.round(fastRate * 100)}% mensajes enviados en < ${SPAM_MIN_INTERVAL_SEC}s de distancia`);
      actions.push(`Esperá al menos ${SPAM_MIN_INTERVAL_SEC + 2}s entre cada mensaje`);
    } else if (fastRate > 0.3) {
      riskScore += 8;
    }
  }

  // ── 4. Same text → many different contacts (broadcast pattern) ────
  const textToContacts = new Map();
  for (const m of recent) {
    if (!m.to_phone) continue;
    if (!textToContacts.has(m.text)) textToContacts.set(m.text, new Set());
    textToContacts.get(m.text).add(m.to_phone);
  }
  let maxBroadcast = 0;
  const repeatedTexts = []; // textos que se repitieron a múltiples contactos
  for (const [text, contacts] of textToContacts) {
    if (contacts.size > maxBroadcast) maxBroadcast = contacts.size;
    if (contacts.size > 2) repeatedTexts.push({ text: text.slice(0, 120), count: contacts.size });
  }
  repeatedTexts.sort((a, b) => b.count - a.count); // más repetidos primero
  if (maxBroadcast > 15) {
    riskScore += 30;
    warnings.push(`Mismo texto enviado a ${maxBroadcast} contactos distintos`);
    actions.push('WA detecta broadcasting — usá variables de personalización');
  } else if (maxBroadcast > 8) {
    riskScore += 12;
    warnings.push(`Mismo texto a ${maxBroadcast} contactos`);
  }

  // ── 5. Total volume in session ─────────────────────────────────────
  if (last5min.length > 60) {
    riskScore += 15;
    warnings.push(`${last5min.length} mensajes en los últimos 5 min`);
    actions.push('Tomá una pausa de 10 minutos');
  }

  riskScore = Math.min(100, riskScore);
  const risk_level =
    riskScore >= 70 ? 'critical' :
    riskScore >= 45 ? 'high'     :
    riskScore >= 25 ? 'medium'   : 'low';

  // Suggested cooldown in seconds (shown in overlay countdown)
  const cooldown_sec =
    risk_level === 'critical' ? 180 :
    risk_level === 'high'     ? 90  :
    risk_level === 'medium'   ? 30  : 0;

  return {
    risk_level,
    risk_score:    riskScore,
    warnings,
    actions,
    cooldown_sec,
    message_count: recent.length,
    own_number:    recent[recent.length - 1]?.own_number || null,
    repeated_texts: repeatedTexts.slice(0, 5), // top 5 textos más repetidos
    unique_rate:   texts.length > 0 ? Math.round((unique / texts.length) * 100) : 100,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// PUBLIC: Synchronous check called before each outgoing message.
// Returns the result AND broadcasts if level >= medium.
// This is the "check in the hot path" — called by blast-panel + validator.
// ═══════════════════════════════════════════════════════════════════════
export function checkSpamNow(ownNumber) {
  const result = localSpamCheck(ownNumber);
  if (!result || result.risk_level === 'low') return result;

  const ownNum = ownNumber || result.own_number;
  _updateNumberRisk(ownNum, result.risk_level, result.risk_score);

  if (_shouldAlert(ownNum, result.risk_level)) {
    console.warn(
      '[WSPP SPAM]', result.risk_level.toUpperCase(),
      '| Score:', result.risk_score,
      '| Warnings:', result.warnings.join(' | ')
    );
    _broadcastToWaTabs(result);
    if (result.risk_level !== 'low') _persistAlert(ownNum, result);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// PERIODIC: Background check (every 30s) — catches gradual drift.
// Also deduped by _shouldAlert so it won't spam the user.
// ═══════════════════════════════════════════════════════════════════════
let _periodicCheckSeq = 0;
setInterval(() => {
  _periodicCheckSeq++;
  const result = localSpamCheck();
  if (!result || result.risk_level === 'low') return;

  const ownNum = result.own_number;
  _updateNumberRisk(ownNum, result.risk_level, result.risk_score);

  if (_shouldAlert(ownNum, result.risk_level)) {
    console.warn(
      '[WSPP SPAM periodic]', result.risk_level.toUpperCase(),
      '| Score:', result.risk_score,
      '| seq:', _periodicCheckSeq
    );
    _broadcastToWaTabs(result);
    _persistAlert(ownNum, result);
  }
}, SPAM_CHECK_INTERVAL_MS);

// ═══════════════════════════════════════════════════════════════════════
// SERVER-SIDE REPORT: Every 5 min — Gemini-backed deeper analysis.
// If server returns risk, ALSO broadcast to WA tabs (was missing before).
// ═══════════════════════════════════════════════════════════════════════
setInterval(() => {
  if (_outgoingLog.length < 5) return;
  const cutoff = Math.floor(Date.now() / 1000) - 300;
  const recent = _outgoingLog.filter(m => m.timestamp >= cutoff);
  if (recent.length < 3) return;

  apiFetch('/api/ai/spam-check', {
    method: 'POST',
    body: JSON.stringify({
      own_number: recent[0]?.own_number || undefined,
      messages:   recent.map(m => ({
        text:      m.text,
        timestamp: m.timestamp,
        to_phone:  m.to_phone || undefined,
      })),
    }),
  }).then(res => {
    if (!res.ok) return;

    const ownNum = res.own_number || recent[0]?.own_number || null;

    if (res.risk_level && res.risk_level !== 'low') {
      console.warn(
        '[WSPP SPAM-SERVER]', res.risk_level.toUpperCase(),
        '| Score:', res.risk_score,
        '| Warnings:', (res.warnings || []).join(' | ')
      );

      // ── THIS WAS MISSING: broadcast server result to tabs ─────────
      _updateNumberRisk(ownNum, res.risk_level, res.risk_score);

      const serverResult = {
        risk_level:    res.risk_level,
        risk_score:    res.risk_score,
        warnings:      res.warnings || [],
        actions:       res.recommendations || [],
        cooldown_sec:  res.risk_level === 'critical' ? 180 : res.risk_level === 'high' ? 90 : 30,
        message_count: recent.length,
        own_number:    ownNum,
        source:        'server', // lets overlay indicate this is server-validated
      };

      if (_shouldAlert(ownNum, res.risk_level)) {
        _broadcastToWaTabs(serverResult);
        _persistAlert(ownNum, serverResult);
      }
    } else if (res.risk_level === 'low') {
      // Server says ok — update risk state to ok
      _updateNumberRisk(ownNum, 'low', 0);
    }
  }).catch(() => {});
}, SPAM_REPORT_INTERVAL_MS);

// ── Expose risk state query for background handlers ───────────────────
export function getNumberRisk(ownNumber) {
  return _numberRisk.get(ownNumber || 'global') || { level: 'low', score: 0, ts: 0 };
}
