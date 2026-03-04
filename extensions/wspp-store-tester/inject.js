// inject.js - v13 CRM — devuelve datos estructurados para el CRM
// world: MAIN — accede directamente a window.require (módulos WhatsApp Web)
(function() {
  'use strict';
  console.log('[WSPP] Injector v13-CRM');

  function req(name) {
    try { return window.require(name); } catch(e) { return {}; }
  }

  function getStore() {
    return {
      ChatCollection:    req('WAWebChatCollection').ChatCollection,
      MsgCollection:     req('WAWebMsgCollection').MsgCollection,
      ContactCollection: req('WAWebContactCollection').ContactCollection,
      LabelCollection:   req('WAWebLabelCollection').LabelCollection,
      Conn:              req('WAWebConnModel').Conn,
    };
  }

  // ── Mapa de etiquetas WA: labelId → {id, name, color, predefinedId} ──
  // Las etiquetas son de WhatsApp Business (las que se asignan desde WA directamente).
  // Cada chat puede tener labels = array de labelIds.
  // Semilla hardcodeada para evitar pérdidas por carga lazy de WA.
  const KNOWN_LABELS = [
    { id: '9',  name: 'Nicho trabajador salud' },
    { id: '11', name: 'dato basura' },
    { id: '12', name: 'Amigos y conocidos' },
    { id: '13', name: 'Militantes' },
    { id: '14', name: 'Interesados' },
    { id: '15', name: 'Periodistas' },
    { id: '17', name: 'Cajamarca' },
    { id: '18', name: 'Lambayeque' },
    { id: '19', name: 'Arequipa' },
    { id: '20', name: 'Lima' },
    { id: '21', name: 'Libertad' },
    { id: '22', name: 'Apurimac' },
    { id: '23', name: 'Piura' },
    { id: '24', name: 'Cusco' },
    { id: '25', name: 'Tumbes' },
    { id: '26', name: 'Puno' },
    { id: '27', name: 'Ayacucho' },
    { id: '28', name: 'Voluntarios 🅰️3️⃣' },
    { id: '32', name: 'LIDER O DIRIGENTE' },
    { id: '33', name: 'SUPERFAN 💙' },
  ];
  let waLabelMap = {}; // labelId → { id, name, color, predefinedId }
  // Pre-poblar con etiquetas conocidas
  KNOWN_LABELS.forEach(l => { waLabelMap[l.id] = { id: l.id, name: l.name, color: null, predefinedId: null }; });

  function buildLabelMap() {
    try {
      const { LabelCollection } = window.require('WAWebLabelCollection');
      // Merge sobre el seed: NO resetear, para preservar etiquetas conocidas
      for (const label of (LabelCollection?._models || [])) {
        const id   = label.get?.('id')   || label.id   || '';
        const name = label.get?.('name') || label.name || '';
        const color = label.get?.('color') ?? label.color ?? null;
        const predefinedId = label.get?.('predefinedId') ?? label.predefinedId ?? null;
        if (id) waLabelMap[String(id)] = { id: String(id), name, color, predefinedId };
      }
      console.log('[WSPP] Labels WA:', Object.keys(waLabelMap).length, JSON.stringify(Object.values(waLabelMap).map(l => l.name)));
    } catch(e) { console.warn('[WSPP] buildLabelMap error:', e.message); }
  }

  // ── Serializar chat ──────────────────────────────────────────────
  function serializeChat(chat) {
    try {
      const lastMsgModel = chat.get?.('lastMessage');
      // body puede estar en .body del modelo o en .get('body')
      const lastMsgBody  = lastMsgModel?.get?.('body') || lastMsgModel?.body || null;
      // timestamp: primero t del chat (más reciente), si no el del lastMessage
      const lastMsgTime  = chat.get?.('t') || lastMsgModel?.get?.('t') || lastMsgModel?.t || null;

      // Etiquetas WA: el chat tiene labels = array de labelIds (strings)
      // Las resolvemos contra waLabelMap para obtener nombre y color.
      const rawLabels  = chat.get?.('labels') || chat.labels || [];
      const waLabels   = (Array.isArray(rawLabels) ? rawLabels : [])
        .map(lid => waLabelMap[String(lid)] || null)
        .filter(Boolean);

      // Resolver teléfono: si es @lid, buscarlo en lidMap
      const chatIdSerialized = chat.id?._serialized || chat.get?.('id')?._serialized || '';
      const rawUser = chatIdSerialized.replace(/@.+/, '');
      const resolvedPhone = chatIdSerialized.includes('@lid')
        ? (lidMap[rawUser]?.phone || null)
        : rawUser;

      return {
        id:          chatIdSerialized,
        phone:       resolvedPhone,  // teléfono real (ej: '51966843769') o null si no resuelto
        name:        chat.get?.('name') || chat.name || null,
        unread:      chat.get?.('unreadCount') ?? 0,
        isGroup:     chat.get?.('isGroup') ?? false,
        lastMsg:     lastMsgBody,
        lastMsgTime: lastMsgTime,
        muteExpiry:  chat.get?.('muteExpiry') || 0,
        pinned:      !!(chat.get?.('pin') || false),
        archived:    !!(chat.get?.('archive') || false),
        waLabels,    // [{id, name, color, predefinedId}] — etiquetas WA Business
      };
    } catch(e) { return null; }
  }

  // ── Mapa LID → {phone, name} ─────────────────────────────────────
  // WA migró a @lid: los JIDs ya no contienen el número de teléfono.
  // El número real vive en ChatCollection.formattedTitle (ej: "+51 921 783 055").
  let lidMap = {}; // lid_user → { phone, name }

  function buildLidMap() {
    try {
      const { ChatCollection }    = window.require('WAWebChatCollection');
      const { ContactCollection } = window.require('WAWebContactCollection');

      for (const chat of (ChatCollection?._models || [])) {
        const id = chat.id || chat.get?.('id') || {};
        if (id.server !== 'lid') continue;
        const lid = String(id.user || '');
        if (!lid) continue;

        const name    = chat.get?.('name') || chat.get?.('formattedTitle') || '';
        const contact = chat.get?.('contact');

        // Fuente 1 (mejor): contact.phoneNumber.user — número real siempre presente
        // aunque el contacto tenga nombre guardado ("Santiago Polo Libertad")
        const pnUser  = contact?.get?.('phoneNumber')?.user
                     || contact?.phoneNumber?.user
                     || '';

        // Fuente 2 (fallback): formattedTitle solo cuando tiene formato "+51 XXX"
        const title   = chat.get?.('formattedTitle') || '';
        const titleDigits = title.startsWith('+') ? title.replace(/\D/g, '') : '';

        const phone = pnUser || titleDigits || lid;
        lidMap[lid] = { phone, name: name || title };
      }

      // ContactCollection como fuente adicional (puede tener contactos no en ChatCollection)
      for (const c of (ContactCollection?._models || [])) {
        const id = c.id || c.get?.('id') || {};
        if (id.server !== 'lid') continue;
        const lid = String(id.user || '');
        if (!lid) continue;

        // Solo actualizar si aún no tenemos número real (distinto al lid)
        if (lidMap[lid]?.phone && lidMap[lid].phone !== lid) continue;

        const pnUser = c.get?.('phoneNumber')?.user || '';
        const name   = c.get?.('name') || c.get?.('pushname') || '';
        if (pnUser) lidMap[lid] = { phone: pnUser, name: name || pnUser };
      }
    } catch(e) { console.warn('[WSPP] buildLidMap error:', e.message); }
  }

  /** Extrae número de teléfono limpio desde un JID (soporta @lid y @c.us) */
  function phoneFromJid(jid) {
    if (!jid) return '';
    const raw    = typeof jid === 'object' ? (jid._serialized || '') : String(jid);
    const user   = raw.replace(/@.+/, '');
    const server = raw.includes('@') ? raw.split('@')[1] : '';
    if (server === 'lid')                                return lidMap[user]?.phone || user;
    if (server === 'c.us' || server === 's.whatsapp.net') return user;
    return ''; // grupos, broadcast — ignorar
  }

  /** Extrae nombre de contacto desde un JID/LID */
  function nameFromJid(jid) {
    if (!jid) return '';
    const raw  = typeof jid === 'object' ? (jid._serialized || '') : String(jid);
    const user = raw.replace(/@.+/, '');
    return lidMap[user]?.name || '';
  }

  // ── Serializar mensaje ───────────────────────────────────────────
  function serializeMsg(msg) {
    try {
      const id     = msg.get?.('id') || msg.id;
      const fromMe = id?.fromMe ?? false;

      const remoteJid = id?.remote;
      const fromJid   = msg.get?.('from') || msg.from;
      const toJid     = msg.get?.('to')   || msg.to;
      const chatJid   = msg.get?.('chatId') || msg.chatId;

      // contactJid = el chat del otro lado (siempre el contacto, no yo)
      const contactJid = remoteJid || (fromMe ? toJid : fromJid) || chatJid;

      // Filtrar status@broadcast y mensajes de grupos
      const contactSer = typeof contactJid === 'object'
        ? (contactJid._serialized || '') : String(contactJid || '');
      if (contactSer.includes('@broadcast') || contactSer.includes('status@')
          || contactSer.includes('@g.us')) return null;

      const phone = phoneFromJid(contactJid);
      const name  = nameFromJid(contactJid) || msg.get?.('notifyName') || '';

      return {
        id:        id?._serialized || '',
        fromMe,
        from:      phoneFromJid(fromJid),
        to:        phoneFromJid(toJid),
        phone,   // número limpio del contacto
        name,    // nombre del contacto desde lidMap o notifyName
        body:      msg.get?.('body') || msg.body || '',
        type:      msg.get?.('type') || msg.type || 'chat',
        timestamp: msg.get?.('t')   || msg.t    || 0,
        chatId:    phoneFromJid(chatJid),
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

    // Construir mapas inmediatamente
    buildLidMap();
    buildLabelMap();

    // Reconstruir lidMap cuando lleguen chats nuevos.
    // buildLidMap con debounce para evitar O(n) en cada evento de carga inicial.
    // Re-escanear historia si hay LIDs nuevos resueltos.
    let lidDebounce     = null;
    let historyDebounce = null;
    if (S.ChatCollection) {
      S.ChatCollection.on('add change', () => {
        clearTimeout(lidDebounce);
        lidDebounce = setTimeout(() => {
          buildLidMap();
          // Re-emitir historia después de resolver nuevos LIDs
          clearTimeout(historyDebounce);
          historyDebounce = setTimeout(() => exportRecentHistory(), 2000);
        }, 300);
      });
    }

    // Reconstruir label map si cambian las etiquetas
    if (S.LabelCollection) {
      S.LabelCollection.on('add change remove', () => buildLabelMap());
    }

    // Mensajes nuevos (entrantes Y salientes)
    if (S.MsgCollection) {
      S.MsgCollection.on('add', (msg) => {
        try {
          const data = serializeMsg(msg);
          if (!data) return;
          const icon = data.fromMe ? '📤' : '📨';
          console.log('[WSPP]', icon, data.phone, data.body?.slice(0, 40));
          window.postMessage({ type: 'WSPP_NEW_MSG', payload: data }, '*');
        } catch(e) {}
      });
    }

    // Cambios en Conn (reconexión, cambio de sesión)
    if (S.Conn) {
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
    }

    console.log('[WSPP] ✓ Listeners CRM activos');
  }

  // ── Responder solicitudes ────────────────────────────────────────
  window.addEventListener('message', (e) => {
    if (!e.data || typeof e.data !== 'object') return;
    const { type, payload } = e.data;

    // ── WSPP_SCAN: exportar todo el estado ───────────────────────
    if (type === 'WSPP_SCAN') {
      try {
        const S = getStore();
        setupListeners(S);

        const chats    = (S.ChatCollection?._models || []).map(serializeChat).filter(Boolean);
        const contacts = (S.ContactCollection?._models || []).map(serializeContact).filter(Boolean);
        const labels   = Object.values(waLabelMap);
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
            labels,   // [{id, name, color, predefinedId}] — todas las etiquetas WA
          }
        }, '*');
      } catch(err) {
        window.postMessage({
          type:    'WSPP_RESULT',
          payload: { storeFound: false, error: err.message },
        }, '*');
      }
    }

    // ── WSPP_GET_MSGS: últimos N mensajes de un chat ─────────────
    if (type === 'WSPP_GET_MSGS') {
      try {
        const chatId = payload?.chatId;
        const S      = getStore();
        const msgs   = (S.MsgCollection?._models || [])
          .filter(m => {
            const cid = m.get?.('chatId')?._serialized
                     || m.get?.('id')?.remote?._serialized
                     || m.get?.('from')?._serialized;
            return cid === chatId;
          })
          .map(serializeMsg)
          .filter(Boolean)
          .slice(-100);  // up from 50 → 100

        window.postMessage({ type: 'WSPP_MSGS_RESULT', payload: { chatId, msgs } }, '*');
      } catch(err) {
        window.postMessage({
          type:    'WSPP_MSGS_RESULT',
          payload: { chatId: payload?.chatId, msgs: [], error: err.message },
        }, '*');
      }
    }

    // ── WSPP_OPEN_CHAT: abrir chat existente por número de teléfono ─
    // Busca en ChatCollection y navega visualmente usando WAWebCmd.
    // Responde found:true si lo encontró y abrió, found:false si no existe.
    if (type === 'WSPP_OPEN_CHAT') {
      try {
        const phone = String(payload?.phone || '').replace(/\D/g, '');
        if (!phone) return;

        const { ChatCollection } = window.require('WAWebChatCollection');
        const chat = (ChatCollection?._models || []).find(c => {
          const id = c.id?._serialized || c.get?.('id')?._serialized || '';
          // WA serializa como "51XXXXXXXXX@c.us" — buscamos por prefijo numérico
          return id.startsWith(phone);
        });

        if (chat) {
          // Navegar al chat usando la API interna de WA (no set active)
          const { Cmd } = window.require('WAWebCmd');
          Cmd.openChatBottom({ chat });
          console.log('[WSPP] ✓ Chat existente abierto:', chat.get?.('name') || phone);
          window.postMessage({ type: 'WSPP_OPEN_CHAT_RESULT', payload: { found: true, phone } }, '*');
        } else {
          console.log('[WSPP] Chat no encontrado para phone:', phone);
          window.postMessage({ type: 'WSPP_OPEN_CHAT_RESULT', payload: { found: false, phone } }, '*');
        }
      } catch(err) {
        console.warn('[WSPP] WSPP_OPEN_CHAT error:', err);
        window.postMessage({
          type:    'WSPP_OPEN_CHAT_RESULT',
          payload: { found: false, phone: payload?.phone },
        }, '*');
      }
    }

    // ── WSPP_GET_WA_CONTACTS: exportar todos los contactos con teléfono ──
    // Combina ContactCollection + ChatCollection para obtener:
    //   { phone, name, waLabels: [{id,name,color}], source }
    // Deduplicado por teléfono (51XXXXXXXXX). Solo contactos individuales.
    if (type === 'WSPP_GET_WA_CONTACTS') {
      try {
        buildLidMap();
        buildLabelMap();

        const { ChatCollection }    = window.require('WAWebChatCollection');
        const { ContactCollection } = window.require('WAWebContactCollection');
        const seen   = new Set(); // phones vistos
        const result = [];

        // Fuente primaria: chats (tienen nombre guardado + etiquetas WA)
        for (const chat of (ChatCollection?._models || [])) {
          const id = chat.id || chat.get?.('id') || {};
          if (id.server === 'g.us' || id.server === 'broadcast') continue;
          const chatSer = id._serialized || '';
          if (chatSer.includes('@broadcast') || chatSer.includes('status@')) continue;

          const phone = phoneFromJid(id);
          if (!phone || phone.length < 9) continue;
          const p = phone.length === 9 ? '51' + phone : phone;
          if (seen.has(p)) continue;
          seen.add(p);

          const rawLabels = chat.get?.('labels') || chat.labels || [];
          const waLabels  = (Array.isArray(rawLabels) ? rawLabels : [])
            .map(lid => waLabelMap[String(lid)] || null).filter(Boolean);

          result.push({
            phone:    p,
            name:     nameFromJid(id) || chat.get?.('name') || chat.get?.('formattedTitle') || '',
            waLabels,
            source:   'chat',
          });
        }

        // Fuente secundaria: contactos adicionales no en chats (sin historial de chat)
        for (const c of (ContactCollection?._models || [])) {
          const id = c.id || c.get?.('id') || {};
          if (id.server === 'g.us' || id.server === 'broadcast') continue;
          const user = id.user || '';
          if (!user) continue;

          // Resolver número: si es @lid usar lidMap, si es @c.us el user ya es el número
          let phone = '';
          if (id.server === 'lid') {
            phone = lidMap[user]?.phone || '';
          } else if (id.server === 'c.us' || id.server === 's.whatsapp.net') {
            phone = user;
          }
          if (!phone || phone.length < 8) continue;
          const p = phone.length === 9 ? '51' + phone : phone;
          if (seen.has(p)) continue;
          seen.add(p);

          const name = c.get?.('name') || c.get?.('pushname') || lidMap[user]?.name || '';
          if (!name && !phone.startsWith('51')) continue; // skip contactos sin nombre y sin prefijo PE

          result.push({
            phone:    p,
            name,
            waLabels: [],
            source:   'contact',
          });
        }

        window.postMessage({
          type:    'WSPP_WA_CONTACTS_RESULT',
          payload: { contacts: result, total: result.length },
        }, '*');
        console.log('[WSPP] ✓ WA contacts exportados:', result.length);
      } catch(err) {
        window.postMessage({
          type:    'WSPP_WA_CONTACTS_RESULT',
          payload: { contacts: [], total: 0, error: err.message },
        }, '*');
      }
    }

    // ── WSPP_NAVIGATE_CHAT: abrir chat existente por chatId exacto ─
    // Igual que WSPP_OPEN_CHAT pero con el chatId serializado completo.
    if (type === 'WSPP_NAVIGATE_CHAT') {
      try {
        const chatId = payload?.chatId;
        if (!chatId) return;

        const { ChatCollection } = window.require('WAWebChatCollection');
        const chat = (ChatCollection?._models || []).find(c => {
          const id = c.id?._serialized || c.get?.('id')?._serialized || '';
          return id === chatId;
        });

        if (chat) {
          const { Cmd } = window.require('WAWebCmd');
          Cmd.openChatBottom({ chat });
          console.log('[WSPP] ✓ Chat navegado por id:', chatId);
          window.postMessage({ type: 'WSPP_NAVIGATE_CHAT_RESULT', payload: { found: true, chatId } }, '*');
        } else {
          console.log('[WSPP] WSPP_NAVIGATE_CHAT: chatId no encontrado:', chatId);
          window.postMessage({ type: 'WSPP_NAVIGATE_CHAT_RESULT', payload: { found: false, chatId } }, '*');
        }
      } catch(err) {
        console.warn('[WSPP] WSPP_NAVIGATE_CHAT error:', err);
        window.postMessage({
          type:    'WSPP_NAVIGATE_CHAT_RESULT',
          payload: { found: false, chatId: payload?.chatId },
        }, '*');
      }
    }
  });

  /**
   * Escanea ChatCollection y detecta TODOS los chats con mensajes sin responder.
   *
   * Criterios para considerar un chat como "pendiente":
   *   1. unreadCount > 0  → WA sabe que hay mensajes no vistos
   *   2. O el último mensaje es entrante (fromMe=false) y reciente (≤7 días)
   *
   * Usar unreadCount es mucho más confiable que leer MsgCollection porque:
   *   - MsgCollection solo tiene los mensajes del chat actualmente abierto en WA
   *   - unreadCount lo mantiene WA en todos los chats aunque no estén cargados
   *
   * Los chats @lid sin número mapeado se reportan por separado para diagnóstico.
   */
  function exportRecentHistory() {
    try {
      buildLidMap();
      buildLabelMap();
      const { ChatCollection } = window.require('WAWebChatCollection');
      const cutoff7d = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;

      const pending   = [];
      const skippedLid = []; // para debug: LIDs que no se pudieron resolver

      for (const chat of (ChatCollection?._models || [])) {
        const id = chat.id || chat.get?.('id') || {};
        // Solo chats individuales
        if (id.server === 'g.us' || id.server === 'broadcast') continue;
        const chatSer = id._serialized || '';
        if (chatSer.includes('@broadcast') || chatSer.includes('status@')) continue;

        const unread  = chat.get?.('unreadCount') ?? 0;
        const lastMsg = chat.get?.('lastMessage');
        const fromMe  = lastMsg?.get?.('id')?.fromMe ?? lastMsg?.fromMe ?? true;
        const ts      = chat.get?.('t') || lastMsg?.get?.('t') || 0;

        // Criterio: tiene no-leídos O último mensaje es entrante y reciente
        const isPending = unread > 0 || (!fromMe && ts >= cutoff7d);
        if (!isPending) continue;

        // Resolver número
        const phone = phoneFromJid(id);
        const user  = chatSer.replace(/@.+/, '');

        if (!phone || phone === user) {
          // No pudimos resolver — puede ser LID sin mapear
          if (id.server === 'lid') {
            skippedLid.push({ lid: user, name: chat.get?.('name') || '', unread, ts });
          }
          continue;
        }

        const name = nameFromJid(id) || chat.get?.('name') || chat.get?.('formattedTitle') || '';
        const body = lastMsg?.get?.('body') || lastMsg?.body || '';

        pending.push({ phone, name, body, timestamp: ts, fromMe: false, unread });
      }

      console.log(`[WSPP] ✓ Pendientes detectados: ${pending.length}` +
        (skippedLid.length ? ` | LIDs sin mapear: ${skippedLid.length}` : ''));

      if (skippedLid.length) {
        console.warn('[WSPP] LIDs sin número (buildLidMap incompleto):', skippedLid);
      }

      // Siempre emitir aunque sea vacío (para que el sidebar sepa que el scan terminó)
      window.postMessage({ type: 'WSPP_HISTORY', payload: pending }, '*');

    } catch(e) { console.warn('[WSPP] exportRecentHistory error:', e.message); }
  }

  // Auto-setup al cargar (5s de margen para que WhatsApp inicialice)
  setTimeout(() => {
    try {
      const S = getStore();
      setupListeners(S);
      exportRecentHistory();
      console.log('[WSPP] ✓ CRM listo. Chats:', S.ChatCollection?._models?.length);
    } catch(e) {}
  }, 5000);

  // Debug helpers
  window.__WSPP_detectStore__ = () => {
    const S = getStore();
    console.log('[WSPP] Store status:', {
      chats:    S.ChatCollection?._models?.length,
      contacts: S.ContactCollection?._models?.length,
      pushname: S.Conn?.get('pushname'),
    });
  };
  window.__WSPP_lidMap__ = () => {
    buildLidMap();
    console.table(Object.entries(lidMap).slice(0, 20).map(([lid, v]) => ({ lid, ...v })));
    console.log('Total en lidMap:', Object.keys(lidMap).length);
  };
  window.__WSPP_labels__ = () => {
    buildLabelMap();
    console.table(Object.values(waLabelMap));
    console.log('Total etiquetas WA:', Object.keys(waLabelMap).length);
  };
  window.__WSPP_waContacts__ = () => {
    // Dispara WSPP_GET_WA_CONTACTS y loguea el resultado en consola
    window.addEventListener('message', function h(e) {
      if (e.data?.type === 'WSPP_WA_CONTACTS_RESULT') {
        window.removeEventListener('message', h);
        const { contacts } = e.data.payload;
        console.table(contacts.slice(0, 30).map(c => ({
          phone:    c.phone,
          name:     c.name,
          labels:   c.waLabels.map(l => l.name).join(', ') || '—',
          source:   c.source,
        })));
        console.log('Total contactos WA:', contacts.length);
      }
    });
    window.postMessage({ type: 'WSPP_GET_WA_CONTACTS' }, '*');
  };
  window.__WSPP_pending__ = () => {
    // Muestra qué chats tienen el último mensaje entrante (sin responder)
    buildLidMap(); buildLabelMap();
    const { ChatCollection } = window.require('WAWebChatCollection');
    const cutoff = Math.floor(Date.now() / 1000) - 8 * 3600;
    const rows = [];
    for (const chat of (ChatCollection?._models || [])) {
      const id = chat.id || chat.get?.('id') || {};
      if (id.server === 'g.us' || id.server === 'broadcast') continue;
      const lastMsg = chat.get?.('lastMessage');
      if (!lastMsg) continue;
      const fromMe = lastMsg.get?.('id')?.fromMe ?? false;
      if (fromMe) continue;
      const ts = chat.get?.('t') || 0;
      if (ts < cutoff) continue;
      const phone = phoneFromJid(id);
      const name  = nameFromJid(id) || chat.get?.('name') || '';
      rows.push({ phone, name, ts: new Date(ts * 1000).toLocaleTimeString(), body: (lastMsg.get?.('body') || '').slice(0, 40) });
    }
    console.table(rows);
    console.log('Sin responder (últimas 8h):', rows.length);
  };

  console.log('[WSPP] v13-CRM listo.');
})();
