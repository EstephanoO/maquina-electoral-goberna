// sidebar.js — Panel lateral persistente de Goberna
//
// Reemplaza los 3 paneles flotantes (blast, validador, catálogo)
// por un único sidebar de 360px pegado a la derecha de WA Web.
//
// Tabs:
//   📋 Contactos — lista de pendientes + blast progresivo + clasificación
//   🎙 Audios    — catálogo de audios PTT (compacto)
//   📊 Estado    — número activo, warmup, spam risk, stats del día
//
// WA Web se adapta: al abrir el sidebar se agrega padding-right al
// contenedor principal de WA para que los chats no queden tapados.

import { WA_ORIGIN, getOwnNumber, isCatalogConsultor } from './bootstrap.js';
import { toggleBlastPanel, isBlastPanelOpen } from './blast-panel.js';
import { toggleValidatorPanel, isValidatorPanelOpen } from './wa-validator-panel.js';
import { toggleCatalogPanel, isCatalogPanelOpen, sendAudioAsPTT } from './audio-catalog-panel.js';
import { fullSendFlow } from './chat-opener.js';

// ── Constantes ────────────────────────────────────────────────────────
const SIDEBAR_WIDTH  = 360;          // px
const SIDEBAR_ID     = 'wspp-sidebar';
const FAB_ID         = 'wspp-sidebar-fab';
const WA_APP_SEL     = '#app';       // contenedor raíz de WA Web
const STORAGE_KEY    = 'wspp_sidebar_tab';

// z-index hierarchy — orden determinístico, nunca mismo nivel
// Más alto = más encima visualmente
const Z = {
  fab:          2147483647,  // FAB siempre encima de todo
  toasts:       2147483647,  // toasts al mismo nivel que FAB (temporales, no se solapan con FAB)
  blast:        2147483646,  // blast modal encima del sidebar
  validator:    2147483645,  // validator modal debajo del blast, encima del sidebar
  sidebar:      2147483644,  // sidebar debajo de modales
  valOverlay:   2147483643,  // validation overlay debajo del sidebar pero encima de WA
  valStats:     2147483642,  // validator stats panel
  spamWarning:  2147483641,  // spam warning
  spamBlocker:  2147483640,  // semitransparent blocker
  catalogPanel: 2147483639,  // catálogo panel legacy
};

// Exportar para que otros módulos usen los mismos z-index
export { Z as ZINDEX };

// Colores base
const C = {
  bg:        '#0f1923',
  bgTab:     '#0a1118',
  border:    'rgba(255,255,255,0.07)',
  accent:    '#25d366',
  accentDim: 'rgba(37,211,102,0.15)',
  text:      '#e9edef',
  muted:     'rgba(255,255,255,0.4)',
  danger:    '#ef5350',
  warn:      '#ff9f0a',
};

// ── Estado del sidebar ────────────────────────────────────────────────
let _open     = false;
let _activeTab = localStorage.getItem(STORAGE_KEY) || 'contacts';

// ── Contacts state (owned by sidebar) ─────────────────────────────────
let _allContacts   = [];    // full dataset from backend
let _filteredList  = [];    // after search + filter
let _totalContacts = 0;
let _contactsLoading = false;
let _contactsLoaded  = false;
let _activeFilter  = '';     // '' = all, 'pendiente', 'hablado', etc.
let _searchQuery   = '';
let _searchTimer   = null;

// ── Virtual scroll state ──────────────────────────────────────────────
const ROW_HEIGHT      = 56;   // px per row (collapsed)
const OVERSCAN        = 8;    // extra rows above/below viewport
const VIEWPORT_ROWS   = 12;   // visible at once (~672px)

// ── Audio state ───────────────────────────────────────────────────────
let _audioItems       = [];
let _audioLoading     = false;
let _audioLoaded      = false;

// ── Message template (editable, persisted) ────────────────────────────
const TEMPLATE_KEY = 'wspp_sidebar_template';
const DEFAULT_TEMPLATE = `{{saludo}} {{nombre}}, te escribo de parte de la campaña del Dr. César Vásquez. Nos gustaría conversar contigo sobre las necesidades de {{distrito}}. ¿Tienes un momento?`;
let _messageTemplate = localStorage.getItem(TEMPLATE_KEY) || DEFAULT_TEMPLATE;

// ── Send flow state ───────────────────────────────────────────────────
let _sendingPhone    = null;   // phone currently being processed
let _sendPhase       = '';     // 'opening' | 'waiting' | 'sending' | 'done' | 'error'
let _sendDetail      = '';     // detail text for UI
let _sendQueue       = [];     // phones queued for sequential send

// ── Helpers DOM ────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
function _escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function _setTab(tab) {
  _activeTab = tab;
  localStorage.setItem(STORAGE_KEY, tab);
  _renderTabs();
  _renderContent();
  // Auto-load data when switching to a tab
  if (tab === 'contacts' && !_contactsLoaded && !_contactsLoading) _loadContacts();
  if (tab === 'audios'   && !_audioLoaded   && !_audioLoading)     _loadAudios();
}

// ══════════════════════════════════════════════════════════════════════
// DATA LOADING — contacts + audios via postMessage bridge
// ══════════════════════════════════════════════════════════════════════

function _loadContacts() {
  _contactsLoading = true;
  const countEl = $('wspp-contacts-count');
  if (countEl) countEl.textContent = 'Cargando contactos...';
  // Request ALL contacts (backend paginates, but we request a large batch for client-side filter)
  window.postMessage({ type: 'BLAST_GET_FORM_CONTACTS', limit: 500, offset: 0, status: '' }, WA_ORIGIN);
}

function _loadAudios() {
  _audioLoading = true;
  window.postMessage({ type: 'FETCH_AUDIO_CATALOG' }, WA_ORIGIN);
}

// ── Filter + search (client-side, instant) ────────────────────────────
function _applyFilters() {
  let list = _allContacts;

  // Filter by status / vote_class
  if (_activeFilter) {
    list = list.filter(c => {
      const status = c.cms_status || 'pendiente';
      const vote   = c.vote_class || '';
      return status === _activeFilter || vote === _activeFilter;
    });
  }

  // Search by name or phone
  if (_searchQuery.length >= 2) {
    const q = _searchQuery.toLowerCase();
    list = list.filter(c => {
      const name = ((c.nombre || '') + ' ' + (c.apellidos || '')).toLowerCase();
      const tel  = (c.telefono || '');
      return name.includes(q) || tel.includes(q);
    });
  }

  _filteredList = list;
  _renderVirtualList();
}

// ══════════════════════════════════════════════════════════════════════
// VIRTUAL SCROLL — only renders visible rows
// ══════════════════════════════════════════════════════════════════════

function _renderVirtualList() {
  const container = $('wspp-contacts-list');
  const countEl   = $('wspp-contacts-count');
  if (!container) return;

  const total = _filteredList.length;
  if (countEl) {
    const filterLabel = _activeFilter ? ` · ${_activeFilter}` : '';
    const searchLabel = _searchQuery  ? ` · "${_searchQuery}"` : '';
    countEl.textContent = `${total.toLocaleString('es-PE')} contactos${filterLabel}${searchLabel}`;
  }

  if (total === 0) {
    container.innerHTML = `<div style="text-align:center;padding:24px 12px;color:${C.muted};font-size:12px;">
      ${_contactsLoading ? 'Cargando...' : _searchQuery ? 'Sin resultados para "' + _searchQuery + '"' : 'Sin contactos con este filtro'}
    </div>`;
    container.style.height = 'auto';
    return;
  }

  // Virtual scroll: fixed-height container with spacer
  const totalHeight = total * ROW_HEIGHT;
  container.style.height = Math.min(totalHeight, VIEWPORT_ROWS * ROW_HEIGHT) + 'px';
  container.style.overflowY = 'auto';
  container.style.position = 'relative';
  container.style.overscrollBehavior = 'contain';

  // Inner spacer to maintain scroll height
  container.innerHTML = `<div id="wspp-vscroll-spacer" style="height:${totalHeight}px;position:relative;"></div>`;
  const spacer = $('wspp-vscroll-spacer');

  const renderVisible = () => {
    const scrollTop = container.scrollTop;
    const startIdx  = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const endIdx    = Math.min(total, startIdx + VIEWPORT_ROWS + OVERSCAN * 2);

    // Build only visible rows
    let html = '';
    for (let i = startIdx; i < endIdx; i++) {
      const c = _filteredList[i];
      html += `<div style="position:absolute;top:${i * ROW_HEIGHT}px;left:0;right:0;height:${ROW_HEIGHT}px;padding:0 4px;">${renderContactRow(c)}</div>`;
    }
    // Keep spacer height, replace content
    spacer.innerHTML = html;
    _bindContactRowEvents(spacer);
  };

  renderVisible();
  // Debounced scroll handler
  let _scrollRAF = null;
  container.addEventListener('scroll', () => {
    if (_scrollRAF) cancelAnimationFrame(_scrollRAF);
    _scrollRAF = requestAnimationFrame(renderVisible);
  }, { passive: true });
}

function _bindContactRowEvents(root) {
  // Expand/collapse
  root.querySelectorAll('.wspp-contact-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]')) return;
      const actions = row.querySelector('.wspp-contact-actions');
      if (!actions) return;
      const isOpen = actions.style.display === 'flex';
      root.querySelectorAll('.wspp-contact-actions').forEach(a => a.style.display = 'none');
      actions.style.display = isOpen ? 'none' : 'flex';
      // Expanding changes row height — re-render would be complex, just let it overflow
    });
  });

  // Action buttons
  root.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id     = btn.dataset.id;
      const phone  = btn.dataset.phone;

      if (action === 'send') {
        // Full send flow: open chat DOM → wait 30s → type template → send
        const contact = _allContacts.find(c => (c.telefono || '') === phone) || { nombre: '', distrito: '' };
        const msg = _personalizeTemplate(_messageTemplate, contact);

        // Disable button visually
        btn.textContent = '⏳';
        btn.disabled = true;
        btn.style.opacity = '0.5';

        _sendingPhone = phone;
        _sendPhase = 'opening';
        _sendDetail = 'Iniciando...';
        _renderContent(); // update progress bar

        fullSendFlow(phone, msg, ({ phase, detail }) => {
          _sendPhase = phase;
          _sendDetail = detail;
          _renderContent();
        }).then(result => {
          if (result.ok) {
            // Mark row as sent visually
            const row = btn.closest('.wspp-contact-row');
            if (row) { row.style.opacity = '0.4'; row.style.pointerEvents = 'none'; }
            // Mark as hablado in backend
            const contactObj = _allContacts.find(c => (c.telefono || '') === phone);
            if (contactObj?.id) {
              window.postMessage({ type: 'BLAST_MARK_HABLADO', ids: [contactObj.id], own_number: getOwnNumber() }, WA_ORIGIN);
            }
          } else {
            btn.textContent = '💬 Reintentar';
            btn.disabled = false;
            btn.style.opacity = '1';
          }
          // Clear send state after 3s
          setTimeout(() => {
            _sendingPhone = null;
            _sendPhase = '';
            _sendDetail = '';
            _renderContent();
          }, 3000);
        });
        return;
      }

      const voteMap   = { duro: 'duro', blando: 'blando', flotante: 'flotante', invalido: '' };
      const statusMap = { duro: 'respondido', blando: 'respondido', flotante: 'respondido', invalido: 'invalido' };
      window.postMessage({
        type: 'WSPP_CLASSIFY',
        payload: { validation_id: id, vote_class: voteMap[action], status: statusMap[action], _phone: phone || null },
      }, WA_ORIGIN);

      const row = btn.closest('.wspp-contact-row');
      if (row) { row.style.opacity = '0.4'; row.style.pointerEvents = 'none'; }
    });
  });
}

// ── Bridge listener — receives data from background via content ───────
window.addEventListener('message', (e) => {
  if (e.source !== window) return;

  // Contacts loaded from backend (shared with blast-panel)
  if (e.data?.type === 'BLAST_FORM_CONTACTS_READY') {
    _contactsLoading = false;
    _contactsLoaded  = true;
    if (e.data.ok) {
      _allContacts   = e.data.contacts || [];
      _totalContacts = e.data.total || _allContacts.length;
      console.log(`[SIDEBAR] ${_allContacts.length} contactos cargados (total: ${_totalContacts})`);
      _applyFilters();
    } else {
      const countEl = $('wspp-contacts-count');
      if (countEl) countEl.textContent = 'Error al cargar: ' + (e.data.error || '?');
    }
    return;
  }

  // Audio catalog loaded
  if (e.data?.type === 'AUDIO_CATALOG_READY') {
    _audioLoading = false;
    _audioLoaded  = true;
    if (e.data.ok) {
      _audioItems = e.data.items || [];
      console.log(`[SIDEBAR] ${_audioItems.length} audios cargados`);
      updateAudioList(_audioItems);
    }
    return;
  }

  // Audio regenerated
  if (e.data?.type === 'GENERATE_CATALOG_AUDIO_DONE') {
    if (e.data.ok) {
      // Bust cache + reload audios
      _audioLoaded = false;
      if (_activeTab === 'audios') _loadAudios();
    }
    return;
  }
});

// ── WA layout adaptation ───────────────────────────────────────────────
// Empuja el layout de WA Web hacia la izquierda para no tapar los chats.
function _pushWaLayout(open) {
  const app = document.querySelector(WA_APP_SEL);
  if (!app) return;
  if (open) {
    app.style.transition = 'padding-right 0.25s ease';
    app.style.paddingRight = SIDEBAR_WIDTH + 'px';
  } else {
    app.style.paddingRight = '0';
  }
}

// ── FAB toggle button ──────────────────────────────────────────────────
export function insertSidebarFAB() {
  if ($(FAB_ID)) return;

  const fab = document.createElement('button');
  fab.id = FAB_ID;
  fab.title = 'Goberna — Panel lateral';
  fab.innerHTML = _fabIcon(false);
  Object.assign(fab.style, {
    position:       'fixed',
    bottom:         '20px',
    right:          '20px',
    zIndex:         String(Z.fab),
    width:          '48px',
    height:         '48px',
    borderRadius:   '50%',
    background:     '#163960',
    border:         'none',
    cursor:         'pointer',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    boxShadow:      '0 4px 20px rgba(0,0,0,.5)',
    transition:     'transform 0.15s, background 0.15s',
  });
  fab.addEventListener('mouseenter', () => { fab.style.transform = 'scale(1.12)'; });
  fab.addEventListener('mouseleave', () => { fab.style.transform = 'scale(1)'; });
  fab.addEventListener('click', toggleSidebar);
  document.body.appendChild(fab);
}

function _fabIcon(open) {
  if (open) {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="white">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
    </svg>`;
  }
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="white">
    <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
  </svg>`;
}

// ── Toggle sidebar ────────────────────────────────────────────────────
export function toggleSidebar() {
  _open = !_open;
  const fab = $(FAB_ID);
  if (fab) {
    fab.innerHTML = _fabIcon(_open);
    fab.style.transition = 'right 0.25s ease, background 0.15s ease';
    fab.style.background = _open ? '#0d2137' : '#163960';
    if (_open) {
      fab.style.right = (SIDEBAR_WIDTH + 12) + 'px';
    } else {
      // Delay FAB move until sidebar slide-out animation finishes
      setTimeout(() => { if (!_open) fab.style.right = '20px'; }, 250);
    }
  }
  _pushWaLayout(_open);
  if (_open) {
    _renderSidebar();
    // Auto-load data for the active tab
    if (_activeTab === 'contacts' && !_contactsLoaded && !_contactsLoading) _loadContacts();
    if (_activeTab === 'audios'   && !_audioLoaded   && !_audioLoading)     _loadAudios();
  } else {
    const el = $(SIDEBAR_ID);
    if (el) {
      el.style.transform = `translateX(${SIDEBAR_WIDTH}px)`;
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 260);
    }
  }
}

export function isSidebarOpen() { return _open; }

// ── Render: shell del sidebar ──────────────────────────────────────────
function _renderSidebar() {
  let el = $(SIDEBAR_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = SIDEBAR_ID;
    Object.assign(el.style, {
      position:       'fixed',
      top:            '0',
      right:          '0',
      width:          SIDEBAR_WIDTH + 'px',
      height:         '100vh',
      zIndex:         String(Z.sidebar),
      background:     C.bg,
      borderLeft:     `1px solid ${C.border}`,
      boxShadow:      '-8px 0 32px rgba(0,0,0,.4)',
      display:        'flex',
      flexDirection:  'column',
      fontFamily:     "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif,'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji'",
      color:          C.text,
      transform:      `translateX(${SIDEBAR_WIDTH}px)`,
      opacity:        '0',
      transition:     'transform 0.25s ease, opacity 0.2s ease',
      overflowX:      'hidden',
    });
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.transform = 'translateX(0)';
      el.style.opacity = '1';
    });
  }

  el.innerHTML = `
    ${_headerHTML()}
    ${_tabBarHTML()}
    <div id="wspp-sidebar-content" style="flex:1;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;">
      ${_contentHTML()}
    </div>
    ${_footerHTML()}
  `;

  _bindEvents();
}

// ── Header ─────────────────────────────────────────────────────────────
function _headerHTML() {
  const own = getOwnNumber();
  const ownLabel = own ? `+${own}` : '⏳ detectando...';
  return `
    <div style="
      padding:12px 16px 8px;
      border-bottom:1px solid ${C.border};
      display:flex;align-items:center;justify-content:space-between;
      flex-shrink:0;
    ">
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="
          width:28px;height:28px;border-radius:7px;
          background:rgba(37,211,102,.12);
          display:flex;align-items:center;justify-content:center;
        ">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="${C.accent}">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
          </svg>
        </div>
        <div>
          <div style="font-size:12px;font-weight:700;letter-spacing:-.3px;">Goberna</div>
          <div style="font-size:11px;color:${C.muted};">${ownLabel}</div>
        </div>
      </div>
      <button id="wspp-sidebar-close" style="
        background:none;border:none;color:${C.muted};
        font-size:16px;cursor:pointer;padding:4px;line-height:1;
        border-radius:4px;
      ">✕</button>
    </div>
  `;
}

// ── Tab bar ─────────────────────────────────────────────────────────────
const TABS = [
  { id: 'contacts', icon: '📋', label: 'Contactos' },
  { id: 'audios',   icon: '🎙', label: 'Audios'    },
  { id: 'status',   icon: '📊', label: 'Estado'    },
];

function _tabBarHTML() {
  return `
    <div style="
      display:flex;border-bottom:1px solid ${C.border};
      flex-shrink:0;background:${C.bgTab};
    ">
      ${TABS.map(t => {
        const active = _activeTab === t.id;
        return `
          <button data-tab="${t.id}" style="
            flex:1;padding:10px 4px;border:none;cursor:pointer;
            background:${active ? C.bg : 'transparent'};
            color:${active ? C.accent : C.muted};
            font-size:11px;font-weight:${active ? '700' : '500'};
            border-bottom:2px solid ${active ? C.accent : 'transparent'};
            transition:all .15s;
          ">
            <div style="font-size:14px;margin-bottom:2px;">${t.icon}</div>
            ${t.label}
          </button>
        `;
      }).join('')}
    </div>
  `;
}

// ── Content router ─────────────────────────────────────────────────────
function _contentHTML() {
  if (_activeTab === 'contacts') return _contactsTabHTML();
  if (_activeTab === 'audios')   return _audiosTabHTML();
  if (_activeTab === 'status')   return _statusTabHTML();
  return '';
}

// ── Footer ──────────────────────────────────────────────────────────────
function _footerHTML() {
  return `
    <div style="
      padding:8px 12px;border-top:1px solid ${C.border};
      display:flex;gap:6px;flex-shrink:0;
    ">
      <button id="wspp-sidebar-blast-btn" style="
        flex:1;padding:9px;border-radius:8px;border:none;cursor:pointer;
        background:${C.accentDim};color:${C.accent};
        font-size:11px;font-weight:700;
      ">⚡ Blast</button>
      <button id="wspp-sidebar-val-btn" style="
        flex:1;padding:9px;border-radius:8px;border:none;cursor:pointer;
        background:rgba(96,165,250,.1);color:#60a5fa;
        font-size:11px;font-weight:700;
      ">✅ Validar</button>
      ${isCatalogConsultor() ? `
      <button id="wspp-sidebar-catalog-btn" style="
        flex:1;padding:9px;border-radius:8px;border:none;cursor:pointer;
        background:rgba(167,139,250,.1);color:#a78bfa;
        font-size:11px;font-weight:700;
      ">🎵 Catálogo</button>
      ` : ''}
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════════════
// TAB: CONTACTOS
// Lista de contactos pendientes con blast progresivo + clasificación
// ══════════════════════════════════════════════════════════════════════
// Template personalizer — same as blast-panel but simpler
const _SALUDOS = ['Hola','Buenas','Buenos días','Hola buen día','Buenas tardes'];
function _personalizeTemplate(tpl, contact) {
  const nombre   = ((contact.nombre || '') + ' ' + (contact.apellidos || '')).trim().split(/\s+/)[0] || 'amigo';
  const distrito = contact.distrito || contact.zona || '';
  const saludo   = _SALUDOS[Math.floor(Math.random() * _SALUDOS.length)];
  return tpl
    .replace(/\{\{nombre\}\}/gi, nombre)
    .replace(/\{\{distrito\}\}/gi, distrito)
    .replace(/\{\{saludo\}\}/gi, saludo)
    .trim();
}

function _contactsTabHTML() {
  const isEditing = false; // toggle via button
  return `
    <div style="padding:10px 12px 4px;">

      <!-- Template de mensaje editable -->
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="font-size:11px;color:${C.muted};font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Plantilla de mensaje</span>
          <button id="wspp-tpl-toggle" style="
            background:none;border:1px solid ${C.border};border-radius:6px;
            color:${C.muted};font-size:10px;padding:2px 8px;cursor:pointer;
          ">✏️ Editar</button>
        </div>
        <div id="wspp-tpl-preview" style="
          font-size:11px;color:rgba(255,255,255,.65);line-height:1.5;
          padding:8px 10px;border-radius:8px;
          background:rgba(255,255,255,.04);border:1px solid ${C.border};
          max-height:60px;overflow:hidden;
          cursor:pointer;
        ">${_escHtml(_messageTemplate).replace(/\{\{(\w+)\}\}/gi, '<span style="color:${C.accent};font-weight:700;">{{$1}}</span>')}</div>
        <textarea id="wspp-tpl-editor" style="
          display:none;width:100%;min-height:80px;margin-top:4px;
          background:rgba(255,255,255,.06);border:1px solid rgba(37,211,102,.3);
          border-radius:8px;padding:8px 10px;color:${C.text};
          font-size:11px;line-height:1.5;font-family:inherit;resize:vertical;
          outline:none;
        ">${_escHtml(_messageTemplate)}</textarea>
        <div style="font-size:10px;color:${C.muted};margin-top:3px;">
          Variables: <span style="color:${C.accent};">{{nombre}}</span> · <span style="color:${C.accent};">{{distrito}}</span> · <span style="color:${C.accent};">{{saludo}}</span>
        </div>
      </div>

      ${_sendingPhone ? `
      <!-- Progreso de envío actual -->
      <div style="
        margin-bottom:10px;padding:8px 12px;border-radius:8px;
        background:${_sendPhase === 'error' ? 'rgba(239,83,80,.1)' : _sendPhase === 'done' ? 'rgba(52,199,89,.1)' : 'rgba(37,211,102,.08)'};
        border:1px solid ${_sendPhase === 'error' ? 'rgba(239,83,80,.3)' : _sendPhase === 'done' ? 'rgba(52,199,89,.3)' : 'rgba(37,211,102,.2)'};
        font-size:12px;color:${_sendPhase === 'error' ? C.danger : C.accent};line-height:1.5;
      ">
        <div style="font-weight:700;">
          ${_sendPhase === 'opening' ? '🔍 Abriendo chat...' :
            _sendPhase === 'waiting' ? '⏳ Preparando contacto...' :
            _sendPhase === 'sending' ? '✍️ Escribiendo mensaje...' :
            _sendPhase === 'done'    ? '✅ Enviado' :
            _sendPhase === 'error'   ? '❌ Error' : '...'}
        </div>
        <div style="font-size:11px;opacity:.8;margin-top:2px;">
          +${_sendingPhone} · ${_sendDetail}
        </div>
      </div>
      ` : ''}

      <!-- Barra de búsqueda -->
      <div style="
        display:flex;gap:6px;align-items:center;
        background:rgba(255,255,255,.05);border:1px solid ${C.border};
        border-radius:8px;padding:6px 10px;margin-bottom:8px;
      ">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="${C.muted}">
          <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
        <input
          id="wspp-contacts-search"
          placeholder="Buscar por nombre o número..."
          style="
            background:none;border:none;outline:none;
            color:${C.text};font-size:12px;flex:1;
          "
        />
      </div>

      <!-- Filtros rápidos -->
      <div style="display:flex;gap:4px;margin-bottom:10px;flex-wrap:wrap;">
        ${[
          { key: 'pendiente', label: '⏳ Pendiente', color: '#ff9f0a' },
          { key: 'hablado',   label: '💬 Hablado',   color: '#60a5fa' },
          { key: 'duro',      label: '✅ Duro',       color: '#34c759' },
          { key: 'blando',    label: '🟡 Blando',     color: '#fde68a' },
          { key: 'flotante',  label: '🟣 Flotante',   color: '#a78bfa' },
        ].map(f => `
          <button data-filter="${f.key}" style="
            padding:3px 8px;border-radius:12px;border:1px solid ${f.color}33;
            background:${f.color}11;color:${f.color};
            font-size:10px;cursor:pointer;font-weight:600;
            white-space:nowrap;
          ">${f.label}</button>
        `).join('')}
      </div>

      <!-- Subtítulo con conteo -->
      <div id="wspp-contacts-count" style="
        font-size:10px;color:${C.muted};
        text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;
      ">Cargando contactos...</div>
    </div>

    <!-- Lista de contactos (scrollable) -->
    <div id="wspp-contacts-list" style="
      padding:0 8px 8px;
      display:flex;flex-direction:column;gap:3px;
    ">
      <div style="text-align:center;padding:24px 12px;color:${C.muted};font-size:12px;line-height:1.6;">
        Tocá <strong style="color:${C.accent};">⚡ Blast</strong> o <strong style="color:#60a5fa;">✅ Validar</strong> abajo para cargar contactos
      </div>
    </div>
  `;
}

// ── Render de una fila de contacto ─────────────────────────────────────
export function renderContactRow(contact) {
  // contact: { id, nombre, apellidos, telefono, distrito, cms_status, wa_valid, vote_class }
  const nombre = ((contact.nombre || '') + ' ' + (contact.apellidos || '')).trim() || '—';
  const tel    = contact.telefono || '—';
  const dist   = contact.distrito || '';
  const status = contact.cms_status || 'pendiente';
  const vote   = contact.vote_class || '';
  const waOk   = contact.wa_valid === true;
  const waNull = contact.wa_valid === null || contact.wa_valid === undefined;

  const statusColor = {
    pendiente:  '#ff9f0a',
    hablado:    '#60a5fa',
    respondido: '#a78bfa',
    invalido:   '#ef5350',
  }[status] || C.muted;

  const voteColor = {
    duro:     '#34c759',
    blando:   '#fde68a',
    flotante: '#a78bfa',
  }[vote] || 'transparent';

  const voteLabel = { duro: 'Duro', blando: 'Blando', flotante: 'Flotante' }[vote] || '';
  const waIcon = waNull ? '❓' : waOk ? '✅' : '❌';

  return `
    <div
      data-contact-id="${contact.id}"
      data-phone="${tel}"
      class="wspp-contact-row"
      style="
        padding:8px 10px;border-radius:8px;
        background:rgba(255,255,255,.03);
        border:1px solid ${C.border};
        cursor:pointer;
        transition:background .1s;
      "
    >
      <!-- Fila principal -->
      <div style="display:flex;align-items:center;gap:8px;">
        <!-- Indicador de vote_class -->
        <div style="
          width:3px;height:32px;border-radius:2px;flex-shrink:0;
          background:${vote ? voteColor : C.border};
        "></div>

        <!-- Info -->
        <div style="flex:1;min-width:0;">
          <div style="
            font-size:12px;font-weight:600;color:${C.text};
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
          ">${nombre}</div>
          <div style="font-size:10px;color:${C.muted};margin-top:1px;">
            ${tel}${dist ? ' · ' + dist : ''}
          </div>
        </div>

        <!-- Badges derecha -->
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;">
          <span style="font-size:10px;color:${statusColor};font-weight:600;">${status}</span>
          <div style="display:flex;align-items:center;gap:4px;">
            <span style="font-size:11px;" title="WhatsApp: ${waNull?'sin verificar':waOk?'tiene WA':'sin WA'}">${waIcon}</span>
            ${vote ? `<span style="font-size:11px;font-weight:700;color:${voteColor};background:${voteColor}22;padding:1px 5px;border-radius:8px;">${voteLabel}</span>` : ''}
          </div>
        </div>
      </div>

      <!-- Acciones (colapsadas — se expanden al click en la fila) -->
      <div class="wspp-contact-actions" style="
        display:none;margin-top:7px;padding-top:6px;
        border-top:1px solid ${C.border};
        gap:4px;flex-wrap:wrap;
      ">
        <button data-action="send" data-phone="${tel}" data-name="${nombre}" style="
          flex:1;min-width:60px;padding:5px 6px;border-radius:6px;border:none;cursor:pointer;
          background:rgba(37,211,102,.12);color:${C.accent};font-size:10px;font-weight:700;
        ">💬 Escribir</button>
        <button data-action="duro" data-id="${contact.id}" style="
          padding:5px 8px;border-radius:6px;border:none;cursor:pointer;
          background:rgba(52,199,89,.1);color:#34c759;font-size:10px;font-weight:700;
        ">✅ Duro</button>
        <button data-action="blando" data-id="${contact.id}" style="
          padding:5px 8px;border-radius:6px;border:none;cursor:pointer;
          background:rgba(253,230,138,.1);color:#fde68a;font-size:10px;font-weight:700;
        ">🟡 Blando</button>
        <button data-action="flotante" data-id="${contact.id}" style="
          padding:5px 8px;border-radius:6px;border:none;cursor:pointer;
          background:rgba(167,139,250,.1);color:#a78bfa;font-size:10px;font-weight:700;
        ">🟣 Float.</button>
        <button data-action="invalido" data-id="${contact.id}" style="
          padding:5px 8px;border-radius:6px;border:none;cursor:pointer;
          background:rgba(239,83,80,.1);color:${C.danger};font-size:10px;font-weight:700;
        ">❌ Desc.</button>
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════════════
// TAB: AUDIOS (compacto)
// Lista de audios del catálogo para enviar rápido
// ══════════════════════════════════════════════════════════════════════
function _audiosTabHTML() {
  return `
    <div style="padding:10px 12px 4px;">
      <div style="font-size:10px;color:${C.muted};text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">
        Catálogo de audios · Tocá para previsualizar · Enviá al chat activo
      </div>

      <!-- Filtro por categoría -->
      <div id="wspp-audio-cat-filter" style="
        display:flex;gap:4px;overflow-x:auto;padding-bottom:4px;margin-bottom:8px;
      ">
        <button data-audio-cat="all" style="
          padding:3px 10px;border-radius:12px;border:1px solid ${C.accent}55;
          background:${C.accentDim};color:${C.accent};
          font-size:10px;cursor:pointer;white-space:nowrap;font-weight:700;
        ">Todos</button>
      </div>
    </div>

    <!-- Lista de audios -->
    <div id="wspp-audio-list" style="padding:0 8px 8px;display:flex;flex-direction:column;gap:3px;">
      <div style="text-align:center;padding:24px 0;color:${C.muted};font-size:12px;">
        Cargando catálogo...
      </div>
    </div>
  `;
}

// ── Render de una fila de audio ────────────────────────────────────────
export function renderAudioRow(item) {
  // item: { id, label, category, has_audio, duration_ms, audio_size }
  const dur  = item.duration_ms ? _fmtDuration(item.duration_ms) : '—';
  const size = item.audio_size  ? _fmtSize(item.audio_size) : '';
  const hasAudio = !!item.has_audio;

  return `
    <div
      data-audio-id="${item.id}"
      class="wspp-audio-row"
      style="
        padding:8px 10px;border-radius:8px;
        background:rgba(255,255,255,.03);
        border:1px solid ${C.border};
        display:flex;align-items:center;gap:8px;
        cursor:${hasAudio ? 'pointer' : 'default'};
        opacity:${hasAudio ? '1' : '0.5'};
      "
    >
      <!-- Play / Sin audio -->
      <div style="
        width:32px;height:32px;border-radius:50%;flex-shrink:0;
        background:${hasAudio ? C.accentDim : 'rgba(255,255,255,.05)'};
        display:flex;align-items:center;justify-content:center;
      ">
        ${hasAudio
          ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="${C.accent}"><path d="M8 5v14l11-7z"/></svg>`
          : `<span style="font-size:14px;color:${C.muted};">—</span>`
        }
      </div>

      <!-- Info -->
      <div style="flex:1;min-width:0;">
        <div style="
          font-size:12px;font-weight:600;color:${C.text};
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        ">${item.label}</div>
        <div style="font-size:10px;color:${C.muted};margin-top:1px;">
          ${item.category}${dur !== '—' ? ' · ' + dur : ''}${size ? ' · ' + size : ''}
        </div>
      </div>

      <!-- Botón enviar -->
      ${hasAudio ? `
        <button data-audio-send="${item.id}" style="
          padding:5px 10px;border-radius:6px;border:1px solid rgba(37,211,102,.3);cursor:pointer;
          background:${C.accentDim};color:${C.accent};
          font-size:10px;font-weight:700;flex-shrink:0;
          white-space:nowrap;
        ">Enviar PTT</button>
      ` : `
        <button data-audio-regen="${item.id}" style="
          padding:5px 8px;border-radius:6px;border:1px solid rgba(255,149,0,.3);
          background:rgba(255,149,0,.08);color:${C.warn};cursor:pointer;
          font-size:10px;font-weight:700;flex-shrink:0;
        ">Generar</button>
      `}
    </div>
  `;
}

function _fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  return s < 60 ? s + 's' : Math.floor(s/60) + ':' + String(s%60).padStart(2,'0');
}
function _fmtSize(bytes) {
  return bytes < 1024 ? bytes + 'B' : bytes < 1048576 ? Math.round(bytes/1024) + 'KB' : (bytes/1048576).toFixed(1) + 'MB';
}

// ══════════════════════════════════════════════════════════════════════
// TAB: ESTADO
// Número activo, warmup, spam risk, stats del día
// ══════════════════════════════════════════════════════════════════════
function _statusTabHTML() {
  const own = getOwnNumber();

  return `
    <div style="padding:12px;">

      <!-- Número activo -->
      <div style="
        padding:10px 12px;border-radius:10px;
        background:rgba(255,255,255,.04);border:1px solid ${C.border};
        margin-bottom:8px;
      ">
        <div style="font-size:10px;color:${C.muted};text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">
          Número activo
        </div>
        <div style="font-size:18px;font-weight:800;color:${own ? C.accent : C.warn};">
          ${own ? '+' + own : '⏳ Detectando...'}
        </div>
        ${own ? `<div style="font-size:10px;color:${C.muted};margin-top:2px;">
          ${/* warmup info injected by caller */''}
        </div>` : ''}
      </div>

      <!-- Spam risk indicator -->
      <div id="wspp-sidebar-spam-status" style="
        padding:10px 12px;border-radius:10px;
        background:rgba(255,255,255,.04);border:1px solid ${C.border};
        margin-bottom:8px;
      ">
        <div style="font-size:10px;color:${C.muted};text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">
          Riesgo de spam
        </div>
        <div id="wspp-sidebar-risk-text" style="font-size:13px;font-weight:700;color:#34c759;">
          ✅ Sin riesgo detectado
        </div>
      </div>

      <!-- Stats del día -->
      <div style="
        display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;
      ">
        ${[
          { id: 'stat-sent',    label: 'Enviados hoy',  color: C.accent },
          { id: 'stat-limit',   label: 'Límite hoy',    color: '#60a5fa' },
          { id: 'stat-valid',   label: 'Validados WA',  color: '#34c759' },
          { id: 'stat-pending', label: 'Pendientes',    color: C.warn   },
        ].map(s => `
          <div style="
            padding:10px;border-radius:8px;
            background:rgba(255,255,255,.04);border:1px solid ${C.border};
            text-align:center;
          ">
            <div id="wspp-${s.id}" style="font-size:20px;font-weight:800;color:${s.color};">—</div>
            <div style="font-size:11px;color:${C.muted};margin-top:2px;text-transform:uppercase;">${s.label}</div>
          </div>
        `).join('')}
      </div>

      <!-- Alertas de spam recientes -->
      <div style="font-size:10px;color:${C.muted};text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">
        Alertas recientes
      </div>
      <div id="wspp-sidebar-spam-alerts" style="
        display:flex;flex-direction:column;gap:3px;
      ">
        <div style="font-size:11px;color:${C.muted};padding:8px 0;">Sin alertas</div>
      </div>

    </div>
  `;
}

// ── Render de tabs y contenido (update sin re-crear el shell) ─────────
function _renderTabs() {
  const el = $(SIDEBAR_ID);
  if (!el) return;
  const tabBar = el.querySelector('[data-tab]')?.closest('div');
  if (tabBar) tabBar.outerHTML = _tabBarHTML();
}

function _renderContent() {
  const content = $('wspp-sidebar-content');
  if (content) {
    content.innerHTML = _contentHTML();
    _bindContentEvents();
  }
}

// ── Event binding ──────────────────────────────────────────────────────
function _bindEvents() {
  // Close button
  $('wspp-sidebar-close')?.addEventListener('click', toggleSidebar);

  // Tab switching
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => _setTab(btn.dataset.tab));
  });

  // Footer action buttons
  $('wspp-sidebar-blast-btn')?.addEventListener('click', () => {
    toggleBlastPanel();
  });
  $('wspp-sidebar-val-btn')?.addEventListener('click', () => {
    toggleValidatorPanel();
  });
  $('wspp-sidebar-catalog-btn')?.addEventListener('click', () => {
    toggleCatalogPanel();
  });

  _bindContentEvents();
}

function _bindContentEvents() {
  // Contact rows — expand/collapse on click + action buttons
  document.querySelectorAll('.wspp-contact-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]')) return;
      const actions = row.querySelector('.wspp-contact-actions');
      if (!actions) return;
      const isOpen = actions.style.display === 'flex';
      // Close all others first
      document.querySelectorAll('.wspp-contact-actions').forEach(a => a.style.display = 'none');
      // Toggle this one
      actions.style.display = isOpen ? 'none' : 'flex';
    });
  });

  // Contact action buttons
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id     = btn.dataset.id;
      const phone  = btn.dataset.phone;
      const name   = btn.dataset.name || '';

      if (action === 'send') {
        // Open WA chat for this contact
        window.postMessage({ type: 'WSPP_OPEN_CHAT', phone }, WA_ORIGIN);
        return;
      }

      // Classification actions
      const voteMap = { duro: 'duro', blando: 'blando', flotante: 'flotante', invalido: '' };
      const statusMap = { duro: 'respondido', blando: 'respondido', flotante: 'respondido', invalido: 'invalido' };
      window.postMessage({
        type: 'WSPP_CLASSIFY',
        payload: {
          validation_id: id,
          vote_class:    voteMap[action],
          status:        statusMap[action],
          _phone:        phone || null,
        },
      }, WA_ORIGIN);

      // Visual feedback — update the row immediately
      const row = btn.closest('.wspp-contact-row');
      if (row) {
        row.style.opacity = '0.5';
        row.style.pointerEvents = 'none';
      }
    });
  });

  // Audio rows — play on click, send PTT
  document.querySelectorAll('.wspp-audio-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-audio-send]') || e.target.closest('[data-audio-regen]')) return;
      const id = row.dataset.audioId;
      if (id) window.postMessage({ type: 'GET_CATALOG_AUDIO', id }, WA_ORIGIN);
    });
  });

  document.querySelectorAll('[data-audio-send]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const audioId = btn.dataset.audioSend;
      btn.textContent = '⏳';
      btn.disabled = true;

      // Fetch audio base64 from background cache, then send as PTT
      // Uses the same bridge as the catalog panel: GET_CATALOG_AUDIO → CATALOG_AUDIO_READY
      const onAudioReady = (ev) => {
        if (ev.source !== window) return;
        if (ev.data?.type !== 'CATALOG_AUDIO_READY') return;
        if (!ev.data.ok || ev.data.id !== audioId) return;
        window.removeEventListener('message', onAudioReady);

        sendAudioAsPTT(ev.data.audioBase64, ev.data.mimeType).then(ok => {
          if (ok) {
            btn.textContent = '✅ Enviado';
            btn.style.color = '#34c759';
            setTimeout(() => { btn.textContent = 'Enviar PTT'; btn.disabled = false; btn.style.color = ''; }, 3000);
          } else {
            btn.textContent = '❌ Error';
            btn.style.color = '#ef5350';
            setTimeout(() => { btn.textContent = 'Enviar PTT'; btn.disabled = false; btn.style.color = ''; }, 3000);
          }
        });
      };
      window.addEventListener('message', onAudioReady);
      // Timeout fallback
      setTimeout(() => {
        window.removeEventListener('message', onAudioReady);
        if (btn.disabled) { btn.textContent = 'Enviar PTT'; btn.disabled = false; }
      }, 15000);

      window.postMessage({ type: 'GET_CATALOG_AUDIO', id: audioId }, WA_ORIGIN);
    });
  });

  document.querySelectorAll('[data-audio-regen]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      btn.textContent = '⏳';
      btn.disabled = true;
      window.postMessage({ type: 'GENERATE_CATALOG_AUDIO', id: btn.dataset.audioRegen }, WA_ORIGIN);
    });
  });

  // Filter buttons — client-side, instant
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach(b => {
        b.style.fontWeight = '600';
        b.style.opacity = '0.7';
        b.style.background = b.style.background.replace(/11$/, '11'); // keep base
      });
      const f = btn.dataset.filter;
      if (_activeFilter === f) {
        // Toggle off
        _activeFilter = '';
      } else {
        _activeFilter = f;
        btn.style.fontWeight = '800';
        btn.style.opacity = '1';
      }
      _applyFilters();
    });
  });

  // Template editor toggle
  $('wspp-tpl-toggle')?.addEventListener('click', () => {
    const preview = $('wspp-tpl-preview');
    const editor  = $('wspp-tpl-editor');
    if (!preview || !editor) return;
    const isEditing = editor.style.display !== 'none';
    if (isEditing) {
      // Save
      _messageTemplate = editor.value.trim() || DEFAULT_TEMPLATE;
      localStorage.setItem(TEMPLATE_KEY, _messageTemplate);
      editor.style.display = 'none';
      preview.style.display = 'block';
      preview.innerHTML = _escHtml(_messageTemplate).replace(
        /\{\{(\w+)\}\}/gi,
        `<span style="color:${C.accent};font-weight:700;">{{$1}}</span>`
      );
      $('wspp-tpl-toggle').textContent = '✏️ Editar';
    } else {
      // Open editor
      editor.style.display = 'block';
      editor.value = _messageTemplate;
      preview.style.display = 'none';
      $('wspp-tpl-toggle').textContent = '💾 Guardar';
      editor.focus();
    }
  });

  // Template preview click also opens editor
  $('wspp-tpl-preview')?.addEventListener('click', () => {
    $('wspp-tpl-toggle')?.click();
  });

  // Search input — debounced 200ms
  $('wspp-contacts-search')?.addEventListener('input', (e) => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      _searchQuery = (e.target.value || '').trim();
      _applyFilters();
    }, 200);
  });
}

// ── Update functions (llamadas desde otros módulos) ────────────────────

/** Actualiza la lista de contactos en el sidebar */
export function updateContactsList(contacts, total) {
  const list  = $('wspp-contacts-list');
  const count = $('wspp-contacts-count');
  if (!list) return;
  if (count) count.textContent = `${total.toLocaleString('es-PE')} contactos`;
  if (!contacts.length) {
    list.innerHTML = `<div style="text-align:center;padding:24px 0;color:${C.muted};font-size:12px;">Sin contactos</div>`;
    return;
  }
  list.innerHTML = contacts.slice(0, 80).map(renderContactRow).join('');
  _bindContentEvents();
}

/** Actualiza la lista de audios en el sidebar */
export function updateAudioList(items) {
  const list = $('wspp-audio-list');
  if (!list) return;
  if (!items.length) {
    list.innerHTML = `<div style="text-align:center;padding:24px 0;color:${C.muted};font-size:12px;">Sin audios en el catálogo</div>`;
    return;
  }
  list.innerHTML = items.map(renderAudioRow).join('');

  // Populate category filter
  const catFilter = $('wspp-audio-cat-filter');
  if (catFilter) {
    const cats = [...new Set(items.map(i => i.category))].sort();
    catFilter.innerHTML = `
      <button data-audio-cat="all" style="
        padding:3px 10px;border-radius:12px;border:1px solid ${C.accent}55;
        background:${C.accentDim};color:${C.accent};
        font-size:10px;cursor:pointer;white-space:nowrap;font-weight:700;
      ">Todos</button>
      ${cats.map(c => `
        <button data-audio-cat="${c}" style="
          padding:3px 10px;border-radius:12px;
          border:1px solid ${C.border};background:rgba(255,255,255,.04);color:${C.muted};
          font-size:10px;cursor:pointer;white-space:nowrap;
        ">${c}</button>
      `).join('')}
    `;
    catFilter.querySelectorAll('[data-audio-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.audioCat;
        const filtered = cat === 'all' ? items : items.filter(i => i.category === cat);
        const list2 = $('wspp-audio-list');
        if (list2) {
          list2.innerHTML = filtered.map(renderAudioRow).join('');
          _bindContentEvents();
        }
      });
    });
  }

  _bindContentEvents();
}

/** Actualiza el indicador de spam risk en el tab Estado */
export function updateSpamRisk(level, score) {
  const el = $('wspp-sidebar-risk-text');
  if (!el) return;
  const labels = {
    low:      '✅ Sin riesgo detectado',
    medium:   '⚠️ Riesgo medio — reducí velocidad',
    high:     '🔶 Riesgo alto — detené los envíos',
    critical: '🚨 CRÍTICO — número en riesgo de bloqueo',
  };
  const colors = { low: '#34c759', medium: '#ff9f0a', high: '#ff6b35', critical: '#ef5350' };
  el.textContent = labels[level] || labels.low;
  el.style.color  = colors[level]  || colors.low;
}

/** Actualiza las stats del día en el tab Estado */
export function updateDayStats(stats) {
  const { sent, limit, valid, pending } = stats;
  if ($('wspp-stat-sent'))    $('wspp-stat-sent').textContent    = String(sent    ?? '—');
  if ($('wspp-stat-limit'))   $('wspp-stat-limit').textContent   = String(limit   ?? '—');
  if ($('wspp-stat-valid'))   $('wspp-stat-valid').textContent   = String(valid   ?? '—');
  if ($('wspp-stat-pending')) $('wspp-stat-pending').textContent = String(pending ?? '—');
}
