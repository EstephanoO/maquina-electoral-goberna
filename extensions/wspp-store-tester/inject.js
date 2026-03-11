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
  // AUDIO CATALOG PANEL (v7.4.0)
  // Replaces per-message ElevenLabs TTS with a reusable audio catalog.
  // Consultor role: can regenerate, edit script inline, toggle active/inactive.
  // Agente digital: send-only.
  // ═══════════════════════════════════════════════════════════════════════

  let _catalogItems = [];
  let _catalogPanelOpen = false;
  let _catalogLoading = false;
  let _catalogIsConsultor = false; // true if logged-in user has consultor+ role
  let _catalogEditingId = null;    // id of item currently being edited

  // ── SVG icons (inline, no emoji) ───────────────────────────────────
  const CATALOG_SVG = {
    // Mic button SVG
    mic: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
    // Category icons
    saludo:             `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`,
    agradecimiento:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    pedir_voto:         `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    respuesta_trabajo:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
    respuesta_dinero:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    invitacion_evento:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    despedida:          `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
    propuestas:         `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    // UI action icons
    send:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`,
    refresh: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
    edit:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    close:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    check:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    waveform:`<svg width="52" height="20" viewBox="0 0 52 20" fill="none"><rect x="0"  y="8"  width="3" height="4"  rx="1.5" fill="currentColor" opacity=".4"/><rect x="5"  y="5"  width="3" height="10" rx="1.5" fill="currentColor" opacity=".6"/><rect x="10" y="2"  width="3" height="16" rx="1.5" fill="currentColor" opacity=".8"/><rect x="15" y="6"  width="3" height="8"  rx="1.5" fill="currentColor" opacity=".7"/><rect x="20" y="3"  width="3" height="14" rx="1.5" fill="currentColor"/><rect x="25" y="7"  width="3" height="6"  rx="1.5" fill="currentColor" opacity=".7"/><rect x="30" y="1"  width="3" height="18" rx="1.5" fill="currentColor" opacity=".9"/><rect x="35" y="5"  width="3" height="10" rx="1.5" fill="currentColor" opacity=".6"/><rect x="40" y="8"  width="3" height="4"  rx="1.5" fill="currentColor" opacity=".5"/><rect x="45" y="4"  width="3" height="12" rx="1.5" fill="currentColor" opacity=".7"/><rect x="49" y="9"  width="3" height="2"  rx="1" fill="currentColor" opacity=".3"/></svg>`,
  };

  const CATALOG_CATEGORY_LABELS = {
    saludo: 'Saludo',
    agradecimiento: 'Agradecimiento',
    pedir_voto: 'Voto',
    respuesta_trabajo: 'Trabajo',
    respuesta_dinero: 'Dinero',
    invitacion_evento: 'Evento',
    despedida: 'Despedida',
    propuestas: 'Propuestas',
  };

  const CATALOG_CATEGORY_COLORS = {
    saludo:            { bg: 'rgba(0,168,132,.15)',  accent: '#00a884' },
    agradecimiento:    { bg: 'rgba(239,83,80,.12)',  accent: '#ef5350' },
    pedir_voto:        { bg: 'rgba(251,188,4,.12)',  accent: '#f59e0b' },
    respuesta_trabajo: { bg: 'rgba(99,102,241,.12)', accent: '#818cf8' },
    respuesta_dinero:  { bg: 'rgba(16,185,129,.12)', accent: '#34d399' },
    invitacion_evento: { bg: 'rgba(14,165,233,.12)', accent: '#38bdf8' },
    despedida:         { bg: 'rgba(168,85,247,.12)', accent: '#c084fc' },
    propuestas:        { bg: 'rgba(245,158,11,.12)', accent: '#fbbf24' },
  };

  // Inject keyframes once
  (function injectCatalogStyles() {
    if (document.getElementById('wspp-catalog-styles')) return;
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
    `;
    document.head.appendChild(s);
  })();

  // ── Detect consultor role from storage ─────────────────────────────
  function _refreshConsultorFlag(cb) {
    chrome.storage.local.get(['wspp_user_role'], (s) => {
      const role = s.wspp_user_role || '';
      _catalogIsConsultor = ['admin','consultor'].includes(role);
      if (cb) cb();
    });
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

    _refreshConsultorFlag(() => {
      if (_catalogItems.length === 0 && !_catalogLoading) {
        _catalogLoading = true;
        window.postMessage({ type: 'FETCH_AUDIO_CATALOG' }, WA_ORIGIN);
      }
      renderCatalogPanel();
    });
  }

  // ── Render the full catalog panel ───────────────────────────────────
  function renderCatalogPanel() {
    let panel = document.getElementById('wspp-catalog-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'wspp-catalog-panel';
      Object.assign(panel.style, {
        position: 'fixed',
        bottom: '148px',
        right: '16px',
        zIndex: '99999',
        width: '380px',
        maxHeight: '520px',
        background: '#0b1418',
        borderRadius: '16px',
        boxShadow: '0 8px 40px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.06)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        animation: 'wspp-slide-up .22s cubic-bezier(.16,1,.3,1)',
      });
      document.body.appendChild(panel);
    }

    const loading = _catalogLoading && _catalogItems.length === 0;

    // ── Header ─────────────────────────────────────────────────────
    const header = document.createElement('div');
    Object.assign(header.style, {
      padding: '14px 16px 12px',
      background: 'linear-gradient(180deg,#1a2730 0%,#111b21 100%)',
      borderBottom: '1px solid rgba(255,255,255,.06)',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      flexShrink: '0',
    });

    const headerIcon = document.createElement('div');
    Object.assign(headerIcon.style, {
      width: '32px', height: '32px', borderRadius: '10px',
      background: 'linear-gradient(135deg,#00a884,#008f72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', flexShrink: '0',
      boxShadow: '0 2px 8px rgba(0,168,132,.4)',
    });
    headerIcon.innerHTML = CATALOG_SVG.mic;
    headerIcon.querySelector('svg').style.width = '16px';
    headerIcon.querySelector('svg').style.height = '16px';

    const headerText = document.createElement('div');
    headerText.style.flex = '1';
    const headerTitle = document.createElement('div');
    Object.assign(headerTitle.style, {
      color: '#e9edef', fontSize: '14px', fontWeight: '700', letterSpacing: '-.1px',
    });
    headerTitle.textContent = 'Audios — César Vásquez';
    const headerSub = document.createElement('div');
    Object.assign(headerSub.style, {
      color: '#8696a0', fontSize: '11px', marginTop: '1px',
    });
    headerSub.textContent = _catalogIsConsultor
      ? `${_catalogItems.length} plantillas · modo consultor`
      : `${_catalogItems.length} plantillas disponibles`;
    headerText.appendChild(headerTitle);
    headerText.appendChild(headerSub);

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = CATALOG_SVG.close;
    Object.assign(closeBtn.style, {
      background: 'none', border: 'none', color: '#8696a0',
      cursor: 'pointer', padding: '6px', borderRadius: '8px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'background .15s, color .15s',
    });
    closeBtn.classList.add('wspp-icon-btn');
    closeBtn.addEventListener('click', () => {
      panel.remove();
      _catalogPanelOpen = false;
      _catalogEditingId = null;
      const fab = document.getElementById('wspp-catalog-btn');
      if (fab) fab.style.boxShadow = '0 4px 16px rgba(0,168,132,.45), 0 2px 4px rgba(0,0,0,.3)';
    });

    header.appendChild(headerIcon);
    header.appendChild(headerText);
    header.appendChild(closeBtn);
    panel.innerHTML = '';
    panel.appendChild(header);

    // ── List area ──────────────────────────────────────────────────
    const list = document.createElement('div');
    list.id = 'wspp-catalog-list';
    Object.assign(list.style, {
      overflowY: 'auto',
      flex: '1',
      padding: '8px',
      scrollbarWidth: 'thin',
      scrollbarColor: '#2a3942 transparent',
    });

    if (loading) {
      const loadEl = document.createElement('div');
      Object.assign(loadEl.style, {
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '40px 0', gap: '12px',
      });
      const spinner = document.createElement('div');
      Object.assign(spinner.style, {
        width: '28px', height: '28px', borderRadius: '50%',
        border: '3px solid rgba(0,168,132,.2)',
        borderTopColor: '#00a884',
      });
      spinner.classList.add('wspp-spinning');
      const loadTxt = document.createElement('div');
      Object.assign(loadTxt.style, { color: '#8696a0', fontSize: '13px' });
      loadTxt.textContent = 'Cargando plantillas...';
      loadEl.appendChild(spinner);
      loadEl.appendChild(loadTxt);
      list.appendChild(loadEl);
    } else if (_catalogItems.length === 0) {
      const empty = document.createElement('div');
      Object.assign(empty.style, {
        color: '#8696a0', textAlign: 'center',
        padding: '40px 16px', fontSize: '13px', lineHeight: '1.5',
      });
      empty.textContent = 'No hay audios disponibles';
      list.appendChild(empty);
    } else {
      _catalogItems.forEach(item => {
        list.appendChild(_buildCatalogCard(item));
      });
    }

    panel.appendChild(list);

    // ── Status bar ─────────────────────────────────────────────────
    const statusBar = document.createElement('div');
    statusBar.id = 'wspp-catalog-status';
    Object.assign(statusBar.style, {
      padding: '0 16px',
      background: '#111b21',
      borderTop: '1px solid rgba(255,255,255,.05)',
      color: '#8696a0',
      fontSize: '12px',
      textAlign: 'center',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
      height: '0',
      overflow: 'hidden',
      transition: 'height .2s, padding .2s',
    });
    panel.appendChild(statusBar);
  }

  // ── Build a single catalog card ─────────────────────────────────────
  function _buildCatalogCard(item) {
    const colors = CATALOG_CATEGORY_COLORS[item.category] || { bg: 'rgba(134,150,160,.1)', accent: '#8696a0' };
    const catLabel = CATALOG_CATEGORY_LABELS[item.category] || item.category;
    const catSvg = CATALOG_SVG[item.category] || CATALOG_SVG.propuestas;
    const dur = _fmtDuration(item.duration_ms);
    const hasAudio = item.has_audio;
    const isEditing = _catalogEditingId === item.id;

    const card = document.createElement('div');
    card.className = 'wspp-catalog-item';
    card.dataset.id = item.id;
    card.dataset.hasAudio = String(hasAudio);
    Object.assign(card.style, {
      padding: '0',
      margin: '5px 0',
      borderRadius: '12px',
      background: '#111b21',
      border: '1px solid rgba(255,255,255,.05)',
      overflow: 'hidden',
      transition: 'background .15s, border-color .15s',
      opacity: hasAudio ? '1' : '0.5',
    });

    // ── Card top row ─────────────────────────────────────────────
    const top = document.createElement('div');
    Object.assign(top.style, {
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '10px 12px 8px',
    });

    // Category icon pill
    const iconPill = document.createElement('div');
    Object.assign(iconPill.style, {
      width: '36px', height: '36px', borderRadius: '10px',
      background: colors.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: colors.accent, flexShrink: '0',
    });
    iconPill.innerHTML = catSvg;

    // Text block
    const textBlock = document.createElement('div');
    textBlock.style.flex = '1';
    textBlock.style.minWidth = '0';

    const labelRow = document.createElement('div');
    Object.assign(labelRow.style, {
      display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px',
    });
    const labelEl = document.createElement('div');
    Object.assign(labelEl.style, {
      color: '#e9edef', fontSize: '13px', fontWeight: '600',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: '1',
    });
    labelEl.textContent = item.label;

    const catBadge = document.createElement('span');
    Object.assign(catBadge.style, {
      fontSize: '10px', fontWeight: '700', letterSpacing: '.3px',
      color: colors.accent, background: colors.bg,
      padding: '2px 6px', borderRadius: '20px', flexShrink: '0',
      textTransform: 'uppercase',
    });
    catBadge.textContent = catLabel;
    labelRow.appendChild(labelEl);
    labelRow.appendChild(catBadge);

    const descEl = document.createElement('div');
    Object.assign(descEl.style, {
      color: '#8696a0', fontSize: '11px',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    });
    descEl.textContent = item.description || '';
    textBlock.appendChild(labelRow);
    textBlock.appendChild(descEl);

    top.appendChild(iconPill);
    top.appendChild(textBlock);
    card.appendChild(top);

    // ── Waveform + duration row + send button ────────────────────
    const bottomRow = document.createElement('div');
    Object.assign(bottomRow.style, {
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '4px 12px 10px',
    });

    const waveWrap = document.createElement('div');
    waveWrap.className = 'wspp-waveform';
    Object.assign(waveWrap.style, {
      flex: '1', color: hasAudio ? colors.accent : '#3a4a52',
    });
    waveWrap.innerHTML = CATALOG_SVG.waveform;

    const durEl = document.createElement('span');
    Object.assign(durEl.style, {
      fontSize: '11px', color: '#8696a0', flexShrink: '0', fontVariantNumeric: 'tabular-nums',
    });
    durEl.textContent = dur;

    const sendBtn = document.createElement('button');
    sendBtn.className = 'wspp-send-btn';
    sendBtn.innerHTML = CATALOG_SVG.send;
    Object.assign(sendBtn.style, {
      width: '32px', height: '32px', borderRadius: '50%',
      border: 'none', flexShrink: '0',
      background: hasAudio ? `linear-gradient(135deg,${colors.accent},${colors.accent}cc)` : '#2a3942',
      color: '#fff', cursor: hasAudio ? 'pointer' : 'default',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'background .15s, transform .15s',
      boxShadow: hasAudio ? `0 2px 8px ${colors.accent}55` : 'none',
    });
    if (!hasAudio) sendBtn.style.pointerEvents = 'none';
    sendBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (hasAudio) handleCatalogItemClick(item.id, item.label);
    });

    bottomRow.appendChild(waveWrap);
    if (dur) bottomRow.appendChild(durEl);
    bottomRow.appendChild(sendBtn);
    card.appendChild(bottomRow);

    // ── Consultor actions row ────────────────────────────────────
    if (_catalogIsConsultor) {
      const actionsRow = document.createElement('div');
      actionsRow.className = 'wspp-item-actions';
      Object.assign(actionsRow.style, {
        display: 'flex', alignItems: 'center', gap: '4px',
        padding: '0 8px 8px',
        opacity: '0',
        transition: 'opacity .15s',
      });

      // Regenerate button
      const regenBtn = document.createElement('button');
      regenBtn.title = 'Regenerar audio con ElevenLabs';
      regenBtn.innerHTML = CATALOG_SVG.refresh + '<span style="margin-left:4px;font-size:10px;font-weight:600;">Regenerar</span>';
      Object.assign(regenBtn.style, {
        display: 'flex', alignItems: 'center', padding: '5px 8px',
        borderRadius: '8px', border: '1px solid rgba(255,255,255,.07)',
        background: 'rgba(255,255,255,.03)', color: '#8696a0',
        fontSize: '11px', cursor: 'pointer', transition: 'background .15s, color .15s',
        gap: '2px',
      });
      regenBtn.classList.add('wspp-icon-btn');
      regenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        _handleRegenerate(item.id, regenBtn);
      });

      // Edit script button
      const editBtn = document.createElement('button');
      editBtn.title = 'Editar guión del audio';
      editBtn.innerHTML = CATALOG_SVG.edit + '<span style="margin-left:4px;font-size:10px;font-weight:600;">Editar guión</span>';
      Object.assign(editBtn.style, {
        display: 'flex', alignItems: 'center', padding: '5px 8px',
        borderRadius: '8px', border: '1px solid rgba(255,255,255,.07)',
        background: 'rgba(255,255,255,.03)', color: '#8696a0',
        fontSize: '11px', cursor: 'pointer', transition: 'background .15s, color .15s',
        gap: '2px',
      });
      editBtn.classList.add('wspp-icon-btn');
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        _catalogEditingId = isEditing ? null : item.id;
        renderCatalogPanel();
      });

      actionsRow.appendChild(regenBtn);
      actionsRow.appendChild(editBtn);
      card.appendChild(actionsRow);
    }

    // ── Inline script editor (consultor, expanded) ───────────────
    if (_catalogIsConsultor && isEditing) {
      const editorWrap = document.createElement('div');
      Object.assign(editorWrap.style, {
        padding: '0 12px 12px',
        borderTop: '1px solid rgba(255,255,255,.05)',
        marginTop: '4px',
      });

      const editorLabel = document.createElement('div');
      Object.assign(editorLabel.style, {
        fontSize: '10px', color: '#8696a0', textTransform: 'uppercase',
        letterSpacing: '.5px', margin: '8px 0 6px',
      });
      editorLabel.textContent = 'Guión del audio';

      const textarea = document.createElement('textarea');
      textarea.className = 'wspp-edit-area';
      textarea.value = item.script_text || '';
      Object.assign(textarea.style, {
        width: '100%', minHeight: '80px', padding: '8px 10px',
        background: '#0b1418', border: '1px solid rgba(255,255,255,.1)',
        borderRadius: '8px', color: '#e9edef', fontSize: '12px',
        lineHeight: '1.5', fontFamily: 'inherit', boxSizing: 'border-box',
      });

      const saveScriptBtn = document.createElement('button');
      saveScriptBtn.innerHTML = CATALOG_SVG.check + '<span style="margin-left:5px;">Guardar guión</span>';
      Object.assign(saveScriptBtn.style, {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginTop: '8px', width: '100%', padding: '7px',
        borderRadius: '8px', border: 'none',
        background: 'linear-gradient(135deg,#00a884,#008f72)',
        color: '#fff', fontSize: '12px', fontWeight: '700',
        cursor: 'pointer',
      });
      saveScriptBtn.addEventListener('click', () => {
        const newScript = textarea.value.trim();
        if (!newScript) return;
        _handleUpdateScript(item.id, newScript, saveScriptBtn);
      });

      editorWrap.appendChild(editorLabel);
      editorWrap.appendChild(textarea);
      editorWrap.appendChild(saveScriptBtn);
      card.appendChild(editorWrap);
    }

    return card;
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

    // Response handled in message listener below
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

  // Pending regen/update state
  let _pendingRegenId = null;
  let _pendingRegenBtn = null;
  let _pendingUpdateId = null;
  let _pendingUpdateBtn = null;

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

    // Disable all cards while loading
    document.querySelectorAll('.wspp-catalog-item').forEach(el => {
      el.style.pointerEvents = 'none'; el.style.opacity = '0.5';
    });

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

    // ── Catalog list received ──────────────────────────────────────
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

    // ── Single audio received — send as PTT ────────────────────────
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

    // ── Regenerate audio response ──────────────────────────────────
    if (e.data?.type === 'GENERATE_CATALOG_AUDIO_DONE') {
      if (_pendingRegenBtn) {
        _pendingRegenBtn.el.innerHTML = _pendingRegenBtn.orig;
        _pendingRegenBtn.el.disabled = false;
        _pendingRegenBtn = null;
      }
      if (e.data.ok) {
        // Update local item data and re-render
        const idx = _catalogItems.findIndex(i => i.id === e.data.id);
        if (idx >= 0) {
          _catalogItems[idx] = { ..._catalogItems[idx], has_audio: true, audio_size: e.data.audioSize, duration_ms: e.data.durationMs };
        }
        // Bust audio cache for this item
        window.postMessage({ type: 'BUST_AUDIO_CACHE', id: e.data.id }, WA_ORIGIN);
        _showCatalogStatus('Audio regenerado ✓', '#00a884', 2500);
        if (_catalogPanelOpen) renderCatalogPanel();
      } else {
        _showCatalogStatus('Error al regenerar: ' + (e.data.error || 'intenta de nuevo'), '#ef5350', 4000);
      }
      _pendingRegenId = null;
      return;
    }

    // ── Update script response ─────────────────────────────────────
    if (e.data?.type === 'UPDATE_CATALOG_SCRIPT_DONE') {
      if (_pendingUpdateBtn) {
        _pendingUpdateBtn.el.innerHTML = _pendingUpdateBtn.orig;
        _pendingUpdateBtn.el.disabled = false;
        _pendingUpdateBtn = null;
      }
      if (e.data.ok) {
        // Update local item, clear has_audio (needs regen)
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
