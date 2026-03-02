/**
 * WhatsApp Goberna Helper — WhatsApp Web Content Script (v2)
 *
 * Runs inside web.whatsapp.com.
 *
 * The primary navigation mechanism is now in background.js via
 * chrome.scripting.executeScript. This content script serves as:
 *   1. A fallback message listener (in case sendMessage is used)
 *   2. A diagnostic logger
 *
 * The background.js injects a function that calls
 * window.location.assign(url) directly — this triggers WhatsApp's
 * SPA router without a full page reload.
 */

console.log("[Goberna WA] Content script loaded in WhatsApp Web");
console.log("[Goberna WA] URL:", window.location.href);

// ── Fallback listener ──
// If background.js falls back to sendMessage (shouldn't happen
// with the v2 approach, but kept for safety).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "navigateToChat") {
    const { phone, text } = msg;
    console.log("[Goberna WA] navigateToChat message received:", phone);

    const url = `https://web.whatsapp.com/send?phone=${phone}${text ? `&text=${encodeURIComponent(text)}` : ""}`;
    window.location.assign(url);

    sendResponse({ ok: true, method: "content-script-assign" });
    return true;
  }
});

// ── Diagnostic: detect full reloads ──
// If the page fully reloads, this runs again and we log it.
// This helps debug whether our navigation is truly in-place.
(() => {
  const navEntry = performance.getEntriesByType("navigation")[0];
  if (navEntry) {
    console.log("[Goberna WA] Navigation type:", navEntry.type);
    // "navigate" = fresh load, "reload" = reload, "back_forward" = history
    // We want to see "navigate" only on the first open, not on subsequent chats
  }
})();
