// background.js - v4 — service worker: relay, API proxy, CDP phone typing, CRM window
'use strict';

let crmWindowId = null;
let cdpBusy     = false;

chrome.runtime.onInstalled.addListener(() => {
  console.log('[WSPP BG] v4 instalado');
});

// ── Tipos que se retransmiten desde content.js a todos los listeners ──
// Incluye eventos de tiempo real de inject.js Y resultados de acciones
const BROADCAST_TYPES = new Set([
  'WSPP_NEW_MSG',
  'WSPP_ME',
  'WSPP_CHATS_UPDATE',
  'WSPP_OPEN_CHAT_RESULT',
  'WSPP_NAVIGATE_CHAT_RESULT',
  'WSPP_HISTORY',
  'WSPP_WA_CONTACTS_RESULT',
]);

// ── Main message handler ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // Relay broadcast: content.js → todos los demás (CRM popup, sidebar)
  if (BROADCAST_TYPES.has(msg.type)) {
    // sendMessage sin callback — no es necesario esperar respuesta
    chrome.runtime.sendMessage(msg).catch(() => {});
    return;
  }

  // ── Proxy de llamadas API ────────────────────────────────────────
  // El background service worker no tiene restricciones de CORS de extensión.
  // Solo se permiten URLs de api.goberna.us para evitar uso como proxy arbitrario.
  if (msg.type === 'WSPP_API_FETCH') {
    const { url, method = 'GET', headers = {}, body } = msg.payload || {};
    if (!url || !url.startsWith('https://api.goberna.us/')) {
      sendResponse({ ok: false, error: 'URL no autorizada' });
      return;
    }
    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    })
      .then(async r => {
        let data = null;
        try { data = await r.json(); } catch(_) {}
        sendResponse({ ok: r.ok, status: r.status, data });
      })
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true; // async response
  }

  // ── Tipear en WA via CDP (isTrusted: true) ───────────────────────
  if (msg.type === 'WSPP_TYPE_PHONE') {
    const tabId   = sender.tab?.id;
    const { phone, greeting = '' } = msg.payload || {};
    console.log('[WSPP BG] WSPP_TYPE_PHONE phone:', phone, 'tabId:', tabId, 'busy:', cdpBusy);
    if (!tabId)   { sendResponse({ error: 'no tabId' }); return; }
    if (cdpBusy)  { sendResponse({ error: 'busy' });     return; }
    cdpBusy = true;
    // Reset de seguridad: si CDP se queda colgado, liberar el lock a los 20s
    const cdpSafetyReset = setTimeout(() => { cdpBusy = false; }, 20000);
    typePhoneViaCDP(tabId, phone, greeting)
      .then(sendResponse)
      .catch(e => sendResponse({ error: e.message }))
      .finally(() => { cdpBusy = false; clearTimeout(cdpSafetyReset); });
    return true;
  }
});

// ── Abrir / focalizar ventana CRM ──────────────────────────────────
chrome.action.onClicked?.addListener(() => openCRM());

async function openCRM() {
  if (crmWindowId !== null) {
    try {
      await chrome.windows.update(crmWindowId, { focused: true });
      return;
    } catch(_) { crmWindowId = null; }
  }

  const win = await chrome.windows.create({
    url:    chrome.runtime.getURL('crm.html'),
    type:   'popup',
    width:  1100,
    height: 720,
  });
  crmWindowId = win.id;

  // Limpiar referencia cuando la ventana se cierra
  const onRemoved = (id) => {
    if (id === crmWindowId) {
      crmWindowId = null;
      chrome.windows.onRemoved.removeListener(onRemoved);
    }
  };
  chrome.windows.onRemoved.addListener(onRemoved);
}

// ── Tipear via CDP (eventos isTrusted) ──────────────────────────────
async function waitForSelector(target, selector, maxMs = 3000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const r = await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
      expression: `!!document.querySelector(${JSON.stringify(selector)})`,
    });
    if (r?.result?.value === true) return true;
    await sleep(50);
  }
  return false;
}

async function typePhoneViaCDP(tabId, phone, greeting = '') {
  const target = { tabId };
  try { await chrome.debugger.attach(target, '1.3'); } catch(_) {}

  try {
    const clean    = String(phone || '').replace(/\D/g, '');
    const SEARCH   = '[aria-placeholder="Buscar un chat o iniciar uno nuevo"]';
    const COMPOSER = '[aria-placeholder="Escribe un mensaje"]';

    // 1. Click "Nuevo chat" para abrir el buscador
    await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
      expression: `document.querySelector('[aria-label="Nuevo chat"]')?.click()`,
    });
    const inputReady = await waitForSelector(target, SEARCH, 3000);
    if (!inputReady) throw new Error('Input búsqueda no apareció');

    // 2. Foco en el input
    await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
      expression: `document.querySelector(${JSON.stringify(SEARCH)})?.focus()`,
    });
    await sleep(100);

    // 3. Tipear número char a char (30ms entre chars)
    for (const char of clean) {
      await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
        type: 'char', key: char, code: charToCode(char), text: char, unmodifiedText: char,
      });
      await sleep(30);
    }

    // 4. Esperar resultado y presionar Enter
    await sleep(600);
    await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
      type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r',
      windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
    });
    await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
      type: 'keyUp', key: 'Enter', code: 'Enter',
      windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
    });

    // 5. Escribir saludo en el compositor si se proporcionó
    if (greeting) {
      const composerReady = await waitForSelector(target, COMPOSER, 4000);
      if (composerReady) {
        await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
          expression: `document.querySelector(${JSON.stringify(COMPOSER)})?.focus()`,
        });
        await sleep(100);
        for (const char of greeting) {
          await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
            type: 'char', key: char, code: '', text: char, unmodifiedText: char,
          });
          await sleep(20);
        }
      }
    }

  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }

  return { ok: true };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function charToCode(char) {
  const map = {
    '0':'Digit0','1':'Digit1','2':'Digit2','3':'Digit3','4':'Digit4',
    '5':'Digit5','6':'Digit6','7':'Digit7','8':'Digit8','9':'Digit9',
    '+':'Equal','-':'Minus',
  };
  return map[char] || `Key${char.toUpperCase()}`;
}
