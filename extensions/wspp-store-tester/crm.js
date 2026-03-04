// crm.js — v4 — lógica del CRM popup, comunica con inject.js via background relay
'use strict';

// ── Estado global ──────────────────────────────────────────────────
const state = {
  me:           null,
  chats:        [],
  contacts:     [],
  activeChat:   null,
  activeMsgs:   [],
  tab:          'chats',
  search:       '',
  liveMessages: [],   // mensajes recibidos en esta sesión (live)
};

// ── Utilidades ─────────────────────────────────────────────────────
function initials(name) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function formatTime(ts) {
  if (!ts) return '';
  const d   = new Date(ts * 1000);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000)  return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  if (diff < 604800000) return d.toLocaleDateString('es', { weekday: 'short' });
  return d.toLocaleDateString('es', { day: '2-digit', month: '2-digit' });
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function isGroup(chatId) {
  return String(chatId || '').includes('@g.us');
}

// ── Comunicación con tab de WhatsApp ──────────────────────────────
async function getWhatsAppTab() {
  const tabs = await chrome.tabs.query({ url: ['*://web.whatsapp.com/*'] });
  return tabs[0] || null;
}

async function sendToWhatsApp(action, data = {}) {
  const tab = await getWhatsAppTab();
  if (!tab) return null;
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, { action, ...data }, (res) => {
      resolve(res || null);
    });
  });
}

// Mensajes en tiempo real desde inject.js via background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'WSPP_NEW_MSG')      handleNewMessage(msg.payload);
  if (msg.type === 'WSPP_ME')           updateMe(msg.payload);
  if (msg.type === 'WSPP_CHATS_UPDATE') { state.chats = msg.payload; renderList(); }
});

// ── Inicialización ─────────────────────────────────────────────────
async function init() {
  const listArea = document.getElementById('list-area');
  listArea.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;

  const result = await sendToWhatsApp('scan');
  if (!result) {
    listArea.innerHTML = `
      <div class="empty">
        <div class="icon">⚠️</div>
        <div class="title">WhatsApp no detectado</div>
        <div class="sub">Abre web.whatsapp.com primero</div>
      </div>`;
    return;
  }

  if (result.me)       updateMe(result.me);
  if (result.chats)    { state.chats    = result.chats;    }
  if (result.contacts) { state.contacts = result.contacts; }

  renderList();
}

// ── Usuario conectado ──────────────────────────────────────────────
function updateMe(me) {
  state.me = me;
  const dot = document.getElementById('conn-dot');
  document.getElementById('me-name').textContent      = me.pushname || 'Conectado';
  document.getElementById('me-platform').textContent  = me.platform || 'WhatsApp Web';
  document.getElementById('me-avatar').textContent    = initials(me.pushname);
  if (dot) { dot.classList.add('live'); }
}

// ── Render list dispatcher ─────────────────────────────────────────
function renderList() {
  if (state.tab === 'chats')    renderChatList();
  if (state.tab === 'contacts') renderContactList();
  if (state.tab === 'stats')    renderStats();
}

// ── Lista de chats ─────────────────────────────────────────────────
function renderChatList() {
  const listArea = document.getElementById('list-area');
  const search   = state.search.toLowerCase();

  let chats = state.chats;
  if (search) {
    chats = chats.filter(c => (c.name || c.id || '').toLowerCase().includes(search));
  }

  if (!chats.length) {
    listArea.innerHTML = `<div class="empty"><div class="icon">🔍</div><div class="sub">Sin resultados</div></div>`;
    return;
  }

  listArea.innerHTML = chats.map(chat => {
    const group   = isGroup(chat.id);
    const unread  = chat.unread || 0;
    const name    = chat.name || String(chat.id || '').replace(/@.+/, '') || '?';
    const preview = esc(chat.lastMsg || '');
    const time    = formatTime(chat.lastMsgTime);
    const active  = state.activeChat?.id === chat.id ? 'active' : '';
    const unreadClass = unread > 0 ? 'unread' : '';

    return `
      <div class="chat-item ${active}" data-id="${esc(chat.id)}">
        <div class="avatar ${group ? 'group' : ''} ${unreadClass}">
          ${group ? '👥' : esc(initials(name))}
        </div>
        <div class="chat-info">
          <div class="chat-name">${esc(name)}</div>
          <div class="chat-preview">${preview || '<span style="opacity:.4">Sin mensajes</span>'}</div>
        </div>
        <div class="chat-meta">
          <div class="chat-time">${time}</div>
          ${unread > 0 ? `<div class="unread-badge">${unread > 99 ? '99+' : unread}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  listArea.querySelectorAll('.chat-item').forEach(el => {
    el.addEventListener('click', () => {
      const id   = el.dataset.id;
      const chat = state.chats.find(c => c.id === id);
      if (chat) openChat(chat);
    });
  });
}

// ── Lista de contactos ─────────────────────────────────────────────
function renderContactList() {
  const listArea = document.getElementById('list-area');
  const search   = state.search.toLowerCase();

  let contacts = state.contacts;
  if (search) {
    contacts = contacts.filter(c =>
      (c.name || c.pushname || c.id || '').toLowerCase().includes(search)
    );
  }

  if (!contacts.length) {
    listArea.innerHTML = `<div class="empty"><div class="icon">👤</div><div class="sub">Sin contactos</div></div>`;
    return;
  }

  listArea.innerHTML = contacts.slice(0, 200).map(c => {
    const name = c.name || c.pushname || String(c.id || '').replace(/@.+/, '') || '?';
    return `
      <div class="contact-item">
        <div class="avatar">${esc(initials(name))}</div>
        <div>
          <div class="contact-name">${esc(name)}</div>
          <div class="contact-id">${esc(c.id || '')}</div>
        </div>
      </div>`;
  }).join('');
}

// ── Stats ──────────────────────────────────────────────────────────
function renderStats() {
  const main        = document.getElementById('main-panel');
  const totalUnread = state.chats.reduce((s, c) => s + (c.unread || 0), 0);
  const groups      = state.chats.filter(c => isGroup(c.id)).length;
  const directs     = state.chats.length - groups;

  // Show stats in list-area for consistency with tab pattern
  const listArea = document.getElementById('list-area');
  listArea.innerHTML = `
    <div class="stats-view">
      <div class="stats-title">Resumen de sesión</div>
      <div class="stats-grid">
        ${statCard('💬', 'Chats totales', state.chats.length)}
        ${statCard('🔴', 'No leídos',     totalUnread)}
        ${statCard('👥', 'Grupos',        groups)}
        ${statCard('👤', 'Directos',      directs)}
        ${statCard('📇', 'Contactos',     state.contacts.length)}
        ${statCard('📨', 'Live msgs',     state.liveMessages.length)}
      </div>

      <div class="section-label">Mensajes recientes (live)</div>
      <div class="live-msg-list">
        ${state.liveMessages.length === 0
          ? `<div style="color:var(--text-mute);font-size:12px;text-align:center;padding:12px">Sin mensajes aún</div>`
          : state.liveMessages.slice(-20).reverse().map(m => `
            <div class="live-msg-item">
              <div class="live-msg-from">${esc(String(m.from || '').replace(/@.+/, ''))}</div>
              <div class="live-msg-body">${esc(m.body || '[media]')}</div>
              <div class="live-msg-time">${formatTime(m.timestamp)}</div>
            </div>`).join('')}
      </div>
    </div>`;

  // Also keep main panel placeholder when no chat selected
  if (!state.activeChat) {
    main.innerHTML = `
      <div class="empty">
        <div class="icon" style="font-size:40px;opacity:.15">◆</div>
        <div class="title">Goberna CRM</div>
        <div class="sub">Selecciona un chat para ver sus mensajes</div>
      </div>`;
  }
}

function statCard(icon, label, value) {
  return `
    <div class="stat-card">
      <div class="stat-card-icon">${icon}</div>
      <div class="stat-card-val">${value}</div>
      <div class="stat-card-label">${label}</div>
    </div>`;
}

// ── Abrir chat ─────────────────────────────────────────────────────
async function openChat(chat) {
  state.activeChat = chat;
  // Clear unread for this chat in state
  const idx = state.chats.findIndex(c => c.id === chat.id);
  if (idx !== -1) state.chats[idx].unread = 0;
  renderList(); // refresh active highlight + unread

  const main  = document.getElementById('main-panel');
  const name  = chat.name || String(chat.id || '').replace(/@.+/, '') || '?';
  const group = isGroup(chat.id);

  main.innerHTML = `
    <div class="chat-header">
      <div class="avatar ${group ? 'group' : ''}">${group ? '👥' : esc(initials(name))}</div>
      <div class="info">
        <div class="chat-name">${esc(name)}</div>
        <div class="chat-sub">${esc(String(chat.id || ''))}</div>
      </div>
      <span class="live-badge"><span class="live-dot"></span>LIVE</span>
    </div>
    <div class="stats-bar">
      <div class="stat-pill">No leídos: <span id="hdr-unread">${chat.unread || 0}</span></div>
      <div class="stat-pill">Tipo: <span>${group ? 'Grupo' : 'Directo'}</span></div>
      ${chat.pinned  ? `<div class="stat-pill">📌 Fijado</div>` : ''}
      ${chat.archived ? `<div class="stat-pill" style="color:var(--orange)">Archivado</div>` : ''}
    </div>
    <div class="messages" id="messages-container">
      <div class="loading"><div class="spinner"></div></div>
    </div>`;

  const result = await sendToWhatsApp('getMsgs', { chatId: chat.id });
  const msgs   = result?.msgs || [];
  renderMessages(msgs);
}

// ── Renderizar mensajes ────────────────────────────────────────────
function renderMessages(msgs) {
  const container = document.getElementById('messages-container');
  if (!container) return;

  if (!msgs.length) {
    container.innerHTML = `<div class="empty"><div class="sub">Sin mensajes cargados</div></div>`;
    return;
  }

  container.innerHTML = msgs.map(m => {
    const mine = m.fromMe;
    const time = formatTime(m.timestamp);
    const body = esc(m.body || '[media]');
    const type = m.type !== 'chat' ? `<div class="msg-type">${esc(m.type)}</div>` : '';
    return `
      <div class="msg-bubble ${mine ? 'mine' : 'their'}">
        ${!mine && m.author
          ? `<div class="msg-from">${esc(String(m.author || m.from || '').replace(/@.+/, ''))}</div>`
          : ''}
        ${type}
        <div class="msg-body">${body}</div>
        <div class="msg-time">${time}${mine ? ' ✓' : ''}</div>
      </div>`;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

// ── Mensajes en tiempo real ────────────────────────────────────────
function handleNewMessage(msg) {
  if (!msg) return;
  state.liveMessages.push(msg);

  // Actualizar chat en la lista (unread + preview + reorden)
  const chatId = msg.chatId || msg.from;
  const chat   = state.chats.find(c => c.id === chatId);
  if (chat) {
    // Solo incrementar unread si no es el chat activo
    if (!state.activeChat || state.activeChat.id !== chatId) {
      chat.unread = (chat.unread || 0) + 1;
    }
    chat.lastMsg     = (msg.body || '[media]').slice(0, 50);
    chat.lastMsgTime = msg.timestamp;
    // Mover al top
    state.chats = [chat, ...state.chats.filter(c => c.id !== chatId)];
    if (state.tab === 'chats') renderChatList();
  }

  // Añadir burbuja si el chat activo recibe el mensaje
  if (state.activeChat &&
      (state.activeChat.id === msg.from || state.activeChat.id === msg.chatId)) {
    const container = document.getElementById('messages-container');
    if (container) {
      const div = document.createElement('div');
      div.className = 'msg-bubble their';
      div.innerHTML = `
        <div class="msg-from">${esc(String(msg.from || '').replace(/@.+/, ''))}</div>
        <div class="msg-body">${esc(msg.body || '[media]')}</div>
        <div class="msg-time">${formatTime(msg.timestamp)}</div>`;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }
  }

  // Actualizar stats si visible
  if (state.tab === 'stats') renderStats();

  // Flash badge en el tab de stats
  flashStatsBadge();
}

// ── Flash badge en tab stats cuando hay mensajes nuevos ───────────
let flashTimer = null;
function flashStatsBadge() {
  const statsTab = document.querySelector('.tab[data-tab="stats"]');
  if (!statsTab) return;
  statsTab.classList.add('flash');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => statsTab.classList.remove('flash'), 800);
}

// ── Tabs ───────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => { t.classList.remove('active', 'flash'); });
    tab.classList.add('active');
    state.tab    = tab.dataset.tab;
    state.search = '';
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    renderList();
  });
});

// ── Search ─────────────────────────────────────────────────────────
const searchInput = document.getElementById('search-input');
if (searchInput) {
  let debounce = null;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.search = e.target.value;
      renderList();
    }, 200);
  });
}

// ── Init ───────────────────────────────────────────────────────────
init();
