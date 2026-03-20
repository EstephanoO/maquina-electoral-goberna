// blast-panel.js — VERSIÓN SIMPLIFICADA
// Delay variable 1-5s entre mensajes. Loop hasta que pares.
// Sin bulk, sin checkpoint, sin preview, sin health check, sin spam check.
// Mínimo código posible para máxima confiabilidad.

import { WA_ORIGIN, getOwnNumber } from './bootstrap.js';

// ── Config ─────────────────────────────────────────────────────────
const CFG_KEY = 'wspp_blast_cfg_v7'; // v7: simplificado
const TPL_KEY = 'wspp_blast_tpls_v6';

const DEFAULTS = {
  batchSize: 10,   // cuántos contactos pedir por fetch al backend
  brigadista: '',
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

// Dedup local simple
const _sentPhones = new Set();
const _sentIds = new Set();

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
  }
  _trackedMsgs = _trackedMsgs.filter(e => {
    if (e.lastAck >= 3 && now - e.ts > 120000) return false;
    if (now - e.ts > 600000) return false;
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
    return opts[_hashSeed(String(seed + counter), counter) % opts.length];
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
async function _checkExistsOnWA(normalizedPhone) {
  try {
    const { USyncQuery } = window.require('WAWebUsync');
    const { USyncUser }  = window.require('WAWebUsyncUser');
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
async function _simulateTyping(chat, text) {
  try {
    const csb = _req('WAWebChatStateBridge');
    if (csb.sendChatStateComposing) {
      await csb.sendChatStateComposing(chat.id);
      const typingMs = Math.max(800, Math.min(4000, text.length * 30));
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

// ── Delay 1-5s VARIABLE ──────────────────────────────────────────
// Sin patrón fijo: 1-5s al azar para que WA no detecte bot
function _variableDelay() {
  return 1000 + Math.floor(Math.random() * 4000); // 1000-5000ms
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

// ── Hablado IDs (para marcar en backend sin romper dedup) ────────
const _habladoIds = new Set();

function _markHabladoIds(ids) {
  for (const id of ids) _habladoIds.add(id);
}

// ── Backend comms ─────────────────────────────────────────────────
let _reqIdCounter = 0;
function _nextReqId() { return 'blast_' + (++_reqIdCounter) + '_' + Date.now(); }
const _pendingRequests = new Map();

window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.type !== 'BLAST_FORM_CONTACTS_READY') return;
  const reqId = e.data.reqId;
  if (!reqId) return;
  const pending = _pendingRequests.get(reqId);
  if (!pending) return;
  clearTimeout(pending.timer);
  _pendingRequests.delete(reqId);
  if (e.data.ok) {
    _totalPending = e.data.total ?? _totalPending;
    pending.resolve(e.data.contacts || []);
    _notify();
  } else {
    pending.resolve([]);
  }
});

function _fetchBatch(limit) {
  return new Promise((resolve) => {
    const reqId = _nextReqId();
    const timer = setTimeout(() => {
      _pendingRequests.delete(reqId);
      resolve([]);
    }, 15000);
    _pendingRequests.set(reqId, { resolve, timer });
    window.postMessage({
      type: 'BLAST_GET_FORM_CONTACTS',
      limit, offset: 0, status: 'nuevo',
      brigadista: cfg.brigadista || '',
      reqId,
      own_number: getOwnNumber()
    }, WA_ORIGIN);
  });
}

function _markHablado(ids, no_wa_ids) {
  if (!ids.length && !(no_wa_ids?.length)) return Promise.resolve(false);
  return new Promise((resolve) => {
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
      type: 'BLAST_MARK_HABLADO', ids, no_wa_ids: no_wa_ids ?? [],
      own_number: getOwnNumber(), reqId
    }, WA_ORIGIN);
  });
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
export function isWithinBlastWindow() { return true; } // Simplificado: sin ventana horaria
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

  _running = true;
  _kpis = { sent: 0, failed: 0, no_wa: 0, skipped: 0 };
  _lastResults = [];
  _trackedMsgs = [];
  _totalPending = null;
  _sessionSent = 0;
  _notify();

  while (_running) {
    // Si alcanzó el límite → parar
    if (_blastLimit > 0 && _sessionSent >= _blastLimit) {
      _running = false;
      _stopCountdown();
      _notify();
      break;
    }
    // 1. Fetch un batch
    const rawBatch = await _fetchBatch(cfg.batchSize);
    if (!rawBatch.length) {
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

    if (!batch.length) {
      _running = false;
      _stopCountdown();
      _notify();
      break;
    }

    const habladoBatch = [];
    const noWaBatch = [];

    // 3. Procesar cada contacto
    for (let i = 0; i < batch.length && _running; i++) {
      const c = batch[i];
      const normalizedPhone = _normalizePhone(c.telefono);
      const jid = normalizedPhone ? normalizedPhone + '@c.us' : null;
      const cName = ((c.nombre || '') + ' ' + (c.apellidos || '')).trim() || '—';
      const lockKey = (normalizedPhone || '') + ':' + (c.id || '');

      // Skip si ya se envió
      if (_inFlight.has(lockKey)) continue;

      // Dedup
      if (normalizedPhone) _sentPhones.add(normalizedPhone);
      if (c.id) _sentIds.add(c.id);
      _inFlight.add(lockKey);

      // Sin nombre → skip
      if (!((c.nombre || '') + ' ' + (c.apellidos || '')).trim()) {
        _kpis.skipped++;
        if (c.id) { _markHabladoIds([c.id]); habladoBatch.push(c.id); }
        _lastResults.unshift({ nombre: '— Sin nombre', telefono: c.telefono, status: 'skipped', ack: -1, error: 'Sin nombre' });
        if (_lastResults.length > 30) _lastResults.length = 30;
        _notify();
        continue;
      }

      if (!jid) {
        _kpis.failed++;
        _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: 'failed', ack: -1, error: 'Tel inválido' });
        if (_lastResults.length > 30) _lastResults.length = 30;
        _notify();
        continue;
      }

      // USyncQuery pre-check
      if (normalizedPhone) {
        const hasWA = await _checkExistsOnWA(normalizedPhone);
        if (hasWA === false) {
          _kpis.no_wa++;
          if (c.id) { _sentIds.add(c.id); noWaBatch.push(c.id); }
          _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: 'no_wa', ack: -1, error: 'Sin WA' });
          if (_lastResults.length > 30) _lastResults.length = 30;
          _notify();
          continue;
        }
      }

      // Prewarm chat
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

        // ── SAFETY NET: si WA Web ya tiene chat con historial → skip ─────
        // Si lastReceivedKey existe, el contacto YA RECIBIÓ mensajes antes.
        // Esto cubre el caso donde el backend falló en marcar hablado.
        const lastReceivedKey = chat.get?.('lastReceivedKey');
        const msgCount = chat.get?.('msgCount') || 0;
        if (lastReceivedKey && msgCount > 0) {
          console.log('[BLAST] Skip — WA ya tiene chat con historial:', cName, telefono);
          _kpis.skipped++;
          if (c.id) { _markHabladoIds([c.id]); habladoBatch.push(c.id); }
          _markHablado(c.id ? [c.id] : [], []).catch(() => {});
          _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: 'skipped', ack: -1, error: 'Ya tiene chat en WA' });
          if (_lastResults.length > 30) _lastResults.length = 30;
          _notify();
          _inFlight.delete(lockKey);
          continue;
        }
      } catch (err) {
        _kpis.failed++;
        _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: 'failed', ack: -1, error: err.message });
        if (_lastResults.length > 30) _lastResults.length = 30;
        _notify();
        continue;
      }

      // Seleccionar plantilla (rotación)
      const tpl = tpls[_tplIndex % tpls.length];
      const parts = _spinMessage(tpl, c, _tplIndex);
      const text = parts[0];

      // Enviar partes (---)
      let msgModel = null;
      let sendOk = true;
      try {
        for (let p = 0; p < parts.length && _running; p++) {
          const partText = parts[p];
          if (p > 0) await _sleep(1000 + Math.random() * 2000);
          const partModel = await _sendToChat(chat, partText);
          if (p === 0) {
            msgModel = partModel;
            if (partModel) _trackMessage(partModel, c.telefono);
          }
        }
        _kpis.sent++;
        _sessionSent++;
        _tplIndex++;
        if (c.id) {
          habladoBatch.push(c.id);
          // ── MARCAR INMEDIATAMENTE después del envío ──────────────────
          // Así, si algo falla después, el contacto ya está marcado
          // como 'hablado' en form_submissions y blast_log
          _markHablado([c.id], []).catch(err => {
            console.warn('[BLAST] mark-hablado immediate failed:', err?.message);
          });
        }
        // Si alcanzó el límite → romper el loop de contactos
        if (_blastLimit > 0 && _sessionSent >= _blastLimit) {
          _running = false;
          _stopCountdown();
          _notify();
          break;
        }
      } catch (err) {
        _kpis.failed++;
        sendOk = false;
        _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: 'failed', ack: -1, error: err.message });
      }

      if (_lastResults.length > 30) _lastResults.length = 30;
      _notify();

      // Release lock
      _inFlight.delete(lockKey);

      // Delay VARIABLE 1-5s ANTES del siguiente
      if (_running && i < batch.length - 1) {
        const delay = _variableDelay();
        _startCountdown(Math.ceil(delay / 1000), 'delay');
        await _sleep(delay);
        _stopCountdown();
      }
    }

    // 4. Mark hablado masivo
    if (habladoBatch.length || noWaBatch.length) {
      await _markHablado([...habladoBatch], [...noWaBatch]);
    }

    if (_totalPending !== null) _totalPending = Math.max(0, _totalPending - _kpis.sent);
    _notify();

    // Pausa corta entre batches
    if (_running) {
      await _sleep(2000);
    }
  }

  _running = false;
  _stopCountdown();
  _stopAckTracking();
  _notify();
}

// ── STUBS para compatibilidad con sidebar.js existente ──────────────
// Funciones eliminadas en versión simplificada — devuelven null/vacios
export function isPaused() { return false; }
export function getPhase() { return ''; }
export function refreshPendingCount() {}
export function getPeruTimeStr() { return ''; }
export function getNumberHealth() { return null; }
export function isNumberAuthorized() { return null; }
export function fetchNumberHealth() {}
export function fetchNumberConfig() {}
export function getLastSpamResult() { return null; }
export function getGlobalStats() { return null; }
export function fetchGlobalStats() {}
export function getPreviewContacts() { return []; }
export function isPreviewLoading() { return false; }
export function isPreviewReady() { return false; }
export function getPreviewSkipped() { return new Set(); }
export function previewSkipAndReplace() {}
export function previewMarkHablado() {}
export function previewConfirm() {}
export function previewCancel() {}
export function getCheckpoint() { return null; }
export function getBlockSent() { return 0; }
export function getRespondedCount() { return 0; }

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
  _habladoIds.clear();
  _inFlight.clear();
  _trackedMsgs = [];
  _kpis = { sent: 0, failed: 0, no_wa: 0, skipped: 0 };
  _lastResults = [];
  _totalPending = null;
  _running = false;
  _tplIndex = 0;
  _sessionSent = 0;
  _blastLimit = 0;
  _stopCountdown();
  _stopAckTracking();
  _notify();
}
