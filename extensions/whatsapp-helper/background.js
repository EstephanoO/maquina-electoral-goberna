/**
 * WhatsApp Goberna Helper — Background Script
 * Manages a single WhatsApp Web tab. Never opens duplicates.
 *
 * When a WA tab already exists, it sends a message to the content script
 * running inside WhatsApp Web to navigate to the chat WITHOUT reloading.
 */

const WA_BASE = "https://web.whatsapp.com";

async function findWaTab() {
  const tabs = await chrome.tabs.query({ url: `${WA_BASE}/*` });
  return tabs.length > 0 ? tabs[0] : null;
}

async function openChat(phone, text) {
  const existing = await findWaTab();

  if (existing) {
    // Focus the tab + window first
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });

    // Tell the content script to navigate to the chat in-page (no reload)
    try {
      await chrome.tabs.sendMessage(existing.id, {
        action: "navigateToChat",
        phone,
        text: text || "",
      });
      return { reused: true, tabId: existing.id, method: "inject" };
    } catch {
      // Content script not ready (page just loaded?) — fall back to URL change
      const sendUrl = `${WA_BASE}/send?phone=${phone}${text ? `&text=${encodeURIComponent(text)}` : ""}`;
      await chrome.tabs.update(existing.id, { url: sendUrl });
      return { reused: true, tabId: existing.id, method: "url" };
    }
  }

  // No existing tab — create one (first time only)
  const sendUrl = `${WA_BASE}/send?phone=${phone}${text ? `&text=${encodeURIComponent(text)}` : ""}`;
  const newTab = await chrome.tabs.create({ url: sendUrl, active: true });
  return { reused: false, tabId: newTab.id, method: "new" };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "openChat") {
    openChat(msg.phone, msg.text)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.action === "getStatus") {
    findWaTab().then((tab) => {
      sendResponse({ open: !!tab, tabId: tab?.id ?? null });
    });
    return true;
  }
});
