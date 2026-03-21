// blast-panel.js — v8: preview completo + anti-ban mejorado
// Preview antes de enviar, burst-rest pattern, delays humanos.

import { WA_ORIGIN, getOwnNumber } from './bootstrap.js';

// ── Config ─────────────────────────────────────────────────────────
const CFG_KEY = 'wspp_blast_cfg_v8'; // v8: preview + anti-ban
const TPL_KEY = 'wspp_blast_tpls_v6';

const DEFAULTS = {
  batchSize: 10,   // cuántos contactos pedir por fetch al backend
  brigadista: '',
  burstSize: 12,   // cuántos msgs antes de descanso obligatorio
  burstRestSec: 90, // descanso entre bursts (segundos)
};

function _loadCfg() {
  try { const r = localStorage.getItem(CFG_KEY); return r ? { ...DEFAULTS, ...JSON.parse(r) } : { ...DEFAULTS }; } catch (_) { return { ...DEFAULTS }; }
}
function _saveCfg(c) { try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (_) {} }
let cfg = _loadCfg();

// 4 plantillas — se rotan 1→2→3→4
const DEFAULT_TPL  = '{{nombre}}, [buenas tardes|buen día|buenas]. Te saluda César Vásquez, candidato al Senado Nacional.\n---\n[Nos llegaron tus datos a través de|Tus datos nos llegaron por medio de|Tu contacto nos llegó gracias a] mi equipo de campaña en {{departamento}}, por medio de {{brigadista}}.';
const DEFAULT_TPL2 = '[Buenas tardes|Buen día|Buenas] {{nombre}}. Soy César Vásquez, candidato al Senado Nacional #3 🇵🇪\n---\n[Tu número me llegó a través de|Me contactó de tu parte|Tus datos nos llegaron por] {{brigadista}}, de [nuestro equipo en|mi equipo de campaña en] {{departamento}}.';
const DEFAULT_TPL3 = '{{nombre}}, [buenas tardes|buen día|buenas]. Soy César Vásquez, candidato al Senado Nacional. [Nos llegaron tus datos gracias a|Tu contacto nos llegó por medio de] {{brigadista}} de mi equipo en {{departamento}}.';
const DEFAULT_TPL4 = '[Hola|Buenas|Buenas tardes] {{nombre}}, ¿[cómo estás?|todo bien?|cómo te va?]\n---\nTe [saluda|escribe|habla] César Vásquez, candidato al Senado Nacional #3. [Tu número me llegó gracias a|Tus datos me los compartió] {{brigadista}} de {{departamento}}.';

function _loadTpls() {
  try { const r = localStorage.getItem(TPL_KEY); if (r) { const p = JSON.parse(r); if (p.length) return p; } } catch (_) {}
  return [DEFAULT_TPL, DEFAULT_TPL2, DEFAULT_TPL3, DEFAULT_TPL4];
}
function _saveTpls(t) { try { localStorage.setItem(TPL_KEY, JSON.stringify(t)); } catch (_) {} }
let tpls = _loadTpls();

// ── State ─────────────────────────────────────────────────────────
let _running = false;
let _countdown = 0;
let _countdownTimer = null;
let _onUpdate = null;
let _kpis = { sent: 0, failed: 0, no_wa: 0, skipped: 0 };
let _lastResults = [];
let _trackedMsgs = [];
let _tplIndex = 0;
let _totalPending = null;
let _blastLimit = 0; // 0 = infinito, >0 = parar al alcanzar
let _sessionSent = 0;

// ── Capa 4: localStorage persistente anti-crash ─────────────────────
// Solo persiste si hubo al menos 1 envío exitoso en esta sesión.
// Si la sesión se limpió manualmente (resetSession), arranca limpio.
// Key: wspp_blast_sent_v1 — { phones: [...], ids: [...], savedAt: timestamp, sessionId: string }
// Cleanup automático: entradas > 7 días se descartan al cargar.
const LS_SENT_KEY = 'wspp_blast_sent_v1';
const LS_SENT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

// Dedup local
const _sentPhones = new Set();
const _sentIds = new Set();

// Session ID — cambia en cada startBlast(). Si no coincide, significa que
// es una sesión nueva y se ignoran los datos de localStorage.
let _currentSessionId = null;

// Flag: ¿esta sesión ya tuvo envíos exitosos? Solo entonces persistimos.
let _hasSentThisSession = false;

// _loadSentFromStorage removed — recovery logic inlined in startBlast()

function _saveSentToStorage() {
  // Solo persiste si hubo envíos esta sesión
  if (!_hasSentThisSession) return;
  try {
    // Cap to last 5000 entries to avoid localStorage quota issues
    const phones = [..._sentPhones];
    const ids = [..._sentIds];
    localStorage.setItem(LS_SENT_KEY, JSON.stringify({
      phones: phones.length > 5000 ? phones.slice(-5000) : phones,
      ids: ids.length > 5000 ? ids.slice(-5000) : ids,
      savedAt: Date.now(),
      sessionId: _currentSessionId,
    }));
  } catch (_) {}
}

// In-flight lock
const _inFlight = new Set();

// ── ACK Tracking ──────────────────────────────────────────────────
let _ackInterval = null;
function _startAckTracking() {
  if (_ackInterval) return;
  _ackInterval = setInterval(_pollAcks, 5000);
}
function _stopAckTracking() {
  if (_ackInterval) { clearInterval(_ackInterval); _ackInterval = null; }
  // Release msgModel references to prevent memory leaks
  for (const entry of _trackedMsgs) entry.msgModel = null;
  _trackedMsgs = [];
}
function _pollAcks() {
  let changed = false;
  const now = Date.now();
  for (const entry of _trackedMsgs) {
    if (!entry.msgModel) continue;
    const ack = typeof entry.msgModel.get === 'function' ? entry.msgModel.get('ack') : entry.msgModel.ack;
    const newAck = Number(ack) || 0;
    if (newAck !== entry.lastAck) {
      entry.lastAck = newAck;
      const result = _lastResults.find(r => r.telefono === entry.telefono && r.status !== 'failed');
      if (result) result.ack = newAck;
      changed = true;
    }
    // Release reference once ACK is confirmed delivered (≥2) — no need to keep polling
    if (newAck >= 2) entry.msgModel = null;
  }
  _trackedMsgs = _trackedMsgs.filter(e => {
    if (!e.msgModel && e.lastAck >= 2 && now - e.ts > 30000) return false; // delivered + 30s
    if (now - e.ts > 300000) { e.msgModel = null; return false; } // 5 min hard cap
    return true;
  });
  if (!_trackedMsgs.length) _stopAckTracking();
  if (changed) _notify();
}
function _trackMessage(msgModel, telefono) {
  const ack = typeof msgModel.get === 'function' ? msgModel.get('ack') : (msgModel.ack || 0);
  _trackedMsgs.push({ msgModel, telefono, lastAck: Number(ack) || 0, ts: Date.now() });
  _startAckTracking();
}
function _notify() { if (_onUpdate) _onUpdate(); }

// ── Spintax + variables ──────────────────────────────────────────
const SALUDOS = ['Hola', 'Buenas', 'Buenos días', 'Hola buen día', 'Qué tal', 'Buenas tardes'];
const CIERRES = ['Gracias!', 'Saludos!', 'Un abrazo!', 'Hasta pronto!', 'Éxitos!'];
const EMOJIS  = ['👋', '🙌', '✅', '😊', '🌟', '💬'];

function _hashSeed(str, offset) {
  let h = offset * 2654435761;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 2246822519);
    h ^= h >>> 13;
  }
  return Math.abs(h);
}

function _spinVariants(text, seed) {
  let counter = 0;
  return text.replace(/\[([^\]]+)\]/g, (_, inner) => {
    const opts = inner.split('|');
    const pick = opts[_hashSeed(String(seed + counter), counter) % opts.length];
    counter++;
    return pick;
  });
}

function _toTitleCase(word) {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function _titleCasePhrase(phrase) {
  if (!phrase) return '';
  return phrase.split(/\s+/).map(_toTitleCase).join(' ');
}

function _applyVars(text, c, seed) {
  const rawNombre = ((c.nombre || '') + ' ' + (c.apellidos || '')).trim().split(/\s+/)[0] || 'amigo';
  const nombre = _toTitleCase(rawNombre);
  const rawBrigadista = (c.encuestador || '').trim();
  const brigadista = _toTitleCase(rawBrigadista.split(/\s+/)[0] || 'un colaborador');
  const now = new Date();
  return text
    .replace(/\{\{nombre\}\}/gi, nombre)
    .replace(/\{\{brigadista\}\}/gi, brigadista)
    .replace(/\{\{departamento\}\}/gi, _titleCasePhrase((c.departamento || c.distrito || '').trim()) || 'tu zona')
    .replace(/\{\{saludo\}\}/gi, SALUDOS[_hashSeed(String(seed), 1) % SALUDOS.length])
    .replace(/\{\{cierre\}\}/gi, CIERRES[_hashSeed(String(seed), 2) % CIERRES.length])
    .replace(/\{\{emoji\}\}/gi,  EMOJIS[_hashSeed(String(seed),  3) % EMOJIS.length])
    .replace(/\{\{distrito\}\}/gi, c.distrito || '')
    .replace(/\{\{fecha\}\}/gi, now.toLocaleDateString('es-PE'))
    .replace(/\{\{hora\}\}/gi, now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }));
}

function _spinMessage(tpl, c, idx) {
  const seed = idx * 137 + (c.id ? c.id.charCodeAt(0) : 0);
  const parts = tpl.split(/^[ \t]*---[ \t]*$/m);
  return parts
    .map(part => {
      const spun = _spinVariants(part.trim(), seed);
      const resolved = _applyVars(spun, c, seed);
      return resolved.trim();
    })
    .filter(p => p.length > 0);
}

// ── WA internals ─────────────────────────────────────────────────
function _req(...names) {
  for (const n of names) { try { const m = window.require(n); if (m) return m; } catch (_) {} }
  throw new Error('WA module: ' + names.join('/'));
}

function _normalizePhone(tel) {
  const d = String(tel).replace(/\D/g, '');
  if (!d) return null;
  return d.length === 9 ? '51' + d : d;
}

// USyncQuery: ¿tiene WA este número?
// RESILIENCE: Multiple module name fallbacks — WA renames these on every deploy
async function _checkExistsOnWA(normalizedPhone) {
  try {
    const usyncMod = _req('WAWebUsync', 'WAWebUsyncQuery', 'WAWebUSyncModule');
    const userMod  = _req('WAWebUsyncUser', 'WAWebUSyncUserUtils', 'WAWebUSyncUser');
    const USyncQuery = usyncMod?.USyncQuery || usyncMod?.default?.USyncQuery || usyncMod;
    const USyncUser  = userMod?.USyncUser || userMod?.default?.USyncUser || userMod;
    if (!USyncQuery || !USyncUser) return null;
    const query = new USyncQuery()
      .withContext('interactive')
      .withContactProtocol()
      .withUser(new USyncUser().withPhone(normalizedPhone));
    const response = await query.execute();
    const type = response?.list?.[0]?.contact?.type;
    if (!type) return null;
    return type === 'in';
  } catch (_) {
    return null;
  }
}

// Typing indicator antes de enviar
// ANTI-BAN: Simulación más realista — no lineal, con "pausas de pensamiento"
async function _simulateTyping(chat, text) {
  try {
    const csb = _req('WAWebChatStateBridge');
    if (csb.sendChatStateComposing) {
      await csb.sendChatStateComposing(chat.id);
      // Base: ~40-80ms por caracter (humano promedio: 40-100ms)
      const charMs = 40 + Math.random() * 40;
      const baseMs = text.length * charMs;
      // Jitter: ±30% no-uniforme + pausa de "pensamiento" (0-2s extra)
      const jitter = baseMs * (0.7 + Math.random() * 0.6);
      const thinkPause = Math.random() < 0.3 ? _humanRandom(500, 2000) : 0; // 30% chance de pausa
      const typingMs = Math.max(1200, Math.min(6000, jitter + thinkPause));
      await _sleep(typingMs);
      if (csb.sendChatStatePaused) await csb.sendChatStatePaused(chat.id);
    }
  } catch (_) {}
}

// Enviar UN mensaje — retorna el msgModel para tracking de ACK
async function _sendToChat(chat, text) {
  await _simulateTyping(chat, text);

  const meMod  = _req('WAWebUserPrefsMeUser');
  const meUser = (meMod.getMaybeMePnUser ?? meMod.getMeUser).call(meMod);
  const MsgKey = _req('WAWebMsgKey');
  const { unproxy } = _req('WAWebStateUtils');
  const { MsgCollection } = _req('WAWebMsgCollection');

  const idStr = await MsgKey.newId();
  const key = MsgKey.from({ fromMe: true, remote: chat.id, id: idStr });

  let eph = {};
  try {
    const em = _req('WAWebGetEphemeralFieldsMsgActionsUtils', 'WAWebEphemeralFields', 'WAWebEphemeralUtils');
    const fn = em.getEphemeralFields ?? em.default?.getEphemeralFields;
    if (fn) eph = fn(chat);
  } catch (_) {}

  let capturedModel = null;
  const onAdd = (msg) => {
    if (msg.get?.('id')?.id === idStr && msg.get?.('id')?.fromMe) {
      capturedModel = msg;
      MsgCollection.off('add', onAdd);
    }
  };
  MsgCollection.on('add', onAdd);

  try {
    const [p0] = _req('WAWebSendMsgChatAction').addAndSendMsgToChat(unproxy(chat), {
      ...eph, id: key, type: 'chat', body: text,
      from: meUser, to: chat.id, local: true, self: 'out',
      t: Math.floor(Date.now() / 1000), isNewMsg: true,
    });
    await p0;
  } finally {
    MsgCollection.off('add', onAdd);
  }

  if (!capturedModel) {
    const models = MsgCollection.models || MsgCollection._models || [];
    try {
      capturedModel = (Array.isArray(models) ? models : Array.from(models)).find(m =>
        m.get?.('id')?.id === idStr && m.get?.('id')?.fromMe
      ) || null;
    } catch (_) { capturedModel = null; }
  }

  if (!capturedModel) {
    await new Promise(r => setTimeout(r, 500));
    const models2 = MsgCollection.models || MsgCollection._models || [];
    try {
      capturedModel = (Array.isArray(models2) ? models2 : Array.from(models2)).find(m =>
        m.get?.('id')?.id === idStr && m.get?.('id')?.fromMe
      ) || null;
    } catch (_) {}
  }

  return capturedModel;
}

// ── Timer helpers ─────────────────────────────────────────────────
function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function _startCountdown(sec, phase) {
  _countdown = sec;
  clearInterval(_countdownTimer);
  _countdownTimer = setInterval(() => {
    _countdown = Math.max(0, _countdown - 1);
    const timerEl = document.getElementById('sb-timer-label');
    if (timerEl) {
      timerEl.textContent = `⏱️ ${_countdown}s`;
    } else {
      _notify();
    }
    if (_countdown <= 0) clearInterval(_countdownTimer);
  }, 1000);
}
function _stopCountdown() { clearInterval(_countdownTimer); _countdown = 0; }

// Legacy sets kept for resetSession compat
const _preClaimedIds = new Set();

// ── Backend comms ─────────────────────────────────────────────────
let _reqIdCounter = 0;
function _nextReqId() { return 'blast_' + (++_reqIdCounter) + '_' + Date.now(); }
const _pendingRequests = new Map();

window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.type !== 'BLAST_FORM_CONTACTS_READY') return;
  const reqId = e.data.reqId;
  console.log(`[BLAST FETCH] BLAST_FORM_CONTACTS_READY received reqId=${reqId} ok=${e.data.ok} contacts=${e.data.contacts?.length ?? '?'} total=${e.data.total}`);
  if (!reqId) return;
  const pending = _pendingRequests.get(reqId);
  if (!pending) {
    console.warn(`[BLAST FETCH] reqId=${reqId} not found in _pendingRequests — already resolved or cleared`);
    return;
  }
  clearTimeout(pending.timer);
  _pendingRequests.delete(reqId);
  if (e.data.ok) {
    _totalPending = e.data.total ?? _totalPending;
    console.log(`[BLAST FETCH] resolving with ${e.data.contacts?.length ?? 0} contacts, totalPending=${_totalPending}`);
    pending.resolve(e.data.contacts || []);
    _notify();
  } else {
    console.warn(`[BLAST FETCH] backend error: ${e.data.error}`);
    pending.resolve([]);
  }
});

function _fetchBatch(limit) {
  return new Promise((resolve) => {
    const reqId = _nextReqId();
    const ownNum = getOwnNumber();
    console.log(`[BLAST FETCH] reqId=${reqId} limit=${limit} own=${ownNum} brigadista=${cfg.brigadista || '(ninguno)'}`);
    const timer = setTimeout(() => {
      console.warn(`[BLAST FETCH] TIMEOUT — reqId=${reqId} no response after 15s`);
      _pendingRequests.delete(reqId);
      resolve([]);
    }, 15000);
    _pendingRequests.set(reqId, { resolve, timer });
    window.postMessage({
      type: 'BLAST_GET_FORM_CONTACTS',
      limit, offset: 0, status: 'nuevo',
      brigadista: cfg.brigadista || '',
      reqId,
      own_number: ownNum,
    }, WA_ORIGIN);
    console.log(`[BLAST FETCH] message sent, waiting for BLAST_FORM_CONTACTS_READY reqId=${reqId}`);
  });
}

// Retry queue: si markHablado falla, guardamos y reintentamos en el próximo batch
const LS_RETRY_KEY = 'wspp_blast_retry_hablado';

function _loadRetryQueue() {
  try {
    const raw = localStorage.getItem(LS_RETRY_KEY);
    if (!raw) return { ids: [], no_wa_ids: [] };
    return JSON.parse(raw);
  } catch (_) { return { ids: [], no_wa_ids: [] }; }
}

function _saveRetryQueue(ids, no_wa_ids) {
  if (!ids.length && !no_wa_ids.length) {
    try { localStorage.removeItem(LS_RETRY_KEY); } catch (_) {}
    return;
  }
  // Cap to last 500 entries to prevent localStorage bloat
  try { localStorage.setItem(LS_RETRY_KEY, JSON.stringify({
    ids: ids.length > 500 ? ids.slice(-500) : ids,
    no_wa_ids: no_wa_ids.length > 500 ? no_wa_ids.slice(-500) : no_wa_ids,
  })); } catch (_) {}
}

async function _markHablado(ids, no_wa_ids) {
  // Merge with retry queue
  const retry = _loadRetryQueue();
  const allIds = [...new Set([...ids, ...(retry.ids || [])])];
  const allNoWa = [...new Set([...(no_wa_ids ?? []), ...(retry.no_wa_ids || [])])];

  if (!allIds.length && !allNoWa.length) return true;

  const ok = await new Promise((resolve) => {
    const reqId = 'mh_' + Date.now();
    const timer = setTimeout(() => {
      window.removeEventListener('message', onReply);
      resolve(false);
    }, 8000);
    function onReply(e) {
      if (e.source !== window || e.data?.type !== 'BLAST_MARK_HABLADO_DONE' || e.data.reqId !== reqId) return;
      window.removeEventListener('message', onReply);
      clearTimeout(timer);
      resolve(e.data.ok ?? false);
    }
    window.addEventListener('message', onReply);
    window.postMessage({
      type: 'BLAST_MARK_HABLADO', ids: allIds, no_wa_ids: allNoWa,
      own_number: getOwnNumber(), reqId
    }, WA_ORIGIN);
  });

  if (ok) {
    // Success — clear retry queue
    _saveRetryQueue([], []);
    console.log(`[BLAST] markHablado OK: ${allIds.length} hablado, ${allNoWa.length} no_wa`);
  } else {
    // Failed — save to retry queue for next batch
    _saveRetryQueue(allIds, allNoWa);
    console.warn(`[BLAST] markHablado FAILED — queued ${allIds.length} ids for retry`);
  }
  return ok;
}

// ── Capa 5: realtime check con backend antes de procesar ─────────────
// Verifica que cada contacto siga siendo 'nuevo' en la DB.
// Cubre el caso donde OTRO phone lo marcó 'hablado' mientras este corre.
// IMPORTANTE: En timeout, retornamos TODOS los IDs (asumir válidos) para
// confiar en el dedup local. NO retornar Set vacío porque eso filtraría todo.
function _checkContactsBackend(contacts) {
  if (!contacts.length) return Promise.resolve(new Set());
  // Extraer IDs para fallback en caso de timeout
  const allIds = new Set(contacts.filter(c => c.id).map(c => c.id));
  return new Promise((resolve) => {
    const reqId = 'chk_' + Date.now();
    console.log(`[BLAST CHECK] checking ${contacts.length} contacts with backend`);
    const timer = setTimeout(() => {
      window.removeEventListener('message', onReply);
      console.warn('[BLAST CHECK] TIMEOUT — asumiendo todos válidos, confiando en dedup local');
      resolve(allIds); // fallback SEGURO: asumir todos válidos, confiar en dedup local
    }, 10000);
    function onReply(e) {
      if (e.source !== window || e.data?.type !== 'BLAST_CHECK_CONTACTS_DONE' || e.data.reqId !== reqId) return;
      window.removeEventListener('message', onReply);
      clearTimeout(timer);
      const valid = e.data.valid ?? [];
      console.log(`[BLAST CHECK] done: ${valid.length}/${contacts.length} still 'nuevo', filtered ${contacts.length - valid.length}`);
      resolve(new Set(valid));
    }
    window.addEventListener('message', onReply);
    window.postMessage({
      type: 'BLAST_CHECK_CONTACTS',
      contacts: contacts.map(c => ({ id: c.id, phone: c.telefono })),
      own_number: getOwnNumber(),
      reqId,
    }, WA_ORIGIN);
  });
}

// ── Capa 6: reportar skips a blast_log para visibilidad dashboard ──
// Registra cada skip con su razón para trazabilidad.
function _reportSkips(skips) {
  if (!skips.length) return;
  window.postMessage({
    type: 'BLAST_REPORT_SKIPS',
    skips: skips.map(s => ({
      contact_id:    s.contact_id ?? null,
      phone:         getOwnNumber() || '',
      contact_phone: s.contact_phone,
      contact_name:  s.contact_name ?? null,
      reason:        s.reason,
    })),
    own_number: getOwnNumber(),
  }, WA_ORIGIN); // fire-and-forget
}

// _reportSentResult removed — results are now batched and sent post-loop

// ── Health check — rate limiting server-side ────────────────────
let _lastHealth = null;

function _fetchHealth() {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', onReply);
      resolve(null); // timeout → no bloquear
    }, 8000);
    function onReply(e) {
      if (e.source !== window || e.data?.type !== 'BLAST_NUMBER_HEALTH_READY') return;
      window.removeEventListener('message', onReply);
      clearTimeout(timer);
      _lastHealth = e.data;
      resolve(e.data);
    }
    window.addEventListener('message', onReply);
    window.postMessage({
      type: 'BLAST_GET_NUMBER_HEALTH',
      own_number: getOwnNumber(),
    }, WA_ORIGIN);
  });
}

// ── Time window — solo enviar en horario razonable (Peru) ───────
function _isWithinSendWindow() {
  const now = new Date();
  // Peru = UTC-5
  const peruHour = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' })).getHours();
  return peruHour >= 8 && peruHour < 21; // 8am-9pm
}

// ── Delay adaptativo según risk_level ───────────────────────────
// ANTI-BAN: Delays más humanos con distribución no-uniforme.
// Un humano NO tiene intervalos uniformes — a veces se distrae, a veces es rápido.
// Usamos beta-like distribution via sum of randoms para picos alrededor del centro.
function _humanRandom(min, max) {
  // Sum of 3 randoms / 3 = distribución que pica en el medio (bell-ish)
  const r = (Math.random() + Math.random() + Math.random()) / 3;
  return min + Math.floor(r * (max - min));
}

function _adaptiveDelay() {
  const risk = _lastHealth?.risk_level || 'low';
  switch (risk) {
    case 'critical': return _humanRandom(25000, 45000); // 25-45s
    case 'high':     return _humanRandom(12000, 25000); // 12-25s
    case 'medium':   return _humanRandom(8000,  15000); // 8-15s
    default:         return _humanRandom(4000,  10000); // 4-10s — antes era 2-6s
  }
}

// ── Remote config — loaded from backend, merged with local defaults ──
// Allows campaign managers to tune anti-ban params centrally.
// Loaded on sidebar open + blast start. Fallback to local if unavailable.
let _remoteConfig = null;
let _remoteConfigLoadedAt = 0;
const REMOTE_CONFIG_TTL = 10 * 60 * 1000; // 10 min cache

function _fetchRemoteConfig() {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', onReply);
      resolve(null);
    }, 5000);
    function onReply(e) {
      if (e.source !== window || e.data?.type !== 'BLAST_NUMBER_CONFIG_READY') return;
      window.removeEventListener('message', onReply);
      clearTimeout(timer);
      resolve(e.data.config || null);
    }
    window.addEventListener('message', onReply);
    window.postMessage({
      type: 'BLAST_GET_NUMBER_CONFIG',
      own_number: getOwnNumber(),
    }, WA_ORIGIN);
  });
}

async function _loadRemoteConfig() {
  if (_remoteConfig && Date.now() - _remoteConfigLoadedAt < REMOTE_CONFIG_TTL) return;
  const rc = await _fetchRemoteConfig();
  if (rc) {
    _remoteConfig = rc;
    _remoteConfigLoadedAt = Date.now();
    // Apply remote overrides to local config (only if set by backend)
    if (rc.burst_size) cfg.burstSize = rc.burst_size;
    if (rc.burst_rest_sec) cfg.burstRestSec = rc.burst_rest_sec;
    _saveCfg(cfg);
    console.log('[BLAST CONFIG] Remote config loaded:', JSON.stringify(rc).slice(0, 200));
  }
}

export function getRemoteConfig() { return _remoteConfig; }

// ── Spam warning — receive from background via content bridge ────
let _lastSpamResult = null;

window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.type !== 'WSPP_SPAM_WARNING') return;
  _lastSpamResult = e.data.payload || null;
  _notify();
});

// ── Global stats — sidebar "progreso global" ────────────────────
let _globalStats = null;

function _fetchGlobalStats() {
  window.postMessage({ type: 'BLAST_GET_STATS' }, WA_ORIGIN);
}

// Listener for BLAST_STATS_READY
window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.type !== 'BLAST_STATS_READY') return;
  if (e.data.ok) {
    _globalStats = {
      ...e.data.stats,
      by_number: e.data.by_number ?? {},
      // Map field names sidebar expects
      total_hablado: e.data.stats?.total_sent ?? 0,
      total_pending: e.data.stats?.total_pending ?? 0,
    };
    _notify();
  }
});

// ── Preview state ────────────────────────────────────────────────
let _previewContacts = [];  // contacts loaded for preview
let _previewLoading = false;
let _previewReady = false;
let _previewSkippedIds = new Set(); // IDs the operator chose to skip
let _previewMessages = new Map(); // id → spun message preview
let _previewFlags = new Map();    // id → { inContacts: bool, noWA: bool|null }
let _burstCount = 0; // msgs since last burst rest

// ── Preview: check if contact is already in WA contacts or has no WA ──
// Runs during preview load to flag contacts BEFORE the operator confirms.
async function _checkPreviewContact(c) {
  const np = _normalizePhone(c.telefono);
  if (!np) {
    _previewFlags.set(c.id, { inContacts: false, noWA: null, invalid: true });
    return;
  }

  const flags = { inContacts: false, noWA: null, invalid: false };

  // Check ContactCollection — is this person already saved in WA?
  try {
    const { ContactCollection } = window.require('WAWebContactCollection');
    if (ContactCollection?._models) {
      const rawDigits = np.replace(/\D/g, '');
      for (const model of ContactCollection._models) {
        const modelPhone = (model.number || model.userid || model.phoneNumber || '').replace(/\D/g, '');
        if (modelPhone && (modelPhone === rawDigits || modelPhone.endsWith(rawDigits.slice(-9)))) {
          flags.inContacts = true;
          break;
        }
      }
    }
  } catch (_) {}

  // USyncQuery — does this number have WA?
  try {
    const exists = await _checkExistsOnWA(np);
    flags.noWA = exists === false ? true : exists === true ? false : null;
  } catch (_) {
    flags.noWA = null; // unknown
  }

  _previewFlags.set(c.id, flags);
}

async function _checkAllPreviewContacts(contacts) {
  // Run checks in parallel batches of 20 (USyncQuery supports batch)
  // But we check ContactCollection first (synchronous, fast)
  const batchSize = 20;
  for (let i = 0; i < contacts.length; i += batchSize) {
    const slice = contacts.slice(i, i + batchSize);
    await Promise.all(slice.map(c => _checkPreviewContact(c)));
  }

  // Auto-skip contacts that are already in WA contacts (flagged)
  for (const c of contacts) {
    const f = _previewFlags.get(c.id);
    if (f?.inContacts) {
      _previewSkippedIds.add(c.id);
    }
  }
}

// ── Exports ──────────────────────────────────────────────────────
export function getConfig() { return cfg; }
export function setConfig(c) { cfg = { ...cfg, ...c }; _saveCfg(cfg); }
export function getTemplates() { return tpls; }
export function setTemplates(t) { tpls = t; _saveTpls(t); }
export function isRunning() { return _running; }
export function getCountdown() { return _countdown; }
export function getKpis() { return { ..._kpis }; }
export function getLastResults() { return _lastResults; }
export function getTotalPending() { return _totalPending; }
export function setOnUpdate(fn) { _onUpdate = fn; }
export function getTplIndex() { return _tplIndex; }
export function isWithinBlastWindow() { return _isWithinSendWindow(); }
export function setBlastLimit(n) { _blastLimit = n; }
export function getBlastLimit() { return _blastLimit; }
export function getSessionSent() { return _sessionSent; }

// ── MAIN LOOP ────────────────────────────────────────────────────
export async function startBlast() {
  if (_running) return;
  if (!tpls.length || !tpls[0].trim()) return;

  const activeNumber = getOwnNumber();
  if (!activeNumber) {
    _lastResults.unshift({ nombre: '❌ Sin número', telefono: '', status: 'failed', ack: -1, error: 'No se detectó el número. Recargá WA Web.' });
    _notify();
    return;
  }

  // ══════════════════════════════════════════════════════════════════
  // RECOVERY: Intentar cargar dedup de sesión anterior (crash recovery)
  // Si hay datos guardados recientes (<7 días), los usamos como dedup
  // para no re-enviar a contactos ya procesados.
  // ══════════════════════════════════════════════════════════════════
  _preClaimedIds.clear();
  _inFlight.clear();
  _trackedMsgs = [];

  // Intentar recovery ANTES de crear nueva sesión
  let recovered = false;
  try {
    const raw = localStorage.getItem(LS_SENT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.savedAt && Date.now() - parsed.savedAt < LS_SENT_TTL_MS) {
        // Datos recientes — cargar como dedup seeds
        _sentPhones.clear();
        _sentIds.clear();
        if (Array.isArray(parsed.phones)) for (const p of parsed.phones) _sentPhones.add(p);
        if (Array.isArray(parsed.ids)) for (const id of parsed.ids) _sentIds.add(id);
        recovered = _sentPhones.size > 0 || _sentIds.size > 0;
        if (recovered) {
          console.log(`[BLAST] Recovery: cargó ${_sentPhones.size} phones + ${_sentIds.size} ids de sesión anterior`);
        }
      }
    }
  } catch (_) {}

  if (!recovered) {
    _sentPhones.clear();
    _sentIds.clear();
    try { localStorage.removeItem(LS_SENT_KEY); } catch (_) {}
    console.log('[BLAST] Sesión limpia — sin recovery');
  }

  // Nueva sesión
  _currentSessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  _hasSentThisSession = false;
  console.log(`[BLAST] Iniciando sesión=${_currentSessionId}`);

  _running = true;
  _kpis = { sent: 0, failed: 0, no_wa: 0, skipped: 0 };
  _lastResults = [];
  _trackedMsgs = [];
  _totalPending = null;
  _sessionSent = 0;
  _burstCount = 0;
  let _consecutiveFailures = 0; // Circuit breaker counter
  _notify();

  // ── Remote config: cargar params del backend ──────────────────
  await _loadRemoteConfig();

  // ── Ventana horaria check al inicio ──────────────────────────
  if (!_isWithinSendWindow()) {
    console.log('[BLAST] Fuera de ventana horaria (8am-9pm Peru) — no se inicia');
    _running = false;
    _notify();
    return;
  }

  while (_running) {
    // ── Ventana horaria check en cada iteración ──────────────────
    if (!_isWithinSendWindow()) {
      console.log('[BLAST] Fuera de ventana horaria (8am-9pm Peru) — parando');
      _running = false;
      _stopCountdown();
      _notify();
      break;
    }

    // ── Health check — rate limiting server-side ─────────────────
    const health = await _fetchHealth();
    if (health && health.can_send === false) {
      const waitUntil = health.next_available_at;
      console.log(`[BLAST] Rate limit — can_send=false, next=${waitUntil}`);
      // Don't pollute _lastResults with system messages — only log to console
      _notify();
      // Esperar hasta que se pueda enviar (máx 5 min, luego re-check)
      const waitMs = waitUntil
        ? Math.min(300000, Math.max(5000, new Date(waitUntil).getTime() - Date.now()))
        : 60000;
      _startCountdown(Math.ceil(waitMs / 1000), 'cooldown');
      await _sleep(waitMs);
      _stopCountdown();
      continue; // Re-check health
    }

    // Si alcanzó el límite → parar
    if (_blastLimit > 0 && _sessionSent >= _blastLimit) {
      console.log('[BLAST] Límite alcanzado — parando');
      _running = false;
      _stopCountdown();
      _notify();
      break;
    }

    // ── Circuit breaker: 5+ fallos consecutivos → pausa ─────────
    if (_consecutiveFailures >= 5) {
      console.warn('[BLAST] Circuit breaker: 5+ fallos consecutivos — pausando 60s');
      _notify();
      _startCountdown(60, 'circuit-breaker');
      await _sleep(60000);
      _stopCountdown();
      _consecutiveFailures = 0;
      continue;
    }

    // ── BURST-REST: descanso obligatorio cada N mensajes ─────────
    // ANTI-BAN: Un humano no envía 100 msgs sin parar. Descansamos
    // cada burstSize mensajes para parecer natural.
    const burstMax = cfg.burstSize || 12;
    const burstRestSec = cfg.burstRestSec || 90;
    if (_burstCount >= burstMax) {
      const restMs = burstRestSec * 1000 + _humanRandom(0, 15000); // +0-15s jitter
      console.log(`[BLAST] Burst rest: ${_burstCount} msgs enviados, descansando ${Math.round(restMs / 1000)}s`);
      _startCountdown(Math.ceil(restMs / 1000), 'descanso');
      _notify();
      await _sleep(restMs);
      _stopCountdown();
      _burstCount = 0;
      if (!_running) break;
    }

    // 1. Fetch un batch — usar preview confirmado si existe
    let rawBatch;
    if (_confirmedPreview && _confirmedPreview.length) {
      rawBatch = _confirmedPreview;
      _confirmedPreview = null; // consume once
      console.log(`[BLAST LOOP] usando ${rawBatch.length} contactos del preview confirmado`);
    } else {
      rawBatch = await _fetchBatch(cfg.batchSize);
      console.log(`[BLAST LOOP] batch recibido: ${rawBatch.length} contactos`);
    }
    if (!rawBatch.length) {
      console.log('[BLAST LOOP] Batch vacío — no hay más contactos pendientes, parando loop');
      // Auto-limpiar localStorage para que el próximo blast arranque limpio
      try { localStorage.removeItem(LS_SENT_KEY); } catch (_) {}
      _running = false;
      _stopCountdown();
      _notify();
      break;
    }

    // 2. Filtrar dedup local
    const batch = rawBatch.filter(c => {
      if (c.id && _sentIds.has(c.id)) return false;
      const np = _normalizePhone(c.telefono);
      if (np && _sentPhones.has(np)) return false;
      return true;
    });
    console.log(`[BLAST LOOP] tras dedup local: ${batch.length}/${rawBatch.length} contactos`);

    if (!batch.length) {
      console.log('[BLAST LOOP] Todos filtrados por dedup local — parando loop');
      // Si batch completo está filtrado por dedup, significa que ya se enviou todo en sesiones anteriores.
      // Limpiar localStorage para que el próximo blast arranque limpio.
      try { localStorage.removeItem(LS_SENT_KEY); } catch (_) {}
      _running = false;
      _stopCountdown();
      _notify();
      break;
    }

    // Accumulators — filled DURING the loop, acted on AFTER
    const habladoBatch = [];  // IDs de contactos que recibieron mensaje OK
    const noWaBatch    = [];  // IDs de contactos sin WhatsApp
    const skipsBatch   = [];  // skips para reportar al backend (Capa 6)
    const sentResults  = [];  // envíos exitosos para blast_log (batched)

    // ── Capa 5: realtime check con backend antes de procesar ──────
    let filteredBatch = batch;
    if (batch.length) {
      const validIds = await _checkContactsBackend(batch);
      if (validIds.size < batch.length) {
        const removed = batch.filter(c => c.id && !validIds.has(c.id));
        console.log(`[BLAST] Capa5: ${removed.length} contactos ya marcados por otro phone — skip`);
        for (const c of removed) {
          _kpis.skipped++;
          if (c.id) { _sentIds.add(c.id); _saveSentToStorage(); }
          skipsBatch.push({
            contact_id: c.id ?? null,
            contact_phone: c.telefono ?? '',
            contact_name: ((c.nombre || '') + ' ' + (c.apellidos || '')).trim() || null,
            reason: 'otro_phone_hablado',
          });
          _lastResults.unshift({
            nombre: ((c.nombre || '') + ' ' + (c.apellidos || '')).trim() || '—',
            telefono: c.telefono ?? '', status: 'skipped', ack: -1,
            error: 'Ya marcado por otro phone — skip',
          });
          if (_lastResults.length > 30) _lastResults.length = 30;
        }
        _notify();
        filteredBatch = batch.filter(c => !c.id || validIds.has(c.id));
        console.log(`[BLAST] Capa5: batch filtrado de ${batch.length} → ${filteredBatch.length} contactos`);
      }
    }

    if (!filteredBatch.length) {
      console.log('[BLAST] Capa5: todos filtrados, continuando al siguiente batch');
      _reportSkips(skipsBatch);
      continue;
    }

    // ── PROCESO: sin pre-claim — marcar hablado SOLO después de enviar ──
    for (let i = 0; i < filteredBatch.length && _running; i++) {
      const c = filteredBatch[i];
      const normalizedPhone = _normalizePhone(c.telefono);
      const jid = normalizedPhone ? normalizedPhone + '@c.us' : null;
      const cName = ((c.nombre || '') + ' ' + (c.apellidos || '')).trim() || '—';
      const lockKey = (normalizedPhone || '') + ':' + (c.id || '');

      if (_inFlight.has(lockKey)) continue;

      // FIX P0: Dedup check (read-only) — mark as sent ONLY after success/skip.
      // Before this fix, we added to _sentPhones/_sentIds here, which meant
      // a transient send failure would permanently skip the contact.
      if (normalizedPhone && _sentPhones.has(normalizedPhone)) continue;
      if (c.id && _sentIds.has(c.id)) continue;

      _inFlight.add(lockKey);

      // ── Validación: sin nombre → skip (NO marca hablado) ──────────
      if (!((c.nombre || '') + ' ' + (c.apellidos || '')).trim()) {
        _kpis.skipped++;
        // Dedup: mark as processed so we don't re-fetch this contact
        if (c.id) _sentIds.add(c.id);
        skipsBatch.push({ contact_id: c.id ?? null, contact_phone: c.telefono ?? '', contact_name: null, reason: 'sin_nombre' });
        _lastResults.unshift({ nombre: '— Sin nombre', telefono: c.telefono, status: 'skipped', ack: -1, error: 'Sin nombre — skip' });
        if (_lastResults.length > 30) _lastResults.length = 30;
        _notify();
        _inFlight.delete(lockKey);
        continue;
      }

      // ── Validación: tel inválido → skip (NO marca hablado) ────────
      if (!jid) {
        _kpis.failed++;
        _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: 'failed', ack: -1, error: 'Tel inválido' });
        if (_lastResults.length > 30) _lastResults.length = 30;
        _notify();
        _inFlight.delete(lockKey);
        continue;
      }

      // ── CAPA 0: USyncQuery — ¿tiene WhatsApp este número? ──────────
      // Rápido y no crea chats fantasma. Si retorna false → no_wa.
      // Si retorna null (API no disponible), fall through al flow normal.
      const hasWA = await _checkExistsOnWA(normalizedPhone);
      if (hasWA === false) {
        console.log('[BLAST] Skip — sin WA (USyncQuery):', cName, c.telefono);
        _kpis.no_wa++;
        if (c.id) noWaBatch.push(c.id);
        // Dedup: permanent skip
        if (normalizedPhone) _sentPhones.add(normalizedPhone);
        if (c.id) _sentIds.add(c.id);
        skipsBatch.push({ contact_id: c.id ?? null, contact_phone: c.telefono ?? '', contact_name: cName, reason: 'usync_no_wa' });
        _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: 'skipped', ack: -1, error: 'Sin WA — skip' });
        if (_lastResults.length > 30) _lastResults.length = 30;
        _notify();
        _inFlight.delete(lockKey);
        continue;
      }

      // ── CAPA 1: ContactCollection — ¿ya agendado en WA? → skip ──
      try {
        const { ContactCollection } = window.require('WAWebContactCollection');
        if (ContactCollection?._models) {
          const normalizedPhoneRaw = c.telefono?.replace(/\D/g, '') || normalizedPhone?.replace(/\D/g, '');
          let alreadySaved = false;
          for (const model of ContactCollection._models) {
            const modelPhone = (model.number || model.userid || model.phoneNumber || '').replace(/\D/g, '');
            if (modelPhone && modelPhone === normalizedPhoneRaw) {
              alreadySaved = true;
              break;
            }
          }
          if (alreadySaved) {
            console.log('[BLAST] Skip — contacto ya agendado en WA:', cName, c.telefono);
            _kpis.skipped++;
            skipsBatch.push({ contact_id: c.id ?? null, contact_phone: c.telefono ?? '', contact_name: cName, reason: 'contact_collection_agendado' });
            _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: 'skipped', ack: -1, error: 'Agendado en WA — skip' });
            if (_lastResults.length > 30) _lastResults.length = 30;
            _notify();
            _inFlight.delete(lockKey);
            continue;
          }
        }
      } catch (_) {}

      // ── CAPA 2: Prewarm chat ──────────────────────────────────────
      let chat = null;
      try {
        const wf  = _req('WAWebWidFactory');
        const wid = wf.createWid(jid);
        const coll = _req('WAWebCollections');
        chat = coll.Chat.get(wid);
        if (!chat) {
          const FC = _req('WAWebFindChatAction');
          const r = await FC.findOrCreateLatestChat(wid);
          chat = r?.chat ?? r;
        }
        if (!chat) throw new Error('No se resolvió el chat');

        // ── CAPA 3: lastReceivedKey → skip ──────────────────────────
        const lastReceivedKey = chat.get?.('lastReceivedKey');
        const msgCount = chat.get?.('msgCount') || 0;
        if (lastReceivedKey && msgCount > 0) {
          console.log('[BLAST] Skip — WA ya tiene chat con historial:', cName, c.telefono);
          _kpis.skipped++;
          skipsBatch.push({ contact_id: c.id ?? null, contact_phone: c.telefono ?? '', contact_name: cName, reason: 'last_received_key' });
          _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: 'skipped', ack: -1, error: 'Chat con historial — skip' });
          if (_lastResults.length > 30) _lastResults.length = 30;
          _notify();
          _inFlight.delete(lockKey);
          continue;
        }
      } catch (err) {
        // findOrCreateLatestChat falla → contacto probablemente no tiene WA
        _kpis.no_wa++;
        if (c.id) noWaBatch.push(c.id);
        _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: 'failed', ack: -1, error: 'Sin WA: ' + err.message });
        if (_lastResults.length > 30) _lastResults.length = 30;
        _notify();
        _inFlight.delete(lockKey);
        continue;
      }

      // ── ENVIAR ────────────────────────────────────────────────────
      const tpl = tpls[_tplIndex % tpls.length];
      const parts = _spinMessage(tpl, c, _tplIndex);
      const text = parts[0];

      try {
        for (let p = 0; p < parts.length && _running; p++) {
          const partText = parts[p];
          // ANTI-BAN: Pausa entre partes con typing indicator (simula leer + escribir)
          if (p > 0) await _sleep(_humanRandom(1500, 4000));
          const partModel = await _sendToChat(chat, partText);
          if (p === 0 && partModel) _trackMessage(partModel, c.telefono);
        }

        // ✅ ÉXITO — agregar a habladoBatch para marcar DESPUÉS del loop
        _kpis.sent++;
        _sessionSent++;
        _tplIndex++;
        _burstCount++;
        _hasSentThisSession = true;
        if (c.id) habladoBatch.push(c.id);
        // FIX P0: Dedup AFTER success — not before
        if (normalizedPhone) _sentPhones.add(normalizedPhone);
        if (c.id) _sentIds.add(c.id);
        _saveSentToStorage();

        // Report conversation: mapear jid → phone para que el CMS trackee respuestas
        window.postMessage({
          type: 'BLAST_REPORT_CONVERSATION',
          jid: jid,
          own_number: getOwnNumber() || '',
          phone: c.telefono ?? '',
          contact_name: cName,
        }, WA_ORIGIN);

        // Acumular resultado para report batch
        sentResults.push({
          phone:        c.telefono ?? '',
          contact_name: ((c.nombre || '') + ' ' + (c.apellidos || '')).trim() || null,
          message:      text?.slice(0, 200) ?? null,
          status:       'sent',
          error:        null,
          own_number:   getOwnNumber() || '',
          contact_id:   c.id ?? null,
        });

        _consecutiveFailures = 0; // Reset circuit breaker on success
        _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: 'sent', ack: 0, error: null });

        if (_blastLimit > 0 && _sessionSent >= _blastLimit) {
          console.log('[BLAST] Límite alcanzado — parando');
          _running = false;
          _stopCountdown();
          _notify();
          break;
        }
      } catch (err) {
        _kpis.failed++;
        _consecutiveFailures++;
        _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: 'failed', ack: -1, error: err.message });
      }

      if (_lastResults.length > 30) _lastResults.length = 30;
      _notify();
      _inFlight.delete(lockKey);

      // Delay ADAPTATIVO según risk_level del health check
      if (_running && i < filteredBatch.length - 1) {
        const delay = _adaptiveDelay();
        _startCountdown(Math.ceil(delay / 1000), 'delay');
        await _sleep(delay);
        _stopCountdown();
      }
    }

    // ── POST-LOOP: marcar hablado/no_wa SOLO de contactos realmente procesados ──
    if (habladoBatch.length || noWaBatch.length) {
      await _markHablado([...habladoBatch], [...noWaBatch]).catch(err => {
        console.warn('[BLAST] batch mark-hablado failed:', err?.message);
      });
    }

    // ── POST-LOOP: reportar envíos exitosos en batch (no uno a uno) ──
    if (sentResults.length) {
      window.postMessage({
        type: 'BLAST_REPORT_RESULTS',
        results: sentResults,
      }, WA_ORIGIN);
    }

    _saveSentToStorage();
    _reportSkips(skipsBatch);

    // Decrement pending by ALL processed contacts (sent + skipped + no_wa + failed)
    const batchProcessed = habladoBatch.length + noWaBatch.length + skipsBatch.length;
    if (_totalPending !== null && batchProcessed > 0) _totalPending = Math.max(0, _totalPending - batchProcessed);
    _notify();

    // Pausa entre batches
    if (_running) {
      await _sleep(2000);
    }
  }

  _running = false;
  _stopCountdown();
  _stopAckTracking();
  _notify();
}

// ── PREVIEW SYSTEM ──────────────────────────────────────────────
// Carga contactos ANTES de enviar para que el operador vea exactamente
// a quién le va a escribir y qué mensaje recibiría cada uno.

export async function loadPreview() {
  if (_previewLoading || _running) return;
  _previewLoading = true;
  _previewReady = false;
  _previewContacts = [];
  _previewSkippedIds.clear();
  _previewMessages.clear();
  _notify();

  // Load remote config (may update burstSize etc.)
  await _loadRemoteConfig();

  const limit = _blastLimit > 0 ? _blastLimit : (cfg.batchSize || 10);
  const contacts = await _fetchBatch(Math.min(limit, 200)); // cap at 200 for preview

  if (!contacts.length) {
    _previewLoading = false;
    _notify();
    return;
  }

  // Generate message preview for each contact
  let tplIdx = _tplIndex;
  for (const c of contacts) {
    const tpl = tpls[tplIdx % tpls.length];
    const parts = _spinMessage(tpl, c, tplIdx);
    _previewMessages.set(c.id, parts);
    tplIdx++;
  }

  _previewContacts = contacts;
  _notify(); // show contacts while checking

  // Check each contact: already in WA contacts? Has WA at all?
  // Auto-skips contacts already in contacts list.
  await _checkAllPreviewContacts(contacts);

  _previewLoading = false;
  _previewReady = true;
  _notify();
}

export function getPreviewContacts() { return _previewContacts; }
export function isPreviewLoading() { return _previewLoading; }
export function isPreviewReady() { return _previewReady; }
export function getPreviewSkipped() { return _previewSkippedIds; }
export function getPreviewMessage(id) { return _previewMessages.get(id) || []; }
export function getPreviewFlags() { return _previewFlags; } // id → { inContacts, noWA }

export function previewSkipContact(id) {
  if (_previewSkippedIds.has(id)) {
    _previewSkippedIds.delete(id); // toggle
  } else {
    _previewSkippedIds.add(id);
  }
  _notify();
}

// Skip contact + mark as hablado in backend + fetch a replacement
export async function previewMarkHabladoAndReplace(id) {
  const contact = _previewContacts.find(c => c.id === id);
  if (!contact) return;

  // 1. Mark as hablado in backend (fire-and-forget with retry)
  _previewSkippedIds.add(id);
  _notify();

  await _markHablado([id], []);
  console.log('[PREVIEW] Marked hablado:', id, contact.telefono);

  // 2. Add to local dedup so it never comes back
  const np = _normalizePhone(contact.telefono);
  if (np) _sentPhones.add(np);
  _sentIds.add(id);

  // 3. Fetch 1 replacement from backend
  const replacements = await _fetchBatch(1);
  if (replacements.length) {
    const rep = replacements[0];
    // Don't add if already in preview or already skipped
    const existingIds = new Set(_previewContacts.map(c => c.id));
    if (!existingIds.has(rep.id) && !_sentIds.has(rep.id)) {
      // Generate message preview for replacement
      const tplIdx = _tplIndex + _previewContacts.length;
      const tpl = tpls[tplIdx % tpls.length];
      _previewMessages.set(rep.id, _spinMessage(tpl, rep, tplIdx));

      // Check if replacement is in WA contacts
      await _checkPreviewContact(rep);

      // Replace the skipped contact in the list
      const idx = _previewContacts.findIndex(c => c.id === id);
      if (idx !== -1) {
        _previewContacts[idx] = rep;
        _previewSkippedIds.delete(id); // remove old skip since it's replaced
      } else {
        _previewContacts.push(rep);
      }
      console.log('[PREVIEW] Replaced with:', rep.nombre, rep.telefono);
    }
  }
  _notify();
}

export function previewCancel() {
  _previewContacts = [];
  _previewSkippedIds.clear();
  _previewMessages.clear();
  _previewFlags.clear();
  _previewReady = false;
  _previewLoading = false;
  _notify();
}

// Confirm preview → start blast with these specific contacts
export function previewConfirm() {
  if (!_previewReady || !_previewContacts.length) return;
  // Filter out skipped and flagged-inContacts
  const confirmed = _previewContacts.filter(c => !_previewSkippedIds.has(c.id));
  if (!confirmed.length) { previewCancel(); return; }

  // Store confirmed contacts for the blast loop to use
  _confirmedPreview = confirmed;
  _previewReady = false;
  _previewFlags.clear();
  _notify();
  startBlast();
}

// Internal: confirmed contacts from preview (null = use normal fetch)
let _confirmedPreview = null;

export function isPaused() { return false; }
export function getPhase() { return ''; }
export function refreshPendingCount() { _fetchGlobalStats(); }
export function getPeruTimeStr() {
  return new Date().toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' });
}
export function getNumberHealth() { return _lastHealth; }
export function isNumberAuthorized() { return _lastHealth?.can_send ?? null; }
export function fetchNumberHealth() { _fetchHealth(); }
export function fetchNumberConfig() {}
export function getLastSpamResult() { return _lastSpamResult; }
export function getGlobalStats() { return _globalStats; }
export function fetchGlobalStats() { _fetchGlobalStats(); }
export function getCheckpoint() { return null; }
export function getBlockSent() { return 0; }
export function getRespondedCount() { return 0; }
// Legacy stubs for sidebar compat (no longer used but keep contract)
export function previewSkipAndReplace() {}
export function previewMarkHablado() {}

export function pauseBlast() {
  _running = false;
  _stopCountdown();
  _notify();
}

export function resumeBlast() {
  if (_running) return;
  startBlast();
}

export function resetSession() {
  _sentPhones.clear();
  _sentIds.clear();
  try { localStorage.removeItem(LS_SENT_KEY); } catch (_) {}
  try { localStorage.removeItem(LS_RETRY_KEY); } catch (_) {}
  _preClaimedIds.clear();
  _inFlight.clear();
  _trackedMsgs = [];
  _kpis = { sent: 0, failed: 0, no_wa: 0, skipped: 0 };
  _lastResults = [];
  _totalPending = null;
  _running = false;
  _tplIndex = 0;
  _sessionSent = 0;
  _blastLimit = 0;
  _burstCount = 0;
  _hasSentThisSession = false;
  _confirmedPreview = null;
  _previewContacts = [];
  _previewSkippedIds.clear();
  _previewMessages.clear();
  _previewFlags.clear();
  _previewReady = false;
  _previewLoading = false;
  _stopCountdown();
  _stopAckTracking();
  _notify();
}
