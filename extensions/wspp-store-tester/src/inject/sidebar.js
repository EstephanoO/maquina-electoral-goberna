// sidebar.js — Panel lateral Goberna
// Light mode. Blast = tab principal. Audios + Validación = secundarios.
// Contactos vienen del backend en batches. Sin localStorage de contactos.

import { WA_ORIGIN, getOwnNumber } from './bootstrap.js';
import {
  getConfig, setConfig, getTemplates, setTemplates,
  isRunning, isPaused, getCountdown, getPhase,
  getKpis, getTotalPending, getLastResults,
  startBlast, pauseBlast, resumeBlast, resetSession,
  refreshPendingCount, setOnUpdate, getTplIndex,
  isWithinBlastWindow, getPeruTimeStr,
  getNumberHealth, isNumberAuthorized, fetchNumberHealth, fetchNumberConfig,
  getLastSpamResult,
  getGlobalStats, fetchGlobalStats,
  getPreviewContacts, isPreviewLoading, isPreviewReady, getPreviewSkipped,
  previewSkipAndReplace, previewMarkHablado, previewConfirm, previewCancel,
  getCheckpoint, getBlockSent,
} from './blast-panel.js';
import { analyzeTemplates } from './template-analyzer.js';
import { toggleValidatorPanel } from './wa-validator-panel.js';
import { sendAudioAsPTT } from './audio-catalog-panel.js';

// ── Cached template analysis ──────────────────────────────────────────
let _cachedAnalysis = null;
let _cachedTplsHash = '';

// ── Constants ─────────────────────────────────────────────────────────
const SIDEBAR_W = 380;
const SIDEBAR_ID = 'wspp-sidebar';
const FAB_ID = 'wspp-sidebar-fab';
const TAB_KEY = 'wspp_sidebar_tab';

const Z = {
  fab: 10010,
  toasts: 10010,
  blast: 10009,
  validator: 10008,
  sidebar: 10007,
  valOverlay: 10006,
  valStats: 10005,
  spamWarning: 10004,
  spamBlocker: 10003,
  catalogPanel: 10002,
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
    // Sidebar purely overlays — no mutation of WA Web's #app layout
    _renderSidebar();
    if (!isRunning()) refreshPendingCount();
    fetchNumberHealth();
    fetchNumberConfig();
    fetchGlobalStats();
  } else {
    // Restaurar botón
    if (fab) {
      fab.style.right      = '0';
      fab.style.background = S.accent;
      fab.textContent      = 'WA';
    }
    // No #app layout restoration needed — sidebar is overlay-only
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
      boxShadow: '-8px 0 32px rgba(0,0,0,0.15), -2px 0 8px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column',
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      color: S.text, transform: `translateX(${SIDEBAR_W}px)`, opacity: '0',
      transition: 'transform .25s ease, opacity .2s ease', overflowX: 'hidden',
    });
    // Only stop propagation for interactive elements inside sidebar, not the container itself
    el.addEventListener('click', (e) => { if (e.target.closest('button, input, textarea, select, a, [role="button"]')) e.stopPropagation(); });
    el.addEventListener('mousedown', (e) => { if (e.target.closest('button, input, textarea, select, a, [role="button"]')) e.stopPropagation(); });
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.transform = 'translateX(0)'; el.style.opacity = '1'; });
  }

  // innerHTML replaces the DOM tree — the old sb-content (with its delegated
  // listeners) is destroyed. We MUST reset the flag so _renderContent() can
  // re-attach delegation to the NEW sb-content element.
  _delegationBound = false;

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
    <div id="sb-content" style="flex:1;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;"></div>
  `;
  _bindShell();
  _renderContent();
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

let _delegationBound = false; // solo se registra UNA vez

function _renderContent() {
  const el = $('sb-content');
  if (!el) return;
  el.innerHTML = _contentHTML();
  _bindContentInputs(); // solo inputs/textareas (no clicks)
  if (!_delegationBound) {
    _delegationBound = true;
    el.addEventListener('click', _handleDelegatedClick);
    el.addEventListener('change', _handleDelegatedChange);
    el.addEventListener('input', _handleDelegatedInput);
  }
}

// ── Delegación de clicks — UN solo listener para todo ────────────────
async function _handleDelegatedClick(e) {
  const btn = e.target.closest('button, [data-action]');
  if (!btn) return;

  const id = btn.id;
  const skip = btn.dataset?.skip;
  const markH = btn.dataset?.markhablado;
  const preset = btn.dataset?.preset;
  const tplDel = btn.dataset?.tplDel;

  console.log('[SIDEBAR] delegated click:', id || skip || markH || preset || tplDel || btn.dataset?.audioSend || '?');

  if (id === 'sb-refresh') { refreshPendingCount(); fetchGlobalStats(); _toast('Actualizando...'); }
  else if (id === 'sb-brigadista-clear') { setConfig({ brigadista: '' }); refreshPendingCount(); _renderContent(); }
  else if (id === 'sb-start') { console.log('[SIDEBAR] sb-start clicked'); startBlast(); }
  else if (id === 'sb-pause') { pauseBlast(); }
  else if (id === 'sb-resume') { resumeBlast(); }
  else if (id === 'sb-reset') { resetSession(); refreshPendingCount(); _renderContent(); }
  else if (id === 'sb-preview-cancel') { previewCancel(); _renderContent(); }
  else if (id === 'sb-preview-confirm') { btn.disabled = true; btn.textContent = 'Enviando...'; previewConfirm(); await startBlast(); }
  else if (id === 'sb-tpl-add') {
    const t = getTemplates();
    t.push(`[Hola|Buenas|Buenas tardes] {{nombre}} ¿[cómo estás?|todo bien?|cómo te va?]\n---\n[Mensaje ${t.length + 1} — editá este bloque]`);
    setTemplates(t); _renderContent();
  }
  else if (id === 'sb-open-validator') { toggleValidatorPanel(); }
  else if (skip) {
    btn.disabled = true; btn.textContent = '...';
    try { await previewSkipAndReplace(skip); } catch (err) { console.error('[SIDEBAR] skip error:', err); }
    _renderContent();
  }
  else if (markH) {
    btn.disabled = true; btn.textContent = '...';
    try { await previewMarkHablado(markH); } catch (err) { console.error('[SIDEBAR] markHablado error:', err); }
    _renderContent();
  }
  else if (preset) {
    const n = Number(preset);
    setConfig({ batchSize: n });
    const inp = document.querySelector('[data-cfg="batchSize"]');
    if (inp) inp.value = n;
    document.querySelectorAll('[data-preset]').forEach(b => {
      const active = Number(b.dataset.preset) === n;
      b.style.borderColor = active ? S.accent : S.border;
      b.style.background  = active ? S.accentBg : S.bg;
      b.style.color       = active ? S.accent : S.muted;
    });
    const startBtn = $('sb-start');
    if (startBtn) startBtn.textContent = `▶ Enviar a ${n} personas`;
  }
  else if (tplDel !== undefined) {
    const t = getTemplates();
    if (t.length > 1) { t.splice(Number(tplDel), 1); setTemplates(t); _renderContent(); }
  }
  // Audio send
  else if (btn.dataset?.audioSend) {
    const aid = btn.dataset.audioSend;
    btn.textContent = '⏳'; btn.disabled = true;
    const h = (ev) => {
      if (ev.source !== window || ev.data?.type !== 'CATALOG_AUDIO_READY' || ev.data.id !== aid) return;
      window.removeEventListener('message', h);
      sendAudioAsPTT(ev.data.audioBase64, ev.data.mimeType).then(ok => {
        btn.textContent = ok ? '✓' : '✗';
        setTimeout(() => { btn.textContent = 'Enviar'; btn.disabled = false; }, 3000);
      });
    };
    window.addEventListener('message', h);
    setTimeout(() => { window.removeEventListener('message', h); btn.textContent = 'Enviar'; btn.disabled = false; }, 15000);
    window.postMessage({ type: 'GET_CATALOG_AUDIO', id: aid }, WA_ORIGIN);
  }
  else if (btn.dataset?.audioRegen) {
    btn.textContent = '⏳'; btn.disabled = true;
    window.postMessage({ type: 'GENERATE_CATALOG_AUDIO', id: btn.dataset.audioRegen }, WA_ORIGIN);
  }
}

function _handleDelegatedChange(e) {
  const inp = e.target.closest('[data-cfg]');
  if (!inp) return;
  const v = Math.max(Number(inp.min || 1), Math.min(Number(inp.max || 9999), Number(inp.value)));
  inp.value = v;
  setConfig({ [inp.dataset.cfg]: v });
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
}

let _brigTimer = null;
function _handleDelegatedInput(e) {
  const tpl = e.target.closest('[data-tpl]');
  const brig = e.target.id === 'sb-brigadista-input' ? e.target : null;

  if (tpl) {
    const idx = Number(tpl.dataset.tpl);
    const t = getTemplates(); t[idx] = tpl.value; setTemplates(t);
    // Update preview
    const preview = document.getElementById('sb-tpl-preview-' + idx);
    if (preview) {
      const fakeParts = _previewSpin(tpl.value);
      if (fakeParts.length === 1) {
        preview.textContent = '▶ ' + fakeParts[0].slice(0, 80) + (fakeParts[0].length > 80 ? '…' : '');
      } else {
        preview.innerHTML = fakeParts.map((p, i) =>
          `<span style="display:block;margin-bottom:1px;">✉️ ${(i+1)}: ${_esc(p.slice(0, 60))}${p.length > 60 ? '…' : ''}</span>`
        ).join('');
      }
    }
  }
  if (brig) {
    clearTimeout(_brigTimer);
    _brigTimer = setTimeout(() => {
      setConfig({ brigadista: brig.value.trim() });
      refreshPendingCount();
      _renderContent();
    }, 600);
  }
}

// Solo binds que requieren setup inicial (templates preview on load)
function _bindContentInputs() {
  document.querySelectorAll('[data-tpl]').forEach(ta => {
    const idx = Number(ta.dataset.tpl);
    const preview = document.getElementById('sb-tpl-preview-' + idx);
    if (preview) {
      const fakeParts = _previewSpin(ta.value);
      if (fakeParts.length === 1) {
        preview.textContent = '▶ ' + fakeParts[0].slice(0, 80) + (fakeParts[0].length > 80 ? '…' : '');
      } else {
        preview.innerHTML = fakeParts.map((p, i) =>
          `<span style="display:block;margin-bottom:1px;">✉️ ${(i+1)}: ${_esc(p.slice(0, 60))}${p.length > 60 ? '…' : ''}</span>`
        ).join('');
      }
    }
  });
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
      if (_tab === 'blast' && !isRunning()) { refreshPendingCount(); fetchGlobalStats(); }
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
  const totalProcessed = totalSent + kpis.failed + (kpis.no_wa || 0);
  const hasActivity = totalProcessed > 0 || running;

  // Timer — incluye micro-descansos stealth
  let timerLabel = '';
  if (countdown > 0) {
    const m = Math.floor(countdown / 60); const s = countdown % 60;
    const labels = { prewarm: '⏳ Preparando', delay: '⏱️ Próximo', pausa: '☕ Pausa', descanso: '😴 Descanso', cargando: '📥 Cargando', micro: '🫖 Micro-pausa' };
    timerLabel = `${labels[phase] || '⏱️'} ${m > 0 ? m + 'm ' : ''}${s}s`;
  } else if (phase === 'cargando') {
    timerLabel = '📥 Cargando...';
  }

  // Template risk analysis (cached — only recompute when templates change)
  const tplsHash = tpls.join('\n');
  if (_cachedTplsHash !== tplsHash) { _cachedTplsHash = tplsHash; _cachedAnalysis = analyzeTemplates(tpls); }
  const analysis = _cachedAnalysis || { level: 'ok', suggestions: [] };

  // Session stats
  const sessionStart = window.__blastSessionStart || Date.now();
  if (!window.__blastSessionStart && running) window.__blastSessionStart = Date.now();
  const elapsedMin = Math.max(1, (Date.now() - sessionStart) / 60000);
  const msgPerMin = totalProcessed > 0 ? (totalSent / elapsedMin).toFixed(1) : '0';
  const estRemaining = pending !== null && totalSent > 0 ? Math.round(pending / (totalSent / elapsedMin)) : null;

  // Ventana horaria
  const inWindow = isWithinBlastWindow();
  const peruTime = getPeruTimeStr();

  // Number health
  const ownNum = getOwnNumber();
  const nHealth = getNumberHealth();
  const nAuth = isNumberAuthorized();

  const gs = getGlobalStats();
  const pendingLabel = pending === null ? '...' : pending.toLocaleString('es-PE');
  const hasPending = pending === null || pending > 0;

  // Barra de progreso global: % hablado sobre total
  const gsTotal   = gs?.total_contacts ?? 0;
  const gsHablado = gs?.total_hablado  ?? 0;
  const gsPending = gs?.total_pending  ?? 0;
  const gsSent    = gs?.total_sent     ?? 0;
  const gsPct     = gsTotal > 0 ? Math.round((gsHablado / gsTotal) * 100) : 0;

  // Desglose por celular (by_number) — mostrar los que tienen actividad hoy
  const byNum = gs?.by_number ?? {};
  const byNumEntries = Object.entries(byNum)
    .filter(([, v]) => v.today > 0 || v.sent > 0)
    .sort(([, a], [, b]) => b.today - a.today)
    .slice(0, 6);

  return `<div style="padding:14px;display:flex;flex-direction:column;gap:12px;">

    <!-- ESTADO DEL NÚMERO -->
    <div style="background:${!ownNum ? S.dangerBg : nAuth === false ? S.warnBg : nHealth && !nHealth.can_send ? S.dangerBg : S.card};border:1px solid ${!ownNum ? '#fecaca' : nAuth === false ? '#fde68a' : S.border};border-radius:10px;padding:10px 12px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:${nHealth ? '6' : '0'}px;">
        <span style="font-size:16px;">${!ownNum ? '❌' : nAuth === false ? '🚫' : '📱'}</span>
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:700;color:${!ownNum ? S.danger : nAuth === false ? S.warn : S.text};">
            ${!ownNum ? 'Número no detectado' : nAuth === false ? 'Número no autorizado' : '+' + ownNum}
          </div>
          <div style="font-size:10px;color:${S.muted};">
            ${!ownNum ? 'Recargá WhatsApp Web para detectar el celular' : nAuth === false ? 'Este celular no está registrado para blast' : nAuth === true ? '✅ Registrado' : 'Verificando...'}
          </div>
        </div>
      </div>
      ${nHealth ? `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;font-size:10px;color:${S.muted};margin-top:4px;">
        <div>Hora: <b style="color:${nHealth.sent_last_hour >= nHealth.hourly_limit * 0.8 ? S.danger : S.text};">${nHealth.sent_last_hour}/${nHealth.hourly_limit}</b></div>
        <div>Hoy: <b style="color:${nHealth.sent_today >= nHealth.daily_limit * 0.8 ? S.danger : S.text};">${nHealth.sent_today}/${nHealth.daily_limit}</b></div>
        <div>Edad: <b>${nHealth.age_days}d</b></div>
      </div>
      ` : ''}
    </div>

    <!-- STATS GLOBALES DEL SERVIDOR -->
    <div style="background:${S.card};border:1px solid ${S.border};border-radius:10px;padding:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="font-size:11px;color:${S.muted};font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Progreso global — todos los celulares</div>
        <button id="sb-refresh" style="padding:4px 10px;border-radius:6px;border:1px solid ${S.border};background:${S.bg};color:${S.muted};font-size:11px;cursor:pointer;">↻</button>
      </div>

      <!-- Tres contadores grandes -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">
        <div style="background:${S.bg};border:1px solid ${S.border};border-radius:8px;padding:10px 6px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:${S.accent};">${gs ? gsPending.toLocaleString('es-PE') : '...'}</div>
          <div style="font-size:10px;color:${S.muted};margin-top:2px;">Pendientes</div>
        </div>
        <div style="background:${S.bg};border:1px solid ${S.border};border-radius:8px;padding:10px 6px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:#6b7280;">${gs ? gsHablado.toLocaleString('es-PE') : '...'}</div>
          <div style="font-size:10px;color:${S.muted};margin-top:2px;">Hablados</div>
        </div>
        <div style="background:${S.bg};border:1px solid ${S.border};border-radius:8px;padding:10px 6px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:${S.text};">${gs ? gsTotal.toLocaleString('es-PE') : '...'}</div>
          <div style="font-size:10px;color:${S.muted};margin-top:2px;">Total</div>
        </div>
      </div>

      <!-- Barra de progreso -->
      ${gs ? `
      <div style="margin-bottom:${byNumEntries.length ? '10' : '0'}px;">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:${S.muted};margin-bottom:4px;">
          <span>Completado</span>
          <span style="font-weight:700;color:${gsPct >= 80 ? S.accent : S.text};">${gsPct}%</span>
        </div>
        <div style="height:6px;background:${S.border};border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${gsPct}%;background:${gsPct >= 80 ? S.accent : gsPct >= 50 ? S.blue : S.warn};border-radius:3px;transition:width .4s ease;"></div>
        </div>
      </div>
      ` : ''}

      <!-- Desglose por celular (solo si hay datos hoy) -->
      ${byNumEntries.length ? `
      <div style="border-top:1px solid ${S.border};padding-top:8px;">
        <div style="font-size:10px;color:${S.muted};font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Hoy por celular</div>
        <div style="display:flex;flex-direction:column;gap:3px;">
          ${byNumEntries.map(([num, v]) => `
            <div style="display:flex;align-items:center;gap:6px;font-size:11px;">
              <span style="color:${S.muted};font-size:10px;min-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="+${num}">${v.label ? _esc(v.label) : '+' + num.slice(-4)}</span>
              <div style="flex:1;height:4px;background:${S.border};border-radius:2px;overflow:hidden;">
                <div style="height:100%;width:${gsTotal > 0 ? Math.min(100, Math.round((v.sent / gsTotal) * 100 * 6)) : 0}%;background:${S.accent};border-radius:2px;"></div>
              </div>
              <span style="font-weight:700;color:${S.text};min-width:28px;text-align:right;">${v.today}</span>
              <span style="color:${S.muted};font-size:10px;">hoy</span>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}
    </div>

    <!-- KPIs -->
    ${hasActivity ? `
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;">
      ${[
        ['✓',   kpis.sent,           'Enviado',   '#6b7280'],
        ['✓✓',  kpis.delivered,      'Entregado', S.accent],
        ['<span style="color:#53bdeb;">✓✓</span>', kpis.read, 'Leído', '#53bdeb'],
        ['✗',   kpis.failed,         'Fallido',   S.danger],
        ['📵',  kpis.no_wa || 0,     'Sin WA',    '#9ca3af'],
      ].map(([icon, val, label, color]) => `
        <div style="background:${S.card};border:1px solid ${S.border};border-radius:8px;padding:8px 4px;text-align:center;">
          <div style="font-size:16px;font-weight:800;color:${color};">${val}</div>
          <div style="font-size:9px;color:${S.muted};margin-top:2px;">${icon} ${label}</div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <!-- VENTANA HORARIA + STEALTH STATS -->
    <div style="background:${inWindow ? S.accentBg : S.dangerBg};border:1px solid ${inWindow ? 'rgba(37,211,102,0.3)' : '#fecaca'};border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:10px;">
      <span style="font-size:18px;">${inWindow ? '🟢' : '🔴'}</span>
      <div style="flex:1;">
        <div style="font-size:11px;font-weight:700;color:${inWindow ? S.accent : S.danger};">${inWindow ? 'Ventana activa' : 'Fuera de horario'}</div>
        <div style="font-size:10px;color:${S.muted};">Perú ${peruTime} · Lun-Vie 8-20h · Sáb 9-14h</div>
      </div>
    </div>

    <!-- STEALTH STATS (solo con actividad) -->
    ${hasActivity ? `
    <div style="background:${S.card};border:1px solid ${S.border};border-radius:10px;padding:10px 12px;">
      <div style="font-size:10px;color:${S.muted};text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Sesión actual</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;font-size:11px;">
        <div><span style="color:${S.muted};">Velocidad</span><br><b>${msgPerMin} msg/min</b></div>
        <div><span style="color:${S.muted};">Est. restante</span><br><b>${estRemaining !== null ? (estRemaining > 60 ? Math.round(estRemaining / 60) + 'h' : estRemaining + ' min') : '—'}</b></div>
        <div><span style="color:${S.muted};">Plantilla</span><br><b>#${(getTplIndex() % tpls.length) + 1} de ${tpls.length}</b></div>
      </div>
      ${(() => {
        const spam = getLastSpamResult();
        if (!spam || spam.riskLevel === 'low' || !spam.score) return '';
        const isHigh = spam.riskLevel === 'critical' || spam.riskLevel === 'high';
        const color = isHigh ? S.danger : S.warn;
        const bg = isHigh ? S.dangerBg : S.warnBg;
        return `
        <div style="margin-top:8px;background:${bg};border:1px solid ${isHigh ? '#fecaca' : '#fde68a'};border-radius:8px;padding:8px 10px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
            <span style="font-size:12px;">${isHigh ? '🚨' : '⚠️'}</span>
            <span style="font-size:11px;font-weight:700;color:${color};">Spam: ${spam.riskLevel.toUpperCase()} (${spam.score}/100)</span>
          </div>
          ${spam.warnings.slice(0, 3).map(w => `<div style="font-size:10px;color:${S.muted};padding-left:20px;">● ${_esc(w)}</div>`).join('')}
          ${spam.actions.length ? spam.actions.slice(0, 2).map(a => `<div style="font-size:10px;color:${color};padding-left:20px;font-weight:600;">→ ${_esc(a)}</div>`).join('') : ''}
          ${spam.repeatedTexts?.length ? `
            <div style="margin-top:6px;padding-left:20px;">
              <div style="font-size:9px;color:${color};font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">Mensajes repetidos:</div>
              ${spam.repeatedTexts.slice(0, 3).map(rt => `
                <div style="font-size:10px;color:${S.muted};padding:3px 6px;margin-bottom:2px;background:rgba(0,0,0,0.03);border-radius:4px;border-left:2px solid ${color};">
                  <span style="color:${color};font-weight:600;">${rt.count}x</span> "${_esc(rt.text.length > 80 ? rt.text.slice(0, 80) + '…' : rt.text)}"
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>`;
      })()}
    </div>
    ` : ''}

    <!-- TEMPLATE RISK ANALYSIS -->
    ${analysis.score > 0 ? `
    <div style="background:${analysis.level === 'danger' ? S.dangerBg : analysis.level === 'warning' ? S.warnBg : S.card};border:1px solid ${analysis.level === 'danger' ? '#fecaca' : analysis.level === 'warning' ? '#fde68a' : S.border};border-radius:10px;padding:10px 12px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="font-size:14px;">${analysis.level === 'danger' ? '🚨' : analysis.level === 'warning' ? '⚠️' : '✅'}</span>
        <div>
          <div style="font-size:11px;font-weight:700;color:${analysis.level === 'danger' ? S.danger : analysis.level === 'warning' ? S.warn : S.accent};">
            Riesgo: ${analysis.level === 'danger' ? 'ALTO' : analysis.level === 'warning' ? 'MEDIO' : 'BAJO'} (${analysis.score} pts)
          </div>
        </div>
      </div>
      ${analysis.suggestions.length ? `
      <div style="display:flex;flex-direction:column;gap:3px;">
        ${analysis.suggestions.slice(0, 4).map(s => `
          <div style="font-size:10px;color:${S.muted};padding-left:22px;">→ ${_esc(s)}</div>
        `).join('')}
      </div>
      ` : ''}
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

    <!-- FILTRO BRIGADISTA -->
    <div style="background:${S.card};border:1px solid ${cfg.brigadista ? S.accent : S.border};border-radius:10px;padding:10px 12px;">
      <div style="font-size:11px;font-weight:700;color:${S.muted};margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">
        Filtrar por brigadista
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        <input type="text" id="sb-brigadista-input" placeholder="Ej: Ricardo Reaño" value="${_esc(cfg.brigadista || '')}" style="
          flex:1;padding:7px 10px;border:1px solid ${S.border};border-radius:6px;
          background:${S.bg};color:${S.text};font-size:12px;outline:none;
        " />
        ${cfg.brigadista ? `<button id="sb-brigadista-clear" style="padding:6px 10px;border-radius:6px;border:1px solid ${S.border};background:${S.bg};color:${S.danger};font-size:11px;font-weight:700;cursor:pointer;">✕</button>` : ''}
      </div>
      ${cfg.brigadista ? `<div style="font-size:10px;color:${S.accent};margin-top:4px;font-weight:600;">Filtrando solo contactos de: ${_esc(cfg.brigadista)}</div>` : ''}
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
        <div><code style="color:${S.accent};background:rgba(37,211,102,0.1);padding:1px 5px;border-radius:3px;font-weight:600;">[Hola!|Buenas!|Qué tal!]</code> → elige una al azar</div>
        <div><code style="color:${S.accent};background:rgba(37,211,102,0.1);padding:1px 5px;border-radius:3px;font-weight:600;">---</code> → corte: envía como mensaje separado</div>
        <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;">
          ${['{{nombre}}','{{brigadista}}','{{departamento}}','{{distrito}}','{{saludo}}','{{cierre}}','{{emoji}}','{{fecha}}'].map(v =>
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

    </div>

    <!-- CHECKPOINT UI -->
    ${(() => {
      const cp = getCheckpoint();
      const bs = getBlockSent();
      if (!running && !cp) return '';
      const pct10 = cp ? Math.min(100, Math.round((cp.response_rate / 0.10) * 100)) : 0;
      const pct50 = cp ? Math.min(100, Math.round((cp.response_rate / 0.50) * 100)) : 0;
      const rPct  = cp ? Math.round(cp.response_rate * 100) : 0;
      // Barra de progreso del bloque actual (enviados hacia 50)
      const blockPct = Math.min(100, Math.round((bs / 50) * 100));
      return `
      <div style="background:${S.card};border:2px solid ${cp?.unlocked_50 ? S.accent : cp?.unlocked_10 ? S.warn : S.border};border-radius:12px;padding:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div style="font-size:12px;font-weight:700;color:${S.text};">
            ${cp ? '⏸ Checkpoint — esperando respuestas' : `📦 Bloque actual: ${bs}/50`}
          </div>
          ${cp ? `<span style="font-size:14px;font-weight:800;color:${rPct>=50?S.accent:rPct>=10?S.warn:S.danger};">${rPct}%</span>` : ''}
        </div>

        ${!cp ? `
          <!-- Progreso de envío hacia 50 -->
          <div style="margin-bottom:4px;">
            <div style="height:6px;background:${S.border};border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${blockPct}%;background:${S.accent};border-radius:3px;transition:width .3s;"></div>
            </div>
            <div style="font-size:10px;color:${S.muted};margin-top:3px;">${bs} enviados de 50 → checkpoint automático</div>
          </div>
        ` : `
          <!-- Barra hacia 10% (desbloqueo vista) -->
          <div style="margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;font-size:10px;color:${S.muted};margin-bottom:3px;">
              <span>Vista (10%)</span>
              <span style="font-weight:700;color:${cp.unlocked_10?S.accent:S.muted};">${cp.unlocked_10?'✓ Desbloqueado':'Esperando...'}</span>
            </div>
            <div style="height:5px;background:${S.border};border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${pct10}%;background:${S.warn};border-radius:3px;transition:width .4s;"></div>
            </div>
          </div>
          <!-- Barra hacia 50% (desbloqueo envío) -->
          <div>
            <div style="display:flex;justify-content:space-between;font-size:10px;color:${S.muted};margin-bottom:3px;">
              <span>Enviar siguientes 50 (50%)</span>
              <span style="font-weight:700;color:${cp.unlocked_50?S.accent:S.muted};">${cp.unlocked_50?'✓ Listo':`${cp.responded}/${Math.ceil(cp.sent*0.5)} respuestas`}</span>
            </div>
            <div style="height:5px;background:${S.border};border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${pct50}%;background:${cp.unlocked_50?S.accent:'#3b82f6'};border-radius:3px;transition:width .4s;"></div>
            </div>
          </div>
          <div style="font-size:10px;color:${S.muted};margin-top:6px;">
            ${cp.responded} de ${cp.sent} respondieron · actualizando cada 30s
          </div>
        `}
      </div>`;
    })()}

    <!-- TIMER + LOG -->
    ${hasActivity ? `
    <div style="background:${S.card};border:1px solid ${S.border};border-radius:10px;padding:12px;">
      ${timerLabel ? `<div id="sb-timer-label" style="font-size:12px;color:${S.accent};font-weight:600;margin-bottom:8px;">${timerLabel}</div>` : '<div id="sb-timer-label" style="display:none"></div>'}
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

    <!-- PREVIEW — muestra próximos contactos antes de arrancar -->
    ${isPreviewLoading() ? `
      <div style="background:${S.card};border:1px solid ${S.border};border-radius:12px;padding:16px;text-align:center;">
        <div style="font-size:13px;color:${S.muted};">Cargando preview...</div>
      </div>
    ` : getPreviewContacts().length > 0 && !isPreviewReady() && !running ? `
      <div style="background:${S.card};border:1px solid ${S.border};border-radius:12px;padding:14px;">
        <div style="font-size:12px;font-weight:700;color:${S.text};margin-bottom:10px;">
          👁 Próximos a enviar — revisá antes de confirmar
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
          ${getPreviewContacts().map(c => {
            const nombre = ((c.nombre || '') + ' ' + (c.apellidos || '')).trim() || '— Sin nombre';
            return `
            <div style="
              display:flex;align-items:center;gap:8px;padding:8px 10px;
              background:${S.bg};border:1px solid ${S.border};border-radius:8px;
            ">
              <div style="flex:1;min-width:0;">
                <div style="font-size:12px;font-weight:600;color:${S.text};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                  ${_esc(nombre)}
                </div>
                <div style="font-size:10px;color:${S.muted};margin-top:1px;">
                  +${_esc(c.telefono || '?')}
                  ${c.departamento ? ` · ${_esc(c.departamento)}` : ''}
                  ${c.heat_score === 2 ? ' 🔥' : ''}
                </div>
              </div>
              <button data-skip="${_esc(c.id)}" title="Saltear (marca hablado)" style="padding:4px 10px;border-radius:5px;border:1px solid ${S.border};background:${S.bg};color:${S.muted};font-size:10px;cursor:pointer;flex-shrink:0;">Saltear</button>
              <button data-markhablado="${_esc(c.id)}" title="Ya le hablamos" style="padding:4px 10px;border-radius:5px;border:1px solid #fecaca;background:#fef2f2;color:${S.danger};font-size:10px;font-weight:600;cursor:pointer;flex-shrink:0;">✓ Hablado</button>
            </div>`;
          }).join('')}
        </div>
        <div style="display:flex;gap:8px;">
          <button id="sb-preview-cancel" style="
            flex:1;padding:10px;border-radius:8px;border:1px solid ${S.border};
            background:${S.bg};color:${S.muted};font-size:13px;font-weight:600;cursor:pointer;
          ">✕ Cancelar</button>
          <button id="sb-preview-confirm" style="
            flex:2;padding:10px;border-radius:8px;border:none;
            background:${S.accent};color:#fff;font-size:13px;font-weight:700;cursor:pointer;
            box-shadow:0 2px 8px ${S.accent}40;
          ">▶ Confirmar y enviar</button>
        </div>
      </div>
    ` : ''}

    <!-- CONTROLES -->
    ${!running && !paused && hasPending && !isPreviewLoading() && getPreviewContacts().length === 0 ? `
      ${!inWindow ? `
        <div style="text-align:center;padding:12px;background:${S.dangerBg};border:1px solid #fecaca;border-radius:10px;font-size:12px;color:${S.danger};font-weight:600;">
          🔴 No se puede enviar fuera de horario (${peruTime})
        </div>
      ` : analysis.level === 'danger' ? `
        <div style="margin-bottom:6px;text-align:center;padding:8px;background:${S.dangerBg};border:1px solid #fecaca;border-radius:8px;font-size:11px;color:${S.danger};">
          ⚠️ Las plantillas tienen riesgo ALTO — revisá las sugerencias arriba
        </div>
        <button id="sb-start" data-force="true" style="
          width:100%;padding:14px;border-radius:10px;border:1px solid ${S.danger};
          background:${S.dangerBg};color:${S.danger};font-size:15px;font-weight:700;cursor:pointer;
        ">⚠️ Enviar igual a ${cfg.batchSize} personas</button>
      ` : `
        <button id="sb-start" style="
          width:100%;padding:14px;border-radius:10px;border:none;
          background:${S.accent};color:#fff;font-size:15px;font-weight:700;cursor:pointer;
          box-shadow:0 2px 12px ${S.accent}40;
        ">▶ Enviar a ${cfg.batchSize} personas</button>
      `}
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

// ── ACK icon — fuera de _blastHTML para no recrearla en cada render ──
function _ackIcon(ack) {
  if (ack === -1) return '✗';
  if (ack === 0)  return '🕐';
  if (ack === 1)  return '✓';
  if (ack === 2)  return '✓✓';
  if (ack >= 3)   return '<span style="color:#53bdeb;">✓✓</span>';
  return '🕐';
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

// _bindContent eliminado — todos los eventos se manejan por delegación
// en _handleDelegatedClick/_handleDelegatedChange/_handleDelegatedInput
// registrados UNA sola vez en _renderContent()

// ── Preview spin (versión simplificada para mostrar cómo queda el template) ─
function _previewSpin(tpl) {
  const now = new Date();
  const parts = tpl.split(/^[ \t]*---[ \t]*$/m);
  return parts.map(part => {
    // Resolver [opción1|opción2] — elegir siempre la primera para que sea predecible
    const spun = part.replace(/\[([^\]]+)\]/g, (_, inner) => inner.split('|')[0]);
    return spun
      .replace(/\{\{nombre\}\}/gi, 'María')
      .replace(/\{\{brigadista\}\}/gi, 'Alberto')
      .replace(/\{\{departamento\}\}/gi, 'Lambayeque')
      .replace(/\{\{distrito\}\}/gi, 'Chiclayo')
      .replace(/\{\{saludo\}\}/gi, 'Hola')
      .replace(/\{\{cierre\}\}/gi, 'Saludos!')
      .replace(/\{\{emoji\}\}/gi, '👋')
      .replace(/\{\{fecha\}\}/gi, now.toLocaleDateString('es-PE'))
      .replace(/\{\{hora\}\}/gi, now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }))
      .trim();
  }).filter(p => p.length > 0);
}

// ── Toast ─────────────────────────────────────────────────────────────
function _toast(text, bg = S.accent) {
  const t = document.createElement('div');
  Object.assign(t.style, { position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)', background: bg, color: '#fff', padding: '8px 18px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', zIndex: String(Z.toasts), boxShadow: '0 4px 16px rgba(0,0,0,.2)' });
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

// CD-1: Legacy exports removed — verified no imports exist in inject-entry.js or any module.
// If a future module needs these, re-add as needed.
