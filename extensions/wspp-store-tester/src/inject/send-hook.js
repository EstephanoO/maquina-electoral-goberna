// send-hook.js — listeners de click/keydown para detectar mensajes salientes.

import { WA_ORIGIN } from './bootstrap.js';
import { getActivePhone, getOwnNumber, getActiveContactName } from './jid-resolver.js';

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
