// inject.js — MAIN world, document_start.
// Detecta mensajes salientes hookenando el CLICK en el botón Send del DOM.
// own_number viene de content.js (storage-backed) — no depende del webpack hook.
(function () {

  // H-3+H-4: Only accept postMessages from WA Web's own origin
  const WA_ORIGIN = 'https://web.whatsapp.com';

  // ─── own_number desde storage (via content.js) ───────────────────────────────
  // content.js envía WSPP_SET_OWN_NUMBER al arrancar y cuando el usuario lo cambia.
  let _ownNumber = null;

  window.addEventListener('message', (e) => {
    // H-4: Validate origin — only accept from same window (content.js bridge)
    if (e.source !== window) return;
    if (e.data?.type !== 'WSPP_SET_OWN_NUMBER') return;
    _ownNumber = e.data.number || null;
    console.log('[WSPP] own_number actualizado:', _ownNumber ?? 'NULL');
  });

  // M-7: Removed dead webpack hook code (~35 lines). WA uses Metro/Haste, not webpack.
  // window.require() is the correct way to access WA internal modules.

  // ─── JID→phone cache ──────────────────────────────────────────────────────
  // Persists successful @lid→phone resolutions so we don't re-resolve every time.
  // Max 2000 entries, LRU-ish (oldest entries dropped when full).
  const _jidPhoneCache = new Map();
  const JID_CACHE_MAX = 2000;

  // PERF v7.1.0: JID→model indexes for O(1) lookups (was O(n) .find() per message)
  let _contactIndex = null; // Map<serialized_jid, ContactModel>
  let _chatIndex = null;    // Map<serialized_jid, ChatModel>
  let _indexBuiltAt = 0;
  const INDEX_REFRESH_MS = 60000; // rebuild every 60s

  function getContactIndex() {
    const now = Date.now();
    if (_contactIndex && (now - _indexBuiltAt) < INDEX_REFRESH_MS) return _contactIndex;
    try {
      const { ContactCollection } = window.require('WAWebContactCollection');
      if (ContactCollection && ContactCollection._models) {
        _contactIndex = new Map();
        for (const c of ContactCollection._models) {
          const key = c.id?._serialized;
          if (key) _contactIndex.set(key, c);
        }
        _indexBuiltAt = now;
      }
    } catch (_) { /* module not ready yet */ }
    return _contactIndex;
  }

  function getChatIndex() {
    const now = Date.now();
    if (_chatIndex && (now - _indexBuiltAt) < INDEX_REFRESH_MS) return _chatIndex;
    try {
      const { ChatCollection } = window.require('WAWebChatCollection');
      if (ChatCollection && ChatCollection._models) {
        _chatIndex = new Map();
        for (const c of ChatCollection._models) {
          const key = c.id?._serialized;
          if (key) _chatIndex.set(key, c);
        }
      }
    } catch (_) { /* module not ready yet */ }
    return _chatIndex;
  }

  function cachePhone(jid, phone) {
    if (!jid || !phone) return;
    if (_jidPhoneCache.size >= JID_CACHE_MAX) {
      // Drop oldest entry
      const first = _jidPhoneCache.keys().next().value;
      _jidPhoneCache.delete(first);
    }
    _jidPhoneCache.set(jid, phone);
  }

  // ─── helpers ────────────────────────────────────────────────────────────────

  /** Extrae número de un JID de WA ("5198765432@c.us" → "5198765432"). Filtra grupos. */
  function jidToNumber(jid) {
    if (!jid || typeof jid !== 'string') return null;
    if (jid.includes('@g.us') || jid.includes('@broadcast') || jid.includes('@newsletter')) return null;
    if (jid.includes('@lid')) return null; // nuevo formato WA — no tiene teléfono en el JID
    const num = jid.replace(/@.+$/, '').replace(/\D/g, '');
    return (num.length >= 10 && num.length <= 13) ? num : null;
  }

  /**
   * Resuelve el número de teléfono para un JID @lid usando WA's internal models.
   * WA internally keeps a mapping from @lid to @c.us JIDs in multiple places:
   *   - Contact model: .userid, .number, .phoneNumber properties
   *   - Chat model: .contact?.userid
   *   - WAWebWidFactory.createWid / numberToLid reverse-lookup
   *
   * Returns the phone number string (digits only) or null.
   */
  function resolvePhoneFromLid(lidJid) {
    if (!lidJid || !lidJid.includes('@lid')) return null;

    // Strategy 0: Check cache first
    const cached = _jidPhoneCache.get(lidJid);
    if (cached) return cached;

    let resolved = null;

    try {
      // Strategy 1: Look up contact by @lid JID — check multiple phone properties
      // PERF v7.1.0: Use indexed Map instead of linear scan
      const contactIdx = getContactIndex();
      if (contactIdx) {
        const contact = contactIdx.get(lidJid);
        if (contact) {
          const candidates = [
            contact.userid,
            contact.number,
            contact.phoneNumber,
            contact.jid?.user,
            contact.plaintextDisabled, // some WA versions store phone here
          ];
          for (const val of candidates) {
            if (val && typeof val === 'string') {
              const digits = val.replace(/\D/g, '');
              if (digits.length >= 9 && digits.length <= 15) { resolved = digits; break; }
            }
          }
        }
      }
    } catch (e) { console.warn('[WSPP] resolvePhoneFromLid S1 error:', e.message); }

    if (!resolved) try {
      // Strategy 2: Look up chat by @lid JID — chat.contact might have the phone
      // PERF v7.1.0: Use indexed Map instead of linear scan
      const chatIdx = getChatIndex();
      if (chatIdx) {
        const chat = chatIdx.get(lidJid);
        if (chat) {
          const contact = chat.contact;
          if (contact) {
            const candidates = [contact.userid, contact.number, contact.phoneNumber];
            for (const val of candidates) {
              if (val && typeof val === 'string') {
                const digits = val.replace(/\D/g, '');
                if (digits.length >= 9 && digits.length <= 15) { resolved = digits; break; }
              }
            }
          }
          if (!resolved && chat.formattedUser) {
            const digits = chat.formattedUser.replace(/\D/g, '');
            if (digits.length >= 9 && digits.length <= 15) resolved = digits;
          }
        }
      }
    } catch (e) { console.warn('[WSPP] resolvePhoneFromLid S2 error:', e.message); }

    if (!resolved) try {
      // Strategy 3: WAWebWidFactory — numberForLid / createUserWid
      const wid = window.require('WAWebWidFactory');
      if (wid && typeof wid.numberForLid === 'function') {
        const num = wid.numberForLid(lidJid);
        if (num) {
          const digits = String(num).replace(/\D/g, '');
          if (digits.length >= 9 && digits.length <= 15) resolved = digits;
        }
      }
    } catch (e) { console.warn('[WSPP] resolvePhoneFromLid S3 error:', e.message); }

    if (!resolved) try {
      // Strategy 4: Scan the active chat header DOM for phone subtitle
      // WA shows "~+51 987 654 321" under the contact name in the chat header
      const header = document.querySelector('#main header');
      if (header) {
        const spans = header.querySelectorAll('span[title], span[dir]');
        for (const s of spans) {
          const txt = (s.getAttribute('title') || s.textContent || '').trim();
          const digits = txt.replace(/[^0-9]/g, '');
          if (digits.length >= 9 && digits.length <= 15) { resolved = digits; break; }
        }
      }
    } catch (e) { console.warn('[WSPP] resolvePhoneFromLid S4 error:', e.message); }

    // Cache successful resolution
    if (resolved) {
      cachePhone(lidJid, resolved);
      console.log('[WSPP] @lid resolved:', lidJid.substring(0, 15) + '…', '→', resolved, '(cached)');
    }

    return resolved;
  }

  /**
   * Extrae el nombre del contacto activo desde el item seleccionado en la lista de chats.
   * El div con aria-selected="true" en #pane-side siempre tiene span[title] con el nombre.
   * Fallback: aria-label del composer del chat (NO del buscador).
   */
  function getActiveContactName() {
    // ── 1. aria-selected en la lista de chats (más confiable) ────────────────
    try {
      const selected = document.querySelector('#pane-side [aria-selected="true"]')
        ?? document.querySelector('[aria-selected="true"]');
      if (selected) {
        const spans = selected.querySelectorAll('span[title]');
        for (const s of spans) {
          const t = (s.getAttribute('title') || '').trim();
          // Ignorar strings vacíos, puntos invisibles y separadores
          if (t && t.length > 1 && !/^[\u200e\u200f\u202a-\u202e\s.]+$/.test(t)) {
            return t;
          }
        }
      }
    } catch (_) {}

    // ── 2. aria-label del composer del chat (NO del buscador) ────────────────
    try {
      // El composer del chat tiene data-tab o está dentro de #main / .two
      // El buscador tiene aria-label que contiene "búsqueda" / "search"
      const allComposers = document.querySelectorAll('[role="textbox"][contenteditable="true"]');
      for (const composer of allComposers) {
        const aria = composer.getAttribute('aria-label') || '';
        if (/búsqueda|search|buscar/i.test(aria)) continue; // saltar buscador
        const m = aria.match(/^(?:Escribe a|Type a message to)\s+(.+?)\.?$/i);
        if (m) return m[1].trim();
      }
    } catch (_) {}

    return null;
  }

  // M-7: Removed findOwnJidInCache() — used dead webpack reference (__wr).

  /**
   * Número propio del celular.
   * Fuente de verdad: storage (via content.js → WSPP_SET_OWN_NUMBER).
   * M-7: Removed webpack fallback — WA uses Metro, not webpack.
   */
  function getOwnNumber() {
    return _ownNumber || null;
  }

  /**
   * Normaliza un string con número de teléfono a solo dígitos.
   * "+51 980 493 473" → "51980493473"
   */
  function normalizePhone(raw) {
    if (!raw) return null;
    const n = raw.replace(/\D/g, '');
    return (n.length >= 10 && n.length <= 13) ? n : null;
  }

  /**
   * Teléfono del contacto en el chat actualmente abierto.
   *
   * WA Web 2026 NO expone el número en el header ni en span[title] del chat activo.
   * Solo expone el nombre. Estrategias en orden:
   *
   * 1. aria-selected en #pane-side → span[title] que sea un número de teléfono
   *    (contactos no guardados muestran su número como nombre)
   * 2. webpack cache: chat activo con JID válido (no @lid, no @g.us)
   */
  function getActivePhone() {
    // ── 1. aria-selected en la lista → span[title] con número ─────────────
    try {
      const selected = document.querySelector('#pane-side [aria-selected="true"]')
        ?? document.querySelector('[aria-selected="true"]');
      if (selected) {
        const spans = selected.querySelectorAll('span[title]');
        for (const s of spans) {
          const n = normalizePhone(s.getAttribute('title'));
          if (n) return n;
        }
      }
    } catch (_) {}

    // M-7: Removed webpack cache scan — WA uses Metro. Use ChatCollection instead.
    try {
      const { ChatCollection } = window.require('WAWebChatCollection');
      if (ChatCollection && ChatCollection._models) {
        const active = ChatCollection._models.find(c => c.active);
        if (active && active.id?._serialized) {
          const n = jidToNumber(active.id._serialized);
          if (n) return n;
          // Try resolving @lid to phone
          if (active.id._serialized.includes('@lid')) {
            const resolved = resolvePhoneFromLid(active.id._serialized);
            if (resolved) return resolved;
          }
        }
      }
    } catch (_) {}

    return null;
  }

  /**
   * Devuelve true si el elemento (o alguno de sus ancestros hasta 6 niveles)
   * es el botón Send de WA Web.
   * L-10: Optimized — check data-testid/data-icon first (cheapest), then role/aria.
   *       Reduced from 8 to 6 ancestors (Send button is max 3-4 levels deep).
   */
  function isSendButton(el) {
    let node = el;
    for (let i = 0; i < 6; i++) {
      if (!node || node === document.body) break;

      // Cheapest checks first — data attributes
      const testid = node.getAttribute?.('data-testid');
      if (testid === 'send') return true;

      const icon = node.getAttribute?.('data-icon');
      if (icon === 'send' || icon === 'wds-ic-send-filled') return true;

      // More expensive: check role + aria only for button-like elements
      const tag = node.tagName;
      if (tag === 'BUTTON' || node.getAttribute?.('role') === 'button') {
        const aria = (node.getAttribute?.('aria-label') || '').trim().toLowerCase();
        if (aria === 'enviar' || aria === 'send' || /\b(enviar|send)\b/.test(aria)) return true;
      }

      node = node.parentElement;
    }
    return false;
  }

  // Debounce para evitar doble disparo (click en Send + Enter simultáneos)
  let _lastEmit = 0;
  function emitSent(phone) {
    const now = Date.now();
    if (now - _lastEmit < 300) return; // ignorar si ya emitimos hace menos de 300ms
    _lastEmit = now;

    const own  = getOwnNumber();
    const name = getActiveContactName(); // siempre intentar — útil para logs y futuro lookup
    // H-3: Use specific origin instead of '*'
    window.postMessage({
      type: 'WSPP_SENT',
      payload: {
        phone,           // null si no se pudo resolver — el backend lo ignorará
        contact_name: name,
        own_number: own,
        timestamp: Math.floor(Date.now() / 1000),
      },
    }, WA_ORIGIN);
    console.log('[WSPP] ✓ enviado → phone:', phone ?? '(sin teléfono)', '| nombre:', name ?? '-', '| celular:', own ?? 'NULL');
  }

  // ─── listeners ───────────────────────────────────────────────────────────────

  document.addEventListener('click', (e) => {
    if (!isSendButton(e.target)) return;
    const phone = getActivePhone();
    console.log('[WSPP] ✓ Send click | phone:', phone ?? '(sin teléfono)');
    emitSent(phone);
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey) return;
    const active = document.activeElement;
    if (!active) return;
    const role      = active.getAttribute('role');
    const testid    = active.getAttribute('data-testid');
    const ariaLabel = active.getAttribute('aria-label') || '';

    // Excluir explícitamente el buscador de WA y otros inputs que no son el composer del chat
    if (/búsqueda|search|buscar/i.test(ariaLabel)) return;

    const isComposer =
      testid === 'conversation-compose-box-input' ||
      (role === 'textbox' && /escribe|message|type|escribir/i.test(ariaLabel)) ||
      (role === 'textbox' && active.getAttribute('contenteditable') === 'true' && !ariaLabel);

    if (!isComposer) return;
    const phone = getActivePhone();
    console.log('[WSPP] ✓ Send Enter | phone:', phone ?? '(sin teléfono)');
    emitSent(phone);
  }, true);

  console.log('[WSPP] ✓ listeners activos — own_number viene del popup');

  // ═══════════════════════════════════════════════════════════════════════
  // INCOMING MESSAGES: Detecta mensajes recibidos via WAWebMsgCollection
  // ═══════════════════════════════════════════════════════════════════════

  let _msgListenerInstalled = false;
  let _chatWatcherInstalled = false;
  let _lastActiveChatJid = null;

  /**
   * Instala el listener de mensajes entrantes usando WAWebMsgCollection.
   * Usa window.require (Metro bundler) — solo disponible después de que WA cargue.
   */
  function installIncomingMessageListener() {
    if (_msgListenerInstalled) return;
    try {
      const { MsgCollection } = window.require('WAWebMsgCollection');
      if (!MsgCollection || !MsgCollection.on) {
        console.log('[WSPP] MsgCollection no disponible aún');
        return;
      }

      MsgCollection.on('add', (msg) => {
        try {
          const isFromMe = !!msg.get('id')?.fromMe;

          // ── OUTGOING: fromMe=true → enrich phone via MsgCollection JID ──
          if (isFromMe) {
            const to = msg.get('to')?._serialized;
            if (!to || typeof to !== 'string') return;
            if (to.includes('@g.us') || to.includes('@broadcast') || to.includes('@newsletter')) return;

            let phone = jidToNumber(to);
            if (!phone && to.includes('@lid')) {
              phone = resolvePhoneFromLid(to);
            }

            // Also try to get name for the recipient
            // PERF v7.1.0: Use indexed Map instead of linear scan
            let contactName = null;
            try {
              const cidx = getContactIndex();
              if (cidx) {
                const contact = cidx.get(to);
                if (contact) contactName = contact.pushname || contact.name || contact.formattedName || null;
              }
            } catch (_) {}

            // Emit WSPP_SENT_RICH — higher fidelity than DOM-based WSPP_SENT
            // BUG FIX v7.1.0: capture outgoing message body for classification + spam detection
            const outBody = msg.get('body') || '';
            window.postMessage({
              type: 'WSPP_SENT_RICH',
              payload: {
                phone,
                contact_name: contactName || getActiveContactName(),
                own_number: getOwnNumber(),
                to_jid: to,
                timestamp: msg.get('t') || Math.floor(Date.now() / 1000),
                body: outBody.substring(0, 500),
              },
            }, WA_ORIGIN);
            return;
          }

          // ── INCOMING: fromMe=false → original flow ──
          const from = msg.get('from')?._serialized;
          if (!from || typeof from !== 'string') return;

          // Filtrar grupos, broadcasts, newsletters
          if (from.includes('@g.us') || from.includes('@broadcast') || from.includes('@newsletter')) return;

          // Extraer telefono del JID
          let phone = jidToNumber(from);
          const body = msg.get('body') || '';
          const msgType = msg.get('type') || 'chat';
          const timestamp = msg.get('t') || Math.floor(Date.now() / 1000);

          // Si es @lid, intentar resolver el teléfono real
          if (!phone && from.includes('@lid')) {
            phone = resolvePhoneFromLid(from);
          }

          // Obtener nombre del contacto si es posible
          // PERF v7.1.0: Use indexed Map instead of linear scan
          let contactName = null;
          try {
            const cidx = getContactIndex();
            if (cidx) {
              const contact = cidx.get(from);
              if (contact) {
                contactName = contact.pushname || contact.name || contact.formattedName || null;
              }
            }
          } catch (_) {}

          window.postMessage({
            type: 'WSPP_RECEIVED',
            payload: {
              phone,
              contact_name: contactName,
              from_jid: from,
              preview: body.substring(0, 500),
              msg_type: msgType,
              own_number: getOwnNumber(),
              timestamp,
            },
          }, WA_ORIGIN);

          console.log('[WSPP] ← recibido de:', phone ?? from, '| tipo:', msgType, '| preview:', body.substring(0, 60));
        } catch (err) {
          console.error('[WSPP] Error procesando mensaje:', err);
        }
      });

      _msgListenerInstalled = true;
      console.log('[WSPP] ✓ Listener de mensajes entrantes instalado (MsgCollection.on add)');
    } catch (err) {
      console.log('[WSPP] MsgCollection aún no disponible:', err.message);
    }
  }

  /**
   * Vigila el chat activo usando ChatCollection.
   * Cuando cambia, emite WSPP_CHAT_OPENED para que el background haga lookup.
   */
  /**
   * M-6: Event-driven chat watcher with polling fallback.
   * Primary: ChatCollection.on('change:active') — fires when active chat changes.
   * Fallback: 2s polling interval (reduced from 800ms) for compatibility.
   */
  function installChatWatcher() {
    if (_chatWatcherInstalled) return;
    try {
      const { ChatCollection } = window.require('WAWebChatCollection');
      if (!ChatCollection || !ChatCollection._models) {
        console.log('[WSPP] ChatCollection no disponible aún');
        return;
      }

      function handleActiveChatChange() {
        try {
          const active = ChatCollection._models.find(c => c.active);
          if (!active) return;

          const jid = active.id?._serialized;
          if (!jid || jid === _lastActiveChatJid) return;

          _lastActiveChatJid = jid;

          // Solo chats individuales con teléfono
          if (jid.includes('@g.us') || jid.includes('@broadcast') || jid.includes('@newsletter')) return;

          let phone = jidToNumber(jid);
          // Try to resolve @lid to phone number
          if (!phone && jid.includes('@lid')) {
            phone = resolvePhoneFromLid(jid);
          }
          const name = active.name || active.formattedTitle || active.pushname || null;

          // H-3: Use specific origin instead of '*'
          window.postMessage({
            type: 'WSPP_CHAT_OPENED',
            payload: {
              phone,
              contact_name: name,
              jid,
            },
          }, WA_ORIGIN);

          console.log('[WSPP] Chat abierto:', phone ?? jid, '| nombre:', name ?? '-');
        } catch (_) {}
      }

      // M-6: Primary — event-driven via ChatCollection.on('change')
      let eventDriven = false;
      try {
        if (typeof ChatCollection.on === 'function') {
          ChatCollection.on('change:active', handleActiveChatChange);
          ChatCollection.on('change', handleActiveChatChange); // broader fallback
          eventDriven = true;
          console.log('[WSPP] ✓ Chat watcher instalado (event-driven: ChatCollection.on)');
        }
      } catch (_) {}

      // M-6: Fallback — polling at 2s (reduced frequency since events handle most cases)
      if (!eventDriven) {
        setInterval(handleActiveChatChange, 2000);
        console.log('[WSPP] ✓ Chat watcher instalado (polling fallback cada 2s)');
      }

      _chatWatcherInstalled = true;
    } catch (err) {
      console.log('[WSPP] ChatCollection aún no disponible:', err.message);
    }
  }

  /**
   * Recibe datos de validación del background (via content.js bridge)
   * para mostrar overlay en el chat activo.
   */
  let _currentOverlay = null;

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;

    // Datos de validación para el chat activo
    if (e.data?.type === 'WSPP_VALIDATION_DATA') {
      const data = e.data.payload;
      showValidationOverlay(data);
      return;
    }

    // Limpiar overlay cuando no hay match
    if (e.data?.type === 'WSPP_VALIDATION_CLEAR') {
      removeValidationOverlay();
      return;
    }

    // Confirmación de clasificación exitosa
    if (e.data?.type === 'WSPP_CLASSIFY_RESULT') {
      if (e.data.ok) {
        updateOverlayStatus(e.data.payload);
        showOverlayToast('Clasificado correctamente', 'success');
      } else {
        showOverlayToast(e.data.error || 'Error al clasificar', 'error');
      }
      return;
    }

    // Spam/repetition warning from background
    if (e.data?.type === 'WSPP_SPAM_WARNING') {
      showSpamWarning(e.data.payload);
      return;
    }
  });

  // ── Spam warning overlay ──────────────────────────────────────────
  let _spamOverlay = null;
  function showSpamWarning(data) {
    if (!data || !data.warnings || data.warnings.length === 0) return;
    removeSpamWarning();

    const overlay = document.createElement('div');
    overlay.id = 'wspp-spam-warning';
    const isCritical = data.risk_level === 'critical';
    const isHigh = data.risk_level === 'high';
    Object.assign(overlay.style, {
      position: 'fixed',
      top: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '99999',
      background: isCritical ? '#dc2626' : isHigh ? '#ea580c' : '#ca8a04',
      color: '#fff',
      padding: '12px 20px',
      borderRadius: '12px',
      boxShadow: '0 4px 20px rgba(0,0,0,.3)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '13px',
      maxWidth: '500px',
      cursor: 'pointer',
      transition: 'opacity .3s',
    });

    const title = document.createElement('div');
    title.style.fontWeight = '800';
    title.style.marginBottom = '4px';
    title.style.fontSize = '14px';
    title.textContent = isCritical
      ? 'RIESGO CRITICO DE BLOQUEO'
      : isHigh ? 'RIESGO ALTO — Reducir velocidad' : 'Advertencia de spam';
    overlay.appendChild(title);

    for (const w of data.warnings.slice(0, 3)) {
      const line = document.createElement('div');
      line.style.fontSize = '12px';
      line.style.opacity = '0.9';
      line.textContent = w;
      overlay.appendChild(line);
    }

    const score = document.createElement('div');
    score.style.fontSize = '10px';
    score.style.opacity = '0.7';
    score.style.marginTop = '4px';
    score.textContent = `Score: ${data.risk_score}/100 | ${data.message_count} msgs recientes`;
    overlay.appendChild(score);

    overlay.addEventListener('click', () => removeSpamWarning());
    document.body.appendChild(overlay);
    _spamOverlay = overlay;

    // Auto-dismiss: 30s for critical, 15s for high, 8s for medium
    const dismissMs = isCritical ? 30000 : isHigh ? 15000 : 8000;
    setTimeout(() => removeSpamWarning(), dismissMs);
  }

  function removeSpamWarning() {
    if (_spamOverlay) { _spamOverlay.remove(); _spamOverlay = null; }
    const existing = document.getElementById('wspp-spam-warning');
    if (existing) existing.remove();
  }

  /**
   * Muestra un badge/overlay de validación sobre el header del chat activo.
   */
  function showValidationOverlay(data) {
    removeValidationOverlay();

    if (!data || !data.id) return;

    const statusColors = {
      pendiente:  { bg: '#f1f5f9', text: '#64748b', label: 'PENDIENTE' },
      contactado: { bg: '#dbeafe', text: '#2563eb', label: 'CONTACTADO' },
      respondido: { bg: '#e0f2fe', text: '#0891b2', label: 'RESPONDIDO' },
      invalido:   { bg: '#fee2e2', text: '#dc2626', label: 'IMPOSIBLE' },
    };

    const voteColors = {
      duro:     { bg: '#dcfce7', text: '#15803d', label: 'VOTO DURO' },
      blando:   { bg: '#fef9c3', text: '#ca8a04', label: 'VOTO BLANDO' },
      flotante: { bg: '#ede9fe', text: '#7c3aed', label: 'FLOTANTE' },
    };

    const st = statusColors[data.status] || statusColors.pendiente;
    const vc = data.vote_class ? voteColors[data.vote_class] : null;
    const displayStatus = vc || st;

    const overlay = document.createElement('div');
    overlay.id = 'wspp-validation-overlay';
    Object.assign(overlay.style, {
      position: 'fixed',
      top: '72px',
      right: '24px',
      zIndex: '99998',
      background: '#ffffff',
      borderRadius: '12px',
      boxShadow: '0 4px 20px rgba(0,0,0,.15)',
      border: '1px solid #e2e8f0',
      padding: '12px 16px',
      minWidth: '220px',
      maxWidth: '300px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '12px',
      transition: 'opacity .2s, transform .2s',
      opacity: '0',
      transform: 'translateY(-8px)',
      cursor: 'pointer',
    });

    // M-1 FIX: Use DOM builder instead of innerHTML to prevent XSS from unsanitized backend data.
    function el(tag, styles, children) {
      const node = document.createElement(tag);
      if (styles) Object.assign(node.style, styles);
      if (typeof children === 'string') node.textContent = children;
      else if (Array.isArray(children)) children.forEach(c => { if (c) node.appendChild(c); });
      return node;
    }
    function setAttrs(node, attrs) { for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v); return node; }

    // Header row: status badge + zona
    const headerRow = el('div', { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }, [
      el('div', { background: displayStatus.bg, color: displayStatus.text, padding: '2px 8px', borderRadius: '6px', fontWeight: '700', fontSize: '10px', letterSpacing: '.5px' }, displayStatus.label),
      el('span', { color: '#94a3b8', fontSize: '10px' }, data.zona || ''),
    ]);
    overlay.appendChild(headerRow);

    // Name
    overlay.appendChild(el('div', { fontWeight: '600', color: '#1e293b', fontSize: '13px', marginBottom: '2px' }, data.nombre || 'Sin nombre'));

    // Phone + encuestador
    const infoText = (data.telefono || '') + (data.encuestador ? ' | Enc: ' + data.encuestador : '');
    overlay.appendChild(el('div', { color: '#64748b', fontSize: '11px', marginBottom: '4px' }, infoText));

    // Claimed by
    if (data.claimed_by_name) {
      overlay.appendChild(el('div', { color: '#94a3b8', fontSize: '10px' }, 'Reclamado: ' + data.claimed_by_name));
    }

    // Classify panel
    const classifyPanel = el('div', { display: 'none', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e2e8f0' });
    classifyPanel.id = 'wspp-classify-panel';
    classifyPanel.appendChild(el('div', { fontSize: '10px', color: '#64748b', fontWeight: '600', marginBottom: '6px' }, 'CLASIFICAR:'));

    const btnContainer = el('div', { display: 'flex', flexWrap: 'wrap', gap: '4px' });
    const btnConfigs = [
      { vote: 'duro', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0', label: 'Voto Duro' },
      { vote: 'blando', bg: '#fef9c3', color: '#ca8a04', border: '#fde68a', label: 'Voto Blando' },
      { vote: 'flotante', bg: '#ede9fe', color: '#7c3aed', border: '#ddd6fe', label: 'Flotante' },
      { vote: 'invalido', bg: '#fee2e2', color: '#dc2626', border: '#fecaca', label: 'Imposible' },
    ];
    for (const cfg of btnConfigs) {
      const btn = el('button', { background: cfg.bg, color: cfg.color, border: '1px solid ' + cfg.border, borderRadius: '6px', padding: '4px 10px', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }, cfg.label);
      btn.className = 'wspp-classify-btn';
      btn.setAttribute('data-vote', cfg.vote);
      btnContainer.appendChild(btn);
    }
    classifyPanel.appendChild(btnContainer);
    overlay.appendChild(classifyPanel);

    // Toast
    const toast = el('div', { display: 'none', marginTop: '6px', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '600', textAlign: 'center' });
    toast.id = 'wspp-overlay-toast';
    overlay.appendChild(toast);

    // Toggle classify panel on click
    overlay.addEventListener('click', (e) => {
      const panel = overlay.querySelector('#wspp-classify-panel');
      if (panel && !e.target.closest('.wspp-classify-btn')) {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      }
    });

    // Classify button handlers
    overlay.addEventListener('click', (e) => {
      const btn = e.target.closest('.wspp-classify-btn');
      if (!btn) return;
      e.stopPropagation();
      const vote = btn.getAttribute('data-vote');
      // H-3: Use specific origin instead of '*'
      // BUG FIX v7.1.0: include _phone and original_category for adaptive scoring
      window.postMessage({
        type: 'WSPP_CLASSIFY',
        payload: {
          validation_id: data.id,
          vote_class: vote === 'invalido' ? '' : vote,
          status: vote === 'invalido' ? 'invalido' : 'respondido',
          _phone: data.telefono || null,
          original_category: data.vote_class || null,
        },
      }, WA_ORIGIN);
      // Disable buttons while processing
      overlay.querySelectorAll('.wspp-classify-btn').forEach(b => {
        b.style.opacity = '0.5';
        b.style.pointerEvents = 'none';
      });
    });

    document.body.appendChild(overlay);
    _currentOverlay = overlay;

    // Animate in
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      overlay.style.transform = 'translateY(0)';
    });
  }

  function removeValidationOverlay() {
    if (_currentOverlay) {
      _currentOverlay.remove();
      _currentOverlay = null;
    }
    const existing = document.getElementById('wspp-validation-overlay');
    if (existing) existing.remove();
  }

  function updateOverlayStatus(data) {
    const overlay = document.getElementById('wspp-validation-overlay');
    if (!overlay || !data) return;
    // Re-render with new data
    showValidationOverlay(data);
  }

  function showOverlayToast(message, type) {
    const toast = document.getElementById('wspp-overlay-toast');
    if (!toast) return;
    toast.style.display = 'block';
    toast.style.background = type === 'success' ? '#dcfce7' : '#fee2e2';
    toast.style.color = type === 'success' ? '#15803d' : '#dc2626';
    toast.textContent = message;
    // Re-enable buttons
    const overlay = document.getElementById('wspp-validation-overlay');
    if (overlay) {
      overlay.querySelectorAll('.wspp-classify-btn').forEach(b => {
        b.style.opacity = '1';
        b.style.pointerEvents = 'auto';
      });
    }
    setTimeout(() => { toast.style.display = 'none'; }, 3000);
  }

  /**
   * Intenta instalar los listeners de WA modules.
   * Se reintenta hasta que WA esté completamente cargado.
   */
  // M-8: Max retry counts to prevent infinite retries
  const MAX_WA_LISTENER_RETRIES = 30; // ~90s max wait
  let _waListenerRetries = 0;

  // S-3: Health check — validate all required WA modules on successful install
  const WA_REQUIRED_MODULES = [
    'WAWebMsgCollection',
    'WAWebChatCollection',
    'WAWebContactCollection',
  ];
  const WA_OPTIONAL_MODULES = [
    'WAWebMediaOpaqueData',      // PTT: media opaque data wrapper
    'WAWebPrepRawMedia',         // PTT: prepRawMedia({ isPtt: true }) pipeline
    'WAWebSendMsgChatAction',    // PTT: addAndSendMsgToChat
    'WAWebWidFactory',           // @lid resolution + chat lookup
    'WAWebFindChatAction',       // PTT: fallback chat resolver
  ];

  function runModuleHealthCheck() {
    const missing = [];
    const missingOptional = [];
    for (const mod of WA_REQUIRED_MODULES) {
      try { window.require(mod); } catch (_) { missing.push(mod); }
    }
    for (const mod of WA_OPTIONAL_MODULES) {
      try { window.require(mod); } catch (_) { missingOptional.push(mod); }
    }

    if (missing.length > 0) {
      console.error('[WSPP HEALTH] CRITICAL — missing required modules:', missing.join(', '));
      showHealthBadge('error', 'Extension desactualizada — faltan modulos: ' + missing.join(', '));
    } else if (missingOptional.length > 0) {
      console.warn('[WSPP HEALTH] Optional modules missing:', missingOptional.join(', '));
      showHealthBadge('warn', 'Funciones limitadas — faltan: ' + missingOptional.join(', '));
    } else {
      console.log('[WSPP HEALTH] All modules OK');
    }
  }

  let _healthBadge = null;
  function showHealthBadge(level, message) {
    if (_healthBadge) _healthBadge.remove();
    const badge = document.createElement('div');
    badge.id = 'wspp-health-badge';
    const isError = level === 'error';
    Object.assign(badge.style, {
      position: 'fixed',
      bottom: '16px',
      left: '16px',
      zIndex: '99999',
      background: isError ? '#dc2626' : '#ca8a04',
      color: '#fff',
      padding: '8px 14px',
      borderRadius: '8px',
      fontSize: '11px',
      fontWeight: '600',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxShadow: '0 2px 12px rgba(0,0,0,.3)',
      maxWidth: '320px',
      cursor: 'pointer',
    });
    badge.textContent = (isError ? 'WSPP: ' : 'WSPP: ') + message;
    badge.title = 'Click para cerrar';
    badge.addEventListener('click', () => badge.remove());
    document.body.appendChild(badge);
    _healthBadge = badge;
    // Auto-dismiss warnings after 15s, errors stay
    if (!isError) setTimeout(() => { if (_healthBadge === badge) badge.remove(); }, 15000);
  }

  function tryInstallWAListeners() {
    if (!window.require) {
      _waListenerRetries++;
      if (_waListenerRetries < MAX_WA_LISTENER_RETRIES) {
        setTimeout(tryInstallWAListeners, 2000);
      } else {
        console.warn('[WSPP] window.require never appeared after', MAX_WA_LISTENER_RETRIES, 'retries — giving up');
        showHealthBadge('error', 'WhatsApp Web no detectado — recarga la pagina');
      }
      return;
    }

    installIncomingMessageListener();
    installChatWatcher();

    // Si no se instalaron, reintentar con limit
    if (!_msgListenerInstalled || !_chatWatcherInstalled) {
      _waListenerRetries++;
      if (_waListenerRetries < MAX_WA_LISTENER_RETRIES) {
        setTimeout(tryInstallWAListeners, 3000);
      } else {
        console.warn('[WSPP] WA listeners not installed after', MAX_WA_LISTENER_RETRIES, 'retries — giving up');
        showHealthBadge('error', 'No se pudieron instalar los listeners — recarga la pagina');
      }
    } else {
      // S-3: All listeners installed — run health check
      runModuleHealthCheck();
    }
  }

  // Esperar a que WA Web cargue para instalar listeners de módulos internos
  if (document.readyState === 'complete') {
    setTimeout(tryInstallWAListeners, 5000); // WA tarda en cargar los módulos
  } else {
    window.addEventListener('load', () => setTimeout(tryInstallWAListeners, 5000));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // AUDIO CATALOG PANEL (v7.3.0)
  // Replaces per-message ElevenLabs TTS with a reusable audio catalog.
  // Button opens a panel with pre-generated audio messages.
  // Send flow: window.WWebJS.sendMessage({ sendAudioAsVoice: true })
  //   → WAWebPrepRawMedia.prepRawMedia(opaqueData, { isPtt: true })
  //   → addAndSendMsgToChat(chat, { type: 'ptt', ... })
  //   → message appears as WhatsApp voice note with waveform.
  // ═══════════════════════════════════════════════════════════════════════

  let _catalogItems = [];
  let _catalogPanelOpen = false;
  let _catalogLoading = false;

  const CATALOG_ICONS = {
    saludo: '\uD83D\uDC4B',          // wave
    agradecimiento: '\uD83D\uDE4F',  // pray
    pedir_voto: '\u2705',            // check
    respuesta_trabajo: '\uD83D\uDCBC', // briefcase
    respuesta_dinero: '\uD83D\uDCB0', // money bag
    invitacion_evento: '\uD83D\uDCC5', // calendar
    despedida: '\uD83D\uDC4D',       // thumbs up
    propuestas: '\uD83D\uDCCB',      // clipboard
  };

  // ── Convertir base64 a Blob ──────────────────────────────────────────
  function base64ToBlob(base64, mimeType) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType });
  }

  // ── Create the mic button (opens catalog panel) ─────────────────────
  function createCatalogButton() {
    const btn = document.createElement('button');
    btn.id = 'wspp-catalog-btn';
    btn.innerHTML = '\uD83C\uDFA4';
    btn.title = 'Audios de Cesar Vasquez';
    Object.assign(btn.style, {
      position: 'fixed',
      bottom: '80px',
      right: '24px',
      zIndex: '99999',
      width: '48px',
      height: '48px',
      borderRadius: '50%',
      border: 'none',
      background: '#00a884',
      color: '#fff',
      fontSize: '22px',
      cursor: 'pointer',
      boxShadow: '0 2px 8px rgba(0,0,0,.3)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background .2s, transform .1s',
    });
    btn.addEventListener('mouseenter', () => { if (!_catalogPanelOpen) btn.style.background = '#008f72'; });
    btn.addEventListener('mouseleave', () => { if (!_catalogPanelOpen) btn.style.background = '#00a884'; });
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
      const btn = document.getElementById('wspp-catalog-btn');
      if (btn) btn.style.background = '#00a884';
      return;
    }
    _catalogPanelOpen = true;
    const btn = document.getElementById('wspp-catalog-btn');
    if (btn) btn.style.background = '#1f2c34';

    // Request catalog from backend if empty
    if (_catalogItems.length === 0 && !_catalogLoading) {
      _catalogLoading = true;
      window.postMessage({ type: 'FETCH_AUDIO_CATALOG' }, WA_ORIGIN);
    }

    renderCatalogPanel();
  }

  // ── Render the catalog panel ────────────────────────────────────────
  function renderCatalogPanel() {
    let panel = document.getElementById('wspp-catalog-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'wspp-catalog-panel';
      Object.assign(panel.style, {
        position: 'fixed',
        bottom: '140px',
        right: '16px',
        zIndex: '99999',
        width: '320px',
        maxHeight: '460px',
        background: '#111b21',
        borderRadius: '12px',
        boxShadow: '0 4px 24px rgba(0,0,0,.5)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Segoe UI, sans-serif',
        animation: 'wspp-slide-up .2s ease-out',
      });
      document.body.appendChild(panel);
    }

    const loading = _catalogLoading && _catalogItems.length === 0;

    panel.innerHTML = `
      <div style="padding:12px 16px;background:#1f2c34;border-bottom:1px solid #2a3942;display:flex;align-items:center;gap:8px;">
        <span style="font-size:16px;">\uD83C\uDFA4</span>
        <span style="color:#e9edef;font-size:14px;font-weight:600;flex:1;">Audios de Cesar Vasquez</span>
        <button id="wspp-catalog-close" style="background:none;border:none;color:#8696a0;font-size:18px;cursor:pointer;padding:2px 6px;">\u2715</button>
      </div>
      <div id="wspp-catalog-list" style="overflow-y:auto;flex:1;padding:8px;">
        ${loading ? '<div style="color:#8696a0;text-align:center;padding:24px;font-size:13px;">Cargando catalogo...</div>' : ''}
        ${!loading && _catalogItems.length === 0 ? '<div style="color:#8696a0;text-align:center;padding:24px;font-size:13px;">No hay audios disponibles</div>' : ''}
        ${_catalogItems.map(item => `
          <div class="wspp-catalog-item" data-id="${item.id}" data-has-audio="${item.has_audio}" style="
            padding:10px 12px;margin:4px 0;border-radius:8px;cursor:pointer;
            background:#1f2c34;transition:background .15s;display:flex;align-items:center;gap:10px;
            ${!item.has_audio ? 'opacity:0.4;pointer-events:none;' : ''}
          ">
            <span style="font-size:20px;flex-shrink:0;">${CATALOG_ICONS[item.category] || '\uD83D\uDD0A'}</span>
            <div style="flex:1;min-width:0;">
              <div style="color:#e9edef;font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${item.label}
              </div>
              <div style="color:#8696a0;font-size:11px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${item.description || item.category}
              </div>
            </div>
            <span style="color:#00a884;font-size:14px;flex-shrink:0;">${item.has_audio ? '\u25B6' : '\u23F3'}</span>
          </div>
        `).join('')}
      </div>
      <div id="wspp-catalog-status" style="padding:8px 16px;background:#1f2c34;border-top:1px solid #2a3942;color:#8696a0;font-size:11px;text-align:center;display:none;"></div>
    `;

    // Close button
    panel.querySelector('#wspp-catalog-close')?.addEventListener('click', () => {
      panel.remove();
      _catalogPanelOpen = false;
      const btn = document.getElementById('wspp-catalog-btn');
      if (btn) btn.style.background = '#00a884';
    });

    // Item click handlers
    panel.querySelectorAll('.wspp-catalog-item').forEach(el => {
      el.addEventListener('mouseenter', () => { el.style.background = '#2a3942'; });
      el.addEventListener('mouseleave', () => { el.style.background = '#1f2c34'; });
      el.addEventListener('click', () => handleCatalogItemClick(el.getAttribute('data-id')));
    });
  }

  // ── Handle catalog item click — fetch audio and send via clipboard ──
  function handleCatalogItemClick(audioId) {
    if (!audioId) return;

    const statusEl = document.getElementById('wspp-catalog-status');
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.textContent = 'Cargando audio...';
      statusEl.style.color = '#8696a0';
    }

    // Highlight the clicked item
    const items = document.querySelectorAll('.wspp-catalog-item');
    items.forEach(el => { el.style.pointerEvents = 'none'; el.style.opacity = '0.6'; });

    window.postMessage({ type: 'GET_CATALOG_AUDIO', id: audioId }, WA_ORIGIN);
  }

  // ── Send audio as WhatsApp voice note (PTT) via WA internal modules ──
  //
  // Implements the full PTT pipeline directly using window.require() modules,
  // mirroring what whatsapp-web.js does in processMediaData + sendMessage.
  // window.WWebJS does NOT exist in the browser — that's a Puppeteer abstraction.
  //
  // Pipeline:
  //   base64 → File → OpaqueData
  //     → WAWebPrepRawMedia.prepRawMedia(opaqueData, { isPtt: true })
  //     → waitForPrep() → mediaData (type: 'ptt')
  //     → generateWaveform(file) → mediaData.waveform
  //     → WAWebMediaStorage.getOrCreateMediaObject(filehash)
  //     → WAWebMediaMmsV4Upload.uploadMedia({ mimetype, mediaObject, mediaType })
  //     → mediaData.set(uploadedEntry)
  //     → build message object { type:'ptt', ... }
  //     → WAWebSendMsgChatAction.addAndSendMsgToChat(chat, message)
  //
  // Result: native WA voice note bubble with waveform.

  // Helper: generate waveform Uint8Array from audio File (same as WWebJS.generateWaveform)
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
      // 1. Verify window.require is available
      if (typeof window.require !== 'function') {
        console.error('[WSPP CATALOG] window.require not available — WA Web still loading?');
        return false;
      }

      // 2. Get the currently active chat model
      const chatJid = _lastActiveChatJid;
      if (!chatJid) {
        console.error('[WSPP CATALOG] No active chat JID — open a conversation first');
        return false;
      }

      // 3. Resolve chat model
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

      // 4. base64 → File
      const binary = atob(audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime });
      const file = new File([blob], 'voice_cesar_vasquez.ogg', { type: mime, lastModified: Date.now() });

      // 5. File → OpaqueData
      const OpaqueData = window.require('WAWebMediaOpaqueData');
      const opaqueData = await OpaqueData.createFromData(file, mime);

      // 6. prepRawMedia with isPtt: true
      const { prepRawMedia } = window.require('WAWebPrepRawMedia');
      const mediaPrep = prepRawMedia(opaqueData, {
        isPtt: true,
        asSticker: false,
        asGif: false,
        asDocument: false,
      });
      const mediaData = await mediaPrep.waitForPrep();
      console.log('[WSPP CATALOG] prepRawMedia done, type:', mediaData.type, 'filehash:', mediaData.filehash?.slice(0, 12));

      // 7. Generate waveform (non-fatal if fails)
      const waveform = await _generateWaveform(file);
      if (waveform) mediaData.waveform = waveform;

      // 8. mediaObject + mediaType
      const { getOrCreateMediaObject } = window.require('WAWebMediaStorage');
      const mediaObject = getOrCreateMediaObject(mediaData.filehash);
      const { msgToMediaType } = window.require('WAWebMmsMediaTypes');
      const mediaType = msgToMediaType({ type: mediaData.type, isGif: false });

      // 9. Ensure mediaBlob is OpaqueData
      if (!(mediaData.mediaBlob instanceof OpaqueData)) {
        mediaData.mediaBlob = await OpaqueData.createFromData(mediaData.mediaBlob, mediaData.mediaBlob.type);
      }
      mediaData.renderableUrl = mediaData.mediaBlob.url();
      mediaObject.consolidate(mediaData.toJSON());
      mediaData.mediaBlob.autorelease();

      // 10. Upload to WA MMS
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

      // 11. Build message identity fields
      const { getMaybeMeLidUser, getMaybeMePnUser } = window.require('WAWebUserPrefsMeUser');
      const meUser = getMaybeMePnUser();
      const newId = await window.require('WAWebMsgKey').newId();
      const MsgKey = window.require('WAWebMsgKey');
      const newMsgKey = new MsgKey({ from: meUser, to: chat.id, id: newId, selfDir: 'out' });

      const ephemeralFields = window.require('WAWebGetEphemeralFieldsMsgActionsUtils').getEphemeralFields(chat);

      // 12. Build message object — spread mediaData JSON, override type to 'ptt'
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

      // 13. Send
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

    // Catalog list received
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

    // Single audio received — send via clipboard
    if (e.data?.type === 'CATALOG_AUDIO_READY') {
      const statusEl = document.getElementById('wspp-catalog-status');

      if (!e.data.ok || !e.data.audioBase64) {
        console.error('[WSPP CATALOG] Audio error:', e.data.error);
        if (statusEl) {
          statusEl.textContent = 'Error: ' + (e.data.error || 'audio no disponible');
          statusEl.style.color = '#ef5350';
        }
        // Re-enable items
        document.querySelectorAll('.wspp-catalog-item').forEach(el => {
          el.style.pointerEvents = ''; el.style.opacity = '';
        });
        setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 3000);
        return;
      }

      if (statusEl) {
        statusEl.textContent = 'Enviando nota de voz...';
        statusEl.style.color = '#00a884';
      }

      sendAudioAsPTT(e.data.audioBase64, e.data.mimeType).then(ok => {
        if (ok) {
          if (statusEl) {
            statusEl.textContent = (e.data.label || 'Audio') + ' — enviado como nota de voz ✓';
            statusEl.style.color = '#00a884';
          }
          console.log('[WSPP CATALOG] PTT voice note sent successfully');
        } else {
          if (statusEl) {
            statusEl.textContent = 'Error al enviar — verifica que haya un chat abierto';
            statusEl.style.color = '#ef5350';
          }
        }
        // Re-enable items after 1.5s
        setTimeout(() => {
          document.querySelectorAll('.wspp-catalog-item').forEach(el => {
            el.style.pointerEvents = ''; el.style.opacity = '';
          });
          setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 2000);
        }, 1500);
      });
      return;
    }
  });

  // ── Insert catalog button when chat is ready ────────────────────────
  const MAX_CATALOG_BTN_RETRIES = 30;
  let _catalogBtnRetries = 0;

  function waitForChatAndInsertButton() {
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

  // Wait for WA Web to load
  if (document.readyState === 'complete') {
    setTimeout(waitForChatAndInsertButton, 3000);
  } else {
    window.addEventListener('load', () => setTimeout(waitForChatAndInsertButton, 3000));
  }

})();
