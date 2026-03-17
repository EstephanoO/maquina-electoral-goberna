// chat-opener.js — Abre un chat con un número nuevo usando el flujo DOM de WA Web.
//
// Secuencia exacta que imita un humano:
//   1. Click botón "Nuevo chat" (lupa o ícono de nuevo chat)
//   2. Esperar que aparezca el input de búsqueda
//   3. Escribir el número con country code
//   4. Esperar que aparezca el resultado en la lista
//   5. Click en el resultado (número con WA) o detectar "no encontrado"
//   6. Chat se abre — retornar success
//
// Después del open, el caller puede esperar 30s y escribir.
//
// Este módulo NO usa window.require — es 100% DOM.
// Los selectores se actualizan con cada deploy de WA Web.

import { WA_ORIGIN } from './bootstrap.js';

// ── Selectores de WA Web ──────────────────────────────────────────────
// WA Web usa data-testid y aria-label. Los selectores son redundantes
// para sobrevivir a cambios parciales de WA.
const SEL = {
  // Botón "Nuevo chat" — el ícono de conversación en el sidebar de WA
  newChatBtn: [
    '[data-testid="chat-list-search"]',              // search icon in header
    '[data-testid="new-chat-btn"]',                  // some builds
    'button[aria-label="Nuevo chat"]',
    'button[aria-label="New chat"]',
    'span[data-testid="menu-bar-new-chat"]',
    'header button:nth-child(3)',                     // fallback position-based
  ],

  // Input de búsqueda que aparece al tocar "Nuevo chat"
  searchInput: [
    '[data-testid="chat-list-search-input"]',
    '[data-testid="search-input"]',
    'div[role="textbox"][data-tab="3"]',
    'div[contenteditable="true"][data-tab="3"]',
    'input[title="Buscar o iniciar un nuevo chat"]',
    'input[title="Search or start a new chat"]',
  ],

  // Resultado de búsqueda: la fila del contacto que aparece al buscar
  searchResult: [
    // WA muestra el número formateado en un span dentro del resultado
    '[data-testid="cell-frame-container"]',
    '[data-testid="search-result"]',
    'div[role="listitem"]',
    'span[data-testid="search-result-contact"]',
  ],

  // Composer: el input del chat donde se escribe el mensaje
  composer: [
    '[data-testid="conversation-compose-box-input"]',
    'div[role="textbox"][contenteditable="true"][data-tab="10"]',
    'div[role="textbox"][contenteditable="true"]:not([data-tab="3"])',
    'footer div[contenteditable="true"]',
  ],

  // Botón enviar del composer
  sendBtn: [
    '[data-testid="send"]',
    'button[aria-label="Enviar"]',
    'button[aria-label="Send"]',
    'span[data-testid="send"]',
  ],
};

// ── Helpers DOM ────────────────────────────────────────────────────────
function _find(selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function _waitFor(selectors, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const el = _find(selectors);
      if (el) return resolve(el);
      if (Date.now() - start > timeoutMs) return resolve(null);
      requestAnimationFrame(check);
    };
    check();
  });
}

// Simula typing humano: focus → clear → type char by char con delay variable
async function _typeInElement(el, text) {
  el.focus();
  // Clear existing content
  if (el.tagName === 'INPUT') {
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    // contenteditable div
    el.textContent = '';
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: '' }));
  }
  await _sleep(100);

  // Type char by char (2-5 chars at a time for speed, but still looks human)
  let i = 0;
  while (i < text.length) {
    const chunk = text.slice(i, i + 3 + Math.floor(Math.random() * 3));
    if (el.tagName === 'INPUT') {
      el.value += chunk;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      document.execCommand('insertText', false, chunk);
    }
    i += chunk.length;
    await _sleep(40 + Math.random() * 80);
  }
}

// ══════════════════════════════════════════════════════════════════════
// openChatDOM — flujo DOM completo para abrir un chat con un número nuevo
//
// Returns: { ok, error?, chatReady? }
//   ok=true: el chat está abierto y el composer está visible
//   ok=false: falló en algún paso
// ══════════════════════════════════════════════════════════════════════
export async function openChatDOM(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (!digits || digits.length < 9) {
    return { ok: false, error: 'Número inválido: ' + phone };
  }
  const normalized = digits.length === 9 ? '51' + digits : digits;
  const L = (step, ...args) => console.log(`[CHAT-OPENER] ${step}`, ...args);

  try {
    // ── Step 1: Click "Nuevo chat" ──────────────────────────────────
    L('1', 'buscando botón nuevo chat...');
    const newChatBtn = _find(SEL.newChatBtn);
    if (!newChatBtn) {
      return { ok: false, error: 'Botón "Nuevo chat" no encontrado' };
    }
    newChatBtn.click();
    L('1 ✓', 'botón clickeado');

    // ── Step 2: Esperar search input ────────────────────────────────
    L('2', 'esperando search input...');
    const searchInput = await _waitFor(SEL.searchInput, 5000);
    if (!searchInput) {
      return { ok: false, error: 'Search input no apareció después de 5s' };
    }
    await _sleep(300); // esperar animación
    L('2 ✓', 'search input visible');

    // ── Step 3: Escribir el número ──────────────────────────────────
    L('3', `escribiendo +${normalized}...`);
    await _typeInElement(searchInput, normalized);
    L('3 ✓', 'número escrito');

    // ── Step 4: Esperar resultado en la lista ───────────────────────
    // WA Web tarda 1-3s en buscar el número en el servidor
    L('4', 'esperando resultado de búsqueda...');
    await _sleep(2000); // WA necesita tiempo para buscar

    // Buscar el resultado: puede ser un contacto o un "Enviar mensaje a [número]"
    const result = await _waitFor(SEL.searchResult, 6000);
    if (!result) {
      // Intentar detectar si hay un resultado de "usar número"
      // Algunos builds muestran "Enviar mensaje a 51..."
      const altResult = document.querySelector(
        `span[title*="${normalized}"], span[title*="+${normalized}"], ` +
        `[data-testid="search-no-results"]`
      );
      if (altResult?.getAttribute('data-testid') === 'search-no-results') {
        L('4 ✗', 'número no encontrado en WA');
        // Cerrar búsqueda con Escape
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return { ok: false, error: 'Número no tiene WhatsApp: ' + normalized };
      }
      if (!altResult) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return { ok: false, error: 'Sin resultado de búsqueda para: ' + normalized };
      }
      altResult.click();
      L('4 ✓', 'resultado alternativo clickeado');
    } else {
      // Click en el primer resultado
      result.click();
      L('4 ✓', 'resultado clickeado');
    }

    // ── Step 5: Esperar que el chat se abra (composer visible) ───────
    L('5', 'esperando composer...');
    await _sleep(800); // animación de apertura
    const composer = await _waitFor(SEL.composer, 5000);
    if (!composer) {
      return { ok: false, error: 'El chat se abrió pero el composer no apareció' };
    }
    L('5 ✓', 'chat abierto, composer listo');

    return { ok: true, chatReady: true };

  } catch (err) {
    console.error('[CHAT-OPENER] error:', err);
    return { ok: false, error: err.message || 'Error desconocido' };
  }
}

// ══════════════════════════════════════════════════════════════════════
// typeAndSendMessage — escribe un mensaje en el composer y lo envía
//
// Prerrequisito: el chat ya debe estar abierto (openChatDOM exitoso).
// ══════════════════════════════════════════════════════════════════════
export async function typeAndSendMessage(text) {
  const L = (step, ...args) => console.log(`[CHAT-OPENER] ${step}`, ...args);

  try {
    const composer = _find(SEL.composer);
    if (!composer) {
      return { ok: false, error: 'Composer no visible — ¿el chat está abierto?' };
    }

    // Escribir el mensaje
    L('send-1', 'escribiendo mensaje...');
    await _typeInElement(composer, text);
    await _sleep(200 + Math.random() * 300); // pausa humana antes de enviar

    // Click botón enviar (o Enter)
    L('send-2', 'enviando...');
    const sendBtn = _find(SEL.sendBtn);
    if (sendBtn) {
      sendBtn.click();
    } else {
      // Fallback: Enter key
      composer.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13,
        bubbles: true, cancelable: true,
      }));
    }

    await _sleep(300);
    L('send ✓', 'mensaje enviado');
    return { ok: true };
  } catch (err) {
    console.error('[CHAT-OPENER] send error:', err);
    return { ok: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════
// fullSendFlow — flujo completo: abrir chat → esperar 30s → enviar
//
// Esto es lo que llama el sidebar cuando el usuario toca "Escribir".
// Retorna un AsyncGenerator que emite eventos de progreso para que
// la UI muestre el estado en tiempo real.
// ══════════════════════════════════════════════════════════════════════
export async function fullSendFlow(phone, messageText, onProgress) {
  const report = (phase, detail) => {
    if (onProgress) onProgress({ phase, detail, phone });
  };

  // Fase 1: Abrir chat (buscar + click)
  report('opening', 'Abriendo chat...');
  const openResult = await openChatDOM(phone);
  if (!openResult.ok) {
    report('error', openResult.error);
    return { ok: false, error: openResult.error, phase: 'open' };
  }
  report('opened', 'Chat abierto');

  // Fase 2: Esperar 30s (anti-ban: agregar como contacto + crear sesión)
  report('waiting', 'Preparando contacto (30s)...');
  const PREWARM = 30_000;
  const start = Date.now();
  while (Date.now() - start < PREWARM) {
    const remaining = Math.ceil((PREWARM - (Date.now() - start)) / 1000);
    report('waiting', `Preparando contacto... ${remaining}s`);
    await _sleep(1000);
  }
  report('ready', 'Listo para enviar');

  // Fase 3: Escribir y enviar
  report('sending', 'Escribiendo mensaje...');
  const sendResult = await typeAndSendMessage(messageText);
  if (!sendResult.ok) {
    report('error', sendResult.error);
    return { ok: false, error: sendResult.error, phase: 'send' };
  }

  report('done', '✅ Mensaje enviado');
  return { ok: true };
}
