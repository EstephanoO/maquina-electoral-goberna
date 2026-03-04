// inject.js - v12 CRM — devuelve datos estructurados para el CRM
(function() {
  console.log('[WSPP] Injector v12-CRM');



  function req(name) {
    try { return window.require(name); } catch(e) { return {}; }
  }

  function getStore() {
    return {
      ChatCollection:    req('WAWebChatCollection').ChatCollection,
      MsgCollection:     req('WAWebMsgCollection').MsgCollection,
      ContactCollection: req('WAWebContactCollection').ContactCollection,
      Conn:              req('WAWebConnModel').Conn,
    };
  }

  // ── Serializar chat ──────────────────────────────────────────────
  function serializeChat(chat) {
    try {
      return {
        id:          chat.id?._serialized || chat.get?.('id')?._serialized || '',
        name:        chat.get?.('name') || chat.name || null,
        unread:      chat.get?.('unreadCount') ?? 0,
        isGroup:     chat.get?.('isGroup') ?? false,
        lastMsg:     chat.get?.('lastMessage')?.get?.('body') || null,
        lastMsgTime: chat.get?.('t') || null,
        muteExpiry:  chat.get?.('muteExpiry') || 0,
        pinned:      chat.get?.('pin') || false,
        archived:    chat.get?.('archive') || false,
      };
    } catch(e) { return null; }
  }

  // ── Serializar mensaje ───────────────────────────────────────────
  function serializeMsg(msg) {
    try {
      const id = msg.get?.('id') || msg.id;
      return {
        id:        id?._serialized || '',
        fromMe:    id?.fromMe ?? false,
        from:      msg.get?.('from')?._serialized || msg.from?._serialized || '',
        to:        msg.get?.('to')?._serialized || '',
        body:      msg.get?.('body') || msg.body || '',
        type:      msg.get?.('type') || msg.type || 'chat',
        timestamp: msg.get?.('t') || msg.t || 0,
        chatId:    msg.get?.('chatId')?._serialized || null,
        author:    msg.get?.('author')?._serialized || null,
      };
    } catch(e) { return null; }
  }

  // ── Serializar contacto ──────────────────────────────────────────
  function serializeContact(c) {
    try {
      return {
        id:       c.get?.('id')?._serialized || c.id?._serialized || '',
        name:     c.get?.('name') || c.name || null,
        pushname: c.get?.('pushname') || null,
        isUser:   c.get?.('isUser') ?? false,
        isGroup:  c.get?.('isGroup') ?? false,
      };
    } catch(e) { return null; }
  }

  // ── Setup listeners tiempo real ──────────────────────────────────
  let listenersSetup = false;
  function setupListeners(S) {
    if (listenersSetup) return;
    listenersSetup = true;

    // Mensajes nuevos
    S.MsgCollection.on('add', (msg) => {
      try {
        const data = serializeMsg(msg);
        if (!data || data.fromMe) return;
        console.log('[WSPP] 📨', data.body?.slice(0, 40));
        window.postMessage({ type: 'WSPP_NEW_MSG', payload: data }, '*');
      } catch(e) {}
    });

    // Cambios en Conn (wid, estado)
    S.Conn.on('change', () => {
      const wid = S.Conn.get('wid');
      if (wid) {
        window.postMessage({ type: 'WSPP_ME', payload: {
          pushname: S.Conn.get('pushname'),
          wid:      wid._serialized,
          phone:    S.Conn.get('phone'),
          platform: S.Conn.get('platform'),
        }}, '*');
      }
    });

    console.log('[WSPP] ✓ Listeners CRM activos');
  }

  // ── Responder solicitudes ────────────────────────────────────────
  window.addEventListener('message', (e) => {
    const { type, payload } = e.data || {};

    if (type === 'WSPP_SCAN') {
      try {
        const S = getStore();
        setupListeners(S);

        const chats    = (S.ChatCollection?._models || []).map(serializeChat).filter(Boolean);
        const contacts = (S.ContactCollection?._models || []).map(serializeContact).filter(Boolean);
        const conn     = S.Conn;

        window.postMessage({
          type: 'WSPP_RESULT',
          payload: {
            storeFound: true,
            me: {
              pushname: conn?.get('pushname'),
              wid:      conn?.get('wid')?._serialized,
              phone:    conn?.get('phone'),
              platform: conn?.get('platform'),
            },
            chats,
            contacts,
          }
        }, '*');
      } catch(err) {
        window.postMessage({ type: 'WSPP_RESULT', payload: { storeFound: false, error: err.message } }, '*');
      }
    }

    if (type === 'WSPP_OPEN_CHAT') {
      try {
        const phone = String(payload?.phone || '').replace(/\D/g, '');
        if (!phone) return;

        const { ChatCollection } = window.require('WAWebChatCollection');

        // Buscar chat existente por número
        const chat = ChatCollection._models.find(c => {
          const id = c.id?._serialized || c.get?.('id')?._serialized || '';
          return id.startsWith(phone);
        });

        if (chat) {
          chat.set('active', 1);
          console.log('[WSPP] Chat existente abierto:', chat.get('name') || phone);
          window.postMessage({ type: 'WSPP_OPEN_CHAT_RESULT', payload: { found: true, phone } }, '*');
        } else {
          console.log('[WSPP] Chat no encontrado, necesita CDP:', phone);
          window.postMessage({ type: 'WSPP_OPEN_CHAT_RESULT', payload: { found: false, phone } }, '*');
        }
      } catch(err) {
        console.warn('[WSPP] WSPP_OPEN_CHAT error:', err);
        window.postMessage({ type: 'WSPP_OPEN_CHAT_RESULT', payload: { found: false, phone: payload?.phone } }, '*');
      }
    }

    if (type === 'WSPP_GET_MSGS') {
      try {
        const chatId = payload?.chatId;
        const S      = getStore();
        const msgs   = (S.MsgCollection?._models || [])
          .filter(m => {
            const id = m.get?.('chatId')?._serialized || m.get?.('from')?._serialized;
            return id === chatId;
          })
          .map(serializeMsg)
          .filter(Boolean)
          .slice(-50);

        window.postMessage({ type: 'WSPP_MSGS_RESULT', payload: { chatId, msgs } }, '*');
      } catch(err) {
        window.postMessage({ type: 'WSPP_MSGS_RESULT', payload: { chatId: payload?.chatId, msgs: [], error: err.message } }, '*');
      }
    }
  });

  // Auto-setup al cargar
  setTimeout(() => {
    try {
      const S = getStore();
      setupListeners(S);
      console.log('[WSPP] ✓ CRM listo. Chats:', S.ChatCollection?._models?.length);
    } catch(e) {}
  }, 5000);

  window.__WSPP_detectStore__ = () => {
    const S = getStore();
    console.log('[WSPP] Store:', {
      chats:    S.ChatCollection?._models?.length,
      contacts: S.ContactCollection?._models?.length,
      pushname: S.Conn?.get('pushname'),
    });
  };

  console.log('[WSPP] v12-CRM listo.');
})();
