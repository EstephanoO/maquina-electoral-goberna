// background.js - relay de mensajes inject → CRM window
'use strict';

let crmWindowId = null;
let cdpBusy = false;

chrome.runtime.onInstalled.addListener(() => {
  console.log('[WSPP] Instalado');
});

// Relay: reenviar mensajes de content.js al CRM
// También maneja llamadas API que necesitan salir sin restricciones CORS
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (['WSPP_NEW_MSG', 'WSPP_ME', 'WSPP_CHATS_UPDATE'].includes(msg.type)) {
    chrome.runtime.sendMessage(msg).catch(() => {});
  }

  // Proxy de llamadas API — el background no tiene restricciones CORS
  if (msg.type === 'WSPP_API_FETCH') {
    const { url, method, headers, body } = msg.payload;
    fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
      .then(async r => {
        let data = null;
        try { data = await r.json(); } catch(_) {}
        sendResponse({ ok: r.ok, status: r.status, data });
      })
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true; // async response
  }

  // Tipear en WA via CDP (isTrusted: true)
  if (msg.type === 'WSPP_TYPE_PHONE') {
    const tabId = sender.tab?.id;
    const { phone } = msg.payload;
    console.log('[WSPP BG] WSPP_TYPE_PHONE recibido, phone:', phone, 'tabId:', tabId, 'busy:', cdpBusy);
    if (!tabId) { sendResponse({ error: 'no tabId' }); return; }
    if (cdpBusy) { console.log('[WSPP BG] Ignorado — busy'); sendResponse({ error: 'busy' }); return; }
    cdpBusy = true;
    const greeting = msg.payload.greeting || '';
    typePhoneViaCDP(tabId, phone, greeting)
      .then(sendResponse)
      .catch(e => sendResponse({ error: e.message }))
      .finally(() => { cdpBusy = false; });
    return true;
  }
});

// Abrir ventana CRM
chrome.action.onClicked?.addListener(() => openCRM());

// ── Tipear via CDP (eventos isTrusted) ──────────────────────────────
// Esperar a que un selector aparezca en el DOM (max ms, poll cada 50ms)
async function waitFor(target, selector, maxMs = 3000) {
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
    const clean  = String(phone).replace(/\D/g, '');
    const SEARCH = '[aria-placeholder="Buscar un chat o iniciar uno nuevo"]';
    const COMPOSER = '[aria-placeholder="Escribe un mensaje"]';
    const RESULT = '[aria-label="Cuadro de texto para ingresar la búsqueda"] ~ * [role="listitem"], ._ak72';

    // 1. Click "Nuevo chat" y esperar el input
    await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
      expression: `document.querySelector('[aria-label="Nuevo chat"]')?.click()`,
    });
    const inputReady = await waitFor(target, SEARCH, 3000);
    if (!inputReady) throw new Error('Input búsqueda no apareció');

    // 2. Foco en el input
    await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
      expression: `document.querySelector(${JSON.stringify(SEARCH)})?.click()`,
    });
    await sleep(100);

    // 3. Tipear número char por char (rápido, 30ms entre chars)
    for (const char of clean) {
      await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
        type: 'char', key: char, code: charToKeyCode(char), text: char, unmodifiedText: char,
      });
      await sleep(30);
    }

    // 4. Esperar un momento para que aparezca el resultado y presionar Enter
    await sleep(600);
    await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
      type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
    });
    await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
      type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
    });

    // 5. Esperar compositor y escribir saludo de golpe
    if (greeting) {
      const composerReady = await waitFor(target, COMPOSER, 4000);
      if (composerReady) {
        await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
          expression: `document.querySelector(${JSON.stringify(COMPOSER)})?.click()`,
        });
        await sleep(100);
        for (const char of greeting) {
          await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
            type: 'char', key: char, code: '', text: char, unmodifiedText: char,
          });
          await sleep(30);
        }
      }
    }

  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }

  return { ok: true };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function charToKeyCode(char) {
  const map = {
    '0':'Digit0','1':'Digit1','2':'Digit2','3':'Digit3','4':'Digit4',
    '5':'Digit5','6':'Digit6','7':'Digit7','8':'Digit8','9':'Digit9',
    '+':'Equal',
  };
  return map[char] || `Key${char.toUpperCase()}`;
}

async function openCRM() {
  if (crmWindowId !== null) {
    try {
      await chrome.windows.update(crmWindowId, { focused: true });
      return;
    } catch(e) { crmWindowId = null; }
  }

  const win = await chrome.windows.create({
    url:    chrome.runtime.getURL('crm.html'),
    type:   'popup',
    width:  1000,
    height: 700,
  });
  crmWindowId = win.id;

  chrome.windows.onRemoved.addListener((id) => {
    if (id === crmWindowId) crmWindowId = null;
  });
}
