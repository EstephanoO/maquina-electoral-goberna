// inject.js — MAIN world, document_start.
// Detecta mensajes salientes hookenando el CLICK en el botón Send del DOM.
// own_number viene de content.js (storage-backed) — no depende del webpack hook.
(function () {

  // ─── own_number desde storage (via content.js) ───────────────────────────────
  // content.js envía WSPP_SET_OWN_NUMBER al arrancar y cuando el usuario lo cambia.
  let _ownNumber = null;

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.type !== 'WSPP_SET_OWN_NUMBER') return;
    _ownNumber = e.data.number || null;
    console.log('[WSPP] own_number actualizado:', _ownNumber ?? 'NULL');
  });

  // ─── webpack require hook (bonus) ────────────────────────────────────────────
  // Si el webpack hook logra capturar el JID propio, lo usa como fallback
  // adicional. No es crítico — storage es la fuente de verdad.
  let __wr = null;

  (function installWebpackHook() {
    const CHUNK_KEY = 'webpackChunkwhatsapp_web_client';

    function hookChunkArray(arr) {
      const origPush = arr.push.bind(arr);
      arr.push = function (...args) {
        const result = origPush(...args);
        if (!__wr) {
          for (const key of Object.keys(arr)) {
            const val = arr[key];
            if (typeof val === 'function' && val.m && val.c && val.n) {
              __wr = val;
              break;
            }
          }
        }
        return result;
      };
    }

    if (window[CHUNK_KEY]) {
      hookChunkArray(window[CHUNK_KEY]);
    } else {
      let _arr;
      Object.defineProperty(window, CHUNK_KEY, {
        configurable: true,
        get() { return _arr; },
        set(val) {
          _arr = val;
          if (Array.isArray(_arr)) hookChunkArray(_arr);
        },
      });
    }
  })();

  // ─── helpers ────────────────────────────────────────────────────────────────

  /** Extrae número de un JID de WA ("5198765432@c.us" → "5198765432"). Filtra grupos. */
  function jidToNumber(jid) {
    if (!jid || typeof jid !== 'string') return null;
    if (jid.includes('@g.us') || jid.includes('@broadcast') || jid.includes('@newsletter')) return null;
    const num = jid.replace(/@.+$/, '').replace(/\D/g, '');
    return (num.length >= 10 && num.length <= 13) ? num : null;
  }

  /** Intenta obtener el JID propio desde el cache de webpack (bonus, no crítico). */
  function findOwnJidInCache() {
    if (!__wr || !__wr.c) return null;
    const jidRe = /^(\d{10,13})@c\.us$/;
    for (const mod of Object.values(__wr.c)) {
      try {
        const exp = mod?.exports;
        if (!exp) continue;
        for (const target of [exp, exp?.default]) {
          if (!target || typeof target !== 'object') continue;
          for (const val of Object.values(target)) {
            if (typeof val === 'string' && jidRe.test(val)) return val;
            if (val && typeof val === 'object') {
              const s = val._serialized || val.user || '';
              if (jidRe.test(s)) return s;
            }
          }
        }
      } catch (_) {}
    }
    return null;
  }

  /**
   * Número propio del celular.
   * Fuente de verdad: storage (via content.js → WSPP_SET_OWN_NUMBER).
   * Fallback: webpack cache scan.
   */
  function getOwnNumber() {
    if (_ownNumber) return _ownNumber;

    // Fallback: webpack cache
    const jid = findOwnJidInCache();
    if (jid) {
      const n = jidToNumber(jid);
      if (n) return n;
    }

    return null;
  }

  /**
   * Teléfono del contacto en el chat actualmente abierto.
   * Filtra grupos y IDs internos (solo 10–13 dígitos).
   */
  function getActivePhone() {
    // ── 1. webpack cache: buscar el chat activo ────────────────────────────
    if (__wr && __wr.c) {
      try {
        for (const mod of Object.values(__wr.c)) {
          try {
            const exp = mod?.exports;
            if (!exp) continue;
            for (const target of [exp, exp?.default]) {
              if (!target || typeof target !== 'object') continue;
              if ((target.active || target.isActive) && target.id?._serialized) {
                const n = jidToNumber(target.id._serialized);
                if (n) return n;
              }
              if (typeof target.getActiveChat === 'function') {
                const chat = target.getActiveChat();
                const n = jidToNumber(chat?.id?._serialized || chat?.id?.user || '');
                if (n) return n;
              }
            }
          } catch (_) {}
        }
      } catch (_) {}
    }

    // ── 2. data-id en el panel de conversación ─────────────────────────────
    try {
      const panel = document.querySelector('[data-id]');
      if (panel) {
        const n = jidToNumber(panel.getAttribute('data-id') || '');
        if (n) return n;
      }
    } catch (_) {}

    // ── 3. URL params ──────────────────────────────────────────────────────
    try {
      const p = new URLSearchParams(window.location.search).get('phone');
      if (p) {
        const n = p.replace(/\D/g, '');
        if (n.length >= 10 && n.length <= 13) return n;
      }
    } catch (_) {}

    return null;
  }

  /**
   * Devuelve true si el elemento (o alguno de sus ancestros hasta 8 niveles)
   * es el botón Send de WA Web.
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
    const own = getOwnNumber();
    window.postMessage({
      type: 'WSPP_SENT',
      payload: {
        phone,
        own_number: own,
        timestamp: Math.floor(Date.now() / 1000),
      },
    }, '*');
    console.log('[WSPP] ✓ enviado →', phone, '| celular:', own ?? 'NULL — configurá tu número en el popup');
  }

  // ─── listeners ───────────────────────────────────────────────────────────────

  document.addEventListener('click', (e) => {
    // DEBUG: loguear todo click para ver qué atributos tiene el botón Send
    const t = e.target;
    const tag    = (t.tagName || '').toLowerCase();
    const role   = t.getAttribute?.('role') || '';
    const testid = t.getAttribute?.('data-testid') || '';
    const icon   = t.getAttribute?.('data-icon') || '';
    const aria   = t.getAttribute?.('aria-label') || '';
    // Solo loguear si parece un botón o SVG (para no spamear con clicks en texto)
    if (tag === 'button' || tag === 'span' || tag === 'svg' || tag === 'div' || role === 'button') {
      console.log('[WSPP:click]', tag, { role, testid, icon, aria: aria.slice(0, 40) });
    }

    if (!isSendButton(e.target)) return;

    console.log('[WSPP] ✓ isSendButton detectado');
    const phone = getActivePhone();
    console.log('[WSPP] activePhone:', phone);
    if (!phone) {
      console.warn('[WSPP] Send detectado pero no se pudo obtener el teléfono del contacto');
      return;
    }
    emitSent(phone);
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey) return;
    const active = document.activeElement;
    if (!active) return;
    const role      = active.getAttribute('role');
    const testid    = active.getAttribute('data-testid');
    const ariaLabel = active.getAttribute('aria-label') || '';

    console.log('[WSPP:enter]', active.tagName?.toLowerCase(), { role, testid, ariaLabel: ariaLabel.slice(0, 40), contenteditable: active.getAttribute('contenteditable') });

    const isComposer =
      testid === 'conversation-compose-box-input' ||
      (role === 'textbox' && /escribe|message|type|escribir/i.test(ariaLabel)) ||
      (active.tagName?.toLowerCase() === 'p' && active.closest('[contenteditable="true"]') !== null) ||
      (active.getAttribute('contenteditable') === 'true');

    if (!isComposer) {
      console.log('[WSPP:enter] no es composer, ignorado');
      return;
    }
    console.log('[WSPP:enter] ✓ composer detectado');
    const phone = getActivePhone();
    console.log('[WSPP:enter] activePhone:', phone);
    if (!phone) return;
    emitSent(phone);
  }, true);

  console.log('[WSPP] ✓ listeners activos — own_number viene del popup');
})();
