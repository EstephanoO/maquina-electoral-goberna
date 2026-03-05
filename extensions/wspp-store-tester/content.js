// content.js — ISOLATED world. Bridge entre inject.js y el background.
'use strict';

window.addEventListener('message', (e) => {
  if (e.data?.type === 'WSPP_SENT') {
    chrome.runtime.sendMessage({ type: 'WSPP_SENT', payload: e.data.payload }).catch(() => {});
  }
});
