// content.js — ISOLATED world, document_start.
// Bridge entre inject.js (MAIN world) y el background service worker.
'use strict';

window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.type !== 'WSPP_SENT') return;

  // Reintentar si el service worker está dormido (Chrome lo mata tras ~30s inactivo)
  function trySend(attemptsLeft) {
    chrome.runtime.sendMessage({ type: 'WSPP_SENT', payload: e.data.payload })
      .catch((err) => {
        if (attemptsLeft > 0 && err?.message?.includes('Receiving end does not exist')) {
          // SW dormido — esperar 300ms y reintentar
          setTimeout(() => trySend(attemptsLeft - 1), 300);
        }
        // Otros errores (contexto invalidado, etc.): ignorar silenciosamente
      });
  }

  trySend(3);
});
