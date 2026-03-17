// wa-validator-panel.js — WA phone number validator for Goberna
//
// MODO SILENCIOSO: verifica existencia vía WAWebUsync (USyncQuery batch, sin abrir chat, sin mensaje)
//   API interna verificada 2026-03-17: contact.type 'in' = existe, 'out'/'invalid' = no tiene WA
//   Velocidad: batch de hasta 20 números por request → ~900 checks/hora por dispositivo
//   6 celulares × ~900 checks/hora = 5,400/hora
//
// MODO CONVERSACIÓN: abre chat, envía mensaje personalizado, marca wa_valid=true al enviar
//   Velocidad: 15-45s por mensaje (anti-baneo real)
//   Doble propósito: valida número + inicia conversación para CRM
//
// Resultado en DB:
//   wa_valid = true  → tiene WA → disponible para blast
//   wa_valid = false → no tiene WA → descartado
//   Reporte por brigadista: quién subió números malos

import { WA_ORIGIN, getOwnNumber } from './bootstrap.js';

// ── Constantes modo silencioso ────────────────────────────────────────
const SILENT_DELAY_MIN = 2000;
const SILENT_DELAY_MAX = 4000;
const SESSION_MAX_SILENT = 500;

// ── Constantes modo conversación (anti-baneo) ─────────────────────────
// Delays largos + variación = patrón humano
const CONV_DELAY_MIN  = 15_000;  // 15s mínimo
const CONV_DELAY_MAX  = 45_000;  // 45s máximo
const CONV_BURST_MAX  = 8;       // máx mensajes antes de descanso
const CONV_BURST_REST = 120_000; // 2 min de descanso después de cada burst
const SESSION_MAX_CONV = 100;    // máx msgs por sesión

// Mensajes de apertura personalizados (se elige uno al azar + nombre)
// Variedad = menor detección de spam
const CONV_TEMPLATES = [
  (nombre) => `Hola ${nombre} 👋`,
  (nombre) => `Buenos días ${nombre} 🌟`,
  (nombre) => `Hola ${nombre}, ¿cómo estás?`,
  (nombre) => `Buenas ${nombre} 👋`,
  (nombre) => `Hola ${nombre}! 😊`,
];

function _randomTemplate(nombre) {
  const fn = CONV_TEMPLATES[Math.floor(Math.random() * CONV_TEMPLATES.length)];
  return fn(nombre || 'estimado/a');
}

// ── Modo activo ───────────────────────────────────────────────────────
let _mode = 'silent'; // 'silent' | 'conv'

// ── State ─────────────────────────────────────────────────────────────
let _open           = false;
let _contacts       = [];
let _total          = 0;
let _running        = false;
let _paused         = false;
let _idx            = 0;
let _sessionCount   = 0;
let _burstCount     = 0;
let _results        = [];  // { id, nombre, telefono, encuestador, wa_valid }
let _countdown      = 0;
let _countdownTimer = null;
let _activeNumber   = null;
let _startTime      = null;

// ── WA module resolver ────────────────────────────────────────────────
function _req(...names) {
  for (const n of names) {
    try { const m = window.require(n); if (m) return m; } catch (_) {}
  }
  return null;
}

// ── USyncQuery batch validation cache ────────────────────────────────
// Evita re-validar el mismo número en la misma sesión
const _usyncCache = new Map(); // normalized_phone → { exists, ts }
const USYNC_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

// ── MODO SILENCIOSO BATCH: verifica hasta 20 números de una vez ────────
// Usa WAWebUsync / USyncQuery — verificado en producción el 2026-03-17.
// Resultado: contact.type
//   'in'      → registrado en WhatsApp ✅
//   'out'     → número válido pero NO en WhatsApp ❌
//   'invalid' → número inválido ❌
//
// Fallback: si USyncQuery no está disponible, intenta WAWebWidFactory
// como check de si el chat ya existe en el store local.
async function _checkPhonesSilentBatch(phones) {
  // phones = array de strings de dígitos ya normalizados (ej: '51999999999')
  const results = {}; // phone → { exists, reason }
  const toQuery = [];

  // 1. Servir desde cache los que ya tenemos frescos
  const now = Date.now();
  for (const phone of phones) {
    const cached = _usyncCache.get(phone);
    if (cached && (now - cached.ts) < USYNC_CACHE_TTL_MS) {
      results[phone] = { exists: cached.exists, reason: 'cache' };
    } else {
      toQuery.push(phone);
    }
  }

  if (!toQuery.length) return results;

  // 2. Intentar WAWebUsync (API interna — más confiable y silenciosa)
  let usyncOk = false;
  try {
    const { USyncQuery } = window.require('WAWebUsync');
    const { USyncUser }  = window.require('WAWebUsyncUser');

    if (USyncQuery && USyncUser) {
      const query = new USyncQuery()
        .withContext('interactive')
        .withContactProtocol();

      for (const phone of toQuery) {
        query.withUser(new USyncUser().withPhone(phone));
      }

      const response = await query.execute();
      const list = response?.list || [];

      // list[i] matches toQuery[i] por orden (la API respeta el orden del request)
      // Pero para seguridad también matcheamos por content
      const byPhone = {};
      for (const item of list) {
        const phone = item?.contact?.content;
        const type  = item?.contact?.type;   // 'in' | 'out' | 'invalid'
        if (phone) byPhone[phone] = type;
      }

      for (const phone of toQuery) {
        const type = byPhone[phone];
        const exists = type === 'in';
        const reason = type || 'no_response';
        results[phone] = { exists, reason };
        _usyncCache.set(phone, { exists, ts: now });
      }
      usyncOk = true;
    }
  } catch (_) {}

  // 3. Fallback: WAWebCollections store local (solo sabe de chats ya abiertos)
  if (!usyncOk) {
    for (const phone of toQuery) {
      if (results[phone]) continue; // ya resuelto
      try {
        const wf   = _req('WAWebWidFactory');
        const coll = _req('WAWebCollections');
        if (wf && coll) {
          const wid  = wf.createWid(phone + '@c.us');
          const chat = coll.Chat?.get(wid);
          if (chat) {
            results[phone] = { exists: true, reason: 'in_store' };
            _usyncCache.set(phone, { exists: true, ts: now });
            continue;
          }
        }
      } catch (_) {}
      // Si el fallback también falla: marcamos como desconocido (no como inválido)
      results[phone] = { exists: false, reason: 'usync_unavailable' };
    }
  }

  return results;
}

// ── MODO SILENCIOSO: wrapper single-phone (mantiene API de _run) ───────
async function _checkPhoneSilent(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (!digits || digits.length < 9) return { exists: false, reason: 'invalid_phone' };
  const normalized = digits.length === 9 ? '51' + digits : digits;
  const results = await _checkPhonesSilentBatch([normalized]);
  return results[normalized] || { exists: false, reason: 'unresolved' };
}

// ── Spam check bridge (same pattern as blast-panel) ───────────────────
async function _spamCheckBeforeSend() {
  return new Promise((resolve) => {
    window.postMessage({ type: 'WSPP_SPAM_CHECK_NOW', own_number: getOwnNumber() }, WA_ORIGIN);
    const onResult = (e) => {
      if (e.source !== window) return;
      if (e.data?.type !== 'WSPP_SPAM_CHECK_RESULT') return;
      window.removeEventListener('message', onResult);
      const r = e.data.result;
      resolve({ shouldPause: r?.risk_level === 'critical', cooldown_sec: r?.cooldown_sec || 0, result: r });
    };
    window.addEventListener('message', onResult);
    setTimeout(() => {
      window.removeEventListener('message', onResult);
      resolve({ shouldPause: false, cooldown_sec: 0, result: null });
    }, 500);
  });
}

// Record outgoing for spam detector (conv mode only — silent mode doesn't send msgs)
function _recordOutgoingBridge(text, phone) {
  window.postMessage({
    type: 'WSPP_VALIDATOR_CONV_SENT',
    payload: { text, phone, own_number: getOwnNumber(), timestamp: Math.floor(Date.now() / 1000) },
  }, WA_ORIGIN);
}

// ── MODO CONVERSACIÓN: abrir chat + enviar mensaje ────────────────────
// Si el mensaje se envía = número válido.
// Si falla (número no existe en WA) = inválido.
// Usa openChatByPhone del inject.js (via postMessage WSPP_OPEN_CHAT).
async function _sendConvMessage(phone, nombre) {
  return new Promise((resolve) => {
    const digits = String(phone).replace(/\D/g, '');
    if (!digits || digits.length < 9) {
      resolve({ sent: false, reason: 'invalid_phone' });
      return;
    }

    const timeout = setTimeout(() => {
      window.removeEventListener('message', onResult);
      resolve({ sent: false, reason: 'timeout_open' });
    }, 12000);

    // 1. Pedir al inject.js que abra el chat
    const onResult = (e) => {
      if (e.source !== window) return;
      if (e.data?.type !== 'WSPP_OPEN_CHAT_RESULT') return;
      if (e.data.phone !== digits) return;
      window.removeEventListener('message', onResult);
      clearTimeout(timeout);

      if (!e.data.ok) {
        resolve({ sent: false, reason: e.data.error || 'open_failed' });
        return;
      }

      // 2. Chat abierto → esperar 800ms para que el composer esté listo
      setTimeout(() => {
        const sent = _typeAndSend(_randomTemplate(nombre));
        resolve({ sent, reason: sent ? 'ok' : 'compose_failed' });
      }, 800);
    };

    window.addEventListener('message', onResult);
    window.postMessage({ type: 'WSPP_OPEN_CHAT', phone: digits }, WA_ORIGIN);
  });
}

// Escribe en el composer activo y envía (simula Enter)
function _typeAndSend(text) {
  try {
    const composer = document.querySelector(
      '[data-testid="conversation-compose-box-input"], ' +
      'div[role="textbox"][contenteditable="true"]:not([aria-label*="búsqueda"]):not([aria-label*="search"])'
    );
    if (!composer) return false;

    // Insertar texto via execCommand (más natural que innerHTML)
    composer.focus();
    document.execCommand('insertText', false, text);

    // Pequeña pausa (simula typing) → Enter
    setTimeout(() => {
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13,
        bubbles: true, cancelable: true,
      });
      composer.dispatchEvent(enterEvent);
    }, 200 + Math.random() * 300);

    return true;
  } catch (_) {
    return false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────
const _sleep = ms => new Promise(r => setTimeout(r, ms));

function _randomDelay() {
  if (_mode === 'conv') {
    return CONV_DELAY_MIN + Math.random() * (CONV_DELAY_MAX - CONV_DELAY_MIN);
  }
  return SILENT_DELAY_MIN + Math.random() * (SILENT_DELAY_MAX - SILENT_DELAY_MIN);
}

function _startCountdown(ms) {
  _countdown = Math.ceil(ms / 1000);
  clearInterval(_countdownTimer);
  _countdownTimer = setInterval(() => {
    _countdown = Math.max(0, _countdown - 1);
    const el = document.getElementById('wspp-val-countdown');
    if (el) el.textContent = _countdown > 0 ? `Próximo en ${_countdown}s` : 'Verificando...';
  }, 1000);
}
function _stopCountdown() { clearInterval(_countdownTimer); _countdown = 0; }

function _toast(text, color = '#25d366', ms = 4000) {
  const t = document.createElement('div');
  Object.assign(t.style, {
    position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
    background: color, color: '#fff', padding: '10px 20px', borderRadius: '8px',
    fontSize: '13px', fontWeight: '600', zIndex: '2147483647',
    boxShadow: '0 4px 20px rgba(0,0,0,.35)', maxWidth: '360px', textAlign: 'center', lineHeight: '1.4',
  });
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

function _saveResults(results) {
  if (!results.length) return;
  window.postMessage({
    type: 'WA_VALIDATOR_SAVE_RESULTS',
    results: results.map(r => ({ id: r.id, wa_valid: r.wa_valid, mode: r.mode || 'silent' })),
    own_number: _activeNumber,
  }, WA_ORIGIN);
}

// ── Tamaño de batch para USyncQuery (máx recomendado: 20) ────────────
const USYNC_BATCH_SIZE = 20;

// ── Motor principal ───────────────────────────────────────────────────
async function _run() {
  if (_running || _paused) return;
  if (!_contacts.length) { _toast('Carga los contactos primero', '#ef5350'); return; }

  _running = true; _paused = false;
  const batch = [];
  _render();

  const sessionMax = _mode === 'conv' ? SESSION_MAX_CONV : SESSION_MAX_SILENT;

  while (_idx < _contacts.length && _running && !_paused) {

    // Límite de sesión
    if (_sessionCount >= sessionMax) {
      _paused = _running = false; _stopCountdown();
      if (batch.length) { _saveResults([...batch]); batch.length = 0; }
      const msg = _mode === 'conv'
        ? `${sessionMax} mensajes enviados. Descansá 10 min antes de reanudar.`
        : `${sessionMax} verificados. Descansá 5 min y reanudá.`;
      _toast(msg, '#ff9f0a', 10000);
      _render(); break;
    }

    // ── MODO SILENCIOSO: batch de hasta USYNC_BATCH_SIZE números ──────
    // USyncQuery puede verificar N números en una sola llamada → mucho más rápido
    if (_mode === 'silent') {
      const remaining = Math.min(
        USYNC_BATCH_SIZE,
        sessionMax - _sessionCount,
        _contacts.length - _idx
      );
      const slice = _contacts.slice(_idx, _idx + remaining);

      // Normalizar teléfonos
      const normalized = slice.map(c => {
        const d = String(c.telefono).replace(/\D/g, '');
        return d.length === 9 ? '51' + d : d;
      });

      _phase = `Verificando batch ${_idx + 1}–${_idx + slice.length}`;
      _render();

      let batchResults = {};
      try {
        batchResults = await _checkPhonesSilentBatch(normalized);
      } catch (_) {}

      for (let i = 0; i < slice.length; i++) {
        if (!_running || _paused) break;
        const c      = slice[i];
        const norm   = normalized[i];
        const r      = batchResults[norm] || { exists: false, reason: 'error' };
        const result = { ...c, wa_valid: r.exists, mode: 'silent' };
        batch.push(result);
        _results.push(result);
        _sessionCount++;
      }
      _idx += slice.length;
      _render();

      if (batch.length >= 20) {
        _saveResults([...batch]);
        batch.length = 0;
      }

      // Delay corto entre batches para no saturar la API interna
      if (_running && !_paused && _idx < _contacts.length) {
        const d = SILENT_DELAY_MIN + Math.random() * (SILENT_DELAY_MAX - SILENT_DELAY_MIN);
        _startCountdown(d); _render();
        await _sleep(d); _stopCountdown();
      }
      continue;
    }

    // ── MODO CONVERSACIÓN: uno por uno con delays anti-baneo ──────────
    // Descanso de burst
    if (_burstCount >= CONV_BURST_MAX) {
      _burstCount = 0;
      if (batch.length) { _saveResults([...batch]); batch.length = 0; }
      _toast(`Pausa de 2 min para evitar detección (${_sessionCount} msgs enviados)`, '#ff9f0a', CONV_BURST_REST);
      _startCountdown(CONV_BURST_REST);
      _render();
      await _sleep(CONV_BURST_REST);
      _stopCountdown();
      if (!_running || _paused) break;
    }

    const c = _contacts[_idx];

    // Spam check BEFORE sending
    const spamCheck = await _spamCheckBeforeSend();
    if (spamCheck.shouldPause) {
      _paused = _running = false;
      _stopCountdown();
      if (batch.length) { _saveResults([...batch]); batch.length = 0; }
      const coolMin = Math.ceil((spamCheck.cooldown_sec || 180) / 60);
      _toast(
        `🚨 RIESGO CRÍTICO — Validador pausado.\nEsperá ${coolMin} min antes de reanudar.`,
        '#dc2626', 15000
      );
      _render(); break;
    }

    const r = await _sendConvMessage(c.telefono, c.nombre);
    if (r.sent) {
      const tpl = _randomTemplate(c.nombre);
      _recordOutgoingBridge(tpl, c.telefono);
    } else {
      console.log('[WA VALIDATOR CONV] failed for', c.telefono, ':', r.reason);
    }
    _burstCount++;

    const result = { ...c, wa_valid: r.sent, mode: 'conv' };
    batch.push(result);
    _results.push(result);
    _sessionCount++;
    _idx++;
    _render();

    if (batch.length >= 20) {
      _saveResults([...batch]);
      batch.length = 0;
    }

    if (_running && !_paused && _idx < _contacts.length) {
      const d = _randomDelay();
      _startCountdown(d); _render();
      await _sleep(d); _stopCountdown();
    }
  }

  if (batch.length) { _saveResults([...batch]); batch.length = 0; }

  if (!_paused && _idx >= _contacts.length) {
    _running = false; _stopCountdown();
    const valid   = _results.filter(r => r.wa_valid).length;
    const invalid = _results.filter(r => !r.wa_valid).length;
    const modeLabel = _mode === 'conv' ? 'mensajes enviados' : 'verificados sin mensajes';
    _toast(`✅ Completado — ${valid} con WA · ${invalid} sin WA · ${modeLabel}`, '#25d366', 6000);
  }
  _running = false; _render();
}

// ── UI ────────────────────────────────────────────────────────────────
function _render() {
  const el = document.getElementById('wspp-val-panel');
  if (!_open) { if (el) el.remove(); return; }

  _activeNumber = getOwnNumber();
  const valid   = _results.filter(r => r.wa_valid === true).length;
  const invalid = _results.filter(r => r.wa_valid === false).length;
  const pending = _contacts.length - _idx;
  const pct     = _contacts.length ? Math.round((_idx / _contacts.length) * 100) : 0;
  const isSilent = _mode === 'silent';
  const isConv   = _mode === 'conv';

  const speedLabel = _sessionCount > 0 && _startTime
    ? `${Math.round(_sessionCount / ((Date.now() - _startTime) / 3600000))}/h`
    : '—';

  const modeColor = isSilent ? '#60a5fa' : '#a78bfa';
  const modeLabel = isSilent ? 'Silencioso' : 'Conversación';
  const modeDesc  = isSilent
    ? 'Verifica sin abrir chats ni enviar mensajes'
    : 'Abre chat + envía saludo · anti-baneo activo';

  const html = `
    <div id="wspp-val-panel" style="
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      width:480px;max-height:92vh;overflow-y:auto;
      background:#0a0f1e;border:1px solid rgba(96,165,250,.2);border-radius:16px;
      box-shadow:0 24px 64px rgba(0,0,0,.8);z-index:2147483645;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fff;
    ">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,.06);">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:34px;height:34px;border-radius:9px;background:rgba(96,165,250,.1);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#60a5fa"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div>
            <div style="font-size:14px;font-weight:700;">Validador WA · Goberna</div>
            <div style="font-size:10px;color:rgba(255,255,255,.5);">Limpieza de base · Métrica de brigadistas</div>
          </div>
        </div>
        <button id="wspp-val-close" style="background:none;border:none;color:rgba(255,255,255,.5);font-size:18px;cursor:pointer;padding:4px 8px;line-height:1;">✕</button>
      </div>

      <!-- Selector de modo -->
      <div style="margin:12px 16px 0;display:flex;gap:6px;">
        <button id="wspp-mode-silent" style="
          flex:1;padding:9px 12px;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;
          background:${isSilent ? 'rgba(96,165,250,.15)' : 'rgba(255,255,255,.03)'};
          border:1px solid ${isSilent ? 'rgba(96,165,250,.4)' : 'rgba(255,255,255,.07)'};
          color:${isSilent ? '#60a5fa' : 'rgba(255,255,255,.35)'};
          transition:all .15s;
          ${_running ? 'opacity:0.4;pointer-events:none;' : ''}
        ">
          🔍 Silencioso<br>
          <span style="font-size:10px;font-weight:400;opacity:.7;">2-4s por número</span>
        </button>
        <button id="wspp-mode-conv" style="
          flex:1;padding:9px 12px;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;
          background:${isConv ? 'rgba(167,139,250,.15)' : 'rgba(255,255,255,.03)'};
          border:1px solid ${isConv ? 'rgba(167,139,250,.4)' : 'rgba(255,255,255,.07)'};
          color:${isConv ? '#a78bfa' : 'rgba(255,255,255,.35)'};
          transition:all .15s;
          ${_running ? 'opacity:0.4;pointer-events:none;' : ''}
        ">
          💬 Conversación<br>
          <span style="font-size:10px;font-weight:400;opacity:.7;">15-45s · anti-baneo</span>
        </button>
      </div>

      <!-- Modo activo info -->
      <div style="margin:8px 16px 0;padding:7px 12px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:8px;font-size:11px;color:rgba(255,255,255,.4);">
        <span style="color:${modeColor};font-weight:700;">${modeLabel}</span>
        · ${modeDesc}
        ${isConv ? `<br><span style="color:rgba(255,149,0,.6);">⚠️ Usa delays de 15-45s y pausa cada ${CONV_BURST_MAX} msgs — cumple best practices</span>` : ''}
      </div>

      <!-- Número activo -->
      <div style="margin:8px 16px 0;padding:7px 12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:8px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:11px;color:rgba(255,255,255,.4);">Número activo</span>
        <span style="font-size:13px;font-weight:700;color:${_activeNumber ? '#60a5fa' : '#ff9f0a'};">
          ${_activeNumber ? '+' + _activeNumber : '⏳ detectando...'}
        </span>
      </div>

      <!-- Stats -->
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.05);">
        ${[
          ['Total',     _total,       '#60a5fa'],
          ['✅ Con WA', valid,         '#34c759'],
          ['❌ Sin WA', invalid,       '#ef5350'],
          ['Pendientes',pending,       '#ff9f0a'],
          ['Vel.',      speedLabel,    '#a78bfa'],
        ].map(([l,v,c]) => `
          <div style="text-align:center;padding:5px 2px;background:rgba(255,255,255,.03);border-radius:7px;">
            <div style="font-size:15px;font-weight:800;color:${c};">${v}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.55);text-transform:uppercase;margin-top:1px;">${l}</div>
          </div>
        `).join('')}
      </div>

      <!-- Progreso -->
      ${_contacts.length ? `
      <div style="padding:10px 16px 5px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:rgba(255,255,255,.5);margin-bottom:4px;">
          <span>${_idx} / ${_contacts.length} procesados</span>
          <span id="wspp-val-countdown" style="color:${_running?modeColor:'rgba(255,255,255,.5)'};">
            ${_running && _countdown > 0 ? `Próximo en ${_countdown}s` : _running ? 'Procesando...' : ''}
          </span>
          <span>${pct}%</span>
        </div>
        <div style="background:rgba(255,255,255,.06);border-radius:4px;height:5px;overflow:hidden;">
          <div style="background:linear-gradient(90deg,${modeColor},${isSilent ? '#a78bfa' : '#60a5fa'});width:${pct}%;height:100%;border-radius:4px;transition:width .4s;"></div>
        </div>
      </div>` : ''}

      <!-- Controles -->
      <div style="padding:10px 16px 14px;display:flex;gap:8px;flex-wrap:wrap;">
        ${!_contacts.length ? `
          <button id="wspp-val-load" style="flex:1;padding:11px 16px;background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.2);border-radius:9px;color:#60a5fa;font-size:13px;font-weight:700;cursor:pointer;">
            📋 Cargar ${_total || '...'} números
          </button>
        ` : !_running && !_paused ? `
          <button id="wspp-val-start" style="flex:1;padding:11px 16px;background:${modeColor};border:none;border-radius:9px;color:#0a0f1e;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 4px 20px ${modeColor}33;">
            ▶ ${isConv ? 'Iniciar conversaciones' : 'Verificar'} (${_contacts.length - _idx})
          </button>
          <button id="wspp-val-reload" title="Recargar" style="padding:11px 14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:9px;color:rgba(255,255,255,.4);font-size:14px;cursor:pointer;">↺</button>
        ` : _running ? `
          <div style="flex:1;padding:9px 12px;background:rgba(96,165,250,.05);border:1px solid rgba(96,165,250,.1);border-radius:9px;font-size:12px;color:rgba(255,255,255,.55);line-height:1.5;">
            ${isConv
              ? `💬 Enviando · ${_sessionCount} msgs · burst ${_burstCount}/${CONV_BURST_MAX}`
              : `🔵 Verificando · ${_sessionCount} en esta sesión`}
          </div>
          <button id="wspp-val-pause" style="padding:11px 16px;background:rgba(255,149,0,.1);border:1px solid rgba(255,149,0,.2);border-radius:9px;color:#ff9f0a;font-size:13px;font-weight:700;cursor:pointer;">⏸ Pausar</button>
        ` : _paused && _idx < _contacts.length ? `
          <div style="width:100%;padding:9px 12px;background:rgba(255,149,0,.06);border:1px solid rgba(255,149,0,.14);border-radius:9px;font-size:12px;color:#ff9f0a;line-height:1.5;">
            ⏸ Pausado en ${_idx}/${_contacts.length}. Listo para reanudar.
          </div>
          <button id="wspp-val-resume" style="flex:1;padding:11px 16px;background:${modeColor};border:none;border-radius:9px;color:#0a0f1e;font-size:13px;font-weight:800;cursor:pointer;">▶ Reanudar</button>
        ` : `
          <div style="width:100%;padding:9px;background:rgba(52,199,89,.06);border:1px solid rgba(52,199,89,.14);border-radius:9px;font-size:12px;color:#34c759;text-align:center;font-weight:600;">
            ✅ Completado — ${valid} con WA · ${invalid} sin WA
          </div>
          <button id="wspp-val-stats" style="flex:1;padding:11px 16px;background:rgba(167,139,250,.1);border:1px solid rgba(167,139,250,.2);border-radius:9px;color:#a78bfa;font-size:13px;font-weight:700;cursor:pointer;">📊 Reporte brigadistas</button>
        `}
      </div>

      <!-- Últimos resultados -->
      ${_results.length ? `
      <div style="padding:0 16px 16px;">
        <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.55);text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;">Últimos procesados</div>
        <div style="max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:3px;">
          ${_results.slice(-12).reverse().map(r => `
            <div style="display:flex;align-items:center;gap:7px;padding:5px 9px;background:rgba(255,255,255,.02);border-radius:6px;border:1px solid rgba(255,255,255,.04);">
              <span style="font-size:13px;flex-shrink:0;">${r.wa_valid ? '✅' : '❌'}</span>
              <span style="font-size:12px;color:${r.wa_valid?'rgba(255,255,255,.6)':'rgba(255,255,255,.5)'};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${r.nombre || '?'} · +${r.telefono}
              </span>
              <span style="font-size:10px;color:rgba(255,255,255,.15);flex-shrink:0;">
                ${r.mode === 'conv' ? '💬' : '🔍'} ${(r.encuestador || '').slice(0, 14)}
              </span>
            </div>
          `).join('')}
        </div>
      </div>` : ''}
    </div>
  `;

  if (el) el.outerHTML = html;
  else document.body.insertAdjacentHTML('beforeend', html);

  // ── Event listeners ──────────────────────────────────────────────────
  document.getElementById('wspp-val-close')?.addEventListener('click', () => {
    _open = false;
    if (_running) { _running = false; _paused = true; _stopCountdown(); }
    _render();
  });

  document.getElementById('wspp-mode-silent')?.addEventListener('click', () => {
    if (_running) return;
    _mode = 'silent'; _render();
  });
  document.getElementById('wspp-mode-conv')?.addEventListener('click', () => {
    if (_running) return;
    _mode = 'conv'; _render();
  });

  document.getElementById('wspp-val-load')?.addEventListener('click', _load);
  document.getElementById('wspp-val-reload')?.addEventListener('click', () => {
    _contacts = []; _results = []; _idx = 0; _sessionCount = 0; _burstCount = 0;
    _running = false; _paused = false;
    _load();
  });
  document.getElementById('wspp-val-start')?.addEventListener('click', () => {
    _startTime = Date.now();
    _burstCount = 0;
    _run();
  });
  document.getElementById('wspp-val-pause')?.addEventListener('click', () => {
    _paused = true; _running = false; _stopCountdown(); _render();
  });
  document.getElementById('wspp-val-resume')?.addEventListener('click', () => {
    _sessionCount = 0; _burstCount = 0; _paused = false; _run();
  });
  document.getElementById('wspp-val-stats')?.addEventListener('click', () => {
    window.postMessage({ type: 'WA_VALIDATOR_GET_STATS_REQ' }, WA_ORIGIN);
  });
}

// ── Load contacts ─────────────────────────────────────────────────────
function _load() {
  _activeNumber = getOwnNumber();
  const btn = document.getElementById('wspp-val-load') || document.getElementById('wspp-val-reload');
  if (btn) { btn.textContent = '⏳ Cargando...'; btn.disabled = true; }
  window.postMessage({ type: 'WA_VALIDATOR_GET_CONTACTS', limit: 500, offset: _idx }, WA_ORIGIN);
}

// ── Stats panel ───────────────────────────────────────────────────────
function _showStats(summary, byBrigadista) {
  const existing = document.getElementById('wspp-val-stats-panel');
  if (existing) { existing.remove(); return; }

  const topBad = (byBrigadista || [])
    .filter(b => b.invalid > 0)
    .sort((a, b) => (b.invalid_rate_pct || 0) - (a.invalid_rate_pct || 0))
    .slice(0, 15);

  const html = `
    <div id="wspp-val-stats-panel" style="
      position:fixed;top:50%;right:20px;transform:translateY(-50%);
      width:400px;max-height:82vh;overflow-y:auto;
      background:#0a0f1e;border:1px solid rgba(167,139,250,.2);border-radius:14px;
      box-shadow:0 16px 48px rgba(0,0,0,.7);z-index:2147483642;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fff;
      padding:16px;
    ">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div style="font-size:14px;font-weight:700;color:#a78bfa;">📊 Reporte por Brigadista</div>
        <button id="wspp-stats-close" style="background:none;border:none;color:rgba(255,255,255,.5);font-size:16px;cursor:pointer;">✕</button>
      </div>

      <!-- Summary global -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-bottom:14px;">
        ${[
          ['Total',     summary?.total   || 0, '#60a5fa'],
          ['Con WA',    summary?.valid   || 0, '#34c759'],
          ['Sin WA',    summary?.invalid || 0, '#ef5350'],
          ['Pendiente', summary?.pending || 0, '#ff9f0a'],
        ].map(([l,v,c]) => `
          <div style="text-align:center;padding:6px;background:rgba(255,255,255,.03);border-radius:8px;">
            <div style="font-size:18px;font-weight:800;color:${c};">${v}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.5);text-transform:uppercase;">${l}</div>
          </div>
        `).join('')}
      </div>

      <!-- Tasa global de inválidos -->
      ${summary?.total ? `
      <div style="margin-bottom:12px;padding:8px 12px;background:rgba(255,255,255,.03);border-radius:8px;display:flex;justify-content:space-between;font-size:12px;">
        <span style="color:rgba(255,255,255,.5);">Tasa inválidos global</span>
        <span style="font-weight:700;color:${
          (summary.invalid / summary.total) > 0.3 ? '#ef5350' :
          (summary.invalid / summary.total) > 0.15 ? '#ff9f0a' : '#34c759'
        };">${Math.round((summary.invalid / summary.total) * 100)}%</span>
      </div>` : ''}

      <!-- Brigadistas con más inválidos -->
      <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">
        Brigadistas con más números inválidos
      </div>
      ${topBad.length === 0 ? `
        <div style="font-size:12px;color:rgba(255,255,255,.5);text-align:center;padding:16px;">
          Sin datos — ejecutá la validación primero
        </div>
      ` : topBad.map(b => {
        const pct = Number(b.invalid_rate_pct) || 0;
        const pctColor = pct > 40 ? '#ef5350' : pct > 20 ? '#ff9f0a' : '#a78bfa';
        return `
        <div style="padding:8px 10px;background:rgba(255,255,255,.02);border-radius:8px;border:1px solid rgba(255,255,255,.04);margin-bottom:5px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:12px;font-weight:600;color:rgba(255,255,255,.75);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:230px;">
              ${b.encuestador || 'Sin nombre'}
            </span>
            <span style="font-size:12px;font-weight:800;color:${pctColor};">${pct}% inv.</span>
          </div>
          <div style="display:flex;gap:12px;font-size:11px;color:rgba(255,255,255,.35);">
            <span>📋 ${b.total} total</span>
            <span style="color:#34c759;">✅ ${b.valid || 0}</span>
            <span style="color:#ef5350;">❌ ${b.invalid}</span>
            <span style="color:#ff9f0a;">⏳ ${b.pending || 0}</span>
          </div>
          <!-- Barra de inválidos -->
          <div style="margin-top:5px;background:rgba(255,255,255,.05);border-radius:3px;height:3px;overflow:hidden;">
            <div style="background:${pctColor};width:${Math.min(100,pct)}%;height:100%;border-radius:3px;"></div>
          </div>
        </div>
      `}).join('')}
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  document.getElementById('wspp-stats-close')?.addEventListener('click', () => {
    document.getElementById('wspp-val-stats-panel')?.remove();
  });
}

// ── Bridge listeners ──────────────────────────────────────────────────
window.addEventListener('message', (e) => {
  if (e.source !== window) return;

  if (e.data?.type === 'WA_VALIDATOR_CONTACTS_READY') {
    if (!e.data.ok) { _toast('Error cargando contactos: ' + (e.data.error || '?'), '#ef5350'); _render(); return; }
    _contacts     = e.data.contacts || [];
    _total        = e.data.total    || _contacts.length;
    _idx          = 0;
    _sessionCount = 0;
    _burstCount   = 0;
    _results      = [];
    _running      = false;
    _paused       = false;
    _toast(`✅ ${_contacts.length} números cargados`, '#60a5fa');
    _render();
    return;
  }

  if (e.data?.type === 'WA_VALIDATOR_STATS_READY') {
    _showStats(e.data.summary, e.data.by_brigadista);
    return;
  }
});

// ── Public API ────────────────────────────────────────────────────────
export function toggleValidatorPanel() {
  _open = !_open;
  _render();
}

export function isValidatorPanelOpen() { return _open; }
