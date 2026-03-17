// blast-panel.js — Multi-number WA Blast for Goberna
// Source: form_submissions (12,258 brigadistas contacts)
// Auto-marks cms_status: nuevo → hablado on successful send.
//
// ═══════════════════════════════════════════════════════
// ANTI-BAN — 7 CAPAS
// L1. WA @c.us JID from phone number (51XXXXXXXXX@c.us)
// L2. Delays no lineales: 10-22s, 45-90s c/10, 3-5min c/25
// L3. Variación profunda: saludo×8, cierre×6, emoji opcional
// L4. Límites sesión(50) + diarios por número (warmup-aware)
// L5. Warmup por número: 20→50→100→200/día en 14 días
// L6. Circuit breaker: 3 fallos consecutivos → pausa
// L7. addAndSendMsgToChat (no DOM, no clicks)
// ═══════════════════════════════════════════════════════

import { WA_ORIGIN, getOwnNumber } from './bootstrap.js';

// Spam check — called before each send via bridge to background
// Returns a Promise<{ shouldPause, cooldown_sec, result }>
async function _spamCheckBeforeSend() {
  return new Promise((resolve) => {
    window.postMessage({ type: 'WSPP_SPAM_CHECK_NOW' }, WA_ORIGIN);
    const onResult = (e) => {
      if (e.source !== window) return;
      if (e.data?.type !== 'WSPP_SPAM_CHECK_RESULT') return;
      window.removeEventListener('message', onResult);
      const r = e.data.result;
      resolve({
        shouldPause: r?.risk_level === 'critical',
        cooldown_sec: r?.cooldown_sec || 0,
        result: r,
      });
    };
    window.addEventListener('message', onResult);
    // Timeout 500ms — if no response, continue (fail open, don't block sends)
    setTimeout(() => {
      window.removeEventListener('message', onResult);
      resolve({ shouldPause: false, cooldown_sec: 0, result: null });
    }, 500);
  });
}

// ── Números warm (tienen historial — sin warmup) ──────────────────────
const WARM_NUMBERS = new Set(['51901938157', '51930700661']);

// ── Constantes ────────────────────────────────────────────────────────
const SESSION_MAX       = 50;
const DAILY_MAX         = 200;
const CONSEC_FAIL_LIMIT = 3;

// Pre-warm: tiempo de espera entre abrir el chat y enviar el mensaje.
// 30s imita el tiempo que tarda un humano en escribir y revisar.
// WA registra la sesión de chat antes del mensaje → menos sospechoso.
const PREWARM_WAIT_MS   = 30_000;  // 30 segundos fijos

// Delay ENTRE contactos (después de enviar, antes del siguiente pre-warm).
// El ciclo total por contacto es: prewarm(30s) + envío + delay(10-22s)
// ≈ 40-52s por contacto = ~70-90 contactos/hora por celular.
const DELAY_MIN         = 10000;   // 10s mínimo entre contactos
const DELAY_MAX         = 22000;   // 22s máximo entre contactos
const DELAY_MICRO_MIN   = 45000;   // pausa extra c/10 mensajes
const DELAY_MICRO_MAX   = 90000;
const DELAY_BREAK_MIN   = 180000;  // pausa larga c/25 mensajes
const DELAY_BREAK_MAX   = 300000;

// ── State ─────────────────────────────────────────────────────────────
let _open          = false;
let _contacts      = [];   // form_submissions contacts
let _total         = 0;
let _message       = '';
let _running       = false;
let _paused        = false;
let _results       = [];   // { nombre, telefono, status, error }
let _idx           = 0;
let _sessionSent   = 0;
let _dailyCount    = 0;
let _warmupStart   = null;
let _countdown     = 0;
let _countdownTimer = null;
let _activeNumber  = null;
// Current phase shown in the UI countdown
// 'prewarm' | 'send' | 'delay' | 'break'
let _phase = 'delay';
// Batch of IDs to mark as hablado — flushed every 10 or at end
let _habladoBatch  = [];
// Segment info from backend config
let _segmentInfo   = null;  // { segment_idx, total_slots, label } | null

// ── Per-number storage ────────────────────────────────────────────────
const _dailyKey  = n => `wspp_blast_daily_${n || 'global'}`;
const _warmupKey = n => `wspp_blast_warmup_${n || 'global'}`;

function _loadState() {
  _activeNumber = getOwnNumber();
  const n = _activeNumber;
  try {
    const ws = localStorage.getItem(_warmupKey(n));
    _warmupStart = ws ? Number(ws) : null;
    const raw = localStorage.getItem(_dailyKey(n));
    if (raw) {
      const { date, count } = JSON.parse(raw);
      const today = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
      _dailyCount = date === today ? Number(count) : 0;
    } else { _dailyCount = 0; }
  } catch (_) { _dailyCount = 0; }
}

function _saveDaily(c) {
  try {
    const today = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    localStorage.setItem(_dailyKey(_activeNumber), JSON.stringify({ date: today, count: c }));
  } catch (_) {}
}

function _initWarmup() {
  if (_warmupStart) return;
  _warmupStart = WARM_NUMBERS.has(_activeNumber || '')
    ? Date.now() - 14 * 86400000  // already warm
    : Date.now();
  try { localStorage.setItem(_warmupKey(_activeNumber), String(_warmupStart)); } catch (_) {}
}

function _dailyLimit() {
  if (!_warmupStart) return 20;
  const d = (Date.now() - _warmupStart) / 86400000;
  if (d < 3) return 20; if (d < 7) return 50; if (d < 14) return 100;
  return DAILY_MAX;
}

function _warmupDay() {
  return _warmupStart ? Math.floor((Date.now() - _warmupStart) / 86400000) + 1 : 0;
}

// ── L2: Delay ─────────────────────────────────────────────────────────
function _delay(sent) {
  if (sent > 0 && sent % 25 === 0)
    return DELAY_BREAK_MIN + Math.random() * (DELAY_BREAK_MAX - DELAY_BREAK_MIN);
  if (sent > 0 && sent % 10 === 0)
    return DELAY_MICRO_MIN + Math.random() * (DELAY_MICRO_MAX - DELAY_MICRO_MIN);
  const r = Math.random();
  return DELAY_MIN + r * r * (DELAY_MAX - DELAY_MIN) + (Math.random() < 0.1 ? Math.random() * 12000 : 0);
}

// ── L3: Message variation ─────────────────────────────────────────────
const SALUDOS = ['Hola','Buenas','Buenos días','Hola buen día','Qué tal','Hola, buen día','Buenas tardes','Buenas noches'];
const CIERRES = ['Gracias!','Saludos!','Un abrazo!','Hasta pronto!','Que tengas buen día!','Éxitos!'];
const EMOJIS  = ['','','','','','👋','🙌','✅','🇵🇪'];
const pick    = (a, s) => a[Math.abs(s) % a.length];

function _personalize(tpl, c, seed) {
  const nombre   = ((c.nombre || '') + ' ' + (c.apellidos || '')).trim().split(/\s+/)[0] || 'amigo';
  const saludo   = pick(SALUDOS, seed);
  const cierre   = pick(CIERRES, seed + 7);
  const emoji    = pick(EMOJIS,  seed + 13);
  const distrito = c.distrito || '';

  let msg = tpl
    .replace(/\{\{nombre\}\}/gi,   nombre)
    .replace(/\{\{saludo\}\}/gi,   saludo)
    .replace(/\{\{cierre\}\}/gi,   cierre)
    .replace(/\{\{emoji\}\}/gi,    emoji)
    .replace(/\{\{distrito\}\}/gi, distrito)
    .trim();

  if (!/\{\{saludo\}\}/i.test(tpl) && !/^(hola|buenas|buenos|qué)/i.test(msg))
    msg = `${saludo} ${nombre}! ${msg}`;

  if (!/[.!?]$/.test(msg))
    msg += pick(['.', '!', ' !'], seed + 17);

  if (emoji) msg += ' ' + emoji;
  return msg;
}

// ── L7: Build JID from phone number ──────────────────────────────────
// Peruvian numbers: if 9 digits, prepend 51
function _phoneToJid(telefono) {
  const digits = String(telefono).replace(/\D/g, '');
  if (!digits) return null;
  const normalized = digits.length === 9 ? '51' + digits : digits;
  return normalized + '@c.us';
}

// ── L7: WA module resolver ────────────────────────────────────────────
function _req(...names) {
  for (const n of names) { try { const m = window.require(n); if (m) return m; } catch (_) {} }
  throw new Error('WA module not found: ' + names.join(' / '));
}

// ── L8: Pre-warm — abre/registra el chat sin enviar nada ──────────────
// WA trata diferente un mensaje enviado a un chat ya "conocido" que a
// uno que nunca tuvo actividad. Abrir el chat 30s antes del envío
// genera una señal de sesión que reduce la probabilidad de detección.
//
// Retorna el objeto chat para reutilizarlo en _sendToChat().
// Si el número no existe en WA, lanza Error('No existe en WA').
async function _prewarmChat(jid) {
  if (typeof window.require !== 'function') throw new Error('WA Web no cargado');

  const wf   = _req('WAWebWidFactory');
  const wid  = wf.createWid(jid);
  const coll = _req('WAWebCollections');

  let chat = coll.Chat.get(wid);
  if (!chat) {
    const FC = _req('WAWebFindChatAction');
    const r  = await FC.findOrCreateLatestChat(wid);
    chat = r?.chat ?? r;
  }
  if (!chat) throw new Error('No existe en WA: ' + jid);

  return chat;
}

// ── L8: Send text to an already-warmed chat object ────────────────────
// Llamar solo DESPUÉS de _prewarmChat() + esperar 30s.
async function _sendToChat(chat, text) {
  const meMod  = _req('WAWebUserPrefsMeUser');
  const meUser = (meMod.getMaybeMePnUser ?? meMod.getMeUser ?? meMod.default?.getMaybeMePnUser).call(meMod);
  const MsgKey = _req('WAWebMsgKey');
  const newId  = await MsgKey.newId();
  const key    = new MsgKey({ from: meUser, to: chat.id, id: newId, selfDir: 'out' });

  let eph = {};
  try {
    const em = _req('WAWebGetEphemeralFieldsMsgActionsUtils','WAWebEphemeralFields','WAWebEphemeralUtils');
    const fn = em.getEphemeralFields ?? em.default?.getEphemeralFields;
    if (fn) eph = fn(chat);
  } catch (_) {}

  const [p] = _req('WAWebSendMsgChatAction').addAndSendMsgToChat(chat, {
    ...eph, id: key, type: 'chat', body: text, ack: 0,
    from: meUser, to: chat.id, local: true, self: 'out',
    t: Math.floor(Date.now() / 1000), isNewMsg: true,
  });
  await p;
}

// ── Compatibilidad — mantiene la firma original para usos externos ─────
async function _send(jid, text) {
  const chat = await _prewarmChat(jid);
  await _sendToChat(chat, text);
}

// ── Helpers ───────────────────────────────────────────────────────────
// phase: 'prewarm' | 'delay' | 'break'
function _startCountdown(ms, phase = 'delay') {
  _phase = phase;
  _countdown = Math.ceil(ms / 1000);
  clearInterval(_countdownTimer);
  _countdownTimer = setInterval(() => {
    _countdown = Math.max(0, _countdown - 1);
    const el = document.getElementById('wspp-blast-countdown');
    if (!el) return;
    if (_countdown <= 0) { el.textContent = _phase === 'prewarm' ? 'Enviando mensaje...' : 'Enviando...'; return; }
    if (_phase === 'prewarm') {
      el.textContent = `⏳ Preparando contacto... ${_countdown}s`;
    } else if (_phase === 'break') {
      const m = Math.floor(_countdown / 60);
      const s = _countdown % 60;
      el.textContent = `☕ Pausa anti-ban ${m}:${String(s).padStart(2,'0')}`;
    } else {
      el.textContent = `Próximo en ${_countdown}s`;
    }
  }, 1000);
}
function _stopCountdown() { clearInterval(_countdownTimer); _countdown = 0; _phase = 'delay'; }
function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function _toast(text, color = '#25d366', ms = 4000) {
  const t = document.createElement('div');
  Object.assign(t.style, {
    position:'fixed',bottom:'80px',left:'50%',transform:'translateX(-50%)',
    background:color,color:'#fff',padding:'10px 20px',borderRadius:'8px',
    fontSize:'13px',fontWeight:'600',zIndex:'2147483647',
    boxShadow:'0 4px 20px rgba(0,0,0,.35)',maxWidth:'360px',textAlign:'center',lineHeight:'1.4',
  });
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// Flush blast log to backend
function _reportLog(results) {
  if (!results.length) return;
  window.postMessage({ type: 'BLAST_REPORT_RESULTS', results }, WA_ORIGIN);
}

// Flush hablado batch to backend
function _flushHablado() {
  if (!_habladoBatch.length) return;
  window.postMessage({
    type: 'BLAST_MARK_HABLADO',
    ids: [..._habladoBatch],
    own_number: _activeNumber,
  }, WA_ORIGIN);
  _habladoBatch = [];
}

// ── Motor principal ───────────────────────────────────────────────────
async function _run() {
  if (_running || _paused) return;
  if (!_message.trim())  { _toast('Escribe el mensaje', '#ef5350'); return; }
  if (!_contacts.length) { _toast('Carga los contactos primero', '#ef5350'); return; }

  _loadState(); _initWarmup();
  const limit = _dailyLimit();
  if (_dailyCount >= limit) {
    _toast(`Límite diario (${limit}) alcanzado para +${_activeNumber}.\nUsa otra pestaña o continúa mañana.`, '#ef5350', 7000);
    return;
  }

  _running = true; _paused = false;
  let consecFails = 0;
  const logBatch  = [];

  _render();

  while (_idx < _contacts.length && _running && !_paused) {

    if (_sessionSent >= SESSION_MAX) {
      _paused = _running = false; _stopCountdown();
      _flushHablado();
      _toast(`Pausa: ${SESSION_MAX} enviados esta sesión.\nEspera 10 min y reanuda.`, '#ff9f0a', 10000);
      _render(); break;
    }
    if (_dailyCount >= limit) {
      _paused = _running = false; _stopCountdown();
      _flushHablado();
      _toast(`Límite diario (${limit}) para +${_activeNumber}.\nContinúa mañana.`, '#ef5350', 8000);
      _render(); break;
    }

    const c    = _contacts[_idx];
    const jid  = _phoneToJid(c.telefono);
    const seed = (c.id || '').split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) + _idx;
    const text = _personalize(_message, c, seed);

    let status = 'sent', error = null;

    if (!jid) {
      status = 'failed'; error = 'Teléfono inválido: ' + c.telefono;
    } else {
      // ── Spam check BEFORE sending ────────────────────────────────
      const spamCheck = await _spamCheckBeforeSend();
      if (spamCheck.shouldPause) {
        _paused = _running = false;
        _stopCountdown();
        _flushHablado();
        const coolMin = Math.ceil((spamCheck.cooldown_sec || 180) / 60);
        _toast(
          `🚨 RIESGO CRÍTICO — Blast pausado automáticamente.\nEsperá ${coolMin} min antes de reanudar.`,
          '#dc2626', 15000
        );
        _render(); break;
      }

      // ── FASE 1: Pre-warm (abrir chat, 30s) ───────────────────────
      // Abre/registra el chat en WA ANTES de enviar el mensaje.
      // WA genera una señal de sesión que reduce detección de spam.
      // Los 30s de espera imitan el tiempo que tarda un humano en
      // escribir y revisar el mensaje antes de enviarlo.
      let chat = null;
      try {
        chat = await _prewarmChat(jid);
      } catch (err) {
        // Número no existe en WA → fallo directo, no esperar 30s
        status = 'failed'; error = err.message; consecFails++;
        console.error(`[WSPP BLAST] ✗ prewarm +${c.telefono} — ${err.message}`);
        if (consecFails >= CONSEC_FAIL_LIMIT) {
          _paused = _running = false; _stopCountdown(); _flushHablado();
          _toast(`⚠️ ${CONSEC_FAIL_LIMIT} fallos consecutivos.\nVerifica WhatsApp Web.`, '#ef5350', 10000);
          logBatch.push({ phone: c.telefono, contact_name: `${c.nombre} ${c.apellidos}`.trim(), message: text, status, error, own_number: _activeNumber });
          _results.push({ ...c, status, error });
          _idx++; _render(); _reportLog([...logBatch]); logBatch.length = 0; break;
        }
        // Skip the prewarm delay — go straight to next contact's loop
        logBatch.push({ phone: c.telefono, contact_name: `${c.nombre} ${c.apellidos}`.trim(), message: text, status, error, own_number: _activeNumber });
        _results.push({ ...c, status, error });
        _idx++; _render();
        if (logBatch.length >= 10) { _reportLog([...logBatch]); logBatch.length = 0; }
        if (_running && !_paused && _idx < _contacts.length) {
          const d = _delay(_sessionSent);
          _startCountdown(d, 'delay'); _render();
          await _sleep(d); _stopCountdown();
        }
        continue; // eslint-disable-line no-continue
      }

      // ── Espera de 30s: countdown visible con label "Preparando contacto" ──
      if (_running && !_paused) {
        _startCountdown(PREWARM_WAIT_MS, 'prewarm');
        _render();
        await _sleep(PREWARM_WAIT_MS);
        _stopCountdown();
      }

      // Si pausaron durante el pre-warm, no enviar
      if (!_running || _paused) break;

      // ── FASE 2: Enviar mensaje ───────────────────────────────────
      try {
        await _sendToChat(chat, text);
        _sessionSent++; _dailyCount++; consecFails = 0;
        _saveDaily(_dailyCount);

        if (c.id) _habladoBatch.push(c.id);
        if (_habladoBatch.length >= 10) _flushHablado();

        console.log(`[WSPP BLAST] ✓ +${_activeNumber} | ${c.nombre} | +${c.telefono}`);
      } catch (err) {
        status = 'failed'; error = err.message; consecFails++;
        console.error(`[WSPP BLAST] ✗ send +${c.telefono} — ${err.message}`);

        if (consecFails >= CONSEC_FAIL_LIMIT) {
          _paused = _running = false; _stopCountdown(); _flushHablado();
          _toast(`⚠️ ${CONSEC_FAIL_LIMIT} fallos consecutivos.\nVerifica WhatsApp Web.`, '#ef5350', 10000);
          logBatch.push({ phone: c.telefono, contact_name: `${c.nombre} ${c.apellidos}`.trim(), message: text, status, error, own_number: _activeNumber });
          _results.push({ ...c, status, error });
          _idx++; _render(); _reportLog([...logBatch]); logBatch.length = 0; break;
        }
      }
    }

    logBatch.push({ phone: c.telefono, contact_name: `${c.nombre} ${c.apellidos}`.trim(), message: text, status, error, own_number: _activeNumber });
    _results.push({ ...c, status, error });
    _idx++;
    _render();

    if (logBatch.length >= 10) { _reportLog([...logBatch]); logBatch.length = 0; }

    if (_running && !_paused && _idx < _contacts.length) {
      const d = _delay(_sessionSent);
      // Si es una pausa larga (c/25), usar label 'break'. Si es micro (c/10), igual.
      const phase = d >= DELAY_BREAK_MIN ? 'break' : 'delay';
      _startCountdown(d, phase); _render();
      await _sleep(d); _stopCountdown();
    }
  }

  // Flush remaining
  if (logBatch.length) _reportLog([...logBatch]);
  _flushHablado();

  if (!_paused && _idx >= _contacts.length) {
    _running = false; _stopCountdown();
    const sent = _results.filter(r => r.status === 'sent').length;
    _toast(`✅ +${_activeNumber} — ${sent} enviados · ${sent} marcados como hablado`, '#25d366', 6000);
  }
  _running = false; _render();
}

// ── UI ────────────────────────────────────────────────────────────────
function _render() {
  const el = document.getElementById('wspp-blast-panel');
  if (!_open) { if (el) el.remove(); return; }

  _loadState();
  const lim       = _dailyLimit();
  const remaining = Math.max(0, lim - _dailyCount);
  const wDay      = _warmupDay();
  const inWarmup  = wDay <= 14 && !WARM_NUMBERS.has(_activeNumber || '');
  const sent      = _results.filter(r => r.status === 'sent').length;
  const failed    = _results.filter(r => r.status === 'failed').length;
  const pct       = _contacts.length ? Math.round((_idx / _contacts.length) * 100) : 0;
  const numShow   = _activeNumber ? `+${_activeNumber}` : '⏳ detectando...';

  const html = `
    <div id="wspp-blast-panel" style="
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      width:460px;max-height:94vh;overflow-y:auto;
      background:#0c1a0f;border:1px solid rgba(37,211,102,.18);border-radius:16px;
      box-shadow:0 24px 64px rgba(0,0,0,.8);z-index:2147483646;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fff;
    ">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,.06);">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:34px;height:34px;border-radius:9px;background:rgba(37,211,102,.1);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#25d366"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
          </div>
          <div>
            <div style="font-size:14px;font-weight:700;">Blast Brigadistas</div>
            <div style="font-size:10px;color:rgba(255,255,255,.35);">12,258 personas · nuevo → hablado automático</div>
          </div>
        </div>
        <button id="wspp-blast-close" style="background:none;border:none;color:rgba(255,255,255,.3);font-size:18px;cursor:pointer;padding:4px 8px;line-height:1;">✕</button>
      </div>

      <!-- Número activo + slot del call center -->
      <div style="margin:10px 16px 0;padding:8px 12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:8px;display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-size:11px;color:rgba(255,255,255,.4);">Número activo</div>
          ${_segmentInfo ? `<div style="font-size:9px;color:rgba(37,211,102,.5);margin-top:1px;">📞 Call Center · Slot ${_segmentInfo.segment_idx + 1}/${_segmentInfo.total_slots}${_segmentInfo.label ? ' · ' + _segmentInfo.label : ''}</div>` : ''}
        </div>
        <div style="font-size:13px;font-weight:700;color:${_activeNumber ? '#25d366' : '#ff9f0a'};">
          ${numShow}
          ${_activeNumber ? `<span style="font-size:10px;color:rgba(255,255,255,.3);margin-left:5px;">${WARM_NUMBERS.has(_activeNumber) ? '🔥 warm' : `día ${wDay}/14`}</span>` : ''}
        </div>
      </div>

      ${inWarmup ? `
      <div style="margin:8px 16px 0;padding:7px 12px;background:rgba(255,149,0,.07);border:1px solid rgba(255,149,0,.15);border-radius:8px;font-size:11px;color:#ff9f0a;line-height:1.5;">
        🔒 Warmup día ${wDay}/14 — límite hoy: <strong>${lim} mensajes</strong>
      </div>` : ''}

      <!-- Stats -->
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.05);">
        ${[
          ['Total',   _total,                         '#25d366'],
          ['Enviados', sent,                           '#34c759'],
          ['Fallidos', failed,                         '#ef5350'],
          ['Sesión',  `${_sessionSent}/${SESSION_MAX}`,'#ff9f0a'],
          ['Hoy',     `${_dailyCount}/${lim}`,         '#60a5fa'],
        ].map(([l,v,c]) => `
          <div style="text-align:center;padding:5px 2px;background:rgba(255,255,255,.03);border-radius:7px;">
            <div style="font-size:15px;font-weight:800;color:${c};">${v}</div>
            <div style="font-size:9px;color:rgba(255,255,255,.3);text-transform:uppercase;margin-top:1px;">${l}</div>
          </div>
        `).join('')}
      </div>

      <!-- Progreso -->
      ${_contacts.length ? `
      <div style="padding:10px 16px 5px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:rgba(255,255,255,.3);margin-bottom:4px;">
          <span>${_idx} / ${_contacts.length}</span>
          <span id="wspp-blast-countdown" style="color:${_running?'#25d366':'rgba(255,255,255,.3)'};">
            ${_running && _countdown > 0 ? `Próximo en ${_countdown}s` : _running ? 'Enviando...' : ''}
          </span>
          <span>${pct}%</span>
        </div>
        <div style="background:rgba(255,255,255,.06);border-radius:4px;height:5px;overflow:hidden;">
          <div style="background:linear-gradient(90deg,#25d366,#34c759);width:${pct}%;height:100%;border-radius:4px;transition:width .4s;"></div>
        </div>
      </div>` : ''}

      <!-- Mensaje -->
      <div style="padding:10px 16px 8px;">
        <label style="font-size:10px;font-weight:700;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:1.2px;display:block;margin-bottom:5px;">Mensaje</label>
        <textarea id="wspp-blast-msg" rows="4" placeholder="{{saludo}} {{nombre}}! Soy César Vásquez de {{distrito}}..." style="
          width:100%;box-sizing:border-box;background:rgba(255,255,255,.05);
          border:1px solid rgba(255,255,255,.1);border-radius:8px;
          color:#fff;font-size:13px;line-height:1.55;padding:10px 12px;
          resize:vertical;font-family:inherit;outline:none;
        ">${_message}</textarea>
        <div style="font-size:10px;color:rgba(255,255,255,.2);margin-top:4px;line-height:1.5;">
          <code style="color:rgba(37,211,102,.6);">{{nombre}}</code>
          <code style="color:rgba(37,211,102,.6);">{{saludo}}</code>
          <code style="color:rgba(37,211,102,.6);">{{cierre}}</code>
          <code style="color:rgba(37,211,102,.6);">{{distrito}}</code>
          <code style="color:rgba(37,211,102,.6);">{{emoji}}</code>
          · pre-warm 30s → msg → delay 10-22s · c/10: 45-90s · c/25: 3-5min
        </div>
      </div>

      <!-- Controles -->
      <div style="padding:0 16px 14px;display:flex;gap:8px;flex-wrap:wrap;">
        ${!_contacts.length ? `
          <button id="wspp-blast-load" style="flex:1;padding:11px 16px;background:rgba(37,211,102,.1);border:1px solid rgba(37,211,102,.2);border-radius:9px;color:#25d366;font-size:13px;font-weight:700;cursor:pointer;">
            📋 Cargar ${_total || 12258} brigadistas
          </button>
        ` : !_running && !_paused ? `
          ${remaining > 0 ? `
            <button id="wspp-blast-start" style="flex:1;padding:11px 16px;background:#25d366;border:none;border-radius:9px;color:#0c1a0f;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 4px 20px rgba(37,211,102,.2);">
              ▶ Enviar a ${Math.min(_contacts.length - _idx, remaining)} personas
            </button>
          ` : `
            <div style="flex:1;padding:11px;background:rgba(239,83,80,.07);border:1px solid rgba(239,83,80,.16);border-radius:9px;font-size:12px;color:#ef5350;text-align:center;">
              Límite diario (${lim}) alcanzado para ${numShow}. Usa otra pestaña.
            </div>
          `}
          <button id="wspp-blast-reload" title="Recargar" style="padding:11px 14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:9px;color:rgba(255,255,255,.4);font-size:14px;cursor:pointer;">↺</button>
        ` : _running ? `
          <div style="flex:1;padding:9px 12px;background:rgba(37,211,102,.05);border:1px solid rgba(37,211,102,.1);border-radius:9px;font-size:12px;color:rgba(255,255,255,.55);line-height:1.5;">
            ${_phase === 'prewarm'
              ? `⏳ Preparando contacto ${_idx + 1} · ${_sessionSent} enviados · esperando 30s`
              : _phase === 'break'
              ? `☕ Pausa anti-ban · ${_sessionSent} enviados · ${_dailyCount}/${lim} hoy`
              : `🟢 Enviando · ${_sessionSent} sesión · ${_dailyCount}/${lim} hoy · marcando hablado ✅`
            }
          </div>
          <button id="wspp-blast-pause" style="padding:11px 16px;background:rgba(255,149,0,.1);border:1px solid rgba(255,149,0,.2);border-radius:9px;color:#ff9f0a;font-size:13px;font-weight:700;cursor:pointer;">⏸ Pausar</button>
        ` : _paused && _idx < _contacts.length ? `
          <div style="width:100%;padding:9px 12px;background:rgba(255,149,0,.06);border:1px solid rgba(255,149,0,.14);border-radius:9px;font-size:12px;color:#ff9f0a;line-height:1.5;">
            ⏸ Pausado en ${_idx}/${_contacts.length}.
            ${_sessionSent >= SESSION_MAX ? ' Espera 10 min (anti-baneo).' : ' Listo para reanudar.'}
          </div>
          <button id="wspp-blast-resume" style="flex:1;padding:11px 16px;background:#25d366;border:none;border-radius:9px;color:#0c1a0f;font-size:13px;font-weight:800;cursor:pointer;">▶ Reanudar</button>
        ` : `
          <div style="width:100%;padding:9px;background:rgba(37,211,102,.06);border:1px solid rgba(37,211,102,.14);border-radius:9px;font-size:12px;color:#25d366;text-align:center;font-weight:600;">
            ✅ Sesión completa — ${sent} enviados y marcados como <strong>hablado</strong>
          </div>
          <button id="wspp-blast-reload" style="flex:1;padding:11px 16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:9px;color:rgba(255,255,255,.5);font-size:13px;cursor:pointer;">Nueva sesión ↺</button>
        `}
      </div>

      <!-- Últimos -->
      ${_results.length ? `
      <div style="padding:0 16px 16px;">
        <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.25);text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;">Últimos enviados</div>
        <div style="max-height:150px;overflow-y:auto;display:flex;flex-direction:column;gap:3px;">
          ${_results.slice(-10).reverse().map(r => `
            <div style="display:flex;align-items:center;gap:7px;padding:5px 9px;background:rgba(255,255,255,.02);border-radius:6px;border:1px solid rgba(255,255,255,.04);">
              <span style="font-size:13px;flex-shrink:0;">${r.status === 'sent' ? '✅' : '❌'}</span>
              <span style="font-size:12px;color:${r.status==='sent'?'rgba(255,255,255,.6)':'#ef5350'};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${r.nombre || ''} ${r.apellidos || ''} · +${r.telefono || '?'}
              </span>
              <span style="font-size:10px;color:rgba(255,255,255,.25);flex-shrink:0;">${r.distrito || ''}</span>
            </div>
          `).join('')}
        </div>
      </div>` : ''}
    </div>
  `;

  if (el) el.outerHTML = html;
  else document.body.insertAdjacentHTML('beforeend', html);

  document.getElementById('wspp-blast-close')?.addEventListener('click', () => {
    _open = false;
    if (_running) { _running = false; _paused = true; _stopCountdown(); _flushHablado(); }
    _render();
  });
  document.getElementById('wspp-blast-msg')?.addEventListener('input', e => { _message = e.target.value; });
  document.getElementById('wspp-blast-load')?.addEventListener('click', _load);
  document.getElementById('wspp-blast-reload')?.addEventListener('click', () => {
    _contacts = []; _results = []; _idx = 0; _sessionSent = 0;
    _running = false; _paused = false; _habladoBatch = [];
    _load();
  });
  document.getElementById('wspp-blast-start')?.addEventListener('click', () => {
    _message = document.getElementById('wspp-blast-msg')?.value || _message;
    _run();
  });
  document.getElementById('wspp-blast-pause')?.addEventListener('click', () => {
    _paused = true; _running = false; _stopCountdown(); _flushHablado(); _render();
  });
  document.getElementById('wspp-blast-resume')?.addEventListener('click', () => {
    _sessionSent = 0; _paused = false;
    _message = document.getElementById('wspp-blast-msg')?.value || _message;
    _run();
  });
}

// ── Cargar configuración del segmento del número activo ───────────────
function _loadSegmentInfo() {
  const own = getOwnNumber();
  if (!own) return;
  window.postMessage({ type: 'BLAST_GET_NUMBER_CONFIG', own_number: own }, WA_ORIGIN);
}

// ── Cargar contactos ──────────────────────────────────────────────────
function _load() {
  _loadState();
  const btn = document.getElementById('wspp-blast-load') || document.getElementById('wspp-blast-reload');
  if (btn) { btn.textContent = '⏳ Cargando...'; btn.disabled = true; }
  window.postMessage({
    type: 'BLAST_GET_FORM_CONTACTS',
    limit: 200,
    offset: 0,
    status: 'nuevo',
  }, WA_ORIGIN);
}

// ── Bridge listeners ──────────────────────────────────────────────────
window.addEventListener('message', (e) => {
  if (e.source !== window) return;

  // Contacts loaded
  if (e.data?.type === 'BLAST_FORM_CONTACTS_READY') {
    if (!e.data.ok) {
      _toast('Error: ' + (e.data.error || 'desconocido'), '#ef5350');
      _render(); return;
    }
    _contacts    = e.data.contacts || [];
    _total       = e.data.total    || _contacts.length;
    _results     = [];
    _idx         = 0;
    _sessionSent = 0;
    _running     = false;
    _paused      = false;
    _habladoBatch = [];
    // Capture segment info returned alongside contacts
    if (e.data.segment_idx !== undefined) {
      _segmentInfo = {
        segment_idx: e.data.segment_idx,
        total_slots: e.data.total_slots,
        label: _segmentInfo?.label ?? null,
      };
    }
    _loadState();
    const slotLabel = _segmentInfo
      ? ` · Slot ${_segmentInfo.segment_idx + 1}/${_segmentInfo.total_slots}`
      : '';
    console.log(`[WSPP BLAST] ${_contacts.length} contactos cargados (total: ${_total})${slotLabel} | límite hoy: ${_dailyLimit()}`);
    _toast(`✅ ${_contacts.length} contactos${slotLabel} · ${_dailyLimit()}/día para +${_activeNumber || '?'}`, '#25d366');
    _render();
    return;
  }

  // Number config response
  if (e.data?.type === 'BLAST_NUMBER_CONFIG_READY') {
    if (e.data.config) {
      _segmentInfo = e.data.config;
      _render();
    }
  }
});

// ── API pública ───────────────────────────────────────────────────────
export function toggleBlastPanel() {
  _open = !_open;
  if (_open) {
    _loadState();
    _loadSegmentInfo();  // fetch segment config from backend
  }
  _render();
}

export function isBlastPanelOpen() { return _open; }
