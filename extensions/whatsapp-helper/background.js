/**
 * WhatsApp Goberna Helper - Background Script
 * Gestiona una sola pestaña de WhatsApp Web
 */

const WHATSAPP_URL = "https://web.whatsapp.com";
let waTabId = null;

// Buscar pestaña existente de WhatsApp
async function findWhatsAppTab() {
  const tabs = await chrome.tabs.query({ url: `${WHATSAPP_URL}/*` });
  return tabs.length > 0 ? tabs[0] : null;
}

// Abrir o reutilizar pestaña de WhatsApp
async function openWhatsApp(phone) {
  // Buscar pestaña existente
  let tab = await findWhatsAppTab();

  if (tab) {
    // Reutilizar pestaña existente
    waTabId = tab.id;
    const url = phone 
      ? `${WHATSAPP_URL}/send?phone=${phone}`
      : WHATSAPP_URL;
    
    await chrome.tabs.update(tab.id, { active: true, url });
    return { reused: true, tabId: tab.id };
  } else {
    // Crear nueva pestaña
    const url = phone 
      ? `${WHATSAPP_URL}/send?phone=${phone}`
      : WHATSAPP_URL;
    
    const newTab = await chrome.tabs.create({ url, active: true });
    waTabId = newTab.id;
    return { reused: false, tabId: newTab.id };
  }
}

// Escuchar mensajes desde la página web
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "openChat") {
    openWhatsApp(message.phone)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ error: err.message }));
    return true; // Async response
  }

  if (message.action === "getStatus") {
    findWhatsAppTab().then(tab => {
      sendResponse({ 
        open: !!tab, 
        tabId: tab?.id,
        waTabId 
      });
    });
    return true;
  }
});

// Cleanup cuando se cierra la pestaña de WhatsApp
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === waTabId) {
    waTabId = null;
  }
});

// Cleanup cuando se navega fuera de WhatsApp
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === waTabId && changeInfo.url && !changeInfo.url.startsWith(WHATSAPP_URL)) {
    waTabId = null;
  }
});
