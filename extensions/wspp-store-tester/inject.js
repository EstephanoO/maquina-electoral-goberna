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

  /** Extrae número de un JID de WA ("5198765432@c.us" → "5198765432"). Filtra grupos y @lid. */
  function jidToNumber(jid) {
    if (!jid || typeof jid !== 'string') return null;
    if (jid.includes('@g.us') || jid.includes('@broadcast') || jid.includes('@newsletter')) return null;
    if (jid.includes('@lid')) return null; // nuevo formato WA — no es un número de teléfono
    const num = jid.replace(/@.+$/, '').replace(/\D/g, '');
    return (num.length >= 10 && num.length <= 13) ? num : null;
  }

  /**
   * Extrae el nombre del contacto del aria-label del composer.
   * "Escribe a Estephano." → "Estephano"
   * Usado como identificador de texto cuando no hay teléfono disponible.
   */
  function getActiveContactName() {
    try {
      const composer = document.querySelector('[contenteditable="true"][data-tab]') ||
                       document.querySelector('[role="textbox"][contenteditable="true"]');
      if (!composer) return null;
      const aria = composer.getAttribute('aria-label') || '';
      // "Escribe a Nombre." o "Type a message" o "Escribe un mensaje"
      const m = aria.match(/^(?:Escribe a|Escribe un mensaje|Type a message to)\s+(.+?)\.?$/i);
      return m ? m[1].trim() : null;
    } catch (_) { return null; }
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
   * Estrategia:
   * 1. Header del chat (.two header): buscar span[title] con número de teléfono
   * 2. Lista de chats: buscar el span[title=número] adyacente al span[title=nombre]
   *    donde nombre coincide con el aria-label del composer ("Escribe a Nombre.")
   * 3. Webpack cache (si __wr disponible)
   */
  function getActivePhone() {
    // ── 1. span[title] con número en el header del chat abierto ───────────
    try {
      const main = document.querySelector('.two, #main, [data-testid="conversation-panel-wrapper"]');
      if (main) {
        const hdr = main.querySelector('header');
        if (hdr) {
          const spans = hdr.querySelectorAll('span[title]');
          for (const s of spans) {
            const n = normalizePhone(s.getAttribute('title'));
            if (n) return n;
          }
        }
        // También buscar en todo el panel principal (no solo header)
        // pero solo spans con la clase de título (no preview de mensajes)
        // Clase identificada: x1iyjqo2 (nombre/número), x78zum5 (preview — ignorar)
        const spans = main.querySelectorAll('span[title]');
        for (const s of spans) {
          if (s.classList.contains('x78zum5')) continue; // preview de mensaje
          const n = normalizePhone(s.getAttribute('title'));
          if (n) return n;
        }
      }
    } catch (_) {}

    // ── 2. Cruzar nombre del composer con span[title] en la lista ─────────
    try {
      const contactName = getActiveContactName();
      if (contactName) {
        // Buscar el span con title=nombre, luego el span[title=número] adyacente
        const allSpans = Array.from(document.querySelectorAll('span[title]'));
        for (let i = 0; i < allSpans.length; i++) {
          const t = allSpans[i].getAttribute('title') || '';
          if (t.trim().toLowerCase() === contactName.trim().toLowerCase()) {
            // Buscar en los siblings cercanos un span con número
            for (let j = i - 2; j <= i + 2; j++) {
              if (j < 0 || j >= allSpans.length || j === i) continue;
              const n = normalizePhone(allSpans[j].getAttribute('title'));
              if (n) return n;
            }
          }
        }
      }
    } catch (_) {}

    // ── 3. webpack cache: buscar el chat activo ────────────────────────────
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
        icon === 'wds-ic-send-filled' ||   // WA Web nueva versión
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
    const own  = getOwnNumber();
    const name = phone ? null : getActiveContactName();
    window.postMessage({
      type: 'WSPP_SENT',
      payload: {
        phone,           // null si no se pudo resolver — el backend lo ignorará
        contact_name: name,
        own_number: own,
        timestamp: Math.floor(Date.now() / 1000),
      },
    }, '*');
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

    const isComposer =
      testid === 'conversation-compose-box-input' ||
      (role === 'textbox' && /escribe|message|type|escribir/i.test(ariaLabel)) ||
      (active.tagName?.toLowerCase() === 'p' && active.closest('[contenteditable="true"]') !== null) ||
      (active.getAttribute('contenteditable') === 'true');

    if (!isComposer) return;
    const phone = getActivePhone();
    console.log('[WSPP] ✓ Send Enter | phone:', phone ?? '(sin teléfono)');
    emitSent(phone);
  }, true);

  console.log('[WSPP] ✓ listeners activos — own_number viene del popup');
})();
