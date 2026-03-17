// blast-panel.js — Motor de blast que trabaja directo con el backend
// Pide batches → envía → trackea ack (pending/sent/delivered/read) → marca hablado → pide más
// El sidebar consume las exports para mostrar UI.

import { WA_ORIGIN, getOwnNumber } from './bootstrap.js';

// ── Spam check ────────────────────────────────────────────────────────
async function _spamCheck() {
  return new Promise((resolve) => {
    window.postMessage({ type: 'WSPP_SPAM_CHECK_NOW' }, WA_ORIGIN);
    const h = (e) => {
      if (e.source !== window || e.data?.type !== 'WSPP_SPAM_CHECK_RESULT') return;
      window.removeEventListener('message', h);
      resolve({ shouldPause: e.data.result?.risk_level === 'critical' });
    };
    window.addEventListener('message', h);
    setTimeout(() => { window.removeEventListener('message', h); resolve({ shouldPause: false }); }, 500);
  });
}

// ══════════════════════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════════════════════
const CFG_KEY = 'wspp_blast_cfg_v3';
const TPL_KEY = 'wspp_blast_tpls_v4'; // v4: spintax + 3 plantillas César

const DEFAULTS = {
  batchSize:    25,   // personas por tanda — el usuario lo cambia en la UI
  delaySec:     15,
  prewarmSec:   30,
  pausaCada:    10,
  pausaSec:     60,
  descansoSec:  300,
};

function _loadCfg() {
  try { const r = localStorage.getItem(CFG_KEY); return r ? { ...DEFAULTS, ...JSON.parse(r) } : { ...DEFAULTS }; } catch (_) { return { ...DEFAULTS }; }
}
function _saveCfg(c) { try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (_) {} }
let cfg = _loadCfg();

// 3 plantillas predeterminadas para César Vásquez — se rotan 1→2→3→1→2→3
// Plantilla 1: 3 mensajes separados
const DEFAULT_TPL  = '[Buenas tardes|Buenas|Hola|Buen día] {{nombre}}, ¿[cómo te encuentras?|cómo estás?|todo bien?|cómo te va?]\n---\nSoy el doctor César Vásquez\n---\n[Candidato al Senado Nacional|Postulante al Senado Nacional] 🇵🇪';
// Plantilla 2: 2 mensajes
const DEFAULT_TPL2 = '[Hola|Buenas|Buenas tardes] {{nombre}} 👋 ¿[cómo estás?|todo bien?|cómo te va?]\n---\nSoy el doctor César Vásquez, [candidato al Senado Nacional|postulante al Senado Nacional] 🇵🇪';
// Plantilla 3: 1 mensaje
const DEFAULT_TPL3 = '[Hola|Buenas|Buenas tardes] {{nombre}}, ¿[cómo te encuentras?|todo bien?|cómo estás?] Soy el doctor César Vásquez, [candidato al Senado Nacional|postulante al Senado Nacional] 🇵🇪';
function _loadTpls() {
  try { const r = localStorage.getItem(TPL_KEY); if (r) { const p = JSON.parse(r); if (p.length) return p; } } catch (_) {}
  return [DEFAULT_TPL, DEFAULT_TPL2, DEFAULT_TPL3];
}
function _saveTpls(t) { try { localStorage.setItem(TPL_KEY, JSON.stringify(t)); } catch (_) {} }
let tpls = _loadTpls();

// ══════════════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════════════
let _running = false;
let _paused = false;
let _countdown = 0;
let _countdownTimer = null;
let _phase = '';
let _consecFails = 0;
let _totalPending = null;
let _onUpdate = null;

// ── KPIs: ack tracking ────────────────────────────────────────────────
// ack levels: 0=pending(clock), 1=sent(✓), 2=delivered(✓✓), 3=read(✓✓ blue)
// no_wa: número válido pero sin WhatsApp (skipped por USyncQuery pre-check)
let _kpis = { pending: 0, sent: 0, delivered: 0, read: 0, failed: 0, no_wa: 0 };
let _lastResults = [];    // { nombre, telefono, status, ack, error }
let _trackedMsgs = [];    // { msgModel, contactName, telefono } — live ack tracking

// ── Dedup local de sesión ─────────────────────────────────────────────
// Guarda teléfonos + IDs ya enviados en esta sesión para que aunque el
// backend devuelva el mismo contacto (por lag en mark-hablado), la
// extensión lo ignore sin volver a enviar.
const _sentThisSession = new Set();  // Set de telefono normalizado
const _sentIds = new Set();          // Set de form_submission.id

// ── Índice de plantilla de sesión ─────────────────────────────────────
// Contador global que SOLO avanza cuando un envío fue exitoso.
// Es independiente de `i` y de `globalSent` para que skips (dedup, no_wa,
// jid inválido) no desincronicen la rotación ni causen que 2 contactos
// reciban la misma plantilla o que 1 contacto reciba 2 plantillas.
let _tplIndex = 0;

// ══════════════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════════════
export function getConfig() { return cfg; }
export function setConfig(c) { cfg = { ...cfg, ...c }; _saveCfg(cfg); }
export function getTemplates() { return tpls; }
export function setTemplates(t) { tpls = t; _saveTpls(t); }

export function isRunning() { return _running; }
export function isPaused() { return _paused; }
export function getCountdown() { return _countdown; }
export function getPhase() { return _phase; }
export function getTotalPending() { return _totalPending; }
export function getKpis() { return { ..._kpis }; }
export function getLastResults() { return _lastResults; }
export function setOnUpdate(fn) { _onUpdate = fn; }
export function getTplIndex() { return _tplIndex; } // índice actual de rotación

function _notify() { if (_onUpdate) _onUpdate(); }

// ══════════════════════════════════════════════════════════════════════
// ACK TRACKING — polls sent messages for delivery/read status
// ══════════════════════════════════════════════════════════════════════
let _ackInterval = null;

function _startAckTracking() {
  if (_ackInterval) return;
  _ackInterval = setInterval(_pollAcks, 5000); // every 5s
}

function _stopAckTracking() {
  if (_ackInterval) { clearInterval(_ackInterval); _ackInterval = null; }
}

function _pollAcks() {
  let changed = false;
  for (const entry of _trackedMsgs) {
    if (!entry.msgModel) continue;
    // Read ack from the WA Backbone model
    const ack = typeof entry.msgModel.get === 'function'
      ? entry.msgModel.get('ack')
      : entry.msgModel.ack;
    const newAck = Number(ack) || 0;
    if (newAck !== entry.lastAck) {
      // Update KPIs: decrement old, increment new
      const oldKey = _ackToKey(entry.lastAck);
      const newKey = _ackToKey(newAck);
      if (oldKey) _kpis[oldKey] = Math.max(0, _kpis[oldKey] - 1);
      if (newKey) _kpis[newKey] = (_kpis[newKey] || 0) + 1;
      entry.lastAck = newAck;
      // Update last results
      const result = _lastResults.find(r => r.telefono === entry.telefono && r.status !== 'failed');
      if (result) result.ack = newAck;
      changed = true;
    }
  }
  // Cleanup: remove fully-read messages from tracking after 2 min
  const now = Date.now();
  _trackedMsgs = _trackedMsgs.filter(e => {
    if (e.lastAck >= 3 && now - e.ts > 120000) return false; // read + 2min = done
    return true;
  });
  if (!_trackedMsgs.length) _stopAckTracking();
  if (changed) _notify();
}

function _ackToKey(ack) {
  if (ack <= 0) return 'pending';
  if (ack === 1) return 'sent';
  if (ack === 2) return 'delivered';
  if (ack >= 3) return 'read';
  return 'pending';
}

function _trackMessage(msgModel, contactName, telefono) {
  const ack = typeof msgModel.get === 'function' ? msgModel.get('ack') : (msgModel.ack || 0);
  const key = _ackToKey(Number(ack) || 0);
  _kpis[key] = (_kpis[key] || 0) + 1;
  _trackedMsgs.push({ msgModel, contactName, telefono, lastAck: Number(ack) || 0, ts: Date.now() });
  _startAckTracking();
}

// ══════════════════════════════════════════════════════════════════════
// PENDING COUNT
// ══════════════════════════════════════════════════════════════════════
// ── Request IDs para evitar race conditions ───────────────────────────
// refreshPendingCount() y _fetchBatch() usan el mismo canal de mensajes.
// Sin IDs únicos, la respuesta del refresh puede resolver el Promise del
// blast → el blast procesa 1 contacto en vez del batch → doble envío.
let _reqIdCounter = 0;
function _nextReqId() { return 'blast_' + (++_reqIdCounter) + '_' + Date.now(); }

// Mapa de resolvers: reqId → { resolve, timer }
const _pendingRequests = new Map();

window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.type !== 'BLAST_FORM_CONTACTS_READY') return;
  const reqId = e.data.reqId;
  if (!reqId) return; // ignorar mensajes sin reqId (legacy / externos)

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

// Actualiza _totalPending sin interferir con el blast en curso
export function refreshPendingCount() {
  const reqId = _nextReqId();
  const timer = setTimeout(() => { _pendingRequests.delete(reqId); }, 10000);
  _pendingRequests.set(reqId, {
    resolve: (contacts) => {
      // refreshPendingCount solo necesita el total, no los contactos
      // _totalPending ya se actualiza en el listener arriba
    },
    timer,
  });
  window.postMessage({ type: 'BLAST_GET_FORM_CONTACTS', limit: 1, offset: 0, status: 'nuevo', reqId }, WA_ORIGIN);
}

function _fetchBatch(limit) {
  return new Promise((resolve) => {
    const reqId = _nextReqId();
    const timer = setTimeout(() => {
      if (_pendingRequests.has(reqId)) {
        _pendingRequests.delete(reqId);
        resolve([]);
      }
    }, 15000);
    _pendingRequests.set(reqId, { resolve, timer });
    window.postMessage({ type: 'BLAST_GET_FORM_CONTACTS', limit, offset: 0, status: 'nuevo', reqId }, WA_ORIGIN);
  });
}

function _markHablado(ids) {
  if (ids.length) window.postMessage({ type: 'BLAST_MARK_HABLADO', ids, own_number: getOwnNumber() }, WA_ORIGIN);
}

function _reportLog(results) {
  if (results.length) window.postMessage({ type: 'BLAST_REPORT_RESULTS', results }, WA_ORIGIN);
}

// ══════════════════════════════════════════════════════════════════════
// MESSAGE VARIATION — Spintax por bloques
// ══════════════════════════════════════════════════════════════════════
//
// Sintaxis del template:
//   [opción1|opción2|opción3]  → elige una variante al azar
//   {{nombre}}  {{saludo}}  {{cierre}}  {{emoji}}  {{distrito}}  {{fecha}}  {{hora}}
//   ---  (línea sola)           → corte de mensaje: genera múltiples mensajes separados
//
// Ejemplo:
//   [Hola!|Buenas!|Qué tal!] {{nombre}}
//   [Soy de Goberna|Te escribe el equipo Goberna]
//   ---
//   [¿Cómo estás?|¿Todo bien?]
//   [Saludos!|Un abrazo!] {{emoji}}
//
// Resultado: 2 mensajes separados, cada uno con variantes distintas
//
const SALUDOS = ['Hola', 'Buenas', 'Buenos días', 'Hola buen día', 'Qué tal', 'Buenas tardes'];
const CIERRES = ['Gracias!', 'Saludos!', 'Un abrazo!', 'Hasta pronto!', 'Éxitos!'];
const EMOJIS  = ['', '', '', '👋', '🙌', '✅'];

// Genera un número pseudo-random estable para un (contacto, posicion) dado
// Usamos un hash simple para que el mismo contacto siempre reciba variantes distintas
// pero deterministas (no cambian si se reintenta)
function _hashSeed(str, offset) {
  let h = offset * 2654435761;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 2246822519);
    h ^= h >>> 13;
  }
  return Math.abs(h);
}

// Procesa [opción1|opción2|opción3] eligiendo una variante usando el seed
function _spinVariants(text, seed) {
  let counter = 0;
  return text.replace(/\[([^\]]+)\]/g, (_, inner) => {
    const opts = inner.split('|');
    const chosen = opts[_hashSeed(String(seed + counter), counter) % opts.length];
    counter++;
    return chosen;
  });
}

// Reemplaza variables {{nombre}}, {{saludo}}, etc.
function _applyVars(text, c, seed) {
  const nombre = ((c.nombre || '') + ' ' + (c.apellidos || '')).trim().split(/\s+/)[0] || 'amigo';
  const now = new Date();
  return text
    .replace(/\{\{nombre\}\}/gi, nombre)
    .replace(/\{\{saludo\}\}/gi, SALUDOS[_hashSeed(String(seed), 1) % SALUDOS.length])
    .replace(/\{\{cierre\}\}/gi, CIERRES[_hashSeed(String(seed), 2) % CIERRES.length])
    .replace(/\{\{emoji\}\}/gi,  EMOJIS[_hashSeed(String(seed),  3) % EMOJIS.length])
    .replace(/\{\{distrito\}\}/gi, c.distrito || '')
    .replace(/\{\{fecha\}\}/gi, now.toLocaleDateString('es-PE'))
    .replace(/\{\{hora\}\}/gi, now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }));
}

// Retorna array de strings — uno por mensaje a enviar.
// Si el template no tiene '---', retorna array de 1 elemento.
// Cada parte puede tener múltiples líneas y variantes [x|y].
function _spinMessage(tpl, c, idx) {
  const seed = idx * 137 + (c.id ? c.id.charCodeAt(0) : 0);

  // Separar por '---' en línea sola (con o sin espacios alrededor)
  const parts = tpl.split(/^[ \t]*---[ \t]*$/m);

  return parts
    .map(part => {
      // Para cada parte: procesar variantes, luego variables
      const spun = _spinVariants(part.trim(), seed);
      const resolved = _applyVars(spun, c, seed);
      return resolved.trim();
    })
    .filter(p => p.length > 0); // Ignorar partes vacías
}

// ══════════════════════════════════════════════════════════════════════
// WA INTERNALS
// ══════════════════════════════════════════════════════════════════════
function _req(...names) {
  for (const n of names) { try { const m = window.require(n); if (m) return m; } catch (_) {} }
  throw new Error('WA module: ' + names.join('/'));
}

function _phoneToJid(tel) {
  const d = String(tel).replace(/\D/g, '');
  if (!d) return null;
  return (d.length === 9 ? '51' + d : d) + '@c.us';
}

function _normalizePhone(tel) {
  const d = String(tel).replace(/\D/g, '');
  if (!d) return null;
  return d.length === 9 ? '51' + d : d;
}

// ── USyncQuery: verifica si un teléfono tiene WA antes de intentar enviar
// Resultado: true = tiene WA, false = no tiene WA o error
// Si USyncQuery no está disponible retorna null (no bloquea el blast)
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
    const item     = response?.list?.[0];
    const type     = item?.contact?.type; // 'in' | 'out' | 'invalid'
    if (!type) return null; // error de red / respuesta vacía — no bloquear
    return type === 'in';
  } catch (_) {
    return null; // módulo no disponible o error — no bloquear el blast
  }
}

// Retorna { chat, alreadyInStore } — si alreadyInStore=true el prewarm se salta
async function _prewarmChat(jid) {
  const wf   = _req('WAWebWidFactory');
  const wid  = wf.createWid(jid);
  const coll = _req('WAWebCollections');

  // Intentar primero con @c.us en el store
  let chat = coll.Chat.get(wid);
  if (chat) return { chat, alreadyInStore: true };

  // No está — resolver vía findOrCreateLatestChat (puede cambiar a @lid)
  const FC = _req('WAWebFindChatAction');
  const r  = await FC.findOrCreateLatestChat(wid);
  chat = r?.chat ?? r;

  if (!chat) throw new Error('Número no existe en WA');
  return { chat, alreadyInStore: false };
}

// Returns the msg model so we can track ack later
// FIX 2026-03-17:
//   - MsgKey.newId() es async — await obligatorio para obtener el string ID
//   - MsgKey constructor no existe — usar MsgKey.from({fromMe, remote, id})
//   - p1 no es el msgModel — capturar el modelo vía MsgCollection.on('add') por ID
//   - unproxy(chat) necesario para que addAndSendMsgToChat funcione con @lid chats
async function _sendToChat(chat, text) {
  const meMod   = _req('WAWebUserPrefsMeUser');
  const meUser  = (meMod.getMaybeMePnUser ?? meMod.getMeUser).call(meMod);
  const MsgKey  = _req('WAWebMsgKey');
  const { unproxy } = _req('WAWebStateUtils');
  const { MsgCollection } = _req('WAWebMsgCollection');

  // newId() es async en esta versión de WA
  const idStr = await MsgKey.newId();

  // Construir MsgKey con .from() — constructor directo no existe
  const key = MsgKey.from({
    fromMe: true,
    remote: chat.id,   // Wid object — puede ser @lid o @c.us
    id: idStr,         // string hexadecimal
  });

  let eph = {};
  try {
    const em = _req('WAWebGetEphemeralFieldsMsgActionsUtils', 'WAWebEphemeralFields', 'WAWebEphemeralUtils');
    const fn = em.getEphemeralFields ?? em.default?.getEphemeralFields;
    if (fn) eph = fn(chat);
  } catch (_) {}

  // Capturar el msgModel vía MsgCollection.on('add') ANTES de enviar
  // porque addAndSendMsgToChat[1] no es el model sino otra Promise
  let capturedModel = null;
  const onAdd = (msg) => {
    if (msg.get?.('id')?.id === idStr && msg.get?.('id')?.fromMe) {
      capturedModel = msg;
    }
  };
  MsgCollection.on('add', onAdd);

  try {
    const [p0] = _req('WAWebSendMsgChatAction').addAndSendMsgToChat(unproxy(chat), {
      ...eph,
      id:       key,
      type:     'chat',
      body:     text,
      from:     meUser,
      to:       chat.id,
      local:    true,
      self:     'out',
      t:        Math.floor(Date.now() / 1000),
      isNewMsg: true,
    });
    await p0; // esperar confirmación de envío al servidor
  } finally {
    MsgCollection.off('add', onAdd);
  }

  // Si no capturamos el modelo via 'add', buscarlo en la colección por ID
  if (!capturedModel) {
    capturedModel = MsgCollection._models.find(m =>
      m.get?.('id')?.id === idStr && m.get?.('id')?.fromMe
    ) || null;
  }

  return capturedModel; // Backbone model con ack en tiempo real vía .on('change:ack')
}

// ── Timers ────────────────────────────────────────────────────────────
function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function _startCountdown(sec, phase) {
  _phase = phase; _countdown = sec;
  clearInterval(_countdownTimer);
  _countdownTimer = setInterval(() => {
    _countdown = Math.max(0, _countdown - 1);
    _notify();
    if (_countdown <= 0) clearInterval(_countdownTimer);
  }, 1000);
}
function _stopCountdown() { clearInterval(_countdownTimer); _countdown = 0; _phase = ''; }

// ══════════════════════════════════════════════════════════════════════
// MAIN LOOP
// ══════════════════════════════════════════════════════════════════════
export async function startBlast() {
  if (_running) return;
  if (!tpls.length || !tpls[0].trim()) return;

  _running = true; _paused = false; _consecFails = 0;
  const activeNumber = getOwnNumber();
  _notify();

  while (_running && !_paused) {
    // 1. Fetch batch
    _phase = 'cargando'; _notify();
    const batch = await _fetchBatch(cfg.batchSize);

    if (!batch.length) { _running = false; _stopCountdown(); _notify(); break; }

    const logBatch = [];
    let batchSent = 0;

    // 2. Send each contact
    for (let i = 0; i < batch.length && _running && !_paused; i++) {
      const c = batch[i];
      const normalizedPhone = _normalizePhone(c.telefono);
      const jid = normalizedPhone ? normalizedPhone + '@c.us' : null;

      // ── Selección de plantilla robusta ────────────────────────────────
      // _tplIndex es un contador de sesión que SOLO avanza al enviar exitoso.
      // Garantiza:
      //   - 1 plantilla por contacto (no importa cuántos skips haya)
      //   - Rotación pareja: 1→2→3→1→2→3...
      //   - Sin desincronización por dedup/no_wa/jid inválido
      const tpl = tpls[_tplIndex % tpls.length];

      // _spinMessage retorna array: 1 elemento si no hay '---', N si hay cortes
      const parts = _spinMessage(tpl, c, _tplIndex);
      const text = parts[0]; // para logs y fallback
      const cName = ((c.nombre || '') + ' ' + (c.apellidos || '')).trim();
      let status = 'sent', error = null;

      // ── DEDUP local: skip si ya enviamos a este teléfono o ID en esta sesión ──
      // Protege contra el lag del servidor al marcar hablado — sin esperar al backend.
      if ((normalizedPhone && _sentThisSession.has(normalizedPhone)) ||
          (c.id && _sentIds.has(c.id))) {
        console.log('[BLAST] Dedup local — ya enviado a:', normalizedPhone || c.id);
        continue;
      }

      if (!jid) {
        status = 'failed'; error = 'Tel inválido';
        _kpis.failed++;
        _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: 'failed', ack: -1, error });
        if (_lastResults.length > 30) _lastResults.length = 30;
        logBatch.push({ phone: c.telefono, contact_name: cName, message: text, status, error, own_number: activeNumber });
        _notify();
        continue;
      }

      // Spam check
      const sc = await _spamCheck();
      if (sc.shouldPause) {
        _running = false; _stopCountdown();
        _lastResults.unshift({ nombre: '🚨 RIESGO CRÍTICO', telefono: '', status: 'failed', ack: -1, error: 'Pausado por spam' });
        _notify(); break;
      }

      // ── USyncQuery pre-check: ¿tiene WhatsApp este número? ────────────
      if (normalizedPhone) {
        const hasWA = await _checkExistsOnWA(normalizedPhone);
        if (hasWA === false) {
          _kpis.no_wa = (_kpis.no_wa || 0) + 1;
          _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: 'no_wa', ack: -1, error: 'Sin WhatsApp' });
          if (_lastResults.length > 30) _lastResults.length = 30;
          logBatch.push({ phone: c.telefono, contact_name: cName, message: text, status: 'no_wa', error: 'Sin WhatsApp', own_number: activeNumber });
          // Marcar hablado en el servidor para que no vuelva a aparecer
          if (c.id) _markHablado([c.id]);
          if (normalizedPhone) _sentThisSession.add(normalizedPhone);
          if (c.id) _sentIds.add(c.id);
          _notify();
          continue;
        }
      }

      // Prewarm — resolver el chat object
      let chat = null;
      let alreadyInStore = false;
      try {
        const pw = await _prewarmChat(jid);
        chat = pw.chat;
        alreadyInStore = pw.alreadyInStore;
      } catch (err) {
        status = 'failed'; error = err.message; _consecFails++;
        _kpis.failed++;
        _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: 'failed', ack: -1, error });
        if (_lastResults.length > 30) _lastResults.length = 30;
        logBatch.push({ phone: c.telefono, contact_name: cName, message: text, status, error, own_number: activeNumber });
        _notify();
        if (_consecFails >= 3) { _running = false; _stopCountdown(); _reportLog([...logBatch]); break; }
        continue;
      }

      // Pre-warm wait: solo si el chat NO estaba en el store local
      if (_running && !_paused && !alreadyInStore && cfg.prewarmSec > 0) {
        _startCountdown(cfg.prewarmSec, 'prewarm'); _notify();
        await _sleep(cfg.prewarmSec * 1000); _stopCountdown();
      }
      if (!_running || _paused) break;

      // Send — uno o varios mensajes según los '---' del template
      let msgModel = null;
      try {
        for (let p = 0; p < parts.length && _running && !_paused; p++) {
          const partText = parts[p];

          // Delay entre partes del mismo contacto (simula escritura humana)
          // Entre 1s y 4s, crece levemente con cada parte para dar sensación natural
          if (p > 0) {
            const partDelay = 1000 + Math.random() * 3000 + p * 500;
            await _sleep(partDelay);
          }

          const partModel = await _sendToChat(chat, partText);
          if (p === 0) msgModel = partModel; // trackear ACK del primer mensaje
          if (partModel) _trackMessage(partModel, cName, c.telefono);
        }

        batchSent++;
        _tplIndex++;   // ← avanza SOLO en envío exitoso
        _consecFails = 0;

        // Marcar hablado inmediatamente tras enviar todos los mensajes de este contacto
        if (c.id) _markHablado([c.id]);
        if (normalizedPhone) _sentThisSession.add(normalizedPhone);
        if (c.id) _sentIds.add(c.id);

        _lastResults.unshift({
          nombre: cName, telefono: c.telefono, status: 'sent',
          ack: msgModel?.get?.('ack') ?? 0, error: null,
          parts: parts.length, // cuántos mensajes se enviaron
        });
      } catch (err) {
        status = 'failed'; error = err.message; _consecFails++;
        _kpis.failed++;
        _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: 'failed', ack: -1, error });
        if (_consecFails >= 3) {
          _running = false; _stopCountdown();
          logBatch.push({ phone: c.telefono, contact_name: cName, message: text, status, error, own_number: activeNumber });
          _reportLog([...logBatch]); break;
        }
      }

      if (_lastResults.length > 30) _lastResults.length = 30;
      logBatch.push({ phone: c.telefono, contact_name: cName, message: text, status, error, own_number: activeNumber });
      _notify();
      if (logBatch.length >= 10) { _reportLog([...logBatch]); logBatch.length = 0; }

      // Delays
      if (_running && !_paused && i < batch.length - 1) {
        if (batchSent > 0 && batchSent % 25 === 0 && cfg.descansoSec > 0) {
          _startCountdown(cfg.descansoSec, 'descanso'); _notify();
          await _sleep(cfg.descansoSec * 1000); _stopCountdown();
        } else if (batchSent > 0 && cfg.pausaCada > 0 && batchSent % cfg.pausaCada === 0 && cfg.pausaSec > 0) {
          _startCountdown(cfg.pausaSec, 'pausa'); _notify();
          await _sleep(cfg.pausaSec * 1000); _stopCountdown();
        } else if (cfg.delaySec > 0) {
          const v = cfg.delaySec * 0.3;
          const actual = Math.max(1, Math.round(cfg.delaySec + (Math.random() * 2 - 1) * v));
          _startCountdown(actual, 'delay'); _notify();
          await _sleep(actual * 1000); _stopCountdown();
        }
      }
    }

    // 3. Flush log restante (mark-hablado ya se hizo contacto por contacto)
    if (logBatch.length) _reportLog([...logBatch]);
    if (_totalPending !== null) _totalPending = Math.max(0, _totalPending - batchSent);
    _notify();

    if (!_running || _paused) break;

    // Pause between batches
    _startCountdown(5, 'cargando'); _notify();
    await _sleep(5000); _stopCountdown();
  }

  _running = false; _stopCountdown(); _notify();
}

export function pauseBlast() {
  _paused = true; _running = false; _stopCountdown(); _notify();
}

export function resumeBlast() {
  _paused = false; startBlast();
}

export function resetSession() {
  _sentThisSession.clear();
  _sentIds.clear();
  _tplIndex = 0;
  _kpis = { pending: 0, sent: 0, delivered: 0, read: 0, failed: 0, no_wa: 0 };
  _lastResults = []; _trackedMsgs = []; _totalPending = null;
  _running = false; _paused = false; _stopCountdown(); _stopAckTracking(); _notify();
}

// ── Legacy ────────────────────────────────────────────────────────────
export function toggleBlastPanel() {}
export function isBlastPanelOpen() { return false; }
