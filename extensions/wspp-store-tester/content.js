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
console.log('[WSPP BRIDGE] content.js loaded — listener registering');
window.addEventListener('message', (e) => {
  // H-4: Validate source — only accept from same window
  if (e.source !== window) return;

  const msgType = e.data?.type;
  if (msgType && msgType.startsWith('WSPP_')) {
    console.log('[WSPP BRIDGE] postMessage received:', msgType);
  }

  // --- WSPP_SENT (contador de mensajes — DOM-based) ---
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

  // --- WSPP_SENT_RICH (MsgCollection-based, higher fidelity phone resolution) ---
  if (e.data?.type === 'WSPP_SENT_RICH') {
    function trySendRich(attemptsLeft, delay) {
      chrome.runtime.sendMessage({ type: 'WSPP_SENT_RICH', payload: e.data.payload })
        .catch((err) => {
          if (attemptsLeft > 0 && err?.message?.includes('Receiving end does not exist')) {
            setTimeout(() => trySendRich(attemptsLeft - 1, delay * 2), delay);
          }
        });
    }
    trySendRich(3, 300);
    return;
  }

  // --- FETCH_AUDIO_CATALOG (catalog list: inject → background → inject) ---
  if (e.data?.type === 'FETCH_AUDIO_CATALOG') {
    console.log('[WSPP CATALOG bridge] Fetching catalog');
    chrome.runtime.sendMessage({ type: 'FETCH_AUDIO_CATALOG' }, (response) => {
      if (chrome.runtime.lastError) {
        window.postMessage({ type: 'AUDIO_CATALOG_READY', ok: false, error: chrome.runtime.lastError.message }, WA_ORIGIN);
        return;
      }
      window.postMessage({
        type: 'AUDIO_CATALOG_READY',
        ok: response?.ok ?? false,
        items: response?.items ?? [],
        error: response?.error ?? null,
      }, WA_ORIGIN);
    });
    return;
  }

  // --- GET_CATALOG_AUDIO (fetch single audio: inject → background → inject) ---
  if (e.data?.type === 'GET_CATALOG_AUDIO') {
    const audioId = e.data.id;
    console.log('[WSPP CATALOG bridge] Getting audio:', audioId);
    chrome.runtime.sendMessage({ type: 'GET_CATALOG_AUDIO', id: audioId }, (response) => {
      if (chrome.runtime.lastError) {
        window.postMessage({ type: 'CATALOG_AUDIO_READY', ok: false, error: chrome.runtime.lastError.message }, WA_ORIGIN);
        return;
      }
      window.postMessage({
        type: 'CATALOG_AUDIO_READY',
        ok: response?.ok ?? false,
        audioBase64: response?.audioBase64 ?? null,
        mimeType: response?.mimeType ?? null,
        label: response?.label ?? null,
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
    console.log('%c[WSPP BRIDGE] WSPP_RECEIVED → sending to background', 'color:#a855f7;font-weight:700', payload.preview?.slice(0, 50));
    function trySendReceived(attemptsLeft, delay) {
      chrome.runtime.sendMessage(
        { type: 'WSPP_RECEIVED', payload },
        (response) => {
          if (chrome.runtime.lastError) {
            const errMsg = chrome.runtime.lastError.message || '';
            console.warn('[WSPP BRIDGE] sendMessage error:', errMsg, '| retries left:', attemptsLeft);
            if (attemptsLeft > 0 && errMsg.includes('Receiving end does not exist')) {
              setTimeout(() => trySendReceived(attemptsLeft - 1, delay * 2), delay);
            }
            return;
          }
          console.log('%c[WSPP BRIDGE] background responded:', 'color:#22c55e;font-weight:700', JSON.stringify(response)?.slice(0, 200));
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
  // S-6: Retry with backoff if SW is sleeping (400ms → 800ms → 1600ms)
  if (e.data?.type === 'WSPP_CLASSIFY') {
    function tryClassify(attemptsLeft, delay) {
      chrome.runtime.sendMessage(
        { type: 'WSPP_CLASSIFY', payload: e.data.payload },
        (response) => {
          if (chrome.runtime.lastError) {
            if (attemptsLeft > 0 && chrome.runtime.lastError.message?.includes('Receiving end does not exist')) {
              setTimeout(() => tryClassify(attemptsLeft - 1, delay * 2), delay);
              return;
            }
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
    }
    tryClassify(3, 400);
    return;
  }
});

// ── WSPP_SPAM_WARNING — background → content → inject.js overlay ────
// Background SW sends this when it detects spam patterns in outgoing messages.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'WSPP_SPAM_WARNING') return;
  window.postMessage({
    type: 'WSPP_SPAM_WARNING',
    payload: msg.payload,
  }, WA_ORIGIN);
});
