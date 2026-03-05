// inject.js — MAIN world.
// Detecta mensajes salientes hookenado el CLICK en el botón Send del DOM.
// NO usa MsgCollection.on('add') porque dispara también para mensajes
// sincronizados desde el celular/otros devices (fromMe:true ≠ "yo lo envié aquí").
(function () {

  // ─── helpers ────────────────────────────────────────────────────────────────

  function req(name) {
    try { return window.require(name); } catch (_) { return null; }
  }

  /** Extrae número de un JID de WA ("5198765432@c.us" → "5198765432"). */
  function jidToNumber(jid) {
    if (!jid || typeof jid !== 'string') return null;
    if (jid.includes('@g.us') || jid.includes('@broadcast')) return null; // grupos
    const num = jid.replace(/@.+$/, '').replace(/\D/g, '');
    // Números válidos: 10–13 dígitos (PE: 51 + 9 dígitos = 11)
    return (num.length >= 10 && num.length <= 13) ? num : null;
  }

  /**
   * Número propio del celular que está usando WA Web en este browser.
   * Identifica DESDE QUÉ celular físico opera la operadora.
   * Retorna solo dígitos (ej: "51987654321") o null.
   *
   * WA Web cambia sus módulos internos frecuentemente.
   * Se prueban múltiples estrategias en orden de confiabilidad.
   */
  function getOwnNumber() {
    // ── 1. WAWebPhoneInfoStore (build antiguo) ─────────────────────────────
    try {
      const s = req('WAWebPhoneInfoStore');
      if (s) {
        const jid = s.phoneInfo?.wid?._serialized
          || s.phoneInfo?.wid?.user
          || s.wid?._serialized
          || s.wid?.user
          || '';
        const n = jidToNumber(jid);
        if (n) return n;
      }
    } catch (_) {}

    // ── 2. WAWebConnModel — expone conn.me en builds recientes ─────────────
    try {
      const s = req('WAWebConnModel');
      const me = s?.default?.me || s?.me;
      const n = jidToNumber(me?._serialized || me?.user || '');
      if (n) return n;
    } catch (_) {}

    // ── 3. WAWebAuthModel ──────────────────────────────────────────────────
    try {
      const s = req('WAWebAuthModel');
      const me = s?.default?.me || s?.me;
      const n = jidToNumber(me?._serialized || me?.user || '');
      if (n) return n;
    } catch (_) {}

    // ── 4. WAWebContactsMeStore ────────────────────────────────────────────
    try {
      const s = req('WAWebContactsMeStore');
      const me = s?.me || s?.getMaybeMeUser?.();
      const n = jidToNumber(me?._serialized || me?.user || '');
      if (n) return n;
    } catch (_) {}

    // ── 5. WAWebUserPrefsGeneral ───────────────────────────────────────────
    try {
      const s = req('WAWebUserPrefsGeneral');
      const prefs = s?.default || s;
      if (prefs) {
        // buscar cualquier clave que parezca un JID propio
        for (const key of ['me', 'meUser', 'myNumber', 'phone', 'wid']) {
          const val = prefs[key];
          const n = jidToNumber(
            typeof val === 'string' ? val : (val?._serialized || val?.user || '')
          );
          if (n) return n;
        }
      }
    } catch (_) {}

    // ── 6. DOM: avatar del header de WA Web tiene data-jid del usuario ─────
    try {
      // El botón de perfil en el header superior izquierdo
      const avatar = document.querySelector('header [data-jid], header [data-testid="avatar-contact"]');
      if (avatar) {
        const n = jidToNumber(avatar.getAttribute('data-jid') || '');
        if (n) return n;
      }
    } catch (_) {}

    // ── 7. URL del perfil propio (al hacer click en el avatar aparece ?phone=) ──
    try {
      const params = new URLSearchParams(window.location.search);
      const p = params.get('phone') || params.get('number');
      if (p) {
        const num = p.replace(/\D/g, '');
        if (num.length >= 10 && num.length <= 13) return num;
      }
    } catch (_) {}

    // ── 8. Título de la página (algunos builds lo incluyen) ────────────────
    try {
      // Formato: "+51 987 654 321" o "51987654321"
      const match = document.title.match(/\+?(51\d{9})/);
      if (match) return match[1];
    } catch (_) {}

    return null;
  }

  /**
   * Diagnóstico al inicio: imprime en consola qué módulos de WA Web están
   * disponibles y qué número propio encuentra cada uno.
   * Solo corre la primera vez que se carga la extensión.
   */
  function runDiagnostics() {
    const modules = [
      'WAWebPhoneInfoStore',
      'WAWebConnModel',
      'WAWebAuthModel',
      'WAWebContactsMeStore',
      'WAWebUserPrefsGeneral',
      'WAWebChatStore',
      'WAWebSendMsgChatStore',
    ];
    console.group('[WSPP] Diagnóstico de módulos WA Web');
    for (const name of modules) {
      try {
        const m = window.require(name);
        if (m) {
          // Intentar extraer el propio número de cada uno
          const candidates = [
            m?.phoneInfo?.wid?._serialized,
            m?.default?.me?._serialized,
            m?.default?.me?.user,
            m?.me?._serialized,
            m?.me?.user,
            m?.wid?._serialized,
          ].filter(Boolean);
          console.log(`  ✓ ${name}:`, candidates.length ? candidates : '(cargado pero sin wid visible)');
        } else {
          console.log(`  ✗ ${name}: null`);
        }
      } catch (e) {
        console.log(`  ✗ ${name}: error —`, e.message);
      }
    }
    const own = getOwnNumber();
    console.log('[WSPP] own_number resuelto:', own ?? 'NULL — ningún módulo funcionó');
    console.groupEnd();
  }

  /**
   * Teléfono del contacto en el chat actualmente abierto.
   * Orden de preferencia:
   *   1. WAWebChatStore (WA internal) — más confiable
   *   2. Atributo data-id en el panel de conversación
   *   3. window.location search (links directos wa.me)
   * Retorna solo dígitos (ej: "51936628022") o null.
   * Filtra grupos y IDs internos (solo 10–13 dígitos).
   */
  function getActivePhone() {
    try {
      const ChatStore = req('WAWebChatStore') || req('WAWebSendMsgChatStore');
      if (ChatStore) {
        const chat = typeof ChatStore.getActiveChat === 'function'
          ? ChatStore.getActiveChat()
          : ChatStore.active;
        const jid = chat?.id?._serialized || chat?.id?.user || '';
        const n = jidToNumber(jid);
        if (n) return n;
      }
    } catch (_) {}

    try {
      const panel = document.querySelector('[data-id]');
      if (panel) {
        const n = jidToNumber(panel.getAttribute('data-id') || '');
        if (n) return n;
      }
    } catch (_) {}

    try {
      const params = new URLSearchParams(window.location.search);
      const p = params.get('phone');
      if (p) {
        const num = p.replace(/\D/g, '');
        if (num.length >= 10 && num.length <= 13) return num;
      }
    } catch (_) {}

    return null;
  }

  /**
   * Devuelve true si el elemento (o alguno de sus ancestros hasta 8 niveles)
   * es el botón Send de WA Web.
   *
   * WA Web cambia el markup frecuentemente. Estrategias en orden:
   *   1. data-testid="send" o data-icon="send" (versiones anteriores)
   *   2. aria-label exactamente "Enviar" o "Send" en button/role=button
   *   3. Botón con aria-label que contenga "enviar" o "send"
   */
  function isSendButton(el) {
    let node = el;
    for (let i = 0; i < 8; i++) {
      if (!node || node.tagName === 'BODY') break;
      const tag    = (node.tagName || '').toLowerCase();
      const role   = node.getAttribute?.('role') || '';
      const testid = node.getAttribute?.('data-testid') || '';
      const icon   = node.getAttribute?.('data-icon') || '';
      const aria   = node.getAttribute?.('aria-label') || '';
      const isBtn  = tag === 'button' || role === 'button';

      if (
        testid === 'send' ||
        icon === 'send' ||
        (isBtn && /^enviar$/i.test(aria.trim())) ||
        (isBtn && /^send$/i.test(aria.trim())) ||
        (isBtn && /\benviar\b/i.test(aria)) ||
        (isBtn && /\bsend\b/i.test(aria))
      ) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  function emitSent(phone) {
    window.postMessage({
      type: 'WSPP_SENT',
      payload: {
        phone,
        own_number: getOwnNumber(),   // ← celular físico activo
        timestamp: Math.floor(Date.now() / 1000),
      },
    }, '*');
  }

  // ─── listeners ───────────────────────────────────────────────────────────────

  document.addEventListener('click', (e) => {
    if (!isSendButton(e.target)) return;
    const phone = getActivePhone();
    if (!phone) {
      console.warn('[WSPP] Send detectado pero no se pudo obtener el teléfono del contacto');
      return;
    }
    emitSent(phone);
    console.log('[WSPP] ✓ enviado →', phone, '| celular:', getOwnNumber());
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey) return;
    const active = document.activeElement;
    if (!active) return;
    const role      = active.getAttribute('role');
    const testid    = active.getAttribute('data-testid');
    const ariaLabel = active.getAttribute('aria-label') || '';

    const isComposer =
      testid === 'conversation-compose-box-input' ||
      (role === 'textbox' && /escribe|message|type|escribir/i.test(ariaLabel)) ||
      (active.tagName?.toLowerCase() === 'p' && active.closest('[contenteditable="true"]') !== null) ||
      (active.getAttribute('contenteditable') === 'true');

    if (!isComposer) return;
    const phone = getActivePhone();
    if (!phone) return;
    emitSent(phone);
    console.log('[WSPP] ✓ enviado (Enter) →', phone, '| celular:', getOwnNumber());
  }, true);

  // Correr diagnóstico después de que WA Web termine de cargar sus módulos
  if (document.readyState === 'complete') {
    runDiagnostics();
  } else {
    window.addEventListener('load', runDiagnostics, { once: true });
  }

  console.log('[WSPP] ✓ listeners DOM activos (click + Enter + own_number)');
})();
