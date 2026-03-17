// sidebar.js — Panel lateral Goberna
// Light mode. Blast = tab principal. Audios + Validación = secundarios.
// Contactos vienen del backend en batches. Sin localStorage de contactos.

import { WA_ORIGIN, getOwnNumber, isCatalogConsultor } from './bootstrap.js';
import {
  getConfig, setConfig, getTemplates, setTemplates,
  isRunning, isPaused, getCountdown, getPhase,
  getKpis, getTotalPending, getLastResults,
  startBlast, pauseBlast, resumeBlast, resetSession,
  refreshPendingCount, setOnUpdate, getTplIndex,
  toggleBlastPanel, isBlastPanelOpen,
} from './blast-panel.js';
import { toggleValidatorPanel } from './wa-validator-panel.js';
import { sendAudioAsPTT } from './audio-catalog-panel.js';

// ── Constants ─────────────────────────────────────────────────────────
const SIDEBAR_W = 380;
const SIDEBAR_ID = 'wspp-sidebar';
const FAB_ID = 'wspp-sidebar-fab';
const TAB_KEY = 'wspp_sidebar_tab';

const Z = {
  fab: 2147483647, toasts: 2147483647, blast: 2147483646,
  validator: 2147483645, sidebar: 2147483644, valOverlay: 2147483643,
  valStats: 2147483642, spamWarning: 2147483641, spamBlocker: 2147483640,
  catalogPanel: 2147483639,
};
export { Z as ZINDEX };

// ── Light palette ─────────────────────────────────────────────────────
const S = {
  bg: '#ffffff', card: '#f7f8fa', border: '#e5e7eb', text: '#1a1a1a',
  muted: '#6b7280', accent: '#25d366', accentBg: '#ecfdf5',
  danger: '#ef4444', dangerBg: '#fef2f2', warn: '#f59e0b', warnBg: '#fffbeb',
  blue: '#3b82f6', blueBg: '#eff6ff',
};

// ── State ─────────────────────────────────────────────────────────────
let _open = false;
let _tab = localStorage.getItem(TAB_KEY) || 'blast';
let _audioItems = [];
let _audioLoaded = false;
let _audioLoading = false;

const $ = id => document.getElementById(id);
function _esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// Blast engine re-renders sidebar on every tick
setOnUpdate(() => { if (_open && _tab === 'blast') _renderContent(); });

// ══════════════════════════════════════════════════════════════════════
// FAB
// ══════════════════════════════════════════════════════════════════════
export function insertSidebarFAB() {
  if ($(FAB_ID)) return;
  const fab = document.createElement('button');
  fab.id = FAB_ID;
  fab.title = 'Goberna Blast';
  fab.textContent = 'WA';
  Object.assign(fab.style, {
    // Posición: pegado a la derecha, centrado verticalmente
    position:   'fixed',
    right:      '0',
    top:        '50%',
    transform:  'translateY(-50%)',
    zIndex:     String(Z.fab),
    // Forma: rectángulo vertical pegado al borde
    width:      '28px',
    height:     '64px',
    borderRadius: '6px 0 0 6px',
    // Estilo
    background: S.accent,
    color:      '#fff',
    border:     'none',
    cursor:     'pointer',
    fontSize:   '11px',
    fontWeight: '800',
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
    letterSpacing: '0',
    boxShadow:  '-2px 0 12px rgba(0,0,0,.15)',
    // Solo responde a click directo — sin hover que cause click accidental
    userSelect: 'none',
    WebkitUserSelect: 'none',
    // Bloquear propagación de eventos hacia WA
    pointerEvents: 'auto',
  });

  // Solo abrir/cerrar con click directo en el botón
  fab.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    toggleSidebar();
  });
  // Bloquear mousedown para que WA no lo procese
  fab.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
  });

  document.body.appendChild(fab);
}

// ══════════════════════════════════════════════════════════════════════
// TOGGLE
// ══════════════════════════════════════════════════════════════════════
export function toggleSidebar() {
  _open = !_open;
  const fab = $(FAB_ID);

  if (_open) {
    // Mover el botón para que no quede tapado por el sidebar
    if (fab) {
      fab.style.right  = SIDEBAR_W + 'px';
      fab.style.background = '#374151';
      fab.textContent  = '✕';
    }
    // Empujar el layout de WA
    const app = document.querySelector('#app');
    if (app) {
      app.style.transition  = 'margin-right .25s ease';
      app.style.marginRight = SIDEBAR_W + 'px';
    }
    _renderSidebar();
    if (!isRunning()) refreshPendingCount();
  } else {
    // Restaurar botón
    if (fab) {
      fab.style.right      = '0';
      fab.style.background = S.accent;
      fab.textContent      = 'WA';
    }
    // Restaurar layout de WA
    const app = document.querySelector('#app');
    if (app) {
      app.style.transition  = 'margin-right .25s ease';
      app.style.marginRight = '0';
    }
    const el = $(SIDEBAR_ID);
    if (el) {
      el.style.transform = `translateX(${SIDEBAR_W}px)`;
      el.style.opacity   = '0';
      setTimeout(() => el.remove(), 260);
    }
  }
}
export function isSidebarOpen() { return _open; }

// ══════════════════════════════════════════════════════════════════════
// RENDER SHELL
// ══════════════════════════════════════════════════════════════════════
function _renderSidebar() {
  let el = $(SIDEBAR_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = SIDEBAR_ID;
    Object.assign(el.style, {
      position: 'fixed', top: '0', right: '0', width: SIDEBAR_W + 'px', height: '100vh',
      zIndex: String(Z.sidebar), background: S.bg, borderLeft: `1px solid ${S.border}`,
      boxShadow: '-4px 0 24px rgba(0,0,0,.08)', display: 'flex', flexDirection: 'column',
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      color: S.text, transform: `translateX(${SIDEBAR_W}px)`, opacity: '0',
      transition: 'transform .25s ease, opacity .2s ease', overflowX: 'hidden',
    });
    // Stop clicks inside sidebar from reaching WA Web underneath
    el.addEventListener('click', (e) => e.stopPropagation());
    el.addEventListener('mousedown', (e) => e.stopPropagation());
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.transform = 'translateX(0)'; el.style.opacity = '1'; });
  }

  el.innerHTML = `
    <div style="padding:14px 16px 10px;border-bottom:1px solid ${S.border};display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
      <div>
        <div style="font-size:15px;font-weight:700;">Goberna</div>
        <div style="font-size:11px;color:${S.muted};">${getOwnNumber() ? '+' + getOwnNumber() : 'Detectando...'}</div>
      </div>
      <button id="sb-close" style="background:none;border:none;color:${S.muted};font-size:18px;cursor:pointer;padding:4px;">✕</button>
    </div>
    <div style="display:flex;border-bottom:1px solid ${S.border};flex-shrink:0;">
      ${_tabBtn('blast', '📨', 'Blast')}
      ${_tabBtn('audios', '🎙', 'Audios')}
      ${_tabBtn('validar', '✅', 'Validar')}
    </div>
    <div id="sb-content" style="flex:1;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;">
      ${_contentHTML()}
    </div>
  `;
  _bindShell();
  _bindContent();
}

function _tabBtn(id, icon, label) {
  const active = _tab === id;
  return `<button data-tab="${id}" style="
    flex:1;padding:10px 4px;border:none;cursor:pointer;
    background:${active ? S.bg : S.card};color:${active ? S.accent : S.muted};
    font-size:11px;font-weight:${active ? '700' : '500'};
    border-bottom:2px solid ${active ? S.accent : 'transparent'};
  "><div style="font-size:14px;">${icon}</div>${label}</button>`;
}

function _renderContent() {
  const el = $('sb-content');
  if (el) { el.innerHTML = _contentHTML(); _bindContent(); }
}

function _contentHTML() {
  if (_tab === 'blast') return _blastHTML();
  if (_tab === 'audios') return _audiosHTML();
  if (_tab === 'validar') return _validarHTML();
  return '';
}

function _bindShell() {
  $('sb-close')?.addEventListener('click', toggleSidebar);
  document.querySelectorAll('[data-tab]').forEach(b => {
    b.addEventListener('click', () => {
      _tab = b.dataset.tab;
      localStorage.setItem(TAB_KEY, _tab);
      _renderSidebar();
      if (_tab === 'audios' && !_audioLoaded && !_audioLoading) _loadAudios();
      if (_tab === 'blast' && !isRunning()) refreshPendingCount();
    });
  });
}

// ══════════════════════════════════════════════════════════════════════
// TAB: BLAST
// ══════════════════════════════════════════════════════════════════════
function _blastHTML() {
  const cfg = getConfig();
  const tpls = getTemplates();
  const running = isRunning();
  const paused = isPaused();
  const countdown = getCountdown();
  const phase = getPhase();
  const kpis = getKpis();
  const pending = getTotalPending();
  const results = getLastResults();
  const totalSent = kpis.pending + kpis.sent + kpis.delivered + kpis.read;
  const totalProcessed = totalSent + kpis.failed;
  const hasActivity = totalProcessed > 0 || running;

  // Timer
  let timerLabel = '';
  if (countdown > 0) {
    const m = Math.floor(countdown / 60); const s = countdown % 60;
    const labels = { prewarm: '⏳ Preparando', delay: '⏱️ Próximo', pausa: '☕ Pausa', descanso: '😴 Descanso', cargando: '📥 Cargando' };
    timerLabel = `${labels[phase] || '⏱️'} ${m > 0 ? m + 'm ' : ''}${s}s`;
  } else if (phase === 'cargando') {
    timerLabel = '📥 Cargando...';
  }

  const pendingLabel = pending === null ? '...' : pending.toLocaleString('es-PE');
  const hasPending = pending === null || pending > 0;

  // Ack icon helper
  function _ackIcon(ack) {
    if (ack === -1) return '✗';
    if (ack === 0) return '🕐';  // pending/clock
    if (ack === 1) return '✓';   // sent
    if (ack === 2) return '✓✓';  // delivered
    if (ack >= 3) return '<span style="color:#53bdeb;">✓✓</span>'; // read (blue)
    return '🕐';
  }

  return `<div style="padding:14px;display:flex;flex-direction:column;gap:12px;">

    <!-- PENDIENTES -->
    <div style="background:${S.card};border:1px solid ${S.border};border-radius:10px;padding:14px;display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-size:11px;color:${S.muted};font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Pendientes en el servidor</div>
        <div style="font-size:28px;font-weight:800;color:${S.accent};margin-top:2px;">${pendingLabel}</div>
      </div>
      <button id="sb-refresh" style="padding:6px 12px;border-radius:6px;border:1px solid ${S.border};background:${S.bg};color:${S.muted};font-size:12px;cursor:pointer;">↻</button>
    </div>

    <!-- KPIs -->
    ${hasActivity ? `
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;">
      ${[
        ['🕐', kpis.pending,   'Pending',   '#f59e0b'],
        ['✓',  kpis.sent,      'Enviado',   '#6b7280'],
        ['✓✓', kpis.delivered, 'Entregado', S.accent],
        ['<span style="color:#53bdeb;">✓✓</span>', kpis.read, 'Leído', '#53bdeb'],
        ['✗',  kpis.failed,    'Fallido',   S.danger],
      ].map(([icon, val, label, color]) => `
        <div style="background:${S.card};border:1px solid ${S.border};border-radius:8px;padding:8px 4px;text-align:center;">
          <div style="font-size:16px;font-weight:800;color:${color};">${val}</div>
          <div style="font-size:9px;color:${S.muted};margin-top:2px;">${icon} ${label}</div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <!-- TANDA -->
    <div style="background:${S.card};border:1px solid ${S.border};border-radius:10px;padding:12px;">
      <div style="font-size:12px;font-weight:700;margin-bottom:8px;">¿A cuántos enviás por tanda?</div>
      <div style="display:flex;gap:5px;margin-bottom:8px;flex-wrap:wrap;">
        ${[10, 25, 50, 100, 200].map(n => `
          <button data-preset="${n}" style="
            flex:1;min-width:40px;padding:7px 4px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;
            border:2px solid ${cfg.batchSize === n ? S.accent : S.border};
            background:${cfg.batchSize === n ? S.accentBg : S.bg};
            color:${cfg.batchSize === n ? S.accent : S.muted};
            transition:all .1s;
          ">${n}</button>
        `).join('')}
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:11px;color:${S.muted};white-space:nowrap;">O escribí:</span>
        <input type="number" data-cfg="batchSize" value="${cfg.batchSize}" min="1" max="500" style="
          flex:1;padding:6px 8px;border:1px solid ${S.border};border-radius:6px;
          background:${S.bg};color:${S.text};font-size:13px;font-weight:700;
          outline:none;text-align:center;box-sizing:border-box;
        " />
        <span style="font-size:11px;color:${S.muted};white-space:nowrap;">personas</span>
      </div>
    </div>

    <!-- CONFIG AVANZADA -->
    <details style="background:${S.card};border:1px solid ${S.border};border-radius:10px;overflow:hidden;">
      <summary style="padding:12px;font-size:12px;font-weight:700;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;">
        <span>⚙️ Timing anti-baneo</span>
        <span style="font-size:10px;color:${S.muted};">▾</span>
      </summary>
      <div style="padding:0 12px 12px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        ${_cfgField('delaySec', 'Espera entre msgs (seg)', cfg.delaySec, 3, 120)}
        ${_cfgField('prewarmSec', 'Pre-warm (seg)', cfg.prewarmSec, 0, 120)}
        ${_cfgField('pausaCada', 'Pausa cada N msgs', cfg.pausaCada, 3, 50)}
        ${_cfgField('pausaSec', 'Duración pausa (seg)', cfg.pausaSec, 10, 600)}
        ${_cfgField('descansoSec', 'Descanso c/25 (seg)', cfg.descansoSec, 30, 900)}
      </div>
    </details>

    <!-- PLANTILLAS -->
    <div style="background:${S.card};border:1px solid ${S.border};border-radius:10px;padding:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div>
          <span style="font-size:12px;font-weight:700;">Mensajes (${tpls.length})</span>
          ${tpls.length > 1 ? `<span style="
            margin-left:8px;font-size:10px;font-weight:700;
            background:${S.accentBg};color:${S.accent};
            padding:2px 7px;border-radius:10px;
          ">próxima: #${(getTplIndex() % tpls.length) + 1}</span>` : ''}
        </div>
        ${tpls.length < 5 ? `<button id="sb-tpl-add" style="${_smallBtn(S.accent, S.accentBg)}">+ Nuevo</button>` : ''}
      </div>

      <!-- Hint de sintaxis -->
      <div style="background:rgba(37,211,102,0.06);border:1px solid rgba(37,211,102,0.15);border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:11px;color:${S.muted};line-height:1.8;">
        <div style="color:${S.accent};font-weight:700;margin-bottom:4px;">Sintaxis de variaciones</div>
        <div><code style="color:#fff;background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:3px;">[Hola!|Buenas!|Qué tal!]</code> → elige una al azar</div>
        <div><code style="color:#fff;background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:3px;">---</code> → corte: envía como mensaje separado</div>
        <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;">
          ${['{{nombre}}','{{saludo}}','{{cierre}}','{{emoji}}','{{distrito}}','{{fecha}}'].map(v =>
            `<code style="color:${S.accent};background:rgba(37,211,102,0.08);padding:1px 5px;border-radius:3px;">${v}</code>`
          ).join('')}
        </div>
      </div>

      ${tpls.map((t, i) => `
        <div style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:10px;color:${S.muted};font-weight:600;">MENSAJE ${i + 1}</span>
            ${tpls.length > 1 ? `<button data-tpl-del="${i}" style="background:none;border:none;color:${S.danger};cursor:pointer;font-size:11px;padding:2px 4px;">✕ Borrar</button>` : ''}
          </div>
          <textarea data-tpl="${i}" rows="5" style="
            width:100%;box-sizing:border-box;border:1px solid ${S.border};border-radius:8px;background:${S.bg};
            color:${S.text};font-size:12px;padding:10px;line-height:1.6;
            font-family:inherit;resize:vertical;outline:none;
          ">${_esc(t)}</textarea>
          <div id="sb-tpl-preview-${i}" style="margin-top:4px;font-size:10px;color:${S.muted};line-height:1.5;font-style:italic;min-height:14px;"></div>
        </div>
      `).join('')}

      ${tpls.length < 5 ? '' : ''}
    </div>

    <!-- TIMER + LOG -->
    ${hasActivity ? `
    <div style="background:${S.card};border:1px solid ${S.border};border-radius:10px;padding:12px;">
      ${timerLabel ? `<div style="font-size:12px;color:${S.accent};font-weight:600;margin-bottom:8px;">${timerLabel}</div>` : ''}
      ${results.length ? `
      <div style="font-size:10px;color:${S.muted};text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Últimos enviados</div>
      <div style="max-height:140px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;">
        ${results.slice(0, 12).map(r => `
          <div style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:${r.status === 'failed' ? S.dangerBg : S.bg};border:1px solid ${r.status === 'failed' ? '#fecaca' : S.border};border-radius:5px;font-size:11px;">
            <span style="flex-shrink:0;font-size:10px;min-width:20px;">${_ackIcon(r.ack ?? -1)}</span>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${r.status === 'failed' ? S.danger : S.text};">
              ${_esc(r.nombre || '?')}
            </span>
            <span style="font-size:10px;color:${S.muted};flex-shrink:0;">${r.telefono ? '+' + r.telefono : ''}</span>
          </div>
        `).join('')}
      </div>
      ` : ''}
      ${!running && totalProcessed > 0 ? `
        <button id="sb-reset" style="margin-top:8px;width:100%;padding:6px;border-radius:6px;border:1px solid ${S.border};background:${S.bg};color:${S.muted};font-size:11px;cursor:pointer;">Limpiar sesión</button>
      ` : ''}
    </div>
    ` : ''}

    <!-- CONTROLES -->
    ${!running && !paused && hasPending ? `
      <button id="sb-start" style="
        width:100%;padding:14px;border-radius:10px;border:none;
        background:${S.accent};color:#fff;font-size:15px;font-weight:700;cursor:pointer;
        box-shadow:0 2px 12px ${S.accent}40;
      ">▶ Enviar a ${cfg.batchSize} personas</button>
    ` : running ? `
      <button id="sb-pause" style="
        width:100%;padding:14px;border-radius:10px;border:1px solid ${S.warn}40;
        background:${S.warnBg};color:${S.warn};font-size:15px;font-weight:700;cursor:pointer;
      ">⏸ Pausar</button>
    ` : paused ? `
      <button id="sb-resume" style="
        width:100%;padding:14px;border-radius:10px;border:none;
        background:${S.accent};color:#fff;font-size:15px;font-weight:700;cursor:pointer;
      ">▶ Reanudar</button>
    ` : !hasPending && pending !== null ? `
      <div style="text-align:center;padding:12px;background:${S.accentBg};border-radius:10px;font-size:13px;color:${S.accent};font-weight:600;">
        ✅ No hay más pendientes
      </div>
    ` : ''}

  </div>`;
}

// ── Style helpers ─────────────────────────────────────────────────────
function _smallBtn(color, bg) {
  return `padding:5px 10px;border-radius:6px;border:none;background:${bg};color:${color};font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap`;
}
function _cfgField(key, label, value, min, max) {
  return `<div>
    <label style="font-size:11px;color:${S.muted};display:block;margin-bottom:2px;">${label}</label>
    <input type="number" data-cfg="${key}" value="${value}" min="${min}" max="${max}" style="
      width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid ${S.border};
      border-radius:6px;background:${S.bg};color:${S.text};font-size:13px;font-weight:600;
      outline:none;text-align:center;
    " />
  </div>`;
}

// ══════════════════════════════════════════════════════════════════════
// TAB: AUDIOS
// ══════════════════════════════════════════════════════════════════════
function _audiosHTML() {
  if (_audioLoading) return `<div style="padding:40px;text-align:center;color:${S.muted};font-size:12px;">Cargando audios...</div>`;
  if (!_audioItems.length) return `<div style="padding:40px;text-align:center;color:${S.muted};font-size:12px;">Sin audios</div>`;
  return `<div style="padding:10px;display:flex;flex-direction:column;gap:4px;">
    ${_audioItems.map(item => {
      const dur = item.duration_ms ? Math.floor(item.duration_ms / 1000) + 's' : '';
      const has = !!item.has_audio;
      return `<div data-audio-id="${item.id}" style="
        display:flex;align-items:center;gap:8px;padding:8px 10px;
        background:${S.card};border:1px solid ${S.border};border-radius:8px;
        cursor:${has ? 'pointer' : 'default'};opacity:${has ? '1' : '.5'};
      ">
        <div style="width:28px;height:28px;border-radius:50%;background:${has ? S.accentBg : S.card};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;">
          ${has ? '▶' : '—'}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_esc(item.label)}</div>
          <div style="font-size:10px;color:${S.muted};">${_esc(item.category)}${dur ? ' · ' + dur : ''}</div>
        </div>
        ${has ? `<button data-audio-send="${item.id}" style="${_smallBtn(S.accent, S.accentBg)}">Enviar</button>`
             : `<button data-audio-regen="${item.id}" style="${_smallBtn(S.warn, S.warnBg)}">Generar</button>`}
      </div>`;
    }).join('')}
  </div>`;
}

function _loadAudios() {
  _audioLoading = true; _renderContent();
  window.postMessage({ type: 'FETCH_AUDIO_CATALOG' }, WA_ORIGIN);
}

// ══════════════════════════════════════════════════════════════════════
// TAB: VALIDAR
// ══════════════════════════════════════════════════════════════════════
function _validarHTML() {
  return `<div style="padding:40px 20px;text-align:center;">
    <div style="font-size:36px;margin-bottom:12px;">✅</div>
    <div style="font-size:14px;font-weight:600;margin-bottom:6px;">Validación de números</div>
    <div style="font-size:12px;color:${S.muted};margin-bottom:16px;">Verifica qué números tienen WhatsApp activo</div>
    <button id="sb-open-validator" style="
      padding:10px 24px;border-radius:8px;border:none;
      background:${S.blueBg};color:${S.blue};font-size:13px;font-weight:600;cursor:pointer;
    ">Abrir Validador</button>
  </div>`;
}

// ══════════════════════════════════════════════════════════════════════
// EVENTS
// ══════════════════════════════════════════════════════════════════════
function _bindContent() {
  // ── Blast ──
  $('sb-refresh')?.addEventListener('click', () => { refreshPendingCount(); _toast('Actualizando...'); });
  $('sb-start')?.addEventListener('click', startBlast);
  $('sb-pause')?.addEventListener('click', pauseBlast);
  $('sb-resume')?.addEventListener('click', resumeBlast);
  $('sb-reset')?.addEventListener('click', () => { resetSession(); refreshPendingCount(); _renderContent(); });

  // Presets de tanda
  document.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = Number(btn.dataset.preset);
      setConfig({ batchSize: n });
      // Actualizar el input numérico sin re-renderizar todo
      const inp = document.querySelector('[data-cfg="batchSize"]');
      if (inp) inp.value = n;
      // Actualizar estilos de todos los presets
      document.querySelectorAll('[data-preset]').forEach(b => {
        const active = Number(b.dataset.preset) === n;
        b.style.borderColor = active ? S.accent : S.border;
        b.style.background  = active ? S.accentBg : S.bg;
        b.style.color       = active ? S.accent : S.muted;
      });
      // Actualizar el botón de inicio
      const startBtn = $('sb-start');
      if (startBtn) startBtn.textContent = `▶ Enviar a ${n} personas`;
    });
  });

  // Config numérico
  document.querySelectorAll('[data-cfg]').forEach(inp => {
    inp.addEventListener('change', () => {
      const v = Math.max(Number(inp.min || 1), Math.min(Number(inp.max || 9999), Number(inp.value)));
      inp.value = v;
      setConfig({ [inp.dataset.cfg]: v });
      // Si cambiaron batchSize manualmente, sincronizar presets y botón
      if (inp.dataset.cfg === 'batchSize') {
        document.querySelectorAll('[data-preset]').forEach(b => {
          const active = Number(b.dataset.preset) === v;
          b.style.borderColor = active ? S.accent : S.border;
          b.style.background  = active ? S.accentBg : S.bg;
          b.style.color       = active ? S.accent : S.muted;
        });
        const startBtn = $('sb-start');
        if (startBtn) startBtn.textContent = `▶ Enviar a ${v} personas`;
      }
    });
  });

  // Templates — edit + live preview
  document.querySelectorAll('[data-tpl]').forEach(ta => {
    const idx = Number(ta.dataset.tpl);

    // Preview inline: muestra cómo se vería el mensaje con variantes resueltas
    const _updatePreview = () => {
      const preview = document.getElementById('sb-tpl-preview-' + idx);
      if (!preview) return;
      const raw = ta.value;
      if (!raw.trim()) { preview.textContent = ''; return; }
      // Simulamos con un contacto de ejemplo
      const fakeParts = _previewSpin(raw);
      if (fakeParts.length === 1) {
        preview.textContent = '▶ ' + fakeParts[0].slice(0, 80) + (fakeParts[0].length > 80 ? '…' : '');
      } else {
        preview.innerHTML = fakeParts.map((p, i) =>
          `<span style="display:block;margin-bottom:1px;">✉️ ${(i+1)}: ${_esc(p.slice(0, 60))}${p.length > 60 ? '…' : ''}</span>`
        ).join('');
      }
    };

    ta.addEventListener('input', () => {
      const t = getTemplates(); t[idx] = ta.value; setTemplates(t);
      _updatePreview();
    });

    // Mostrar preview al cargar
    _updatePreview();
  });

  document.querySelectorAll('[data-tpl-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = getTemplates();
      if (t.length > 1) { t.splice(Number(btn.dataset.tplDel), 1); setTemplates(t); _renderContent(); }
    });
  });
  $('sb-tpl-add')?.addEventListener('click', () => {
    const t = getTemplates();
    const n = t.length + 1;
    t.push(`[Hola|Buenas|Buenas tardes] {{nombre}} ¿[cómo estás?|todo bien?|cómo te va?]\n---\n[Mensaje ${n} — editá este bloque|Variante ${n} — cambiá este texto]`);
    setTemplates(t); _renderContent();
  });

  // ── Audios ──
  document.querySelectorAll('[data-audio-send]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.audioSend;
      btn.textContent = '⏳'; btn.disabled = true;
      const h = (ev) => {
        if (ev.source !== window || ev.data?.type !== 'CATALOG_AUDIO_READY' || ev.data.id !== id) return;
        window.removeEventListener('message', h);
        sendAudioAsPTT(ev.data.audioBase64, ev.data.mimeType).then(ok => {
          btn.textContent = ok ? '✓' : '✗';
          setTimeout(() => { btn.textContent = 'Enviar'; btn.disabled = false; }, 3000);
        });
      };
      window.addEventListener('message', h);
      setTimeout(() => { window.removeEventListener('message', h); btn.textContent = 'Enviar'; btn.disabled = false; }, 15000);
      window.postMessage({ type: 'GET_CATALOG_AUDIO', id }, WA_ORIGIN);
    });
  });
  document.querySelectorAll('[data-audio-regen]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      btn.textContent = '⏳'; btn.disabled = true;
      window.postMessage({ type: 'GENERATE_CATALOG_AUDIO', id: btn.dataset.audioRegen }, WA_ORIGIN);
    });
  });

  // ── Validar ──
  $('sb-open-validator')?.addEventListener('click', toggleValidatorPanel);
}

// ── Preview spin (versión simplificada para mostrar cómo queda el template) ─
function _previewSpin(tpl) {
  const fakeContact = { nombre: 'María', apellidos: '', distrito: 'Chiclayo', id: 'abc' };
  const now = new Date();
  const parts = tpl.split(/^[ \t]*---[ \t]*$/m);
  return parts.map(part => {
    // Resolver [opción1|opción2] — elegir siempre la primera para que sea predecible
    const spun = part.replace(/\[([^\]]+)\]/g, (_, inner) => inner.split('|')[0]);
    return spun
      .replace(/\{\{nombre\}\}/gi, fakeContact.nombre)
      .replace(/\{\{saludo\}\}/gi, 'Hola')
      .replace(/\{\{cierre\}\}/gi, 'Saludos!')
      .replace(/\{\{emoji\}\}/gi, '👋')
      .replace(/\{\{distrito\}\}/gi, fakeContact.distrito)
      .replace(/\{\{fecha\}\}/gi, now.toLocaleDateString('es-PE'))
      .replace(/\{\{hora\}\}/gi, now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }))
      .trim();
  }).filter(p => p.length > 0);
}

// ── Toast ─────────────────────────────────────────────────────────────
function _toast(text, bg = S.accent) {
  const t = document.createElement('div');
  Object.assign(t.style, { position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)', background: bg, color: '#fff', padding: '8px 18px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', zIndex: '2147483647', boxShadow: '0 4px 16px rgba(0,0,0,.2)' });
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ── Bridge: audio catalog ─────────────────────────────────────────────
window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  if (e.data?.type === 'AUDIO_CATALOG_READY') {
    _audioLoading = false; _audioLoaded = true;
    if (e.data.ok) _audioItems = e.data.items || [];
    if (_tab === 'audios') _renderContent();
  }
  if (e.data?.type === 'GENERATE_CATALOG_AUDIO_DONE') {
    if (e.data.ok) { _audioLoaded = false; if (_tab === 'audios') _loadAudios(); }
  }
});

// ── Legacy exports ────────────────────────────────────────────────────
export function updateContactsList() {}
export function updateAudioList() {}
export function updateSpamRisk() {}
export function updateDayStats() {}
export function renderContactRow() { return ''; }
export function renderAudioRow() { return ''; }
