// blast-panel.js — Motor de blast que trabaja directo con el backend
// Pide batches → envía → trackea ack (pending/sent/delivered/read) → marca hablado → pide más
// El sidebar consume las exports para mostrar UI.

import { WA_ORIGIN, getOwnNumber } from './bootstrap.js';

// ── Spam check ────────────────────────────────────────────────────────
// Devuelve el resultado completo del spam detector (warnings, actions, score)
async function _spamCheck() {
  return new Promise((resolve) => {
    window.postMessage({ type: 'WSPP_SPAM_CHECK_NOW' }, WA_ORIGIN);
    const h = (e) => {
      if (e.source !== window || e.data?.type !== 'WSPP_SPAM_CHECK_RESULT') return;
      window.removeEventListener('message', h);
      const r = e.data.result;
      resolve({
        shouldPause:    r?.risk_level === 'critical' || r?.risk_level === 'high',
        riskLevel:      r?.risk_level || 'low',
        score:          r?.risk_score || 0,
        warnings:       r?.warnings || [],
        actions:        r?.actions || [],
        cooldown:       r?.cooldown_sec || 0,
        repeatedTexts:  r?.repeated_texts || [],
        uniqueRate:     r?.unique_rate ?? 100,
      });
    };
    window.addEventListener('message', h);
    setTimeout(() => { window.removeEventListener('message', h); resolve({ shouldPause: false, riskLevel: 'low', score: 0, warnings: [], actions: [], cooldown: 0 }); }, 1500);
  });
}

// ══════════════════════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════════════════════
const CFG_KEY = 'wspp_blast_cfg_v3';
const TPL_KEY = 'wspp_blast_tpls_v6'; // v6: plantilla César formal + departamento

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

// 4 plantillas para César Vásquez — se rotan 1→2→3→4→1→2→3→4
// Variables: {{nombre}} {{brigadista}} {{departamento}} {{distrito}}
//
// Plantilla 1: tono César formal — 2 mensajes (la que César aprobó)
const DEFAULT_TPL  = '{{nombre}}, [buenas tardes|buen día|buenas]. Te saluda César Vásquez, candidato al Senado Nacional.\n---\n[Nos llegaron tus datos a través de|Tus datos nos llegaron por medio de|Tu contacto nos llegó gracias a] mi equipo de campaña en {{departamento}}, por medio de {{brigadista}}.';
// Plantilla 2: variación — presentación primero, brigadista después
const DEFAULT_TPL2 = '[Buenas tardes|Buen día|Buenas] {{nombre}}. Soy César Vásquez, candidato al Senado Nacional #3 🇵🇪\n---\n[Tu número me llegó a través de|Me contactó de tu parte|Tus datos nos llegaron por] {{brigadista}}, de [nuestro equipo en|mi equipo de campaña en] {{departamento}}.';
// Plantilla 3: compacto 1 solo mensaje
const DEFAULT_TPL3 = '{{nombre}}, [buenas tardes|buen día|buenas]. Soy César Vásquez, candidato al Senado Nacional. [Nos llegaron tus datos gracias a|Tu contacto nos llegó por medio de] {{brigadista}} de mi equipo en {{departamento}}.';
// Plantilla 4: informal — pregunta + brigadista
const DEFAULT_TPL4 = '[Hola|Buenas|Buenas tardes] {{nombre}}, ¿[cómo estás?|todo bien?|cómo te va?]\n---\nTe [saluda|escribe|habla] César Vásquez, candidato al Senado Nacional #3. [Tu número me llegó gracias a|Tus datos me los compartió] {{brigadista}} de {{departamento}}.';
function _loadTpls() {
  try { const r = localStorage.getItem(TPL_KEY); if (r) { const p = JSON.parse(r); if (p.length) return p; } } catch (_) {}
  return [DEFAULT_TPL, DEFAULT_TPL2, DEFAULT_TPL3, DEFAULT_TPL4];
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

// ── Persist dedup across page reloads via chrome.storage ──────────────
// On each send, we postMessage to content.js which saves to chrome.storage.
// On load, content.js pushes back the saved set.
function _persistDedup(phone) {
  window.postMessage({ type: 'BLAST_DEDUP_ADD', phone }, WA_ORIGIN);
}

function _loadPersistedDedup(phones) {
  if (Array.isArray(phones)) {
    for (const p of phones) {
      _sentThisSession.add(p);
    }
    console.log('[BLAST] Loaded', phones.length, 'persisted dedup entries');
  }
}

// Listen for persisted dedup from content.js on page load
window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  if (e.data?.type === 'BLAST_DEDUP_LOADED') {
    _loadPersistedDedup(e.data.phones || []);
  }
});

// Request persisted dedup on module load
window.postMessage({ type: 'BLAST_DEDUP_REQUEST' }, WA_ORIGIN);

// ── Send lock — protege contra envíos concurrentes al mismo contacto ──
// Se registra ANTES del envío y se limpia al terminar (éxito o error).
// Si el mismo teléfono o ID ya está en vuelo, el loop lo salta.
const _inFlight = new Set(); // Set de 'phone:ID' en vuelo

// ── Auto-exclusión: contactos que respondieron no reciben más blast ───
const _respondedPhones = new Set();  // Set de teléfonos normalizados que respondieron

// ── Índice de plantilla de sesión ─────────────────────────────────────
// Contador global que SOLO avanza cuando un envío fue exitoso.
let _tplIndex = 0;

// ── Último resultado del spam check (visible en sidebar) ──────────────
let _lastSpamResult = null;
export function getLastSpamResult() { return _lastSpamResult; }

// ── Guard para evitar loops simultáneos ───────────────────────────────
// resumeBlast puede llamar startBlast() mientras el loop anterior
// todavía está resolviendo una promise → dos loops en paralelo.
let _loopRunning = false;

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
export function getRespondedCount() { return _respondedPhones.size; }

// ── Number Health: estado del número activo ──────────────────────────
let _numberHealth = null; // { sent_last_hour, sent_today, daily_limit, hourly_limit, can_send, risk_level, age_days }
let _numberAuthorized = null; // null=unknown, true=registrado, false=no registrado
export function getNumberHealth() { return _numberHealth; }
export function isNumberAuthorized() { return _numberAuthorized; }

// Fetch number health desde el backend
export function fetchNumberHealth() {
  const num = getOwnNumber();
  if (!num) {
    _numberHealth = null;
    _numberAuthorized = null;
    _notify();
    return;
  }
  window.postMessage({ type: 'BLAST_GET_NUMBER_HEALTH', own_number: num }, WA_ORIGIN);
}

// También verificar config (si existe = número registrado)
export function fetchNumberConfig() {
  const num = getOwnNumber();
  if (!num) return;
  window.postMessage({ type: 'BLAST_GET_NUMBER_CONFIG', own_number: num }, WA_ORIGIN);
}

// Listeners para respuestas
window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  if (e.data?.type === 'BLAST_NUMBER_HEALTH_READY') {
    if (e.data.ok) {
      _numberHealth = {
        sent_last_hour: e.data.sent_last_hour ?? 0,
        sent_today: e.data.sent_today ?? 0,
        daily_limit: e.data.daily_limit ?? 200,
        hourly_limit: e.data.hourly_limit ?? 50,
        can_send: e.data.can_send ?? true,
        risk_level: e.data.risk_level ?? 'low',
        age_days: e.data.age_days ?? 0,
        warm_up_limit: e.data.warm_up_limit ?? 200,
      };
    }
    _notify();
    return;
  }
  if (e.data?.type === 'BLAST_NUMBER_CONFIG_READY') {
    // Si config existe, el número está registrado en el sistema
    _numberAuthorized = e.data.config !== null;
    _notify();
    return;
  }
});

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
    // Remove read messages after 2 minutes
    if (e.lastAck >= 3 && now - e.ts > 120000) return false;
    // Remove ALL messages after 10 minutes regardless of ack (prevent memory leak)
    if (now - e.ts > 600000) return false;
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
  _notify(); // Actualizar sidebar inmediatamente con el nuevo KPI
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
  window.postMessage({ type: 'BLAST_GET_FORM_CONTACTS', limit: 1, offset: 0, status: 'nuevo', reqId, own_number: getOwnNumber() }, WA_ORIGIN);
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
    window.postMessage({ type: 'BLAST_GET_FORM_CONTACTS', limit, offset: 0, status: 'nuevo', reqId, own_number: getOwnNumber() }, WA_ORIGIN);
  });
}

function _markHablado(ids) {
  if (ids.length) window.postMessage({ type: 'BLAST_MARK_HABLADO', ids, own_number: getOwnNumber() }, WA_ORIGIN);
}

function _reportLog(results) {
  if (results.length) window.postMessage({ type: 'BLAST_REPORT_RESULTS', results }, WA_ORIGIN);
}

// ── Auto-exclusión por respuesta: si un contacto responde, sacarlo ───
// Escucha msgs entrantes. Si el número está en _sentThisSession, lo marca.
window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.type !== 'WSPP_INCOMING_MSG') return;
  const phone = (e.data.phone || '').replace(/\D/g, '');
  if (phone && _sentThisSession.has(phone)) {
    _respondedPhones.add(phone);
    console.log('[BLAST] Auto-exclusión: contacto respondió →', phone);
  }
});

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
const EMOJIS  = ['👋', '🙌', '✅', '😊', '🌟', '💬'];

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

// Convierte una palabra a Title Case: primera letra mayúscula, resto minúsculas.
// Respeta caracteres acentuados (á, é, ñ, etc.).
function _toTitleCase(word) {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

// Reemplaza variables {{nombre}}, {{saludo}}, {{brigadista}}, etc.
function _applyVars(text, c, seed) {
  const rawNombre = ((c.nombre || '') + ' ' + (c.apellidos || '')).trim().split(/\s+/)[0] || 'amigo';
  const nombre = _toTitleCase(rawNombre);
  // Brigadista: primer nombre del encuestador que recogió el dato
  const rawBrigadista = (c.encuestador || '').trim();
  const brigadista = _toTitleCase(rawBrigadista.split(/\s+/)[0] || 'un colaborador');
  const now = new Date();
  return text
    .replace(/\{\{nombre\}\}/gi, nombre)
    .replace(/\{\{brigadista\}\}/gi, brigadista)
    .replace(/\{\{departamento\}\}/gi, (c.departamento || c.distrito || '').trim() || 'tu zona')
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

// Normaliza a string de dígitos con prefijo 51 si son 9 dígitos peruanos
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

// ── Typing indicator: simula "escribiendo..." como un humano ──────────
// Delay proporcional al largo del texto: 30ms/char, min 800ms, max 4000ms
async function _simulateTyping(chat, text) {
  try {
    const csb = _req('WAWebChatStateBridge');
    if (csb.sendChatStateComposing) {
      await csb.sendChatStateComposing(chat.id);
      const typingMs = Math.max(800, Math.min(4000, text.length * 30));
      await _sleep(typingMs);
      if (csb.sendChatStatePaused) await csb.sendChatStatePaused(chat.id);
    }
  } catch (_) {
    // WAWebChatStateBridge no disponible — continuar sin typing
  }
}

// Returns the msg model so we can track ack later
// FIX 2026-03-17:
//   - MsgKey.newId() es async — await obligatorio para obtener el string ID
//   - MsgKey constructor no existe — usar MsgKey.from({fromMe, remote, id})
//   - p1 no es el msgModel — capturar el modelo vía MsgCollection.on('add') por ID
//   - unproxy(chat) necesario para que addAndSendMsgToChat funcione con @lid chats
async function _sendToChat(chat, text) {
  // Stealth: enviar "escribiendo..." antes del mensaje
  await _simulateTyping(chat, text);

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
  // Backbone usa .models (no ._models) — intentar ambos por seguridad
  if (!capturedModel) {
    const models = MsgCollection.models || MsgCollection._models || [];
    try {
      capturedModel = (Array.isArray(models) ? models : Array.from(models)).find(m =>
        m.get?.('id')?.id === idStr && m.get?.('id')?.fromMe
      ) || null;
    } catch (_) {
      capturedModel = null;
    }
  }

  // Último recurso: esperar 500ms y reintentar (el 'add' event puede ser async)
  if (!capturedModel) {
    await new Promise(r => setTimeout(r, 500));
    const models2 = MsgCollection.models || MsgCollection._models || [];
    try {
      capturedModel = (Array.isArray(models2) ? models2 : Array.from(models2)).find(m =>
        m.get?.('id')?.id === idStr && m.get?.('id')?.fromMe
      ) || null;
    } catch (_) {}
  }

  return capturedModel; // Backbone model con ack en tiempo real vía .on('change:ack')
}

// ── Stealth: Gaussian delay + micro-breaks ────────────────────────────
// Box-Muller transform: genera distribución gaussiana a partir de uniforme
function _gaussianRandom(mean, stddev) {
  let u, v, s;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  const mul = Math.sqrt(-2 * Math.log(s) / s);
  return mean + stddev * u * mul;
}

// Delay gaussiano: media = delaySec, stddev = 40%, clamp [5s, delaySec*3]
function _gaussianDelay(delaySec) {
  const raw = _gaussianRandom(delaySec, delaySec * 0.4);
  return Math.max(5, Math.min(delaySec * 3, Math.round(raw)));
}

// Micro-descanso: cada 3-7 msgs, pausa de 30-90s ("se distrajo, tomó agua")
let _msgsSinceBreak = 0;
let _nextBreakAt = 3 + Math.floor(Math.random() * 5); // 3-7

function _shouldMicroBreak() {
  _msgsSinceBreak++;
  if (_msgsSinceBreak >= _nextBreakAt) {
    _msgsSinceBreak = 0;
    _nextBreakAt = 3 + Math.floor(Math.random() * 5);
    return true;
  }
  return false;
}

function _microBreakDuration() {
  return 30 + Math.floor(Math.random() * 61); // 30-90 seconds
}

// ── Stealth: ventana horaria (hora Perú UTC-5) ───────────────────────
// Lun-Vie: 8:00-20:00 | Sáb: 9:00-14:00 | Dom: NO
function _getPeruTime() {
  const now = new Date();
  // UTC-5 (Perú no tiene daylight saving)
  const peruOffset = -5 * 60;
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + peruOffset * 60000);
}

function _isWithinBlastWindow() {
  const peru = _getPeruTime();
  const day = peru.getDay(); // 0=dom, 6=sáb
  const hour = peru.getHours();
  const minute = peru.getMinutes();
  const timeDecimal = hour + minute / 60;

  if (day === 0) return false;                    // Domingo: NO enviar
  if (day === 6) return timeDecimal >= 9 && timeDecimal < 14;  // Sábado: 9-14
  return timeDecimal >= 8 && timeDecimal < 20;     // Lun-Vie: 8-20
}

// Exportar para sidebar
export function isWithinBlastWindow() { return _isWithinBlastWindow(); }
export function getPeruTimeStr() {
  const p = _getPeruTime();
  return p.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
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
  if (_loopRunning) return; // previene segundo loop si resume llega antes de que el primero termine
  if (!tpls.length || !tpls[0].trim()) return;

  // Guard: número no detectado
  const activeNumber = getOwnNumber();
  if (!activeNumber) {
    _lastResults.unshift({ nombre: '❌ Sin número', telefono: '', status: 'blocked', ack: -1, error: 'No se detectó el número de este dispositivo. Recargá WhatsApp Web.' });
    _notify();
    return;
  }

  // Guard: número no autorizado (no es uno de los 6 de César)
  if (_numberAuthorized === false) {
    _lastResults.unshift({ nombre: '🚫 No autorizado', telefono: '+' + activeNumber, status: 'blocked', ack: -1, error: 'Este número no está registrado como celular de blast. Contactá al coordinador.' });
    _notify();
    return;
  }

  // Guard: number health — cooldown activo
  if (_numberHealth && !_numberHealth.can_send) {
    _lastResults.unshift({ nombre: '⚠️ Límite alcanzado', telefono: '+' + activeNumber, status: 'blocked', ack: -1, error: `Hoy: ${_numberHealth.sent_today}/${_numberHealth.daily_limit} msgs. Hora: ${_numberHealth.sent_last_hour}/${_numberHealth.hourly_limit}. Esperá.` });
    _notify();
    return;
  }

  // Stealth: no enviar fuera de ventana horaria (Perú UTC-5)
  if (!_isWithinBlastWindow()) {
    _lastResults.unshift({ nombre: '🕐 Fuera de horario', telefono: '', status: 'blocked', ack: -1, error: 'Horario no permitido (' + getPeruTimeStr() + '). Lun-Vie 8-20h, Sáb 9-14h, Dom no.' });
    _notify();
    return;
  }

  _running = true; _paused = false; _consecFails = 0; _loopRunning = true;
  _msgsSinceBreak = 0; // reset micro-break counter
  _notify();

  while (_running && !_paused) {
    // Re-check number health from server between batches
    fetchNumberHealth();

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
      const lockKey = (normalizedPhone || '') + ':' + (c.id || '');
      if (
        (normalizedPhone && _sentThisSession.has(normalizedPhone)) ||
        (c.id && _sentIds.has(c.id)) ||
        (lockKey && _inFlight.has(lockKey))
      ) {
        console.log('[BLAST] Dedup local — ya enviado/en vuelo:', normalizedPhone || c.id);
        continue;
      }

      // ── Auto-exclusión: si el contacto ya respondió, no enviar más ──
      if (normalizedPhone && _respondedPhones.has(normalizedPhone)) {
        console.log('[BLAST] Auto-exclusión — contacto respondió:', normalizedPhone);
        continue;
      }

      // Registrar en dedup ANTES del envío — no después
      // Así, si el send falla a mitad, el contacto no vuelve a aparecer en este batch
      if (normalizedPhone) { _sentThisSession.add(normalizedPhone); _persistDedup(normalizedPhone); }
      if (c.id) { _sentIds.add(c.id); _persistDedup(c.id); }
      if (lockKey) _inFlight.add(lockKey);

      if (!jid) {
        status = 'failed'; error = 'Tel inválido';
        _kpis.failed++;
        _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: 'failed', ack: -1, error });
        if (_lastResults.length > 30) _lastResults.length = 30;
        logBatch.push({ phone: c.telefono, contact_name: cName, message: text, status, error, own_number: activeNumber });
        _notify();
        continue;
      }

      // Spam check — muestra razones concretas de por qué es spam
      const sc = await _spamCheck();
      _lastSpamResult = sc;
      if (sc.shouldPause) {
        _running = false; _stopCountdown();
        const reasons = sc.warnings.length
          ? sc.warnings.slice(0, 3).join(' · ')
          : 'Patrón de envío detectado como spam';
        const whatToDo = sc.actions.length
          ? '\n→ ' + sc.actions.slice(0, 2).join('\n→ ')
          : '';
        _lastResults.unshift({
          nombre: sc.riskLevel === 'critical' ? '🚨 RIESGO CRÍTICO' : '⚠️ RIESGO ALTO',
          telefono: '', status: 'failed', ack: -1,
          error: `Score: ${sc.score}/100 | ${reasons}${whatToDo}`
        });
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
          // Marcar hablado — dedup ya se agregó arriba antes de este bloque
          if (c.id) _markHablado([c.id]);
          if (lockKey) _inFlight.delete(lockKey);
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
        if (lockKey) _inFlight.delete(lockKey);
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
          if (p > 0) {
            const partDelay = 1000 + Math.random() * 3000 + p * 500;
            await _sleep(partDelay);
          }

          const partModel = await _sendToChat(chat, partText);
          if (p === 0) {
            msgModel = partModel;
            if (partModel) {
              _trackMessage(partModel, cName, c.telefono);
            } else {
              // Fallback: contar como pending aunque no tengamos el modelo
              // Esto mantiene los KPIs visibles incluso si la captura del modelo falla
              _kpis.pending++;
            }
          }
        }

        batchSent++;

        // Stealth: re-check warm-up limits every 10 messages
        if (batchSent > 0 && batchSent % 10 === 0 && _numberHealth) {
          // Update local counters (sent_today and sent_last_hour)
          _numberHealth.sent_today += 10;
          _numberHealth.sent_last_hour += 10;
          if (_numberHealth.sent_today >= _numberHealth.daily_limit || _numberHealth.sent_last_hour >= _numberHealth.hourly_limit) {
            _running = false; _stopCountdown();
            _lastResults.unshift({ nombre: '⚠️ Límite alcanzado', telefono: '', status: 'paused', ack: -1,
              error: `Hoy: ${_numberHealth.sent_today}/${_numberHealth.daily_limit} | Hora: ${_numberHealth.sent_last_hour}/${_numberHealth.hourly_limit}. Pausa automática.` });
            _notify(); break;
          }
        }

        _tplIndex++;
        _consecFails = 0;

        // Marcar hablado en el servidor
        if (c.id) _markHablado([c.id]);

        _lastResults.unshift({
          nombre: cName, telefono: c.telefono, status: 'sent',
          ack: msgModel?.get?.('ack') ?? 0, error: null,
          parts: parts.length,
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
      } finally {
        // Liberar el lock de vuelo — el contacto ya está en _sentThisSession/_sentIds
        // así que aunque se libere el inFlight, el dedup principal lo sigue bloqueando
        if (lockKey) _inFlight.delete(lockKey);
      }

      if (_lastResults.length > 30) _lastResults.length = 30;
      logBatch.push({ phone: c.telefono, contact_name: cName, message: text, status, error, own_number: activeNumber });
      _notify();
      if (logBatch.length >= 10) { _reportLog([...logBatch]); logBatch.length = 0; }

      // Delays — gaussiano + micro-descansos stealth
      if (_running && !_paused && i < batch.length - 1) {
        // Check ventana horaria — pausar si se salió del horario permitido
        if (!_isWithinBlastWindow()) {
          _paused = true; _running = false; _stopCountdown();
          _lastResults.unshift({ nombre: '🕐 Fuera de horario', telefono: '', status: 'paused', ack: -1, error: 'Pausa por ventana horaria (' + getPeruTimeStr() + ')' });
          _notify(); break;
        }

        if (batchSent > 0 && batchSent % 25 === 0 && cfg.descansoSec > 0) {
          // Descanso largo cada 25 — gaussiano alrededor del config
          const descanso = _gaussianDelay(cfg.descansoSec);
          _startCountdown(descanso, 'descanso'); _notify();
          await _sleep(descanso * 1000); _stopCountdown();
        } else if (batchSent > 0 && cfg.pausaCada > 0 && batchSent % cfg.pausaCada === 0 && cfg.pausaSec > 0) {
          _startCountdown(cfg.pausaSec, 'pausa'); _notify();
          await _sleep(cfg.pausaSec * 1000); _stopCountdown();
        } else if (_shouldMicroBreak()) {
          // Micro-descanso: simula que el humano se distrajo
          const breakSec = _microBreakDuration();
          _startCountdown(breakSec, 'micro'); _notify();
          await _sleep(breakSec * 1000); _stopCountdown();
        } else if (cfg.delaySec > 0) {
          // Delay gaussiano entre contactos (reemplaza el uniforme ±30%)
          const actual = _gaussianDelay(cfg.delaySec);
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

  _running = false; _loopRunning = false; _stopCountdown(); _notify();
}

export function pauseBlast() {
  _paused = true; _running = false; _stopCountdown(); _notify();
  // _loopRunning se limpia cuando el loop llega al break/fin de iteración
}

export function resumeBlast() {
  if (_loopRunning) return; // el loop anterior todavía termina — ignorar
  _paused = false;
  startBlast();
}

export function resetSession() {
  _sentThisSession.clear();
  _sentIds.clear();
  _inFlight.clear();
  window.postMessage({ type: 'BLAST_DEDUP_CLEAR' }, WA_ORIGIN);
  _respondedPhones.clear();
  _loopRunning = false;
  _tplIndex = 0;
  _kpis = { pending: 0, sent: 0, delivered: 0, read: 0, failed: 0, no_wa: 0 };
  _lastResults = []; _trackedMsgs = []; _totalPending = null;
  _running = false; _paused = false; _stopCountdown(); _stopAckTracking(); _notify();
}


