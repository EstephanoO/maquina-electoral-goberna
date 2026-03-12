// audio-catalog-panel.js — panel de catálogo de audios pre-generados.
// Compact, scalable UI — adapts to any screen size.
// Consultor / audio_admin: crear, editar guión, regenerar audio, eliminar.
// Agente digital: send-only.

import { WA_ORIGIN, _catalogIsConsultor } from './bootstrap.js';
import { _lastActiveChatJid } from './wa-module-installer.js';

// ── State ───────────────────────────────────────────────────────────
let _catalogItems = [];
let _catalogCategories = [];
let _catalogCategoriesLoading = false;
let _catalogPanelOpen = false;
let _catalogLoading = false;
let _catalogEditingId = null;
let _catalogView = 'grid'; // 'grid' | 'category' | 'detail' | 'create'
let _catalogDetailId = null;
let _catalogCategory = null;

let _pendingRegenId = null;
let _pendingRegenBtn = null;
let _pendingUpdateId = null;
let _pendingUpdateBtn = null;
let _pendingDeleteId = null;
let _pendingDeleteBtn = null;
let _pendingCreateBtn = null;
let _pendingDeleteCatBtn = null;

// ── Preview player state ────────────────────────────────────────────
let _previewAudio = null;       // HTMLAudioElement
let _previewData = null;        // { audioBase64, mimeType, label, id }
let _previewPlaying = false;
let _previewLoadingId = null;   // id of item currently being fetched for preview
let _previewRAF = null;         // requestAnimationFrame id for progress updates

// ── Inline SVG icons ────────────────────────────────────────────────
const I = {
  mic:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
  send:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`,
  refresh: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
  edit:    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  close:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  check:   `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  back:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
  plus:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  trash:   `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
  noaudio: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  play:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  pause:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
  stop:    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
};

// Category-specific icons
const CAT_ICONS = {
  saludo:             `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`,
  agradecimiento:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  pedir_voto:         `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  respuesta_trabajo:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  respuesta_dinero:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  invitacion_evento:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  despedida:          `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  propuestas:         `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  cuando_llaman:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  impulsar_canal:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  agendar:            `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  apoyo_historico:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  opiniones:          `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  pedir_apoyo:        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  compartir_canal:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
  saludos:            `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`,
  cerrar_conv:        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>`,
  compartir_mensaje:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  mantener_contacto:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
  responder_opiniones:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>`,
};

const _DEFAULT_ACCENT = '#8696a0';
const _DEFAULT_SVG = I.mic;

function _getCatLabel(k) { return _catalogCategories.find(c => c.key === k)?.label || k; }
function _hexToRgba(hex, a) { const h = hex.replace('#',''); return `rgba(${parseInt(h.substring(0,2),16)},${parseInt(h.substring(2,4),16)},${parseInt(h.substring(4,6),16)},${a})`; }
function _getCatColors(k) { const cat = _catalogCategories.find(c => c.key === k); const ac = cat?.color || _DEFAULT_ACCENT; return { bg: _hexToRgba(ac, 0.13), accent: ac }; }
function _getCatIcon(k) { const cat = _catalogCategories.find(c => c.key === k); const ik = cat?.icon || k; return CAT_ICONS[ik] || CAT_ICONS[k] || _DEFAULT_SVG; }
function _getCatSortOrder(k) { return _catalogCategories.find(c => c.key === k)?.sort_order ?? 999; }
function _getCatId(k) { return _catalogCategories.find(c => c.key === k)?.id || null; }
function _fmtDur(ms) { if (!ms) return ''; const s = Math.round(ms/1000); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }

// ── Styles (injected once) ──────────────────────────────────────────
function _injectStyles() {
  if (document.getElementById('wspp-cat-css')) return;
  const s = document.createElement('style'); s.id = 'wspp-cat-css';
  s.textContent = `
    @keyframes wspp-su{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
    @keyframes wspp-sp{from{transform:rotate(0)}to{transform:rotate(360deg)}}
    .wspp-sp{animation:wspp-sp .7s linear infinite}
    #wspp-cat-panel{position:fixed;bottom:128px;right:12px;z-index:99999;
      width:min(310px,calc(100vw - 24px));max-height:min(460px,calc(100vh - 170px));
      background:#111;border-radius:16px;overflow:hidden;display:flex;flex-direction:column;
      font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;
      animation:wspp-su .2s cubic-bezier(.16,1,.3,1);
      box-shadow:0 8px 40px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.06)}
    #wspp-cat-panel *{box-sizing:border-box}
    .wc-hdr{display:flex;align-items:center;gap:6px;padding:10px 12px 8px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;background:#111}
    .wc-body{overflow-y:auto;flex:1;scrollbar-width:thin;scrollbar-color:#333 transparent}
    .wc-row{display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer;transition:background .1s}
    .wc-row:hover{background:rgba(255,255,255,.04)}
    .wc-row:last-child{border-bottom:none}
    .wc-chip{display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:20px;cursor:pointer;transition:transform .1s,background .1s;white-space:nowrap;flex-shrink:0;border:none;font-family:inherit}
    .wc-chip:active{transform:scale(.93)}
    .wc-ibtn{background:none;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:opacity .12s}
    .wc-ibtn:hover{opacity:.8}
    .wc-input{width:100%;padding:8px 10px;background:#1a1a1c;border:1px solid rgba(255,255,255,.08);border-radius:10px;color:#e9edef;font-size:12px;font-family:inherit;outline:none}
    .wc-input:focus{border-color:#00a884}
    .wc-textarea{resize:none;min-height:64px;line-height:1.5}
    .wc-btn{width:100%;padding:9px;border-radius:10px;border:none;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;transition:background .15s;font-family:inherit}
    .wc-lbl{font-size:10px;color:#666;font-weight:600;text-transform:uppercase;letter-spacing:.3px;margin-bottom:3px}
    .wc-toast{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);padding:6px 14px;border-radius:20px;font-size:11px;font-weight:600;pointer-events:none;z-index:10;transition:opacity .3s;white-space:nowrap;max-width:90%}
    select.wc-input option{background:#1a1a1c;color:#e9edef}
    .wc-preview{display:flex;align-items:center;gap:6px;padding:8px 10px;background:#1a1a1c;border-top:1px solid rgba(255,255,255,.08);flex-shrink:0}
    .wc-preview-play{width:30px;height:30px;border-radius:50%;border:none;background:#00a884;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .12s}
    .wc-preview-play:hover{background:#00c49a}
    .wc-preview-play:active{transform:scale(.92)}
    .wc-preview-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
    .wc-preview-name{font-size:11px;font-weight:600;color:#e9edef;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .wc-preview-track{position:relative;width:100%;height:4px;background:rgba(255,255,255,.08);border-radius:2px;cursor:pointer}
    .wc-preview-fill{position:absolute;left:0;top:0;height:100%;background:#00a884;border-radius:2px;transition:width .05s linear}
    .wc-preview-time{font-size:9px;color:#666;font-variant-numeric:tabular-nums}
    .wc-preview-send{height:28px;padding:0 10px;border-radius:14px;border:none;background:#00a884;color:#fff;font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;flex-shrink:0;transition:background .12s;font-family:inherit;white-space:nowrap}
    .wc-preview-send:hover{background:#00c49a}
    .wc-preview-send:active{transform:scale(.95)}
  `;
  (document.head || document.documentElement).appendChild(s);
}

// ── DOM helpers ──────────────────────────────────────────────────────
function _el(tag, styles, attrs) {
  const e = document.createElement(tag);
  if (styles) Object.assign(e.style, styles);
  if (attrs) Object.entries(attrs).forEach(([k,v]) => { if (k === 'cls') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k === 'txt') e.textContent = v; else e.setAttribute(k, v); });
  return e;
}

function _iconBtn(svg, color, title, onClick) {
  const b = _el('button', { color: color || '#8696a0', width: '24px', height: '24px', borderRadius: '6px', flexShrink: '0' }, { cls: 'wc-ibtn', html: svg, title: title || '' });
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(e); });
  return b;
}

// ── FAB button ──────────────────────────────────────────────────────
function createCatalogButton() {
  const btn = _el('button', {
    position: 'fixed', bottom: '72px', right: '18px', zIndex: '99999',
    width: '44px', height: '44px', borderRadius: '50%', border: 'none',
    background: 'linear-gradient(135deg,#00a884,#008f72)', color: '#fff',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 3px 12px rgba(0,168,132,.4), 0 1px 3px rgba(0,0,0,.3)',
    transition: 'box-shadow .2s, transform .15s',
  }, { html: I.mic });
  btn.id = 'wspp-catalog-btn';
  btn.title = 'Audios César Vásquez';
  btn.addEventListener('mouseenter', () => { if (!_catalogPanelOpen) btn.style.transform = 'scale(1.08)'; });
  btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });
  btn.addEventListener('click', toggleCatalogPanel);
  document.body.appendChild(btn);
  return btn;
}

// ── Toggle panel ────────────────────────────────────────────────────
function toggleCatalogPanel() {
  const existing = document.getElementById('wspp-cat-panel');
  if (existing) { _closePanel(); return; }
  _catalogPanelOpen = true;
  const fab = document.getElementById('wspp-catalog-btn');
  if (fab) fab.style.boxShadow = '0 0 0 3px rgba(0,168,132,.35), 0 3px 12px rgba(0,168,132,.4)';
  if (_catalogItems.length === 0 && !_catalogLoading) { _catalogLoading = true; window.postMessage({ type: 'FETCH_AUDIO_CATALOG' }, WA_ORIGIN); }
  if (_catalogCategories.length === 0 && !_catalogCategoriesLoading) { _catalogCategoriesLoading = true; window.postMessage({ type: 'FETCH_CATALOG_CATEGORIES' }, WA_ORIGIN); }
  renderCatalogPanel();
}

function _closePanel() {
  _destroyPreview();
  const p = document.getElementById('wspp-cat-panel'); if (p) p.remove();
  _catalogPanelOpen = false; _catalogView = 'grid'; _catalogDetailId = null; _catalogCategory = null; _catalogEditingId = null;
  const fab = document.getElementById('wspp-catalog-btn');
  if (fab) fab.style.boxShadow = '0 3px 12px rgba(0,168,132,.4), 0 1px 3px rgba(0,0,0,.3)';
}

// ── Render dispatcher ───────────────────────────────────────────────
function renderCatalogPanel() {
  _injectStyles();
  let panel = document.getElementById('wspp-cat-panel');
  if (!panel) { panel = _el('div'); panel.id = 'wspp-cat-panel'; document.body.appendChild(panel); }
  panel.innerHTML = '';

  if (_catalogView === 'detail' && _catalogDetailId) _renderDetail(panel);
  else if (_catalogView === 'create') _renderCreate(panel);
  else if (_catalogView === 'category' && _catalogCategory) _renderCategory(panel);
  else { _catalogView = 'grid'; _renderGrid(panel); }

  // Preview bar (persistent footer when audio is loaded or loading)
  if (_previewData || _previewLoadingId) _renderPreviewBar(panel);
}

// ── Header builder ──────────────────────────────────────────────────
function _mkHdr(title, onBack, rightEls) {
  const h = _el('div', {}, { cls: 'wc-hdr' });
  if (onBack) {
    h.appendChild(_iconBtn(I.back, '#00a884', 'Volver', onBack));
  } else {
    const pill = _el('div', { width: '24px', height: '24px', borderRadius: '7px', background: 'linear-gradient(135deg,#00a884,#007a62)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: '0' }, { html: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>` });
    h.appendChild(pill);
  }
  const t = _el('div', { flex: '1', color: '#fff', fontSize: '13px', fontWeight: '700', letterSpacing: '-.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, { txt: title });
  h.appendChild(t);
  if (rightEls) rightEls.forEach(el => h.appendChild(el));
  h.appendChild(_iconBtn(I.close, '#666', 'Cerrar', _closePanel));
  return h;
}

// ── Toast ───────────────────────────────────────────────────────────
function _toast(text, color, ms) {
  const panel = document.getElementById('wspp-cat-panel'); if (!panel) return;
  let t = panel.querySelector('.wc-toast'); if (t) t.remove();
  t = _el('div', { background: color === '#ef5350' ? 'rgba(239,83,80,.9)' : color === '#f59e0b' ? 'rgba(245,158,11,.9)' : 'rgba(0,168,132,.9)', color: '#fff' }, { cls: 'wc-toast', txt: text });
  panel.appendChild(t);
  if (ms) setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, ms);
}

// ── Spinner element ─────────────────────────────────────────────────
function _spinner(size, color) {
  const s = _el('div', { width: size+'px', height: size+'px', borderRadius: '50%', border: `2px solid rgba(255,255,255,.15)`, borderTopColor: color || '#00a884', flexShrink: '0' }, { cls: 'wspp-sp' });
  return s;
}

// ═══════════════════════════════════════════════════════════════════════
// GRID VIEW — compact chip-based category list
// ═══════════════════════════════════════════════════════════════════════
function _renderGrid(panel) {
  const loading = _catalogLoading && _catalogItems.length === 0;
  const rightBtns = [];
  if (_catalogIsConsultor) {
    rightBtns.push(_iconBtn(I.plus, '#00a884', 'Crear plantilla', () => { _catalogCategory = null; _catalogView = 'create'; renderCatalogPanel(); }));
  }
  panel.appendChild(_mkHdr('César Vásquez', null, rightBtns));

  const body = _el('div', {}, { cls: 'wc-body' });

  if (loading) {
    const w = _el('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', gap: '8px' });
    w.appendChild(_spinner(18, '#00a884'));
    w.appendChild(_el('div', { color: '#666', fontSize: '11px' }, { txt: 'Cargando...' }));
    body.appendChild(w);
  } else if (_catalogItems.length === 0 && _catalogCategories.length === 0) {
    body.appendChild(_el('div', { color: '#666', textAlign: 'center', padding: '24px 0', fontSize: '12px' }, { txt: 'Sin plantillas disponibles' }));
  } else {
    // Group by category
    const grouped = {};
    _catalogItems.forEach(item => { if (!grouped[item.category]) grouped[item.category] = []; grouped[item.category].push(item); });
    _catalogCategories.forEach(cat => { if (!grouped[cat.key]) grouped[cat.key] = []; });
    const cats = Object.keys(grouped).sort((a, b) => _getCatSortOrder(a) - _getCatSortOrder(b));

    const list = _el('div', { padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '3px' });

    cats.forEach(cat => {
      const items = grouped[cat];
      const colors = _getCatColors(cat);
      const readyCount = items.filter(i => i.has_audio).length;

      const row = _el('div', {
        display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 8px',
        borderRadius: '10px', cursor: 'pointer', transition: 'background .1s',
      });
      row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,255,255,.04)'; });
      row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });

      // Icon
      const ic = _el('div', {
        width: '30px', height: '30px', borderRadius: '8px', flexShrink: '0',
        background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.accent,
      }, { html: _getCatIcon(cat) });
      row.appendChild(ic);

      // Label + count
      const txt = _el('div', { flex: '1', minWidth: '0' });
      const lbl = _el('div', { fontSize: '12px', fontWeight: '600', color: '#e9edef', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, { txt: _getCatLabel(cat) });
      const sub = _el('div', { fontSize: '10px', color: '#666' }, { txt: `${readyCount}/${items.length} listos` });
      txt.appendChild(lbl); txt.appendChild(sub);
      row.appendChild(txt);

      // Chevron
      row.appendChild(_el('div', { color: '#444', flexShrink: '0' }, { html: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>` }));

      row.addEventListener('click', () => { _catalogCategory = cat; _catalogView = 'category'; renderCatalogPanel(); });
      list.appendChild(row);
    });

    body.appendChild(list);
  }

  panel.appendChild(body);
}

// ═══════════════════════════════════════════════════════════════════════
// CATEGORY VIEW — list of items, compact rows with inline send
// ═══════════════════════════════════════════════════════════════════════
function _renderCategory(panel) {
  const cat = _catalogCategory;
  const items = _catalogItems.filter(i => i.category === cat).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const colors = _getCatColors(cat);

  const rightBtns = [];
  if (_catalogIsConsultor) {
    rightBtns.push(_iconBtn(I.plus, colors.accent, 'Agregar plantilla', () => { _catalogView = 'create'; renderCatalogPanel(); }));
    rightBtns.push(_iconBtn(I.trash, '#ef5350', 'Eliminar categoría', () => {
      if (!confirm(`¿Eliminar "${_getCatLabel(cat)}" y TODOS sus audios?`)) return;
      const catId = _getCatId(cat);
      if (!catId) { _toast('Categoría no encontrada', '#ef5350', 2500); return; }
      _handleDeleteCategory(catId, cat, null);
    }));
  }
  panel.appendChild(_mkHdr(_getCatLabel(cat), () => { _catalogView = 'grid'; renderCatalogPanel(); }, rightBtns));

  const body = _el('div', {}, { cls: 'wc-body' });

  if (items.length === 0) {
    body.appendChild(_el('div', { color: '#666', textAlign: 'center', padding: '20px 0', fontSize: '11px' }, { txt: 'Sin plantillas aquí' }));
  } else {
    items.forEach(item => {
      const isActive = _previewData?.id === item.id || _previewLoadingId === item.id;
      const row = _el('div', {}, { cls: 'wc-row' });
      row.style.cursor = item.has_audio ? 'pointer' : 'default';
      if (isActive) row.style.background = 'rgba(0,168,132,.08)';

      // Status dot (pulsing if active/loading)
      const dot = _el('div', {
        width: '8px', height: '8px', borderRadius: '50%', flexShrink: '0',
        background: isActive ? '#00a884' : item.has_audio ? colors.accent : '#444',
      });
      if (_previewLoadingId === item.id) { dot.style.animation = 'wspp-sp .7s linear infinite'; }
      row.appendChild(dot);

      // Label + duration
      const txt = _el('div', { flex: '1', minWidth: '0' });
      const lbl = _el('div', {
        fontSize: '12px', fontWeight: '600', color: item.has_audio ? '#e9edef' : '#555',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }, { txt: item.label });
      txt.appendChild(lbl);
      const dur = _fmtDur(item.duration_ms);
      if (dur) txt.appendChild(_el('div', { fontSize: '10px', color: '#555' }, { txt: dur }));
      row.appendChild(txt);

      // Edit button (consultor)
      if (_catalogIsConsultor) {
        row.appendChild(_iconBtn(I.edit, '#666', 'Editar', () => { _catalogDetailId = item.id; _catalogView = 'detail'; renderCatalogPanel(); }));
      }

      // Send on click (whole row)
      if (item.has_audio) {
        row.addEventListener('click', () => handleCatalogItemClick(item.id, item.label));
      }

      body.appendChild(row);
    });
  }

  panel.appendChild(body);
}

// ═══════════════════════════════════════════════════════════════════════
// DETAIL VIEW — edit item (consultor / audio_admin)
// ═══════════════════════════════════════════════════════════════════════
function _renderDetail(panel) {
  const item = _catalogItems.find(i => i.id === _catalogDetailId);
  if (!item) { _catalogView = 'category'; renderCatalogPanel(); return; }
  const colors = _getCatColors(item.category);

  panel.appendChild(_mkHdr(item.label, () => { _catalogView = 'category'; renderCatalogPanel(); }));

  const body = _el('div', { padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }, { cls: 'wc-body' });

  // Meta: category badge + duration
  const meta = _el('div', { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' });
  const badge = _el('div', { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: '700', color: colors.accent, background: colors.bg, padding: '2px 8px', borderRadius: '12px' });
  badge.innerHTML = _getCatIcon(item.category); badge.appendChild(document.createTextNode(' ' + _getCatLabel(item.category)));
  meta.appendChild(badge);
  const dur = _fmtDur(item.duration_ms);
  if (dur) meta.appendChild(_el('div', { fontSize: '10px', color: '#555' }, { txt: dur }));
  if (item.description) meta.appendChild(_el('div', { fontSize: '10px', color: '#666', flex: '1 0 100%' }, { txt: item.description }));
  body.appendChild(meta);

  // Script textarea
  body.appendChild(_el('div', {}, { cls: 'wc-lbl', txt: 'Guión' }));
  const ta = _el('textarea', { minHeight: '70px' }, { cls: 'wc-input wc-textarea' });
  ta.value = item.script_text || '';
  body.appendChild(ta);

  // Action buttons — compact row
  const acts = _el('div', { display: 'flex', flexDirection: 'column', gap: '6px' });

  const saveBtn = _el('button', { background: 'rgba(0,168,132,.13)', color: '#00a884' }, { cls: 'wc-btn', html: `${I.check} Guardar guión` });
  saveBtn.addEventListener('click', () => { const s = ta.value.trim(); if (!s) return; _handleUpdateScript(item.id, s, saveBtn); });
  acts.appendChild(saveBtn);

  const regenBtn = _el('button', { background: 'rgba(129,140,248,.13)', color: '#818cf8' }, { cls: 'wc-btn', html: `${I.refresh} Regenerar audio` });
  regenBtn.addEventListener('click', () => _handleRegenerate(item.id, regenBtn));
  acts.appendChild(regenBtn);

  const delBtn = _el('button', { background: 'rgba(239,83,80,.1)', color: '#ef5350' }, { cls: 'wc-btn', html: `${I.trash} Eliminar` });
  delBtn.addEventListener('click', () => { if (!confirm(`¿Eliminar "${item.label}"?`)) return; _handleDeleteItem(item.id, delBtn); });
  acts.appendChild(delBtn);

  body.appendChild(acts);
  panel.appendChild(body);
}

// ═══════════════════════════════════════════════════════════════════════
// CREATE VIEW — form to add new item
// ═══════════════════════════════════════════════════════════════════════
function _renderCreate(panel) {
  const preselectedCat = _catalogCategory || (_catalogCategories[0]?.key || 'saludo');
  const backTarget = _catalogCategory ? 'category' : 'grid';
  panel.appendChild(_mkHdr('Nueva plantilla', () => { _catalogView = backTarget; renderCatalogPanel(); }));

  const body = _el('div', { padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '7px' }, { cls: 'wc-body' });

  body.appendChild(_el('div', {}, { cls: 'wc-lbl', txt: 'Nombre' }));
  const labelInp = _el('input', {}, { cls: 'wc-input', type: 'text', placeholder: 'Ej: Saludo inicial' });
  body.appendChild(labelInp);

  body.appendChild(_el('div', {}, { cls: 'wc-lbl', txt: 'Descripción' }));
  const descInp = _el('input', {}, { cls: 'wc-input', type: 'text', placeholder: 'Para quién es este audio' });
  body.appendChild(descInp);

  body.appendChild(_el('div', {}, { cls: 'wc-lbl', txt: 'Categoría' }));
  const catSel = _el('select', { cursor: 'pointer', WebkitAppearance: 'none', appearance: 'none' }, { cls: 'wc-input' });
  _catalogCategories.slice().sort((a,b) => (a.sort_order??999)-(b.sort_order??999)).forEach(c => {
    const o = _el('option'); o.value = c.key; o.textContent = c.label; if (c.key === preselectedCat) o.selected = true; catSel.appendChild(o);
  });
  body.appendChild(catSel);

  body.appendChild(_el('div', {}, { cls: 'wc-lbl', txt: 'Guión' }));
  const scriptTa = _el('textarea', {}, { cls: 'wc-input wc-textarea', placeholder: 'Hola, habla el doctor César Vásquez...' });
  body.appendChild(scriptTa);

  // Order + Voice ID in one row
  const row2 = _el('div', { display: 'flex', gap: '8px' });
  const orderWrap = _el('div', { flex: '1' });
  orderWrap.appendChild(_el('div', {}, { cls: 'wc-lbl', txt: 'Orden' }));
  const sortInp = _el('input', {}, { cls: 'wc-input', type: 'number', min: '0', max: '999', value: '0' });
  orderWrap.appendChild(sortInp);
  row2.appendChild(orderWrap);
  const voiceWrap = _el('div', { flex: '2' });
  voiceWrap.appendChild(_el('div', {}, { cls: 'wc-lbl', txt: 'Voice ID (opcional)' }));
  const voiceInp = _el('input', {}, { cls: 'wc-input', type: 'text', placeholder: 'Voz por defecto' });
  voiceWrap.appendChild(voiceInp);
  row2.appendChild(voiceWrap);
  body.appendChild(row2);

  const createBtn = _el('button', { background: 'rgba(0,168,132,.13)', color: '#00a884', marginTop: '2px' }, { cls: 'wc-btn', html: `${I.check} Crear y generar audio` });
  createBtn.addEventListener('click', () => {
    const label = labelInp.value.trim();
    const script = scriptTa.value.trim();
    if (!label || !script) { _toast('Nombre y guión son obligatorios', '#ef5350', 2500); return; }
    _catalogCategory = catSel.value;
    _handleCreateItem({ label, description: descInp.value.trim(), category: catSel.value, script_text: script, sort_order: parseInt(sortInp.value,10)||0, voice_id: voiceInp.value.trim()||undefined }, createBtn);
  });
  body.appendChild(createBtn);

  panel.appendChild(body);
}

// ═══════════════════════════════════════════════════════════════════════
// ASYNC OPERATION HANDLERS
// ═══════════════════════════════════════════════════════════════════════
function _handleRegenerate(id, btn) {
  const orig = btn.innerHTML; btn.innerHTML = ''; btn.appendChild(_spinner(12, '#818cf8')); btn.disabled = true;
  _toast('Regenerando...', '#8696a0');
  window.postMessage({ type: 'GENERATE_CATALOG_AUDIO', id }, WA_ORIGIN);
  _pendingRegenId = id; _pendingRegenBtn = { el: btn, orig };
}

function _handleUpdateScript(id, text, btn) {
  const orig = btn.innerHTML; btn.textContent = 'Guardando...'; btn.disabled = true;
  window.postMessage({ type: 'UPDATE_CATALOG_SCRIPT', id, script_text: text }, WA_ORIGIN);
  _pendingUpdateId = id; _pendingUpdateBtn = { el: btn, orig };
}

function _handleDeleteItem(id, btn) {
  const orig = btn.innerHTML; btn.textContent = 'Eliminando...'; btn.disabled = true;
  window.postMessage({ type: 'DELETE_CATALOG_ITEM', id }, WA_ORIGIN);
  _pendingDeleteId = id; _pendingDeleteBtn = { el: btn, orig };
}

function _handleCreateItem(data, btn) {
  const orig = btn.innerHTML; btn.textContent = 'Creando...'; btn.disabled = true;
  window.postMessage({ type: 'CREATE_CATALOG_ITEM', data }, WA_ORIGIN);
  _pendingCreateBtn = { el: btn, orig };
}

function _handleDeleteCategory(catId, catKey, btn) {
  if (btn) { const orig = btn.innerHTML; btn.innerHTML = ''; btn.appendChild(_spinner(10, '#ef5350')); btn.disabled = true; _pendingDeleteCatBtn = { el: btn, orig, catKey }; }
  else { _pendingDeleteCatBtn = { el: null, orig: '', catKey }; }
  window.postMessage({ type: 'DELETE_CATALOG_CATEGORY', id: catId }, WA_ORIGIN);
}

// ═══════════════════════════════════════════════════════════════════════
// PREVIEW PLAYER
// ═══════════════════════════════════════════════════════════════════════
function _destroyPreview() {
  if (_previewRAF) { cancelAnimationFrame(_previewRAF); _previewRAF = null; }
  if (_previewAudio) { _previewAudio.pause(); _previewAudio.src = ''; _previewAudio = null; }
  _previewData = null; _previewPlaying = false; _previewLoadingId = null;
}

function _fmtTime(s) { if (!s || !isFinite(s)) return '0:00'; const sec = Math.floor(s); return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`; }

function _renderPreviewBar(panel) {
  const bar = _el('div', {}, { cls: 'wc-preview' });

  // Loading state
  if (_previewLoadingId && !_previewData) {
    const item = _catalogItems.find(i => i.id === _previewLoadingId);
    bar.appendChild(_spinner(16, '#00a884'));
    bar.appendChild(_el('div', { flex: '1', fontSize: '11px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, { txt: item ? `Cargando ${item.label}...` : 'Cargando...' }));
    const cancelBtn = _iconBtn(I.stop, '#666', 'Cancelar', () => { _destroyPreview(); if (_catalogPanelOpen) renderCatalogPanel(); });
    bar.appendChild(cancelBtn);
    panel.appendChild(bar);
    return;
  }

  if (!_previewData || !_previewAudio) return;

  // Play/Pause button
  const playBtn = _el('button', {}, { cls: 'wc-preview-play', html: _previewPlaying ? I.pause : I.play });
  playBtn.addEventListener('click', () => {
    if (_previewPlaying) { _previewAudio.pause(); _previewPlaying = false; }
    else { _previewAudio.play(); _previewPlaying = true; }
    playBtn.innerHTML = _previewPlaying ? I.pause : I.play;
  });
  bar.appendChild(playBtn);

  // Info column: name + track + time
  const info = _el('div', {}, { cls: 'wc-preview-info' });
  info.appendChild(_el('div', {}, { cls: 'wc-preview-name', txt: _previewData.label || 'Audio' }));

  // Progress track
  const track = _el('div', {}, { cls: 'wc-preview-track' });
  const fill = _el('div', { width: '0%' }, { cls: 'wc-preview-fill' });
  track.appendChild(fill);
  track.addEventListener('click', (e) => {
    if (!_previewAudio || !_previewAudio.duration) return;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    _previewAudio.currentTime = pct * _previewAudio.duration;
  });
  info.appendChild(track);

  // Time label
  const timeEl = _el('div', {}, { cls: 'wc-preview-time', txt: `${_fmtTime(_previewAudio.currentTime)} / ${_fmtTime(_previewAudio.duration)}` });
  info.appendChild(timeEl);
  bar.appendChild(info);

  // Live update progress via RAF
  function _updateProgress() {
    if (!_previewAudio) return;
    const pct = _previewAudio.duration ? (_previewAudio.currentTime / _previewAudio.duration) * 100 : 0;
    fill.style.width = pct + '%';
    timeEl.textContent = `${_fmtTime(_previewAudio.currentTime)} / ${_fmtTime(_previewAudio.duration)}`;
    playBtn.innerHTML = _previewPlaying ? I.pause : I.play;
    _previewRAF = requestAnimationFrame(_updateProgress);
  }
  if (_previewRAF) cancelAnimationFrame(_previewRAF);
  _previewRAF = requestAnimationFrame(_updateProgress);

  // Close/discard button
  const discardBtn = _iconBtn(I.stop, '#666', 'Descartar', () => { _destroyPreview(); if (_catalogPanelOpen) renderCatalogPanel(); });
  bar.appendChild(discardBtn);

  // Send button
  const sendBtn = _el('button', {}, { cls: 'wc-preview-send', html: `${I.send} Enviar` });
  sendBtn.addEventListener('click', () => {
    if (!_previewData) return;
    const { audioBase64, mimeType, label } = _previewData;
    _previewAudio.pause(); _previewPlaying = false;
    sendBtn.textContent = '...';
    sendBtn.disabled = true;
    _toast('Enviando nota de voz...', '#00a884');
    sendAudioAsPTT(audioBase64, mimeType).then(ok => {
      if (ok) { _toast((label || 'Audio') + ' enviado ✓', '#00a884', 2500); _destroyPreview(); }
      else { _toast('Error — abre un chat primero', '#ef5350', 3000); sendBtn.innerHTML = `${I.send} Enviar`; sendBtn.disabled = false; }
      if (_catalogPanelOpen) renderCatalogPanel();
    });
  });
  bar.appendChild(sendBtn);

  panel.appendChild(bar);
}

function _loadPreviewAudio(audioBase64, mimeType, label, id) {
  _destroyPreview();
  const mime = mimeType || 'audio/ogg; codecs=opus';
  const binary = atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);

  _previewAudio = new Audio(url);
  _previewData = { audioBase64, mimeType: mime, label, id };
  _previewLoadingId = null;
  _previewPlaying = false;

  _previewAudio.addEventListener('ended', () => {
    _previewPlaying = false;
    if (_catalogPanelOpen) renderCatalogPanel();
  });

  // Auto-play preview
  _previewAudio.play().then(() => { _previewPlaying = true; if (_catalogPanelOpen) renderCatalogPanel(); }).catch(() => {});

  if (_catalogPanelOpen) renderCatalogPanel();
}

// ═══════════════════════════════════════════════════════════════════════
// AUDIO CLICK (click item → fetch → preview)
// ═══════════════════════════════════════════════════════════════════════
function handleCatalogItemClick(audioId, label) {
  if (!audioId) return;
  // If already previewing this audio, just toggle play
  if (_previewData?.id === audioId && _previewAudio) {
    if (_previewPlaying) { _previewAudio.pause(); _previewPlaying = false; }
    else { _previewAudio.play(); _previewPlaying = true; }
    if (_catalogPanelOpen) renderCatalogPanel();
    return;
  }
  _destroyPreview();
  _previewLoadingId = audioId;
  if (_catalogPanelOpen) renderCatalogPanel();
  window.postMessage({ type: 'GET_CATALOG_AUDIO', id: audioId }, WA_ORIGIN);
}

// ── OGG/Opus duration parser ────────────────────────────────────────
function parseOggOpusDurationMs(buffer) {
  const FALLBACK_KBPS = 32;
  const bytes = new Uint8Array(buffer);
  const dv = new DataView(buffer);
  try {
    let preSkip = 0;
    for (let i = 0; i < bytes.length - 8; i++) {
      if (bytes[i]===0x4f&&bytes[i+1]===0x70&&bytes[i+2]===0x75&&bytes[i+3]===0x73&&bytes[i+4]===0x48&&bytes[i+5]===0x65&&bytes[i+6]===0x61&&bytes[i+7]===0x64) {
        preSkip = dv.getUint16(i + 10, true); break;
      }
    }
    let maxGranule = 0, i = 0;
    while (i < bytes.length - 27) {
      if (bytes[i]!==0x4f||bytes[i+1]!==0x67||bytes[i+2]!==0x67||bytes[i+3]!==0x53) { i++; continue; }
      const lo = dv.getUint32(i+6, true), hi = dv.getUint32(i+10, true);
      if (hi === 0 && lo > maxGranule) maxGranule = lo;
      const ns = bytes[i+26] ?? 0;
      if (i + 27 + ns > bytes.length) break;
      let pbs = 0; for (let s = 0; s < ns; s++) pbs += bytes[i+27+s] ?? 0;
      i += 27 + ns + pbs;
    }
    if (maxGranule > preSkip) return Math.round(((maxGranule - preSkip) / 48000) * 1000);
  } catch {}
  return Math.round((buffer.byteLength * 8 / (FALLBACK_KBPS * 1000)) * 1000);
}

// ── Waveform generator ──────────────────────────────────────────────
async function _generateWaveform(audioFile) {
  try {
    const audioData = await audioFile.arrayBuffer();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = await ctx.decodeAudioData(audioData);
    const raw = buf.getChannelData(0);
    const samples = 64, bs = Math.floor(raw.length / samples), fd = [];
    for (let i = 0; i < samples; i++) { const start = bs*i; let sum = 0; for (let j = 0; j < bs; j++) sum += Math.abs(raw[start+j]); fd.push(sum/bs); }
    const mult = Math.pow(Math.max(...fd), -1);
    return new Uint8Array(fd.map(n => Math.floor(100 * n * mult)));
  } catch { return undefined; }
}

// ── Send PTT via WA internal modules ────────────────────────────────
async function sendAudioAsPTT(audioBase64, mimeType) {
  const mime = mimeType || 'audio/ogg; codecs=opus';
  try {
    if (typeof window.require !== 'function') { console.error('[WSPP CATALOG] window.require not available'); return false; }
    const chatJid = _lastActiveChatJid;
    if (!chatJid) { console.error('[WSPP CATALOG] No active chat JID'); return false; }

    let chat = null;
    try {
      const Collections = window.require('WAWebCollections');
      const widFactory = window.require('WAWebWidFactory');
      const wid = widFactory.createWid(chatJid);
      chat = Collections.Chat.get(wid);
      if (!chat) { const FC = window.require('WAWebFindChatAction'); const r = await FC.findOrCreateLatestChat(wid); chat = r?.chat ?? r; }
    } catch (err) { console.error('[WSPP CATALOG] Failed to resolve chat:', err); return false; }
    if (!chat) { console.error('[WSPP CATALOG] Chat not found for:', chatJid); return false; }

    const binary = atob(audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const blob = new Blob([bytes], { type: mime });
    const file = new File([blob], 'voice_cesar_vasquez.ogg', { type: mime, lastModified: Date.now() });

    const OpaqueData = window.require('WAWebMediaOpaqueData');
    const opaqueData = await OpaqueData.createFromData(file, mime);
    const { prepRawMedia } = window.require('WAWebPrepRawMedia');
    const mediaPrep = prepRawMedia(opaqueData, { isPtt: true, asSticker: false, asGif: false, asDocument: false });
    const mediaData = await mediaPrep.waitForPrep();

    const waveform = await _generateWaveform(file);
    if (waveform) mediaData.waveform = waveform;

    const { getOrCreateMediaObject } = window.require('WAWebMediaStorage');
    const mediaObject = getOrCreateMediaObject(mediaData.filehash);
    const { msgToMediaType } = window.require('WAWebMmsMediaTypes');
    const mediaType = msgToMediaType({ type: mediaData.type, isGif: false });

    if (!(mediaData.mediaBlob instanceof OpaqueData)) mediaData.mediaBlob = await OpaqueData.createFromData(mediaData.mediaBlob, mediaData.mediaBlob.type);
    mediaData.renderableUrl = mediaData.mediaBlob.url();
    mediaObject.consolidate(mediaData.toJSON());
    mediaData.mediaBlob.autorelease();

    const { uploadMedia } = window.require('WAWebMediaMmsV4Upload');
    const uploaded = await uploadMedia({ mimetype: mediaData.mimetype, mediaObject, mediaType });
    const me = uploaded?.mediaEntry;
    if (!me) throw new Error('Upload failed: no mediaEntry');

    mediaData.set({ clientUrl: me.mmsUrl, deprecatedMms3Url: me.deprecatedMms3Url, directPath: me.directPath, mediaKey: me.mediaKey, mediaKeyTimestamp: me.mediaKeyTimestamp, filehash: mediaObject.filehash, encFilehash: me.encFilehash, uploadhash: me.uploadHash, size: mediaObject.size, streamingSidecar: me.sidecar, firstFrameSidecar: me.firstFrameSidecar });

    const { getMaybeMePnUser } = window.require('WAWebUserPrefsMeUser');
    const meUser = getMaybeMePnUser();
    const newId = await window.require('WAWebMsgKey').newId();
    const MsgKey = window.require('WAWebMsgKey');
    const newMsgKey = new MsgKey({ from: meUser, to: chat.id, id: newId, selfDir: 'out' });
    const ephemeralFields = window.require('WAWebGetEphemeralFieldsMsgActionsUtils').getEphemeralFields(chat);
    const mediaJSON = mediaData.toJSON ? mediaData.toJSON() : mediaData;
    const message = { ...mediaJSON, ...ephemeralFields, id: newMsgKey, ack: 0, from: meUser, to: chat.id, local: true, self: 'out', t: Math.floor(Date.now()/1000), isNewMsg: true, type: 'ptt', mimetype: mime };
    const { addAndSendMsgToChat } = window.require('WAWebSendMsgChatAction');
    const [msgPromise] = addAndSendMsgToChat(chat, message);
    await msgPromise;
    console.log('[WSPP CATALOG] PTT sent to', chatJid);
    return true;
  } catch (err) { console.error('[WSPP CATALOG] PTT send error:', err.message); return false; }
}

// ═══════════════════════════════════════════════════════════════════════
// MESSAGE HANDLERS (catalog data from background)
// ═══════════════════════════════════════════════════════════════════════
window.addEventListener('message', (e) => {
  if (e.source !== window) return;

  if (e.data?.type === 'AUDIO_CATALOG_READY') {
    _catalogLoading = false;
    if (e.data.ok && e.data.items) { _catalogItems = e.data.items; console.log('[WSPP CATALOG] Loaded', _catalogItems.length, 'items'); }
    else console.warn('[WSPP CATALOG] Load error:', e.data.error);
    if (_catalogPanelOpen) renderCatalogPanel();
    return;
  }

  if (e.data?.type === 'CATALOG_AUDIO_READY') {
    if (!e.data.ok || !e.data.audioBase64) {
      _previewLoadingId = null;
      _toast('Error: ' + (e.data.error || 'audio no disponible'), '#ef5350', 3000);
      if (_catalogPanelOpen) renderCatalogPanel();
      return;
    }
    _loadPreviewAudio(e.data.audioBase64, e.data.mimeType, e.data.label || 'Audio', e.data.id);
    return;
  }

  if (e.data?.type === 'GENERATE_CATALOG_AUDIO_DONE') {
    if (_pendingRegenBtn) { _pendingRegenBtn.el.innerHTML = _pendingRegenBtn.orig; _pendingRegenBtn.el.disabled = false; _pendingRegenBtn = null; }
    if (e.data.ok) {
      const idx = _catalogItems.findIndex(i => i.id === e.data.id);
      if (idx >= 0) _catalogItems[idx] = { ..._catalogItems[idx], has_audio: true, audio_size: e.data.audioSize, duration_ms: e.data.durationMs };
      window.postMessage({ type: 'BUST_AUDIO_CACHE', id: e.data.id }, WA_ORIGIN);
      _toast('Audio regenerado ✓', '#00a884', 2000);
      if (_catalogPanelOpen) renderCatalogPanel();
    } else _toast('Error: ' + (e.data.error || 'intenta de nuevo'), '#ef5350', 3500);
    _pendingRegenId = null;
    return;
  }

  if (e.data?.type === 'UPDATE_CATALOG_SCRIPT_DONE') {
    if (_pendingUpdateBtn) { _pendingUpdateBtn.el.innerHTML = _pendingUpdateBtn.orig; _pendingUpdateBtn.el.disabled = false; _pendingUpdateBtn = null; }
    if (e.data.ok) {
      const idx = _catalogItems.findIndex(i => i.id === e.data.id);
      if (idx >= 0) _catalogItems[idx] = { ..._catalogItems[idx], script_text: e.data.script_text, has_audio: false, audio_size: 0, duration_ms: 0 };
      window.postMessage({ type: 'BUST_CATALOG_CACHE' }, WA_ORIGIN);
      _catalogEditingId = null;
      _toast('Guión guardado — regenerá el audio', '#00a884', 2500);
      if (_catalogPanelOpen) renderCatalogPanel();
    } else _toast('Error: ' + (e.data.error || 'intenta de nuevo'), '#ef5350', 3500);
    _pendingUpdateId = null;
    return;
  }

  if (e.data?.type === 'DELETE_CATALOG_ITEM_DONE') {
    if (_pendingDeleteBtn) { _pendingDeleteBtn.el.innerHTML = _pendingDeleteBtn.orig; _pendingDeleteBtn.el.disabled = false; _pendingDeleteBtn = null; }
    if (e.data.ok) {
      _catalogItems = _catalogItems.filter(i => i.id !== e.data.id);
      window.postMessage({ type: 'BUST_CATALOG_CACHE' }, WA_ORIGIN);
      _catalogView = 'category'; _catalogDetailId = null;
      _toast('Eliminada ✓', '#00a884', 2000);
      if (_catalogPanelOpen) renderCatalogPanel();
    } else _toast('Error: ' + (e.data.error || 'intenta de nuevo'), '#ef5350', 3500);
    _pendingDeleteId = null;
    return;
  }

  if (e.data?.type === 'CREATE_CATALOG_ITEM_DONE') {
    if (_pendingCreateBtn) { _pendingCreateBtn.el.innerHTML = _pendingCreateBtn.orig; _pendingCreateBtn.el.disabled = false; _pendingCreateBtn = null; }
    if (e.data.ok && e.data.item) {
      _catalogItems.push(e.data.item);
      window.postMessage({ type: 'BUST_CATALOG_CACHE' }, WA_ORIGIN);
      _catalogCategory = e.data.item.category; _catalogView = 'category';
      if (e.data.audio_generated) _toast('Creada con audio ✓', '#00a884', 2500);
      else if (e.data.audio_error) _toast('Creada — audio falló', '#f59e0b', 3500);
      else _toast('Creada — generá el audio', '#00a884', 2500);
      if (_catalogPanelOpen) renderCatalogPanel();
    } else _toast('Error: ' + (e.data.error || 'intenta de nuevo'), '#ef5350', 3500);
    return;
  }

  if (e.data?.type === 'CATALOG_CATEGORIES_READY') {
    _catalogCategoriesLoading = false;
    if (e.data.ok && e.data.categories) { _catalogCategories = e.data.categories; console.log('[WSPP CATALOG] Loaded', _catalogCategories.length, 'categories'); }
    if (_catalogPanelOpen) renderCatalogPanel();
    return;
  }

  if (e.data?.type === 'CREATE_CATALOG_CATEGORY_DONE') {
    if (e.data.ok && e.data.category) { _catalogCategories.push(e.data.category); _toast('Categoría creada ✓', '#00a884', 2000); if (_catalogPanelOpen) renderCatalogPanel(); }
    else _toast('Error: ' + (e.data.error || ''), '#ef5350', 3500);
    return;
  }

  if (e.data?.type === 'DELETE_CATALOG_CATEGORY_DONE') {
    if (_pendingDeleteCatBtn?.el) { _pendingDeleteCatBtn.el.innerHTML = _pendingDeleteCatBtn.orig; _pendingDeleteCatBtn.el.disabled = false; }
    if (e.data.ok) {
      const dk = _pendingDeleteCatBtn?.catKey;
      _catalogCategories = _catalogCategories.filter(c => c.id !== e.data.id);
      if (dk) _catalogItems = _catalogItems.filter(i => i.category !== dk);
      window.postMessage({ type: 'BUST_CATALOG_CACHE' }, WA_ORIGIN);
      _catalogView = 'grid'; _catalogCategory = null;
      _toast('Categoría eliminada ✓', '#00a884', 2000);
      if (_catalogPanelOpen) renderCatalogPanel();
    } else _toast('Error: ' + (e.data.error || ''), '#ef5350', 3500);
    _pendingDeleteCatBtn = null;
    return;
  }
});

// ── Insert FAB when WA Web is ready ─────────────────────────────────
const MAX_RETRIES = 30;
let _retries = 0;

export function waitForChatAndInsertButton() {
  if (document.getElementById('wspp-catalog-btn')) return;
  if (document.querySelector('#main') || document.querySelector('.two')) { createCatalogButton(); console.log('[WSPP CATALOG] Button inserted'); return; }
  _retries++;
  if (_retries < MAX_RETRIES) setTimeout(waitForChatAndInsertButton, 2000);
  else console.warn('[WSPP CATALOG] Chat not found after', MAX_RETRIES, 'retries');
}
