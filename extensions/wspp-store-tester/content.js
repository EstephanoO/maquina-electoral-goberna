// content.js - v4 — bridge entre CRM/popup y inject.js (world: MAIN)
// world: ISOLATED — puede usar chrome.runtime pero no window.require
'use strict';

// ── Helpers ─────────────────────────────────────────────────────────
/**
 * Envía un mensaje al MAIN world via postMessage y espera la respuesta.
 * @param {string} outType  Tipo del mensaje saliente hacia inject.js
 * @param {string} inType   Tipo del mensaje esperado de inject.js
 * @param {*}      payload  Datos a enviar
 * @param {number} timeout  Timeout en ms
 */
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

// ── Relay: inject.js → background → CRM/sidebar ──────────────────
// Reenvía eventos de tiempo real del MAIN world a todos los listeners
const RELAY_TYPES = [
  'WSPP_NEW_MSG',
  'WSPP_ME',
  'WSPP_CHATS_UPDATE',
  'WSPP_OPEN_CHAT_RESULT',
  'WSPP_NAVIGATE_CHAT_RESULT',
  'WSPP_HISTORY',
  'WSPP_WA_CONTACTS_RESULT',
];

window.addEventListener('message', (e) => {
  const { type, payload } = e.data || {};
  if (RELAY_TYPES.includes(type)) {
    chrome.runtime.sendMessage({ type, payload }).catch(() => {});
  }
});

// ── Listener: mensajes desde CRM popup / sidebar ──────────────────
chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {

  // scan: exportar chats + contactos + me
  if (req.action === 'scan') {
    postAndWait('WSPP_SCAN', 'WSPP_RESULT', null)
      .then(sendResponse);
    return true;
  }

  // getMsgs: obtener últimos mensajes de un chat
  if (req.action === 'getMsgs') {
    postAndWait('WSPP_GET_MSGS', 'WSPP_MSGS_RESULT', { chatId: req.chatId })
      .then(sendResponse);
    return true;
  }

  // openChat: navegar al chat por número de teléfono (intent → OPEN_CHAT)
  if (req.action === 'openChat') {
    postAndWait('WSPP_OPEN_CHAT', 'WSPP_OPEN_CHAT_RESULT', { phone: req.phone })
      .then(sendResponse);
    return true;
  }

  // navigateChat: navegar al chat por chatId directo
  if (req.action === 'navigateChat') {
    postAndWait('WSPP_NAVIGATE_CHAT', 'WSPP_NAVIGATE_CHAT_RESULT', { chatId: req.chatId })
      .then(sendResponse);
    return true;
  }

  // getWaContacts: exportar todos los contactos WA con teléfono y etiquetas
  if (req.action === 'getWaContacts') {
    postAndWait('WSPP_GET_WA_CONTACTS', 'WSPP_WA_CONTACTS_RESULT', null, 8000)
      .then(sendResponse);
    return true;
  }
});
