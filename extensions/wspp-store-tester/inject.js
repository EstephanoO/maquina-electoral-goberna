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

    // ── 2. webpack cache: chat activo con JID válido ───────────────────────
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

  // Debounce para evitar doble disparo (click en Send + Enter simultáneos)
  let _lastEmit = 0;
  function emitSent(phone) {
    const now = Date.now();
    if (now - _lastEmit < 300) return; // ignorar si ya emitimos hace menos de 300ms
    _lastEmit = now;

    const own  = getOwnNumber();
    const name = getActiveContactName(); // siempre intentar — útil para logs y futuro lookup
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
})();
