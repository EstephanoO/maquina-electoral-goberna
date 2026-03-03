// crm.js — lógica del CRM, se comunica con inject.js via postMessage
'use strict';

// ── Estado global ──────────────────────────────────────────────────
const state = {
  me:            null,
  chats:         [],
  contacts:      [],
  activeChat:    null,
  activeMsgs:    [],
  tab:           'chats',
  search:        '',
  unreadByChat:  {},   // chatId → count
  liveMessages:  [],   // mensajes recibidos en esta sesión
};

// ── Utilidades ────────────────────────────────────────────────────
function initials(name) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000) return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  if (diff < 604800000) return d.toLocaleDateString('es', { weekday: 'short' });
  return d.toLocaleDateString('es', { day: '2-digit', month: '2-digit' });
}

function isGroup(chatId) {
  return chatId?.includes('@g.us');
}

// ── Comunicación con inject.js ────────────────────────────────────
// El CRM corre en la ventana del popup, necesita hablar con el tab de WhatsApp
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

// Escuchar mensajes en tiempo real desde inject.js via background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'WSPP_NEW_MSG') {
    handleNewMessage(msg.payload);
  }
  if (msg.type === 'WSPP_ME') {
    updateMe(msg.payload);
  }
  if (msg.type === 'WSPP_CHATS_UPDATE') {
    state.chats = msg.payload;
    renderChatList();
  }
});

// ── Inicialización ────────────────────────────────────────────────
async function init() {
  // Pedir datos al tab de WhatsApp
  const result = await sendToWhatsApp('scan');
  if (!result) {
    document.getElementById('chat-list').innerHTML = `
      <div class="empty">
        <div class="icon">⚠️</div>
        <div class="title">WhatsApp no detectado</div>
        <div class="sub">Abre web.whatsapp.com primero</div>
      </div>`;
    return;
  }

  if (result.me) updateMe(result.me);
  if (result.chats) {
    state.chats = result.chats;
    renderChatList();
  }
  if (result.contacts) {
    state.contacts = result.contacts;
  }

  updateStats(result);
}

// ── Actualizar usuario conectado ──────────────────────────────────
function updateMe(me) {
  state.me = me;
  document.getElementById('me-name').textContent    = me.pushname || 'Conectado';
  document.getElementById('me-platform').textContent = me.platform || 'WhatsApp Web';
  document.getElementById('me-avatar').textContent   = initials(me.pushname);
  document.getElementById('conn-dot').style.background = '#00a884';
}

// ── Renderizar lista de chats ─────────────────────────────────────
function renderChatList() {
  const list   = document.getElementById('chat-list');
  const search = state.search.toLowerCase();

  let chats = state.chats;
  if (search) {
    chats = chats.filter(c =>
      (c.name || c.id || '').toLowerCase().includes(search)
    );
  }

  if (!chats.length) {
    list.innerHTML = `<div class="empty"><div class="icon">🔍</div><div class="sub">Sin resultados</div></div>`;
    return;
  }

  list.innerHTML = chats.map(chat => {
    const group   = isGroup(chat.id);
    const unread  = chat.unread || 0;
    const name    = chat.name || chat.id?.replace(/@.+/, '') || '?';
    const preview = chat.lastMsg || '';
    const time    = formatTime(chat.lastMsgTime);
    const active  = state.activeChat?.id === chat.id ? 'active' : '';

    return `
      <div class="chat-item ${active}" data-id="${chat.id}">
        <div class="avatar ${group ? 'group' : ''}">${group ? '👥' : initials(name)}</div>
        <div class="chat-info">
          <div class="chat-name">${name}</div>
          <div class="chat-preview">${preview}</div>
        </div>
        <div class="chat-meta">
          <div class="chat-time">${time}</div>
          ${unread > 0 ? `<div class="unread-badge">${unread > 99 ? '99+' : unread}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  // Click handlers
  list.querySelectorAll('.chat-item').forEach(el => {
    el.addEventListener('click', () => {
      const id   = el.dataset.id;
      const chat = state.chats.find(c => c.id === id);
      if (chat) openChat(chat);
    });
  });
}

// ── Renderizar lista de contactos ─────────────────────────────────
function renderContactList() {
  const list   = document.getElementById('chat-list');
  const search = state.search.toLowerCase();

  let contacts = state.contacts;
  if (search) {
    contacts = contacts.filter(c =>
      (c.name || c.pushname || c.id || '').toLowerCase().includes(search)
    );
  }

  if (!contacts.length) {
    list.innerHTML = `<div class="empty"><div class="icon">👤</div><div class="sub">Sin contactos</div></div>`;
    return;
  }

  list.innerHTML = contacts.slice(0, 200).map(c => {
    const name = c.name || c.pushname || c.id?.replace(/@.+/, '') || '?';
    return `
      <div class="contact-item">
        <div class="avatar">${initials(name)}</div>
        <div>
          <div class="contact-name">${name}</div>
          <div class="contact-id">${c.id || ''}</div>
        </div>
      </div>`;
  }).join('');
}

// ── Renderizar stats ──────────────────────────────────────────────
function renderStats() {
  const main = document.getElementById('main-panel');
  const totalUnread = state.chats.reduce((s, c) => s + (c.unread || 0), 0);
  const groups      = state.chats.filter(c => isGroup(c.id)).length;
  const directs     = state.chats.length - groups;

  main.innerHTML = `
    <div style="padding:20px;display:flex;flex-direction:column;gap:12px;">
      <div style="font-size:16px;font-weight:700;color:var(--text)">Resumen</div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        ${statCard('💬', 'Chats totales', state.chats.length)}
        ${statCard('🔴', 'No leídos', totalUnread)}
        ${statCard('👥', 'Grupos', groups)}
        ${statCard('👤', 'Directos', directs)}
        ${statCard('📇', 'Contactos', state.contacts.length)}
        ${statCard('📨', 'Live msgs', state.liveMessages.length)}
      </div>

      <div style="font-size:13px;font-weight:600;color:var(--text);margin-top:8px;">Mensajes recientes (live)</div>
      <div style="display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto;">
        ${state.liveMessages.slice(-20).reverse().map(m => `
          <div style="background:var(--surface);padding:8px 12px;border-radius:8px;font-size:12px;">
            <div style="color:var(--green);font-weight:600;margin-bottom:2px;">${m.from?.replace(/@.+/,'')}</div>
            <div>${m.body || '[media]'}</div>
            <div style="color:var(--text-sub);font-size:10px;margin-top:2px;">${formatTime(m.timestamp)}</div>
          </div>`).join('') || '<div style="color:var(--text-sub);font-size:12px;">Sin mensajes aún</div>'}
      </div>
    </div>`;
}

function statCard(icon, label, value) {
  return `
    <div style="background:var(--surface);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:4px;">
      <div style="font-size:20px;">${icon}</div>
      <div style="font-size:22px;font-weight:700;color:var(--text);">${value}</div>
      <div style="font-size:11px;color:var(--text-sub);">${label}</div>
    </div>`;
}

// ── Abrir chat ────────────────────────────────────────────────────
async function openChat(chat) {
  state.activeChat = chat;
  renderChatList(); // actualizar .active

  const main = document.getElementById('main-panel');
  const name = chat.name || chat.id?.replace(/@.+/, '') || '?';
  const group = isGroup(chat.id);

  main.innerHTML = `
    <div class="chat-header">
      <div class="avatar ${group ? 'group' : ''}">${group ? '👥' : initials(name)}</div>
      <div class="info">
        <div class="chat-name">${name}</div>
        <div class="chat-sub">${chat.id}</div>
      </div>
      <span class="live-badge"><span class="live-dot"></span>LIVE</span>
    </div>
    <div class="stats-bar">
      <div class="stat-pill">No leídos: <span>${chat.unread || 0}</span></div>
      <div class="stat-pill">Tipo: <span>${group ? 'Grupo' : 'Directo'}</span></div>
    </div>
    <div class="messages" id="messages-container">
      <div class="loading"><div class="spinner"></div></div>
    </div>`;

  // Pedir mensajes del chat
  const result = await sendToWhatsApp('getMsgs', { chatId: chat.id });
  const msgs   = result?.msgs || [];
  renderMessages(msgs);
}

// ── Renderizar mensajes ───────────────────────────────────────────
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
    return `
      <div class="msg-bubble ${mine ? 'mine' : 'their'}">
        ${!mine && m.from ? `<div class="msg-from">${m.from.replace(/@.+/, '')}</div>` : ''}
        <div>${m.body || '[media]'}</div>
        <div class="msg-time">${time}</div>
      </div>`;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

// ── Manejar mensajes nuevos en tiempo real ────────────────────────
function handleNewMessage(msg) {
  state.liveMessages.push(msg);

  // Actualizar unread en sidebar
  const chat = state.chats.find(c => c.id === msg.from || c.id === msg.chatId);
  if (chat) {
    chat.unread  = (chat.unread || 0) + 1;
    chat.lastMsg = msg.body?.slice(0, 40) || '[media]';
    chat.lastMsgTime = msg.timestamp;

    // Mover al top
    state.chats = [chat, ...state.chats.filter(c => c.id !== chat.id)];
    if (state.tab === 'chats') renderChatList();
  }

  // Si el chat activo recibe un mensaje, añadir bubble
  if (state.activeChat &&
     (state.activeChat.id === msg.from || state.activeChat.id === msg.chatId)) {
    const container = document.getElementById('messages-container');
    if (container) {
      const div = document.createElement('div');
      div.className = 'msg-bubble their';
      div.innerHTML = `
        <div class="msg-from">${(msg.from || '').replace(/@.+/, '')}</div>
        <div>${msg.body || '[media]'}</div>
        <div class="msg-time">${formatTime(msg.timestamp)}</div>`;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }
  }

  // Flash en stats si está activa
  if (state.tab === 'stats') renderStats();
}

function updateStats(data) {
  if (data.chats !== undefined) {
    const totalUnread = state.chats.reduce((s, c) => s + (c.unread || 0), 0);
    // Solo actualizar si stats está visible
    if (state.tab === 'stats') renderStats();
  }
}

// ── Tabs ──────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.tab = tab.dataset.tab;
    state.search = '';
    document.getElementById('search-input').value = '';

    if (state.tab === 'chats') renderChatList();
    if (state.tab === 'contacts') renderContactList();
    if (state.tab === 'stats') {
      renderStats();
      document.getElementById('main-panel').innerHTML = `<div class="empty"><div class="icon">📊</div><div class="title">Stats</div><div class="sub">Vista en sidebar</div></div>`;
    }
  });
});

// ── Search ────────────────────────────────────────────────────────
document.getElementById('search-input').addEventListener('input', (e) => {
  state.search = e.target.value;
  if (state.tab === 'chats')    renderChatList();
  if (state.tab === 'contacts') renderContactList();
});

// ── Init ──────────────────────────────────────────────────────────
init();
