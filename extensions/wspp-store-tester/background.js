'use strict';

const API = 'https://api.goberna.us';

// Cada WSPP_SENT: incrementa contador local Y reporta al backend
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'WSPP_SENT') return;

  const { phone, own_number } = msg.payload;

  // 1. Incrementar contador local
  chrome.storage.local.get(['wspp_count', 'wspp_token', 'wspp_campaign_id'], (data) => {
    const next = (data.wspp_count ?? 0) + 1;
    chrome.storage.local.set({ wspp_count: next });

    // 2. Reportar al backend si hay sesión activa
    if (data.wspp_token && data.wspp_campaign_id && phone) {
      fetch(`${API}/api/cms/extension-event`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${data.wspp_token}`,
          'x-campaign-id': data.wspp_campaign_id,
        },
        body: JSON.stringify({
          type:        'message_sent',
          phone,
          own_number:  own_number || undefined,
          detected_at: msg.payload.timestamp * 1000,
        }),
      }).catch(() => {}); // fire and forget — no bloquear el contador local
    }
  });
});

// Detectar si WA está abierto
chrome.tabs.onUpdated?.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && tab.url?.includes('web.whatsapp.com')) {
    chrome.storage.local.set({ wspp_wa_active: true });
  }
});
chrome.tabs.onRemoved?.addListener(() => {
  chrome.tabs.query({ url: '*://web.whatsapp.com/*' }, (tabs) => {
    chrome.storage.local.set({ wspp_wa_active: tabs.length > 0 });
  });
});
