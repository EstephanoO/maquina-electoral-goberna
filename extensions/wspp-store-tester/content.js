// content.js — ISOLATED world, document_start.
// Bridge entre inject.js (MAIN world) y el background service worker.
// También empuja wspp_own_number al MAIN world para que inject.js lo use
// sin depender del webpack hook.
'use strict';

// H-3: Use specific origin for postMessage instead of '*'
const WA_ORIGIN = 'https://web.whatsapp.com';

// ── Empujar own_number al MAIN world ────────────────────────────────
// inject.js escucha WSPP_SET_OWN_NUMBER y cachea el valor.
function pushOwnNumber(number) {
  window.postMessage({ type: 'WSPP_SET_OWN_NUMBER', number: number || null }, WA_ORIGIN);
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
  // H-4: Validate source — only accept from same window
  if (e.source !== window) return;

  // --- WSPP_SENT (contador de mensajes) ---
  // S-6: Exponential backoff on SW wake-up retries (300ms → 600ms → 1200ms)
  if (e.data?.type === 'WSPP_SENT') {
    function trySend(attemptsLeft, delay) {
      chrome.runtime.sendMessage({ type: 'WSPP_SENT', payload: e.data.payload })
        .catch((err) => {
          if (attemptsLeft > 0 && err?.message?.includes('Receiving end does not exist')) {
            setTimeout(() => trySend(attemptsLeft - 1, delay * 2), delay);
          }
        });
    }
    trySend(3, 300);
    return;
  }

  // --- GENERATE_VOICE (TTS: inject → background → inject) ---
  if (e.data?.type === 'GENERATE_VOICE') {
    const text = e.data.text;
    console.log('[WSPP TTS bridge] Enviando a background:', text?.slice(0, 50));

    chrome.runtime.sendMessage({ type: 'GENERATE_VOICE', text }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[WSPP TTS bridge] Error:', chrome.runtime.lastError.message);
        window.postMessage({ type: 'VOICE_READY', ok: false, error: chrome.runtime.lastError.message }, WA_ORIGIN);
        return;
      }
      // Pasar respuesta de vuelta al MAIN world (inject.js)
      window.postMessage({
        type: 'VOICE_READY',
        ok: response?.ok ?? false,
        audioBase64: response?.audioBase64 ?? null,
        mimeType: response?.mimeType ?? null,
        error: response?.error ?? null,
      }, WA_ORIGIN);
    });
    return;
  }

  // --- WSPP_RECEIVED (mensaje entrante detectado) ---
  // Uses retry logic (like WSPP_SENT) because the MV3 service worker
  // may be sleeping and needs time to wake up.
  // S-6: Exponential backoff on SW wake-up retries (400ms → 800ms → 1600ms)
  if (e.data?.type === 'WSPP_RECEIVED') {
    const payload = e.data.payload;
    function trySendReceived(attemptsLeft, delay) {
      chrome.runtime.sendMessage(
        { type: 'WSPP_RECEIVED', payload },
        (response) => {
          if (chrome.runtime.lastError) {
            const errMsg = chrome.runtime.lastError.message || '';
            if (attemptsLeft > 0 && errMsg.includes('Receiving end does not exist')) {
              setTimeout(() => trySendReceived(attemptsLeft - 1, delay * 2), delay);
            }
            return;
          }
          // Si background devuelve datos de validacion, pasarlos a inject.js
          if (response?.validation) {
            window.postMessage({ type: 'WSPP_VALIDATION_DATA', payload: response.validation }, WA_ORIGIN);
          }
        }
      );
    }
    trySendReceived(3, 400);
    return;
  }

  // --- WSPP_CHAT_OPENED (operador abre un chat) ---
  if (e.data?.type === 'WSPP_CHAT_OPENED') {
    chrome.runtime.sendMessage(
      { type: 'WSPP_CHAT_OPENED', payload: e.data.payload },
      (response) => {
        if (chrome.runtime.lastError) return;
        if (response?.validation) {
          window.postMessage({ type: 'WSPP_VALIDATION_DATA', payload: response.validation }, WA_ORIGIN);
        } else {
          window.postMessage({ type: 'WSPP_VALIDATION_CLEAR' }, WA_ORIGIN);
        }
      }
    );
    return;
  }

  // --- WSPP_CLASSIFY (operador clasifica desde overlay) ---
  if (e.data?.type === 'WSPP_CLASSIFY') {
    chrome.runtime.sendMessage(
      { type: 'WSPP_CLASSIFY', payload: e.data.payload },
      (response) => {
        if (chrome.runtime.lastError) {
          window.postMessage({ type: 'WSPP_CLASSIFY_RESULT', ok: false, error: chrome.runtime.lastError.message }, WA_ORIGIN);
          return;
        }
        window.postMessage({
          type: 'WSPP_CLASSIFY_RESULT',
          ok: response?.ok ?? false,
          payload: response?.item ?? null,
          error: response?.error ?? null,
        }, WA_ORIGIN);
      }
    );
    return;
  }
});
