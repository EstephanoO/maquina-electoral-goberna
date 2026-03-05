// inject.js — MAIN world, document_start.
// Detecta mensajes salientes hookenando el CLICK en el botón Send del DOM.
// NO usa MsgCollection.on('add') porque dispara también para mensajes
// sincronizados desde el celular/otros devices (fromMe:true ≠ "yo lo envié aquí").
(function () {

  // ─── webpack require hook ────────────────────────────────────────────────────
  // WA Web usa webpackChunkwhatsapp_web_client para cargar módulos.
  // Corriendo en document_start podemos hookear el push del array antes de que
  // WA Web lo use, y así capturar el __webpack_require__ interno del runtime.
  // Con ese handle podemos buscar el módulo que contiene el número propio (JID).

  let __wr = null; // __webpack_require__ interno de WA Web

  (function installWebpackHook() {
    const CHUNK_KEY = 'webpackChunkwhatsapp_web_client';

    function hookChunkArray(arr) {
      const origPush = arr.push.bind(arr);
      arr.push = function (...args) {
        const result = origPush(...args);
        for (const entry of args) {
          // Cada entry es [chunkIds, moduleMap, runtimeFn?]
          // El runtime chunk tiene una función en el índice 2 que recibe __webpack_require__
          if (Array.isArray(entry) && typeof entry[2] === 'function') {
            // Interceptamos la llamada original: entry[2] ya fue llamada por webpack
            // con __wr como argumento. Pero podemos extraerlo del cache.
            // El moduleMap (entry[1]) nos da acceso a los módulos; el runtime
            // también expone __webpack_require__ en el propio chunk array.
            // Estrategia: buscar en el array la propiedad que webpack le agrega.
            if (!__wr) {
              // webpack agrega una propiedad al chunk array que ES __webpack_require__
              for (const key of Object.keys(arr)) {
                const val = arr[key];
                if (typeof val === 'function' && val.m && val.c && val.n) {
                  __wr = val;
                  break;
                }
              }
            }
          }
        }
        return result;
      };
    }

    // Si el array ya existe (raro en document_start pero posible), hookearlo
    if (window[CHUNK_KEY]) {
      hookChunkArray(window[CHUNK_KEY]);
    } else {
      // Definir el array con un getter/setter para interceptar cuando WA Web lo cree
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

  /**
   * Busca en el cache de módulos de webpack el JID del usuario propio.
   * Itera wr.c (cache de módulos instanciados) buscando un objeto que tenga
   * un campo con formato "51XXXXXXXXX@c.us".
   */
  function findOwnJidInCache() {
    if (!__wr || !__wr.c) return null;
    const jidRe = /^(\d{10,13})@c\.us$/;
    for (const mod of Object.values(__wr.c)) {
      try {
        const exp = mod?.exports;
        if (!exp) continue;
        // Revisar exports directo y exports.default
        for (const target of [exp, exp?.default]) {
          if (!target || typeof target !== 'object') continue;
          for (const val of Object.values(target)) {
            if (typeof val === 'string' && jidRe.test(val)) return val;
            // Un nivel más: val puede ser un objeto {_serialized, user, ...}
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

  // Cache del own_number para no escanear el cache en cada envío
  let _cachedOwnNumber = null;
  let _cacheAttempts = 0;

  /**
   * Número propio del celular que está usando WA Web en este browser.
   * Retorna solo dígitos (ej: "51987654321") o null.
   */
  function getOwnNumber() {
    // Si ya lo resolvimos, devolver directo
    if (_cachedOwnNumber) return _cachedOwnNumber;

    // No intentar más de 20 veces si siempre falla (evitar trabajo inútil)
    if (_cacheAttempts > 20) return null;
    _cacheAttempts++;

    // ── 1. webpack cache scan (principal) ─────────────────────────────────
    const jid = findOwnJidInCache();
    if (jid) {
      const n = jidToNumber(jid);
      if (n) { _cachedOwnNumber = n; return n; }
    }

    // ── 2. DOM: buscar spans con número peruano visible ────────────────────
    // Solo funciona si el usuario abrió su perfil, pero vale intentarlo
    try {
      const spans = document.querySelectorAll('span');
      for (const s of spans) {
        const t = s.childElementCount === 0 ? s.textContent?.trim() : '';
        if (t && /^\+?51\d{9}$/.test(t)) {
          const n = t.replace(/\D/g, '');
          _cachedOwnNumber = n;
          return n;
        }
      }
    } catch (_) {}

    // ── 3. data-jid en el DOM ──────────────────────────────────────────────
    try {
      const els = document.querySelectorAll('[data-jid]');
      for (const el of els) {
        const n = jidToNumber(el.getAttribute('data-jid') || '');
        if (n) { _cachedOwnNumber = n; return n; }
      }
    } catch (_) {}

    // ── 4. URL params ──────────────────────────────────────────────────────
    try {
      const p = new URLSearchParams(window.location.search).get('phone');
      if (p) {
        const n = p.replace(/\D/g, '');
        if (n.length >= 10 && n.length <= 13) { _cachedOwnNumber = n; return n; }
      }
    } catch (_) {}

    return null;
  }

  /**
   * Teléfono del contacto en el chat actualmente abierto.
   * Retorna solo dígitos (ej: "51936628022") o null.
   * Filtra grupos y IDs internos (solo 10–13 dígitos).
   */
  function getActivePhone() {
    // ── 1. webpack cache: buscar el chat activo ────────────────────────────
    if (__wr && __wr.c) {
      try {
        const jidRe = /^(\d{10,13})@c\.us$/;
        for (const mod of Object.values(__wr.c)) {
          try {
            const exp = mod?.exports;
            if (!exp) continue;
            for (const target of [exp, exp?.default]) {
              if (!target || typeof target !== 'object') continue;
              // Buscar patrón de chat activo: objeto con id._serialized y isActive/active
              if ((target.active || target.isActive) && target.id?._serialized) {
                const n = jidToNumber(target.id._serialized);
                if (n) return n;
              }
              // getActiveChat function
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
    console.log('[WSPP] ✓ enviado →', phone, '| celular:', own ?? 'NULL (__wr=' + !!__wr + ')');
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
  }, true);

  console.log('[WSPP] ✓ webpack hook instalado, listeners activos');
})();
