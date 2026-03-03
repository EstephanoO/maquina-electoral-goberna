// content.js - bridge entre CRM/popup y inject.js (world: MAIN)
'use strict';

// ── Helpers ────────────────────────────────────────────────────────
function postAndWait(outType, inType, payload, timeout = 6000) {
  return new Promise((resolve) => {
    const handler = (e) => {
      if (e.data?.type === inType) {
        window.removeEventListener('message', handler);
        clearTimeout(timer);
        resolve(e.data.payload);
      }
    };
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve(null);
    }, timeout);

    window.addEventListener('message', handler);
    window.postMessage({ type: outType, payload }, '*');
  });
}

// Reenviar eventos de inject.js al background (para que lleguen al CRM)
window.addEventListener('message', (e) => {
  const { type, payload } = e.data || {};
  if (['WSPP_NEW_MSG', 'WSPP_ME', 'WSPP_CHATS_UPDATE'].includes(type)) {
    chrome.runtime.sendMessage({ type, payload }).catch(() => {});
  }
});

// ── Listener de mensajes desde popup/CRM ──────────────────────────
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {

  if (req.action === 'scan') {
    postAndWait('WSPP_SCAN', 'WSPP_RESULT', null)
      .then(sendResponse);
    return true;
  }

  if (req.action === 'getMsgs') {
    postAndWait('WSPP_GET_MSGS', 'WSPP_MSGS_RESULT', { chatId: req.chatId })
      .then(sendResponse);
    return true;
  }
});
