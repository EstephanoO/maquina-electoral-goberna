// content.js — ISOLATED world, document_start.
// Bridge entre inject.js (MAIN world) y el background service worker.
// También empuja wspp_own_number al MAIN world para que inject.js lo use
// sin depender del webpack hook.
'use strict';

// ── Empujar own_number al MAIN world ────────────────────────────────
// inject.js escucha WSPP_SET_OWN_NUMBER y cachea el valor.
function pushOwnNumber(number) {
  window.postMessage({ type: 'WSPP_SET_OWN_NUMBER', number: number || null }, '*');
}

// Al arrancar: leer del storage y empujar
chrome.storage.local.get('wspp_own_number', (s) => {
  pushOwnNumber(s.wspp_own_number || null);
});

// Si el usuario lo cambia desde el popup mientras WA está abierto: actualizar en caliente
chrome.storage.onChanged.addListener((changes) => {
  if (changes.wspp_own_number !== undefined) {
    pushOwnNumber(changes.wspp_own_number.newValue || null);
  }
});

// ── Bridge WSPP_SENT → background SW ────────────────────────────────
window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.type !== 'WSPP_SENT') return;

  // Reintentar si el service worker está dormido (Chrome lo mata tras ~30s inactivo)
  function trySend(attemptsLeft) {
    chrome.runtime.sendMessage({ type: 'WSPP_SENT', payload: e.data.payload })
      .catch((err) => {
        if (attemptsLeft > 0 && err?.message?.includes('Receiving end does not exist')) {
          setTimeout(() => trySend(attemptsLeft - 1), 300);
        }
      });
  }

  trySend(3);
});
