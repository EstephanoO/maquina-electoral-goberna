/**
 * WhatsApp Goberna Helper — Dashboard Bridge
 *
 * Runs on the Goberna dashboard.
 * Listens for custom events from the React app and forwards them
 * to the extension background script which manages the WhatsApp tab.
 */

// Listen for the custom event the dashboard fires on WhatsApp button click
window.addEventListener("goberna:open-whatsapp", (e) => {
  const { phone, text } = e.detail || {};
  if (!phone) return;

  chrome.runtime.sendMessage({
    action: "openChat",
    phone,
    text: text || "",
  });
});

// Let the dashboard know the extension is installed
// So it can use the extension path instead of window.open fallback
window.__GOBERNA_WA_EXTENSION__ = true;
document.documentElement.setAttribute("data-goberna-wa-ext", "true");
