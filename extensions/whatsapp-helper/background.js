/**
 * WhatsApp Goberna Helper — Background Script
 * Manages a single WhatsApp Web tab. Never opens duplicates.
 */

const WA_BASE = "https://web.whatsapp.com";

// Find existing WhatsApp Web tab
async function findWaTab() {
  const tabs = await chrome.tabs.query({ url: `${WA_BASE}/*` });
  return tabs.length > 0 ? tabs[0] : null;
}

// Open or reuse WhatsApp Web tab
async function openChat(phone, text) {
  const encoded = text ? encodeURIComponent(text) : "";
  const sendUrl = `${WA_BASE}/send?phone=${phone}${encoded ? `&text=${encoded}` : ""}`;

  const existing = await findWaTab();

  if (existing) {
    // Reuse: update URL in existing tab and focus it
    await chrome.tabs.update(existing.id, { url: sendUrl, active: true });
    // Bring window to front
    await chrome.windows.update(existing.windowId, { focused: true });
    return { reused: true, tabId: existing.id };
  }

  // No existing tab — create one
  const newTab = await chrome.tabs.create({ url: sendUrl, active: true });
  return { reused: false, tabId: newTab.id };
}

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "openChat") {
    openChat(msg.phone, msg.text)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true; // async
  }

  if (msg.action === "getStatus") {
    findWaTab().then((tab) => {
      sendResponse({ open: !!tab, tabId: tab?.id ?? null });
    });
    return true;
  }
});
