// audio-catalog-panel.js — panel de catálogo de audios pre-generados.
// Consultor: crear, editar guión, regenerar audio, eliminar.
// Agente digital: send-only.

import { WA_ORIGIN, _catalogIsConsultor } from './bootstrap.js';
import { _lastActiveChatJid } from './wa-module-installer.js';

// ── State ───────────────────────────────────────────────────────────
let _catalogItems = [];
let _catalogCategories = [];     // dynamic categories from API
let _catalogCategoriesLoading = false;
let _catalogPanelOpen = false;
let _catalogLoading = false;
// _catalogIsConsultor is imported from bootstrap (live binding via module re-read)
let _catalogEditingId = null;    // id of item currently being edited
let _catalogView = 'grid';       // current view: 'grid' | 'category' | 'detail' | 'create'
let _catalogDetailId = null;     // item id shown in detail/edit view
let _catalogCategory = null;     // category key when in 'category' view

// Pending async operation state
let _pendingRegenId = null;
let _pendingRegenBtn = null;
let _pendingUpdateId = null;
let _pendingUpdateBtn = null;
let _pendingDeleteId = null;
let _pendingDeleteBtn = null;
let _pendingCreateBtn = null;
let _pendingDeleteCatBtn = null;

// ── SVG icons (inline, no emoji) ───────────────────────────────────
const CATALOG_SVG = {
  mic: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
  saludo:             `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`,
  agradecimiento:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  pedir_voto:         `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  respuesta_trabajo:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  respuesta_dinero:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  invitacion_evento:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  despedida:          `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  propuestas:         `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  // New category icons
  cuando_llaman:      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  impulsar_canal:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  agendar:            `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/></svg>`,
  apoyo_historico:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  opiniones:          `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  pedir_apoyo:        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  compartir_canal:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
  saludos:            `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`,
  cerrar_conv:        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>`,
  compartir_mensaje:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  mantener_contacto:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
  responder_opiniones:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>`,
  send:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`,
  refresh: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
  edit:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  close:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  check:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  waveform:`<svg width="52" height="20" viewBox="0 0 52 20" fill="none"><rect x="0"  y="8"  width="3" height="4"  rx="1.5" fill="currentColor" opacity=".4"/><rect x="5"  y="5"  width="3" height="10" rx="1.5" fill="currentColor" opacity=".6"/><rect x="10" y="2"  width="3" height="16" rx="1.5" fill="currentColor" opacity=".8"/><rect x="15" y="6"  width="3" height="8"  rx="1.5" fill="currentColor" opacity=".7"/><rect x="20" y="3"  width="3" height="14" rx="1.5" fill="currentColor"/><rect x="25" y="7"  width="3" height="6"  rx="1.5" fill="currentColor" opacity=".7"/><rect x="30" y="1"  width="3" height="18" rx="1.5" fill="currentColor" opacity=".9"/><rect x="35" y="5"  width="3" height="10" rx="1.5" fill="currentColor" opacity=".6"/><rect x="40" y="8"  width="3" height="4"  rx="1.5" fill="currentColor" opacity=".5"/><rect x="45" y="4"  width="3" height="12" rx="1.5" fill="currentColor" opacity=".7"/><rect x="49" y="9"  width="3" height="2"  rx="1" fill="currentColor" opacity=".3"/></svg>`,
};

// ── Dynamic category helpers (read from _catalogCategories fetched from API) ──
// Fallback labels/colors for categories not yet loaded from API
const _FALLBACK_LABELS = {
  saludo: 'Saludo', agradecimiento: 'Agradecimiento', pedir_voto: 'Voto',
  respuesta_trabajo: 'Trabajo', respuesta_dinero: 'Dinero',
  invitacion_evento: 'Evento', despedida: 'Despedida', propuestas: 'Propuestas',
};
const _FALLBACK_COLORS = {
  saludo: '#00a884', agradecimiento: '#ef5350', pedir_voto: '#f59e0b',
  respuesta_trabajo: '#818cf8', respuesta_dinero: '#34d399',
  invitacion_evento: '#38bdf8', despedida: '#c084fc', propuestas: '#fbbf24',
};
const _DEFAULT_ACCENT = '#8696a0';

function _getCatLabel(catKey) {
  const cat = _catalogCategories.find(c => c.key === catKey);
  if (cat) return cat.label;
  return _FALLBACK_LABELS[catKey] || catKey;
}

function _getCatColors(catKey) {
  const cat = _catalogCategories.find(c => c.key === catKey);
  const accent = cat?.color || _FALLBACK_COLORS[catKey] || _DEFAULT_ACCENT;
  return { bg: `${accent}18`, accent };
}

function _getCatIcon(catKey) {
  const cat = _catalogCategories.find(c => c.key === catKey);
  const iconKey = cat?.icon || catKey;
  return CATALOG_SVG[iconKey] || CATALOG_SVG.propuestas;
}

function _getCatSortOrder(catKey) {
  const cat = _catalogCategories.find(c => c.key === catKey);
  return cat?.sort_order ?? 999;
}

function _getCatId(catKey) {
  const cat = _catalogCategories.find(c => c.key === catKey);
  return cat?.id || null;
}

// Inject keyframes — deferred: called on first panel open, not at document_start
function injectCatalogStyles() {
  if (document.getElementById('wspp-catalog-styles')) return;
  const root = document.head || document.documentElement;
  if (!root) return;
  const s = document.createElement('style');
  s.id = 'wspp-catalog-styles';
  s.textContent = `
    @keyframes wspp-slide-up {
      from { opacity:0; transform:translateY(16px) scale(.97); }
      to   { opacity:1; transform:translateY(0)    scale(1);   }
    }
    @keyframes wspp-spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    @keyframes wspp-pulse-dot {
      0%,100% { opacity:1; } 50% { opacity:.3; }
    }
    .wspp-catalog-item:hover .wspp-item-actions { opacity:1 !important; }
    .wspp-catalog-item:hover { background: #2a3942 !important; }
    .wspp-send-btn:hover { background: #008f72 !important; transform: scale(1.04); }
    .wspp-icon-btn:hover { background: rgba(255,255,255,.08) !important; }
    .wspp-catalog-item.wspp-sending { pointer-events:none; }
    .wspp-catalog-item.wspp-sending .wspp-waveform { color:#00a884; }
    .wspp-spinning { animation: wspp-spin .7s linear infinite; }
    .wspp-edit-area { resize:none; outline:none; }
    .wspp-edit-area:focus { border-color:#00a884 !important; }
    .wspp-edit-area::placeholder { color: #636366; }
    select option { background: #2c2c2e; color: #e9edef; }
  `;
  root.appendChild(s);
}

// ── Format duration ms → m:ss ──────────────────────────────────────
function _fmtDuration(ms) {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
}

// ── Create the mic FAB button ───────────────────────────────────────
function createCatalogButton() {
  const btn = document.createElement('button');
  btn.id = 'wspp-catalog-btn';
  btn.title = 'Audios Goberna — César Vásquez';
  btn.innerHTML = CATALOG_SVG.mic;
  Object.assign(btn.style, {
    position: 'fixed',
    bottom: '80px',
    right: '24px',
    zIndex: '99999',
    width: '52px',
    height: '52px',
    borderRadius: '50%',
    border: 'none',
    background: 'linear-gradient(135deg,#00a884 0%,#008f72 100%)',
    color: '#fff',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(0,168,132,.45), 0 2px 4px rgba(0,0,0,.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'box-shadow .2s, transform .15s',
  });
  btn.addEventListener('mouseenter', () => {
    if (!_catalogPanelOpen) btn.style.transform = 'scale(1.08)';
  });
  btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });
  btn.addEventListener('click', toggleCatalogPanel);
  document.body.appendChild(btn);
  return btn;
}

// ── Toggle the catalog panel ────────────────────────────────────────
function toggleCatalogPanel() {
  const existing = document.getElementById('wspp-catalog-panel');
  if (existing) {
    existing.remove();
    _catalogPanelOpen = false;
    _catalogEditingId = null;
    const btn = document.getElementById('wspp-catalog-btn');
    if (btn) btn.style.boxShadow = '0 4px 16px rgba(0,168,132,.45), 0 2px 4px rgba(0,0,0,.3)';
    return;
  }
  _catalogPanelOpen = true;
  const btn = document.getElementById('wspp-catalog-btn');
  if (btn) btn.style.boxShadow = '0 0 0 3px rgba(0,168,132,.4), 0 4px 16px rgba(0,168,132,.5)';

  // _catalogIsConsultor is already set via WSPP_SET_USER_ROLE from content.js
  if (_catalogItems.length === 0 && !_catalogLoading) {
    _catalogLoading = true;
    window.postMessage({ type: 'FETCH_AUDIO_CATALOG' }, WA_ORIGIN);
  }
  // Also fetch dynamic categories if not loaded yet
  if (_catalogCategories.length === 0 && !_catalogCategoriesLoading) {
    _catalogCategoriesLoading = true;
    window.postMessage({ type: 'FETCH_CATALOG_CATEGORIES' }, WA_ORIGIN);
  }
  renderCatalogPanel();
}

// ── Render dispatcher ───────────────────────────────────────────────
function renderCatalogPanel() {
  injectCatalogStyles();
  // Wipe and rebuild from scratch every render (simple, no stale DOM)
  let panel = document.getElementById('wspp-catalog-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'wspp-catalog-panel';
    Object.assign(panel.style, {
      position: 'fixed',
      bottom: '148px',
      right: '16px',
      zIndex: '99999',
      width: '340px',
      background: '#1c1c1e',
      borderRadius: '20px',
      boxShadow: '0 12px 48px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.07)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
      animation: 'wspp-slide-up .25s cubic-bezier(.16,1,.3,1)',
      maxHeight: '560px',
    });
    document.body.appendChild(panel);
  }
  panel.innerHTML = '';

  if (_catalogView === 'detail' && _catalogDetailId) {
    _renderDetailView(panel);
  } else if (_catalogView === 'create') {
    _renderCreateView(panel);
  } else if (_catalogView === 'category' && _catalogCategory) {
    _renderCategoryView(panel);
  } else {
    _catalogView = 'grid';
    _renderGridView(panel);
  }
}

// ── Shared header builder ───────────────────────────────────────────
function _mkHeader(title, onBack, rightEl) {
  const hdr = document.createElement('div');
  Object.assign(hdr.style, {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '13px 14px 10px',
    borderBottom: '1px solid rgba(255,255,255,.06)',
    flexShrink: '0',
    background: '#1c1c1e',
  });

  if (onBack) {
    const back = document.createElement('button');
    back.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
    Object.assign(back.style, {
      background: 'none', border: 'none', color: '#00a884',
      cursor: 'pointer', padding: '2px', display: 'flex',
      alignItems: 'center', flexShrink: '0',
    });
    back.addEventListener('click', onBack);
    hdr.appendChild(back);
  } else {
    // Mic icon pill
    const pill = document.createElement('div');
    Object.assign(pill.style, {
      width: '28px', height: '28px', borderRadius: '8px',
      background: 'linear-gradient(135deg,#00a884,#007a62)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', flexShrink: '0',
    });
    pill.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;
    hdr.appendChild(pill);
  }

  const titleEl = document.createElement('div');
  Object.assign(titleEl.style, {
    flex: '1', color: '#fff', fontSize: '15px', fontWeight: '700',
    letterSpacing: '-.2px',
  });
  titleEl.textContent = title;
  hdr.appendChild(titleEl);

  if (rightEl) {
    hdr.appendChild(rightEl);
  }

  // Close X always on the right
  const closeX = document.createElement('button');
  closeX.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  Object.assign(closeX.style, {
    width: '26px', height: '26px', borderRadius: '50%',
    background: 'rgba(255,255,255,.1)', border: 'none',
    color: '#8696a0', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: '0',
  });
  closeX.addEventListener('click', _closePanel);
  hdr.appendChild(closeX);

  return hdr;
}

function _closePanel() {
  const panel = document.getElementById('wspp-catalog-panel');
  if (panel) panel.remove();
  _catalogPanelOpen = false;
  _catalogView = 'grid';
  _catalogDetailId = null;
  _catalogCategory = null;
  _catalogEditingId = null;
  const fab = document.getElementById('wspp-catalog-btn');
  if (fab) fab.style.boxShadow = '0 4px 16px rgba(0,168,132,.45), 0 2px 4px rgba(0,0,0,.3)';
}

// ── GRID VIEW — 2-row × 4-col category tiles ────────────────────────
function _renderGridView(panel) {
  const loading = _catalogLoading && _catalogItems.length === 0;

  let addBtn = null;
  if (_catalogIsConsultor) {
    addBtn = document.createElement('button');
    addBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    Object.assign(addBtn.style, {
      width: '28px', height: '28px', borderRadius: '50%',
      background: 'rgba(0,168,132,.15)', border: 'none',
      color: '#00a884', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: '0',
    });
    addBtn.title = 'Crear nueva plantilla';
    addBtn.addEventListener('click', () => { _catalogCategory = null; _catalogView = 'create'; renderCatalogPanel(); });
  }

  panel.appendChild(_mkHeader('César Vásquez', null, addBtn));

  const body = document.createElement('div');
  Object.assign(body.style, {
    overflowY: 'auto', flex: '1', padding: '10px',
    scrollbarWidth: 'thin', scrollbarColor: '#3a3a3c transparent',
  });

  if (loading) {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0', gap: '10px' });
    const sp = document.createElement('div');
    Object.assign(sp.style, { width: '22px', height: '22px', borderRadius: '50%', border: '3px solid rgba(0,168,132,.2)', borderTopColor: '#00a884' });
    sp.classList.add('wspp-spinning');
    const txt = document.createElement('div');
    Object.assign(txt.style, { color: '#8e8e93', fontSize: '12px' });
    txt.textContent = 'Cargando...';
    wrap.appendChild(sp); wrap.appendChild(txt);
    body.appendChild(wrap);
  } else if (_catalogItems.length === 0) {
    const empty = document.createElement('div');
    Object.assign(empty.style, { color: '#8e8e93', textAlign: 'center', padding: '32px 0', fontSize: '13px' });
    empty.textContent = 'No hay plantillas disponibles';
    body.appendChild(empty);
  } else {
    // Group items by category and sort by dynamic sort_order from API
    const grouped = {};
    _catalogItems.forEach(item => {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item);
    });
    // Also include categories that have 0 items (empty categories from API)
    _catalogCategories.forEach(cat => {
      if (!grouped[cat.key]) grouped[cat.key] = [];
    });
    const allCats = Object.keys(grouped).sort((a, b) => _getCatSortOrder(a) - _getCatSortOrder(b));

    const grid = document.createElement('div');
    Object.assign(grid.style, {
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '7px',
    });

    allCats.forEach(cat => {
      const items = grouped[cat];
      const colors = _getCatColors(cat);
      const catSvg = _getCatIcon(cat);
      const readyCount = items.filter(i => i.has_audio).length;

      const tile = document.createElement('div');
      Object.assign(tile.style, {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '9px 4px 7px', borderRadius: '13px', background: '#2c2c2e',
        cursor: 'pointer', transition: 'transform .12s, background .12s',
        position: 'relative', minHeight: '72px',
      });

      const iconWrap = document.createElement('div');
      Object.assign(iconWrap.style, {
        width: '38px', height: '38px', borderRadius: '11px',
        background: colors.bg, display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: colors.accent, marginBottom: '5px',
        boxShadow: `0 2px 8px ${colors.accent}28`,
      });
      iconWrap.innerHTML = catSvg;
      iconWrap.querySelector('svg').setAttribute('width','20');
      iconWrap.querySelector('svg').setAttribute('height','20');

      const lbl = document.createElement('div');
      Object.assign(lbl.style, {
        fontSize: '9px', fontWeight: '700', color: '#ebebf5',
        textAlign: 'center', lineHeight: '1.2', width: '100%', padding: '0 2px',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      });
      lbl.textContent = _getCatLabel(cat);

      const badge = document.createElement('div');
      Object.assign(badge.style, {
        position: 'absolute', bottom: '5px', left: '6px',
        minWidth: '16px', height: '16px', borderRadius: '8px',
        background: readyCount > 0 ? colors.accent : '#636366',
        color: '#fff', fontSize: '9px', fontWeight: '800',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 4px',
      });
      badge.textContent = String(items.length);

      tile.appendChild(iconWrap);
      tile.appendChild(lbl);
      tile.appendChild(badge);

      tile.addEventListener('mousedown', () => { tile.style.transform = 'scale(.93)'; tile.style.background = '#3a3a3c'; });
      tile.addEventListener('mouseup',   () => { tile.style.transform = 'scale(1)';   tile.style.background = '#2c2c2e'; });
      tile.addEventListener('mouseleave',() => { tile.style.transform = 'scale(1)';   tile.style.background = '#2c2c2e'; });

      tile.addEventListener('click', () => {
        _catalogCategory = cat;
        _catalogView = 'category';
        renderCatalogPanel();
      });

      grid.appendChild(tile);
    });

    body.appendChild(grid);
  }

  panel.appendChild(body);
  panel.appendChild(_mkStatusBar());
}

// ── CATEGORY VIEW — list of items inside a category ──────────────────
function _renderCategoryView(panel) {
  const cat = _catalogCategory;
  const items = _catalogItems
    .filter(i => i.category === cat)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const colors = _getCatColors(cat);

  // Right-side header buttons container
  let rightBtns = null;
  if (_catalogIsConsultor) {
    rightBtns = document.createElement('div');
    Object.assign(rightBtns.style, { display: 'flex', alignItems: 'center', gap: '4px', flexShrink: '0' });

    // Add item button
    const addBtn = document.createElement('button');
    addBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    Object.assign(addBtn.style, {
      width: '26px', height: '26px', borderRadius: '50%',
      background: `${colors.accent}22`, border: 'none',
      color: colors.accent, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    });
    addBtn.title = 'Agregar plantilla en esta categoría';
    addBtn.addEventListener('click', () => { _catalogView = 'create'; renderCatalogPanel(); });
    rightBtns.appendChild(addBtn);

    // Delete category button
    const delCatBtn = document.createElement('button');
    delCatBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
    Object.assign(delCatBtn.style, {
      width: '26px', height: '26px', borderRadius: '50%',
      background: 'rgba(239,83,80,.12)', border: 'none',
      color: '#ef5350', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    });
    delCatBtn.title = 'Eliminar categoría (y todos sus audios)';
    delCatBtn.addEventListener('click', () => {
      const catLabel = _getCatLabel(cat);
      if (!confirm(`¿Eliminar la categoría "${catLabel}" y TODOS sus audios? Esta acción no se puede deshacer.`)) return;
      const catId = _getCatId(cat);
      if (!catId) {
        _showCatalogStatus('Categoría no encontrada en API', '#ef5350', 3000);
        return;
      }
      _handleDeleteCategory(catId, cat, delCatBtn);
    });
    rightBtns.appendChild(delCatBtn);
  }

  panel.appendChild(_mkHeader(
    _getCatLabel(cat),
    () => { _catalogView = 'grid'; renderCatalogPanel(); },
    rightBtns
  ));

  const body = document.createElement('div');
  Object.assign(body.style, {
    overflowY: 'auto', flex: '1',
    scrollbarWidth: 'thin', scrollbarColor: '#3a3a3c transparent',
  });

  if (items.length === 0) {
    const empty = document.createElement('div');
    Object.assign(empty.style, { color: '#8e8e93', textAlign: 'center', padding: '28px 0', fontSize: '12px' });
    empty.textContent = 'Sin plantillas en esta categoría';
    body.appendChild(empty);
  } else {
    items.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'wspp-catalog-item';
      const isLast = idx === items.length - 1;
      Object.assign(row.style, {
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 14px',
        borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,.05)',
        cursor: item.has_audio ? 'pointer' : 'default',
        transition: 'background .1s',
        position: 'relative',
      });

      const iconCol = document.createElement('div');
      Object.assign(iconCol.style, {
        width: '32px', height: '32px', borderRadius: '9px', flexShrink: '0',
        background: item.has_audio ? colors.bg : 'rgba(99,99,102,.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: item.has_audio ? colors.accent : '#636366',
      });
      iconCol.innerHTML = item.has_audio
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

      const textCol = document.createElement('div');
      Object.assign(textCol.style, { flex: '1', minWidth: '0' });
      const rowLabel = document.createElement('div');
      Object.assign(rowLabel.style, {
        fontSize: '13px', fontWeight: '600', color: item.has_audio ? '#e9edef' : '#636366',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      });
      rowLabel.textContent = item.label;
      const rowDesc = document.createElement('div');
      Object.assign(rowDesc.style, {
        fontSize: '11px', color: '#636366', marginTop: '1px',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      });
      const dur = _fmtDuration(item.duration_ms);
      rowDesc.textContent = item.description || (dur ? `⏱ ${dur}` : '');
      textCol.appendChild(rowLabel);
      if (item.description || dur) textCol.appendChild(rowDesc);

      row.appendChild(iconCol);
      row.appendChild(textCol);

      if (_catalogIsConsultor) {
        const editBtn = document.createElement('button');
        editBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
        Object.assign(editBtn.style, {
          background: 'rgba(255,255,255,.06)', border: 'none',
          color: '#8696a0', cursor: 'pointer',
          width: '28px', height: '28px', borderRadius: '8px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: '0', transition: 'background .12s, color .12s',
        });
        const _eAccent = colors.accent; // capture for closure
        editBtn.addEventListener('mouseenter', () => { editBtn.style.background = `${_eAccent}22`; editBtn.style.color = _eAccent; });
        editBtn.addEventListener('mouseleave', () => { editBtn.style.background = 'rgba(255,255,255,.06)'; editBtn.style.color = '#8696a0'; });
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          _catalogDetailId = item.id;
          _catalogView = 'detail';
          renderCatalogPanel();
        });
        row.appendChild(editBtn);
      }

      if (item.has_audio) {
        row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,255,255,.04)'; });
        row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
        row.addEventListener('click', () => handleCatalogItemClick(item.id, item.label));
      }

      body.appendChild(row);
    });
  }

  panel.appendChild(body);
  panel.appendChild(_mkStatusBar());
}

// ── DETAIL VIEW — edit a single item (consultor only) ───────────────
function _renderDetailView(panel) {
  const item = _catalogItems.find(i => i.id === _catalogDetailId);
  if (!item) { _catalogView = 'category'; renderCatalogPanel(); return; }

  const colors = _getCatColors(item.category);
  const catSvg = _getCatIcon(item.category);
  const dur = _fmtDuration(item.duration_ms);

  panel.appendChild(_mkHeader(item.label, () => { _catalogView = 'category'; renderCatalogPanel(); }));

  const body = document.createElement('div');
  Object.assign(body.style, { overflowY: 'auto', flex: '1', padding: '14px' });

  const metaRow = document.createElement('div');
  Object.assign(metaRow.style, { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' });
  const iconBig = document.createElement('div');
  Object.assign(iconBig.style, {
    width: '48px', height: '48px', borderRadius: '13px',
    background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: colors.accent, flexShrink: '0',
  });
  iconBig.innerHTML = catSvg;
  iconBig.querySelector('svg').setAttribute('width','24'); iconBig.querySelector('svg').setAttribute('height','24');

  const metaText = document.createElement('div');
  const catBadge = document.createElement('div');
  Object.assign(catBadge.style, {
    display: 'inline-block', fontSize: '10px', fontWeight: '700',
    color: colors.accent, background: colors.bg,
    padding: '2px 8px', borderRadius: '20px', marginBottom: '4px', textTransform: 'uppercase',
  });
  catBadge.textContent = _getCatLabel(item.category);
  const descEl = document.createElement('div');
  Object.assign(descEl.style, { fontSize: '11px', color: '#8e8e93', lineHeight: '1.4' });
  descEl.textContent = item.description || '';
  const durEl = document.createElement('div');
  Object.assign(durEl.style, { fontSize: '10px', color: '#636366', marginTop: '2px' });
  durEl.textContent = dur ? `⏱ ${dur}` : '';
  metaText.appendChild(catBadge); metaText.appendChild(descEl); if (dur) metaText.appendChild(durEl);
  metaRow.appendChild(iconBig); metaRow.appendChild(metaText);
  body.appendChild(metaRow);

  body.appendChild(_mkDetailLabel('Guión'));
  const textarea = document.createElement('textarea');
  textarea.id = 'wspp-detail-script';
  textarea.className = 'wspp-edit-area';
  textarea.value = item.script_text || '';
  Object.assign(textarea.style, {
    width: '100%', minHeight: '88px', padding: '10px 12px',
    background: '#2c2c2e', border: '1px solid rgba(255,255,255,.08)',
    borderRadius: '12px', color: '#e9edef', fontSize: '12px',
    lineHeight: '1.6', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: '10px',
  });
  body.appendChild(textarea);

  const actions = document.createElement('div');
  Object.assign(actions.style, { display: 'flex', flexDirection: 'column', gap: '8px' });

  const saveBtn = _mkActionBtn('Guardar guión', '#00a884', CATALOG_SVG.check);
  saveBtn.addEventListener('click', () => {
    const s = textarea.value.trim();
    if (!s) return;
    _handleUpdateScript(item.id, s, saveBtn);
  });
  actions.appendChild(saveBtn);

  const regenBtn = _mkActionBtn('Regenerar audio', '#818cf8', CATALOG_SVG.refresh);
  regenBtn.addEventListener('click', () => _handleRegenerate(item.id, regenBtn));
  actions.appendChild(regenBtn);

  const delBtn = _mkActionBtn('Eliminar plantilla', '#ef5350',
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`
  );
  Object.assign(delBtn.style, { background: 'rgba(239,83,80,.12)', color: '#ef5350' });
  delBtn.addEventListener('click', () => {
    if (!confirm(`¿Eliminar "${item.label}"? Esta acción no se puede deshacer.`)) return;
    _handleDeleteItem(item.id, delBtn);
  });
  actions.appendChild(delBtn);

  body.appendChild(actions);
  panel.appendChild(body);
  panel.appendChild(_mkStatusBar());
}

// ── CREATE VIEW — form to add a new item ────────────────────────────
function _renderCreateView(panel) {
  const preselectedCat = _catalogView === 'create' && _catalogCategory ? _catalogCategory : (_catalogCategories[0]?.key || 'saludo');

  // Back goes to category view if we came from one, else grid
  const backTarget = _catalogCategory ? 'category' : 'grid';
  panel.appendChild(_mkHeader('Nueva plantilla', () => { _catalogView = backTarget; renderCatalogPanel(); }));

  // Build category options from dynamic categories (with fallback)
  const CATEGORY_OPTIONS = _catalogCategories.length > 0
    ? _catalogCategories.map(c => ({ value: c.key, label: c.label }))
    : Object.entries(_FALLBACK_LABELS).map(([k, v]) => ({ value: k, label: v }));

  const body = document.createElement('div');
  Object.assign(body.style, { overflowY: 'auto', flex: '1', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' });

  body.appendChild(_mkDetailLabel('Nombre'));
  const labelInput = _mkTextInput('Ej: Saludo inicial');
  body.appendChild(labelInput);

  body.appendChild(_mkDetailLabel('Descripción corta'));
  const descInput = _mkTextInput('Para quién es este audio');
  body.appendChild(descInput);

  body.appendChild(_mkDetailLabel('Categoría'));
  const catSel = document.createElement('select');
  Object.assign(catSel.style, {
    width: '100%', padding: '10px 12px', background: '#2c2c2e',
    border: '1px solid rgba(255,255,255,.08)', borderRadius: '12px',
    color: '#e9edef', fontSize: '13px', cursor: 'pointer',
  });
  CATEGORY_OPTIONS.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.value; o.textContent = opt.label;
    if (opt.value === preselectedCat) o.selected = true;
    catSel.appendChild(o);
  });
  body.appendChild(catSel);

  body.appendChild(_mkDetailLabel('Guión (texto que se convertirá en audio)'));
  const scriptArea = document.createElement('textarea');
  scriptArea.className = 'wspp-edit-area';
  scriptArea.placeholder = 'Hola, habla el doctor César Vásquez...';
  Object.assign(scriptArea.style, {
    width: '100%', minHeight: '88px', padding: '10px 12px',
    background: '#2c2c2e', border: '1px solid rgba(255,255,255,.08)',
    borderRadius: '12px', color: '#e9edef', fontSize: '12px',
    lineHeight: '1.6', fontFamily: 'inherit', boxSizing: 'border-box',
  });
  body.appendChild(scriptArea);

  // ── Order (sort_order) ──────────────────────────────────────────────
  body.appendChild(_mkDetailLabel('Orden de aparición'));
  const sortInput = document.createElement('input');
  sortInput.type = 'number'; sortInput.min = '0'; sortInput.max = '999'; sortInput.value = '0';
  sortInput.placeholder = '0';
  Object.assign(sortInput.style, {
    width: '100%', padding: '10px 12px', background: '#2c2c2e',
    border: '1px solid rgba(255,255,255,.08)', borderRadius: '12px',
    color: '#e9edef', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box',
    outline: 'none',
  });
  body.appendChild(sortInput);

  // ── Voice ID (optional — leave blank to use default César Vásquez voice) ──
  body.appendChild(_mkDetailLabel('Voice ID (opcional — dejar vacío para voz por defecto)'));
  const voiceInput = _mkTextInput('iaSdolcffUuIlEi5pdbj');
  body.appendChild(voiceInput);

  const createBtn = _mkActionBtn('Crear y generar audio', '#00a884', CATALOG_SVG.check);
  createBtn.addEventListener('click', () => {
    const label = labelInput.value.trim();
    const desc  = descInput.value.trim();
    const cat   = catSel.value;
    const script = scriptArea.value.trim();
    const sortOrder = parseInt(sortInput.value, 10) || 0;
    const voiceId = voiceInput.value.trim() || undefined;

    if (!label || !script) {
      _showCatalogStatus('Nombre y guión son obligatorios', '#ef5350', 3000);
      return;
    }
    _catalogCategory = cat;
    _handleCreateItem({ label, description: desc, category: cat, script_text: script, sort_order: sortOrder, voice_id: voiceId }, createBtn);
  });
  body.appendChild(createBtn);

  panel.appendChild(body);
  panel.appendChild(_mkStatusBar());
}

// ── Small helpers ───────────────────────────────────────────────────
function _mkStatusBar() {
  const bar = document.createElement('div');
  bar.id = 'wspp-catalog-status';
  Object.assign(bar.style, {
    padding: '0 14px', background: '#1c1c1e',
    borderTop: '1px solid rgba(255,255,255,.05)',
    color: '#8e8e93', fontSize: '12px', textAlign: 'center',
    display: 'none', alignItems: 'center', justifyContent: 'center',
    height: '0', overflow: 'hidden', transition: 'height .2s, padding .2s',
  });
  return bar;
}

function _mkDetailLabel(text) {
  const l = document.createElement('div');
  Object.assign(l.style, { fontSize: '11px', color: '#8e8e93', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '4px' });
  l.textContent = text;
  return l;
}

function _mkTextInput(placeholder) {
  const inp = document.createElement('input');
  inp.type = 'text'; inp.placeholder = placeholder;
  inp.className = 'wspp-edit-area';
  Object.assign(inp.style, {
    width: '100%', padding: '10px 12px', background: '#2c2c2e',
    border: '1px solid rgba(255,255,255,.08)', borderRadius: '12px',
    color: '#e9edef', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box',
    outline: 'none',
  });
  return inp;
}

function _mkActionBtn(label, color, iconSvg) {
  const btn = document.createElement('button');
  btn.innerHTML = `<span style="display:flex;align-items:center;gap:6px;">${iconSvg}<span>${label}</span></span>`;
  Object.assign(btn.style, {
    width: '100%', padding: '11px', borderRadius: '12px', border: 'none',
    background: `${color}22`, color,
    fontSize: '13px', fontWeight: '700', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background .15s',
  });
  btn.addEventListener('mouseenter', () => { btn.style.background = `${color}33`; });
  btn.addEventListener('mouseleave', () => { btn.style.background = `${color}22`; });
  return btn;
}

// ── Regenerate audio for an item ────────────────────────────────────
function _handleRegenerate(itemId, btn) {
  const origContent = btn.innerHTML;
  const spinner = document.createElement('div');
  Object.assign(spinner.style, { width: '14px', height: '14px', borderRadius: '50%', border: '2px solid rgba(255,255,255,.2)', borderTopColor: '#00a884', flexShrink: '0' });
  spinner.classList.add('wspp-spinning');
  btn.innerHTML = '';
  btn.appendChild(spinner);
  btn.disabled = true;

  _showCatalogStatus('Regenerando audio...', '#8696a0');
  window.postMessage({ type: 'GENERATE_CATALOG_AUDIO', id: itemId }, WA_ORIGIN);

  _pendingRegenId = itemId;
  _pendingRegenBtn = { el: btn, orig: origContent };
}

// ── Update script for an item ────────────────────────────────────────
function _handleUpdateScript(itemId, newScript, btn) {
  const origContent = btn.innerHTML;
  btn.textContent = 'Guardando...';
  btn.disabled = true;

  window.postMessage({ type: 'UPDATE_CATALOG_SCRIPT', id: itemId, script_text: newScript }, WA_ORIGIN);
  _pendingUpdateId = itemId;
  _pendingUpdateBtn = { el: btn, orig: origContent };
}

// ── Delete item ─────────────────────────────────────────────────────
function _handleDeleteItem(itemId, btn) {
  const origContent = btn.innerHTML;
  btn.textContent = 'Eliminando...';
  btn.disabled = true;

  window.postMessage({ type: 'DELETE_CATALOG_ITEM', id: itemId }, WA_ORIGIN);
  _pendingDeleteId = itemId;
  _pendingDeleteBtn = { el: btn, orig: origContent };
}

// ── Create item ──────────────────────────────────────────────────────
function _handleCreateItem(data, btn) {
  const origContent = btn.innerHTML;
  btn.textContent = 'Creando...';
  btn.disabled = true;

  window.postMessage({ type: 'CREATE_CATALOG_ITEM', data }, WA_ORIGIN);
  _pendingCreateBtn = { el: btn, orig: origContent };
}

// ── Delete category ──────────────────────────────────────────────────
function _handleDeleteCategory(catId, catKey, btn) {
  const origContent = btn.innerHTML;
  btn.innerHTML = '';
  const spinner = document.createElement('div');
  Object.assign(spinner.style, { width: '12px', height: '12px', borderRadius: '50%', border: '2px solid rgba(255,255,255,.2)', borderTopColor: '#ef5350' });
  spinner.classList.add('wspp-spinning');
  btn.appendChild(spinner);
  btn.disabled = true;

  window.postMessage({ type: 'DELETE_CATALOG_CATEGORY', id: catId }, WA_ORIGIN);
  _pendingDeleteCatBtn = { el: btn, orig: origContent, catKey };
}

// ── Show/hide status bar ────────────────────────────────────────────
function _showCatalogStatus(text, color, duration) {
  const bar = document.getElementById('wspp-catalog-status');
  if (!bar) return;
  bar.textContent = text;
  bar.style.color = color || '#8696a0';
  bar.style.display = 'flex';
  bar.style.height = '36px';
  bar.style.padding = '0 16px';
  if (duration) {
    setTimeout(() => {
      bar.style.height = '0';
      bar.style.padding = '0 16px';
      setTimeout(() => { bar.style.display = 'none'; }, 200);
    }, duration);
  }
}

// ── Handle catalog item send click ──────────────────────────────────
function handleCatalogItemClick(audioId, label) {
  if (!audioId) return;
  _showCatalogStatus('Cargando audio...', '#8696a0');

  document.querySelectorAll('.wspp-catalog-item').forEach(el => {
    el.style.pointerEvents = 'none'; el.style.opacity = '0.5';
  });

  window.postMessage({ type: 'GET_CATALOG_AUDIO', id: audioId }, WA_ORIGIN);
}

// ── Send audio as WhatsApp voice note (PTT) via WA internal modules ──
async function _generateWaveform(audioFile) {
  try {
    const audioData = await audioFile.arrayBuffer();
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(audioData);
    const rawData = audioBuffer.getChannelData(0);
    const samples = 64;
    const blockSize = Math.floor(rawData.length / samples);
    const filteredData = [];
    for (let i = 0; i < samples; i++) {
      const blockStart = blockSize * i;
      let sum = 0;
      for (let j = 0; j < blockSize; j++) sum += Math.abs(rawData[blockStart + j]);
      filteredData.push(sum / blockSize);
    }
    const multiplier = Math.pow(Math.max(...filteredData), -1);
    return new Uint8Array(filteredData.map(n => Math.floor(100 * n * multiplier)));
  } catch (e) {
    console.warn('[WSPP CATALOG] Waveform generation failed (non-fatal):', e.message);
    return undefined;
  }
}

async function sendAudioAsPTT(audioBase64, mimeType) {
  const mime = mimeType || 'audio/ogg; codecs=opus';
  try {
    if (typeof window.require !== 'function') {
      console.error('[WSPP CATALOG] window.require not available — WA Web still loading?');
      return false;
    }

    const chatJid = _lastActiveChatJid;
    if (!chatJid) {
      console.error('[WSPP CATALOG] No active chat JID — open a conversation first');
      return false;
    }

    let chat = null;
    try {
      const Collections = window.require('WAWebCollections');
      const widFactory = window.require('WAWebWidFactory');
      const wid = widFactory.createWid(chatJid);
      chat = Collections.Chat.get(wid);
      if (!chat) {
        const FindChat = window.require('WAWebFindChatAction');
        const result = await FindChat.findOrCreateLatestChat(wid);
        chat = result?.chat ?? result;
      }
    } catch (err) {
      console.error('[WSPP CATALOG] Failed to resolve chat model:', err);
      return false;
    }
    if (!chat) {
      console.error('[WSPP CATALOG] Chat model not found for JID:', chatJid);
      return false;
    }

    const binary = atob(audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const file = new File([blob], 'voice_cesar_vasquez.ogg', { type: mime, lastModified: Date.now() });

    const OpaqueData = window.require('WAWebMediaOpaqueData');
    const opaqueData = await OpaqueData.createFromData(file, mime);

    const { prepRawMedia } = window.require('WAWebPrepRawMedia');
    const mediaPrep = prepRawMedia(opaqueData, {
      isPtt: true,
      asSticker: false,
      asGif: false,
      asDocument: false,
    });
    const mediaData = await mediaPrep.waitForPrep();
    console.log('[WSPP CATALOG] prepRawMedia done, type:', mediaData.type, 'filehash:', mediaData.filehash?.slice(0, 12));

    const waveform = await _generateWaveform(file);
    if (waveform) mediaData.waveform = waveform;

    const { getOrCreateMediaObject } = window.require('WAWebMediaStorage');
    const mediaObject = getOrCreateMediaObject(mediaData.filehash);
    const { msgToMediaType } = window.require('WAWebMmsMediaTypes');
    const mediaType = msgToMediaType({ type: mediaData.type, isGif: false });

    if (!(mediaData.mediaBlob instanceof OpaqueData)) {
      mediaData.mediaBlob = await OpaqueData.createFromData(mediaData.mediaBlob, mediaData.mediaBlob.type);
    }
    mediaData.renderableUrl = mediaData.mediaBlob.url();
    mediaObject.consolidate(mediaData.toJSON());
    mediaData.mediaBlob.autorelease();

    const { uploadMedia } = window.require('WAWebMediaMmsV4Upload');
    const uploadedMedia = await uploadMedia({ mimetype: mediaData.mimetype, mediaObject, mediaType });
    const mediaEntry = uploadedMedia?.mediaEntry;
    if (!mediaEntry) throw new Error('Upload failed: no mediaEntry returned');

    mediaData.set({
      clientUrl: mediaEntry.mmsUrl,
      deprecatedMms3Url: mediaEntry.deprecatedMms3Url,
      directPath: mediaEntry.directPath,
      mediaKey: mediaEntry.mediaKey,
      mediaKeyTimestamp: mediaEntry.mediaKeyTimestamp,
      filehash: mediaObject.filehash,
      encFilehash: mediaEntry.encFilehash,
      uploadhash: mediaEntry.uploadHash,
      size: mediaObject.size,
      streamingSidecar: mediaEntry.sidecar,
      firstFrameSidecar: mediaEntry.firstFrameSidecar,
    });

    console.log('[WSPP CATALOG] Upload done, directPath:', mediaEntry.directPath?.slice(0, 30));

    const { getMaybeMePnUser } = window.require('WAWebUserPrefsMeUser');
    const meUser = getMaybeMePnUser();
    const newId = await window.require('WAWebMsgKey').newId();
    const MsgKey = window.require('WAWebMsgKey');
    const newMsgKey = new MsgKey({ from: meUser, to: chat.id, id: newId, selfDir: 'out' });

    const ephemeralFields = window.require('WAWebGetEphemeralFieldsMsgActionsUtils').getEphemeralFields(chat);

    const mediaJSON = mediaData.toJSON ? mediaData.toJSON() : mediaData;
    const message = {
      ...mediaJSON,
      ...ephemeralFields,
      id: newMsgKey,
      ack: 0,
      from: meUser,
      to: chat.id,
      local: true,
      self: 'out',
      t: Math.floor(Date.now() / 1000),
      isNewMsg: true,
      type: 'ptt',
      mimetype: mime,
    };

    const { addAndSendMsgToChat } = window.require('WAWebSendMsgChatAction');
    const [msgPromise] = addAndSendMsgToChat(chat, message);
    await msgPromise;

    console.log('[WSPP CATALOG] PTT voice note sent to', chatJid);
    return true;

  } catch (err) {
    console.error('[WSPP CATALOG] PTT send error:', err.message, err.stack?.slice(0, 300));
    return false;
  }
}

// ── Receive catalog data from background ────────────────────────────
window.addEventListener('message', (e) => {
  if (e.source !== window) return;

  if (e.data?.type === 'AUDIO_CATALOG_READY') {
    _catalogLoading = false;
    if (e.data.ok && e.data.items) {
      _catalogItems = e.data.items;
      console.log('[WSPP CATALOG] Loaded', _catalogItems.length, 'items');
    } else {
      console.warn('[WSPP CATALOG] Error loading catalog:', e.data.error);
    }
    if (_catalogPanelOpen) renderCatalogPanel();
    return;
  }

  if (e.data?.type === 'CATALOG_AUDIO_READY') {
    if (!e.data.ok || !e.data.audioBase64) {
      console.error('[WSPP CATALOG] Audio error:', e.data.error);
      _showCatalogStatus('Error: ' + (e.data.error || 'audio no disponible'), '#ef5350', 3500);
      document.querySelectorAll('.wspp-catalog-item').forEach(el => {
        el.style.pointerEvents = ''; el.style.opacity = '';
      });
      return;
    }

    _showCatalogStatus('Enviando nota de voz...', '#00a884');

    sendAudioAsPTT(e.data.audioBase64, e.data.mimeType).then(ok => {
      if (ok) {
        _showCatalogStatus((e.data.label || 'Audio') + ' — enviado ✓', '#00a884', 3000);
        console.log('[WSPP CATALOG] PTT voice note sent successfully');
      } else {
        _showCatalogStatus('Error al enviar — abre un chat primero', '#ef5350', 3500);
      }
      setTimeout(() => {
        document.querySelectorAll('.wspp-catalog-item').forEach(el => {
          el.style.pointerEvents = ''; el.style.opacity = '';
        });
      }, 1200);
    });
    return;
  }

  if (e.data?.type === 'GENERATE_CATALOG_AUDIO_DONE') {
    if (_pendingRegenBtn) {
      _pendingRegenBtn.el.innerHTML = _pendingRegenBtn.orig;
      _pendingRegenBtn.el.disabled = false;
      _pendingRegenBtn = null;
    }
    if (e.data.ok) {
      const idx = _catalogItems.findIndex(i => i.id === e.data.id);
      if (idx >= 0) {
        _catalogItems[idx] = { ..._catalogItems[idx], has_audio: true, audio_size: e.data.audioSize, duration_ms: e.data.durationMs };
      }
      window.postMessage({ type: 'BUST_AUDIO_CACHE', id: e.data.id }, WA_ORIGIN);
      _showCatalogStatus('Audio regenerado ✓', '#00a884', 2500);
      if (_catalogPanelOpen) renderCatalogPanel();
    } else {
      _showCatalogStatus('Error al regenerar: ' + (e.data.error || 'intenta de nuevo'), '#ef5350', 4000);
    }
    _pendingRegenId = null;
    return;
  }

  if (e.data?.type === 'UPDATE_CATALOG_SCRIPT_DONE') {
    if (_pendingUpdateBtn) {
      _pendingUpdateBtn.el.innerHTML = _pendingUpdateBtn.orig;
      _pendingUpdateBtn.el.disabled = false;
      _pendingUpdateBtn = null;
    }
    if (e.data.ok) {
      const idx = _catalogItems.findIndex(i => i.id === e.data.id);
      if (idx >= 0) {
        _catalogItems[idx] = { ..._catalogItems[idx], script_text: e.data.script_text, has_audio: false, audio_size: 0, duration_ms: 0 };
      }
      window.postMessage({ type: 'BUST_CATALOG_CACHE' }, WA_ORIGIN);
      _catalogEditingId = null;
      _showCatalogStatus('Guión guardado — regenerá el audio ✓', '#00a884', 3000);
      if (_catalogPanelOpen) renderCatalogPanel();
    } else {
      _showCatalogStatus('Error al guardar: ' + (e.data.error || 'intenta de nuevo'), '#ef5350', 4000);
    }
    _pendingUpdateId = null;
    return;
  }

  if (e.data?.type === 'DELETE_CATALOG_ITEM_DONE') {
    if (_pendingDeleteBtn) {
      _pendingDeleteBtn.el.innerHTML = _pendingDeleteBtn.orig;
      _pendingDeleteBtn.el.disabled = false;
      _pendingDeleteBtn = null;
    }
    if (e.data.ok) {
      _catalogItems = _catalogItems.filter(i => i.id !== e.data.id);
      window.postMessage({ type: 'BUST_CATALOG_CACHE' }, WA_ORIGIN);
      _catalogView = 'category';
      _catalogDetailId = null;
      _showCatalogStatus('Plantilla eliminada ✓', '#00a884', 2500);
      if (_catalogPanelOpen) renderCatalogPanel();
    } else {
      _showCatalogStatus('Error al eliminar: ' + (e.data.error || 'intenta de nuevo'), '#ef5350', 4000);
    }
    _pendingDeleteId = null;
    return;
  }

  if (e.data?.type === 'CREATE_CATALOG_ITEM_DONE') {
    if (_pendingCreateBtn) {
      _pendingCreateBtn.el.innerHTML = _pendingCreateBtn.orig;
      _pendingCreateBtn.el.disabled = false;
      _pendingCreateBtn = null;
    }
    if (e.data.ok && e.data.item) {
      _catalogItems.push(e.data.item);
      window.postMessage({ type: 'BUST_CATALOG_CACHE' }, WA_ORIGIN);
      _catalogCategory = e.data.item.category;
      _catalogView = 'category';

      if (e.data.audio_generated) {
        // Backend auto-generated audio — item already has audio ready to send
        _showCatalogStatus('Plantilla creada con audio ✓', '#00a884', 3000);
      } else if (e.data.audio_error) {
        // Item created but TTS failed — show warning, user can regenerate manually
        _showCatalogStatus('Plantilla creada — audio falló: ' + e.data.audio_error.slice(0, 60), '#f59e0b', 5000);
      } else {
        // No auto_generate flag or TTS not configured — prompt manual generation
        _showCatalogStatus('Plantilla creada — generá el audio ✓', '#00a884', 3000);
      }

      if (_catalogPanelOpen) renderCatalogPanel();
    } else {
      _showCatalogStatus('Error al crear: ' + (e.data.error || 'intenta de nuevo'), '#ef5350', 4000);
    }
    return;
  }

  // ── Dynamic categories responses ──────────────────────────────────
  if (e.data?.type === 'CATALOG_CATEGORIES_READY') {
    _catalogCategoriesLoading = false;
    if (e.data.ok && e.data.categories) {
      _catalogCategories = e.data.categories;
      console.log('[WSPP CATALOG] Loaded', _catalogCategories.length, 'categories');
    } else {
      console.warn('[WSPP CATALOG] Error loading categories:', e.data.error);
    }
    if (_catalogPanelOpen) renderCatalogPanel();
    return;
  }

  if (e.data?.type === 'CREATE_CATALOG_CATEGORY_DONE') {
    if (e.data.ok && e.data.category) {
      _catalogCategories.push(e.data.category);
      _showCatalogStatus('Categoría creada ✓', '#00a884', 2500);
      if (_catalogPanelOpen) renderCatalogPanel();
    } else {
      _showCatalogStatus('Error al crear categoría: ' + (e.data.error || 'intenta de nuevo'), '#ef5350', 4000);
    }
    return;
  }

  if (e.data?.type === 'DELETE_CATALOG_CATEGORY_DONE') {
    if (_pendingDeleteCatBtn) {
      _pendingDeleteCatBtn.el.innerHTML = _pendingDeleteCatBtn.orig;
      _pendingDeleteCatBtn.el.disabled = false;
    }
    if (e.data.ok) {
      const deletedKey = _pendingDeleteCatBtn?.catKey;
      // Remove from local state
      _catalogCategories = _catalogCategories.filter(c => c.id !== e.data.id);
      // Also remove all items in that category from local state
      if (deletedKey) {
        _catalogItems = _catalogItems.filter(i => i.category !== deletedKey);
      }
      window.postMessage({ type: 'BUST_CATALOG_CACHE' }, WA_ORIGIN);
      _catalogView = 'grid';
      _catalogCategory = null;
      _showCatalogStatus('Categoría eliminada ✓', '#00a884', 2500);
      if (_catalogPanelOpen) renderCatalogPanel();
    } else {
      _showCatalogStatus('Error al eliminar categoría: ' + (e.data.error || 'intenta de nuevo'), '#ef5350', 4000);
    }
    _pendingDeleteCatBtn = null;
    return;
  }
});

// ── Insert catalog button when chat is ready ────────────────────────
const MAX_CATALOG_BTN_RETRIES = 30;
let _catalogBtnRetries = 0;

export function waitForChatAndInsertButton() {
  if (document.getElementById('wspp-catalog-btn')) return;
  if (document.querySelector('#main') || document.querySelector('.two')) {
    createCatalogButton();
    console.log('[WSPP CATALOG] Button inserted');
    return;
  }
  _catalogBtnRetries++;
  if (_catalogBtnRetries < MAX_CATALOG_BTN_RETRIES) {
    setTimeout(waitForChatAndInsertButton, 2000);
  } else {
    console.warn('[WSPP CATALOG] Chat container not found after', MAX_CATALOG_BTN_RETRIES, 'retries');
  }
}
