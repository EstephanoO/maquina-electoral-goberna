// inject.js — MAIN world.
// Detecta mensajes salientes hookenado el CLICK en el botón Send del DOM.
// NO usa MsgCollection.on('add') porque dispara también para mensajes
// sincronizados desde el celular/otros devices (fromMe:true ≠ "yo lo envié aquí").
(function () {

  // ─── helpers ────────────────────────────────────────────────────────────────

  function req(name) {
    try { return window.require(name); } catch (_) { return null; }
  }

  /**
   * Número propio del celular que está usando WA Web en este browser.
   * Identifica DESDE QUÉ celular físico opera la operadora.
   * Retorna solo dígitos (ej: "51987654321") o null.
   */
  function getOwnNumber() {
    try {
      const PhoneInfoStore = req('WAWebPhoneInfoStore');
      if (PhoneInfoStore) {
        const jid = PhoneInfoStore.phoneInfo?.wid?._serialized
          || PhoneInfoStore.phoneInfo?.wid?.user
          || PhoneInfoStore.wid?._serialized
          || '';
        if (jid) return jid.replace(/@.+$/, '').replace(/\D/g, '') || null;
      }
    } catch (_) {}

    // Fallback: algunos builds exponen el número en el título de la página
    try {
      const match = document.title.match(/\+?(51\d{9})/);
      if (match) return match[1] || null;
    } catch (_) {}

    return null;
  }

  /**
   * Teléfono del contacto en el chat actualmente abierto.
   * Orden de preferencia:
   *   1. WAWebChatStore (WA internal) — más confiable
   *   2. Atributo data-id en el panel de conversación
   *   3. window.location search (links directos wa.me)
   * Retorna solo dígitos (ej: "51936628022") o null.
   */
  function getActivePhone() {
    try {
      const ChatStore = req('WAWebChatStore') || req('WAWebSendMsgChatStore');
      if (ChatStore) {
        const chat = typeof ChatStore.getActiveChat === 'function'
          ? ChatStore.getActiveChat()
          : ChatStore.active;
        const jid = chat?.id?._serialized || chat?.id?.user || '';
        if (jid && !jid.includes('@g.us')) {
          return jid.replace(/@.+$/, '').replace(/\D/g, '') || null;
        }
      }
    } catch (_) {}

    try {
      const panel = document.querySelector('[data-id]');
      if (panel) {
        const raw = panel.getAttribute('data-id') || '';
        if (raw && !raw.includes('@g.us')) {
          return raw.replace(/@.+$/, '').replace(/\D/g, '') || null;
        }
      }
    } catch (_) {}

    try {
      const params = new URLSearchParams(window.location.search);
      const p = params.get('phone');
      if (p) return p.replace(/\D/g, '') || null;
    } catch (_) {}

    return null;
  }

  /**
   * Devuelve true si el elemento (o alguno de sus ancestros) es el botón Send.
   */
  function isSendButton(el) {
    let node = el;
    for (let i = 0; i < 5; i++) {
      if (!node || node.tagName === 'BODY') break;
      const tag    = node.tagName?.toLowerCase();
      const role   = node.getAttribute?.('role');
      const testid = node.getAttribute?.('data-testid');
      const icon   = node.getAttribute?.('data-icon');
      const aria   = node.getAttribute?.('aria-label') || '';

      if (
        testid === 'send' ||
        icon === 'send' ||
        /enviar/i.test(aria) ||
        /^send$/i.test(aria) ||
        ((tag === 'button' || role === 'button') && testid === 'send')
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
      console.warn('[WSPP] Send detectado pero no se pudo obtener el teléfono');
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
      (role === 'textbox' && /escribe|message|type/i.test(ariaLabel));

    if (!isComposer) return;
    const phone = getActivePhone();
    if (!phone) return;
    emitSent(phone);
    console.log('[WSPP] ✓ enviado (Enter) →', phone, '| celular:', getOwnNumber());
  }, true);

  console.log('[WSPP] ✓ listeners DOM activos (click + Enter + own_number)');
})();
