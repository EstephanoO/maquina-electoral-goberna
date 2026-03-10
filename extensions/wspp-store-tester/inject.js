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
      const { ContactCollection } = window.require('WAWebContactCollection');
      if (ContactCollection && ContactCollection._models) {
        const contact = ContactCollection._models.find(c => c.id?._serialized === lidJid);
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
      const { ChatCollection } = window.require('WAWebChatCollection');
      if (ChatCollection && ChatCollection._models) {
        const chat = ChatCollection._models.find(c => c.id?._serialized === lidJid);
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
            let contactName = null;
            try {
              const { ContactCollection } = window.require('WAWebContactCollection');
              if (ContactCollection && ContactCollection._models) {
                const contact = ContactCollection._models.find(c => c.id?._serialized === to);
                if (contact) contactName = contact.pushname || contact.name || contact.formattedName || null;
              }
            } catch (_) {}

            // Emit WSPP_SENT_RICH — higher fidelity than DOM-based WSPP_SENT
            window.postMessage({
              type: 'WSPP_SENT_RICH',
              payload: {
                phone,
                contact_name: contactName || getActiveContactName(),
                own_number: getOwnNumber(),
                to_jid: to,
                timestamp: msg.get('t') || Math.floor(Date.now() / 1000),
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
          let contactName = null;
          try {
            const { ContactCollection } = window.require('WAWebContactCollection');
            if (ContactCollection && ContactCollection._models) {
              const contact = ContactCollection._models.find(c => c.id?._serialized === from);
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
      window.postMessage({
        type: 'WSPP_CLASSIFY',
        payload: {
          validation_id: data.id,
          vote_class: vote === 'invalido' ? '' : vote,
          status: vote === 'invalido' ? 'invalido' : 'respondido',
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
    'WAWebMediaOpaqueData',      // TTS
    'WAWebSendMsgChatAction',    // TTS
    'WAWebWidFactory',           // @lid resolution
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
  // TTS: Botón 🎤 para generar voz con ElevenLabs y enviarla como archivo
  // ═══════════════════════════════════════════════════════════════════════

  // ── Botón flotante ──────────────────────────────────────────────────
  function createTTSButton() {
    const btn = document.createElement('button');
    btn.id = 'wspp-tts-btn';
    btn.innerHTML = '🎤';
    btn.title = 'Generar voz y enviar';
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
    btn.addEventListener('mouseenter', () => { btn.style.background = '#008f72'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = '#00a884'; });
    btn.addEventListener('click', handleTTSClick);
    document.body.appendChild(btn);
    return btn;
  }

  // ── Estado del botón ────────────────────────────────────────────────
  function setTTSState(state) {
    const btn = document.getElementById('wspp-tts-btn');
    if (!btn) return;
    switch (state) {
      case 'idle':
        btn.innerHTML = '🎤';
        btn.style.background = '#00a884';
        btn.style.pointerEvents = 'auto';
        btn.title = 'Generar voz y enviar';
        break;
      case 'loading':
        btn.innerHTML = '⏳';
        btn.style.background = '#1f2c34';
        btn.style.pointerEvents = 'none';
        btn.title = 'Generando audio...';
        break;
      case 'error':
        btn.innerHTML = '❌';
        btn.style.background = '#ef5350';
        btn.style.pointerEvents = 'auto';
        btn.title = 'Error — click para reintentar';
        setTimeout(() => setTTSState('idle'), 3000);
        break;
      case 'success':
        btn.innerHTML = '✅';
        btn.style.background = '#00a884';
        btn.style.pointerEvents = 'auto';
        btn.title = 'Audio enviado';
        setTimeout(() => setTTSState('idle'), 2000);
        break;
    }
  }

  // ── Capturar texto del composer ─────────────────────────────────────
  function getComposerText() {
    // El composer del chat tiene estos selectores posibles
    const selectors = [
      '[data-testid="conversation-compose-box-input"]',
      '#main [contenteditable="true"][role="textbox"]',
      'footer [contenteditable="true"][role="textbox"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = (el.innerText || el.textContent || '').trim();
        if (text) return { text, element: el };
      }
    }
    return { text: null, element: null };
  }

  // ── Limpiar el composer después de capturar ─────────────────────────
  function clearComposer(el) {
    if (!el) return;
    el.innerHTML = '';
    el.textContent = '';
    // Disparar input event para que WA actualice su estado interno
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }

  // ── Convertir base64 a Blob ──────────────────────────────────────────
  function base64ToBlob(base64, mimeType) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType });
  }

  // ── Calcular SHA256 hash en base64 (para filehash) ───────────────────
  async function sha256Base64(blob) {
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const bytes = new Uint8Array(hashBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  // ── Enviar audio como PTT (nota de voz) via módulos internos de WA ──
  async function sendAsPTT(base64, mimeType) {
    try {
      // 1. Obtener chat activo
      const { ChatCollection } = window.require('WAWebChatCollection');
      const chat = ChatCollection._models.find(c => c.active);
      if (!chat) {
        console.error('[WSPP TTS] No hay chat activo');
        return false;
      }
      console.log('[WSPP TTS] Chat activo:', chat.id?._serialized);

      // 2. Crear blob y OpaqueData
      const OpaqueData = window.require('WAWebMediaOpaqueData');
      const blob = base64ToBlob(base64, mimeType);
      const opaqueData = await OpaqueData.createFromData(blob, mimeType);
      const filehash = await sha256Base64(blob);
      console.log('[WSPP TTS] OpaqueData creado, size:', blob.size, 'hash:', filehash.slice(0, 20) + '...');

      // 3. Usar addAndSendMsgToChat con un objeto mensaje completo
      //    Basado en la estructura real de un PTT enviado por WA
      const { addAndSendMsgToChat } = window.require('WAWebSendMsgChatAction');

      const msgAttrs = {
        type: 'ptt',
        mimetype: 'audio/ogg; codecs=opus',
        duration: Math.ceil(blob.size / 3000),  // estimado ~3KB/sec para OGG
        size: blob.size,
        filehash,
        body: undefined,
        caption: undefined,
        isGif: false,
        isForwarded: false,
        isViewOnce: false,
      };

      console.log('[WSPP TTS] Enviando con addAndSendMsgToChat, attrs:', JSON.stringify(msgAttrs));

      const result = await addAndSendMsgToChat(chat, msgAttrs, {
        mediaData: {
          type: 'ptt',
          mediaStage: 'PENDING',
          size: blob.size,
          filehash,
          mimetype: 'audio/ogg; codecs=opus',
          mediaBlob: opaqueData,
          duration: msgAttrs.duration,
          isViewOnce: false,
          isGif: false,
          swStreamingSupported: false,
          animationDuration: 0,
          animatedAsNewMsg: false,
        },
      });

      console.log('[WSPP TTS] ✓ addAndSendMsgToChat resultado:', result);
      return true;
    } catch (err) {
      console.error('[WSPP TTS] Error enviando PTT:', err);
      return false;
    }
  }

  // ── Click handler principal ─────────────────────────────────────────
  function handleTTSClick() {
    const { text, element } = getComposerText();

    if (!text) {
      // Feedback visual: shake del botón
      const btn = document.getElementById('wspp-tts-btn');
      if (btn) {
        btn.style.transform = 'translateX(-5px)';
        setTimeout(() => { btn.style.transform = 'translateX(5px)'; }, 100);
        setTimeout(() => { btn.style.transform = ''; }, 200);
      }
      console.log('[WSPP TTS] No hay texto en el composer');
      return;
    }

    console.log('[WSPP TTS] Texto capturado:', text.slice(0, 80));
    setTTSState('loading');

    // Limpiar el composer para que el usuario sepa que se capturó
    clearComposer(element);

    // H-3: Pedir audio al background via content.js bridge — use specific origin
    window.postMessage({ type: 'GENERATE_VOICE', text }, WA_ORIGIN);
  }

  // ── Recibir audio generado ──────────────────────────────────────────
  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.data?.type !== 'VOICE_READY') return;

    if (!e.data.ok) {
      console.error('[WSPP TTS] Error del backend:', e.data.error);
      setTTSState('error');
      return;
    }

    console.log('[WSPP TTS] Audio recibido, enviando como PTT...');

    const ok = await sendAsPTT(e.data.audioBase64, e.data.mimeType);

    if (ok) {
      setTTSState('success');
    } else {
      setTTSState('error');
    }
  });

  // ── Insertar botón cuando el chat esté listo ────────────────────────
  // L-11: Added max retries to prevent infinite polling
  const MAX_TTS_BUTTON_RETRIES = 30; // ~60s max wait
  let _ttsButtonRetries = 0;

  function waitForChatAndInsertButton() {
    if (document.getElementById('wspp-tts-btn')) return;
    if (document.querySelector('#main') || document.querySelector('.two')) {
      createTTSButton();
      console.log('[WSPP TTS] ✓ Botón 🎤 insertado');
      return;
    }
    _ttsButtonRetries++;
    if (_ttsButtonRetries < MAX_TTS_BUTTON_RETRIES) {
      setTimeout(waitForChatAndInsertButton, 2000);
    } else {
      console.warn('[WSPP TTS] ⚠️ Chat container not found after', MAX_TTS_BUTTON_RETRIES, 'retries — giving up');
    }
  }

  // Esperar a que WA Web cargue completamente
  if (document.readyState === 'complete') {
    setTimeout(waitForChatAndInsertButton, 3000);
  } else {
    window.addEventListener('load', () => setTimeout(waitForChatAndInsertButton, 3000));
  }

})();
