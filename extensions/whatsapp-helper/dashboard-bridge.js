/**
 * WhatsApp Goberna Helper — Dashboard Bridge
 *
 * Runs on the Goberna dashboard (prod, preview, localhost).
 * Two mechanisms:
 *   1. Custom event "goberna:open-whatsapp" from React code
 *   2. Click interceptor — catches ALL clicks on whatsapp links
 *      before the browser opens a new tab
 */

console.log("[Goberna WA] Extension bridge loaded on", location.hostname);

// ── Signal to the page that the extension is installed ──
window.__GOBERNA_WA_EXTENSION__ = true;
document.documentElement.setAttribute("data-goberna-wa-ext", "true");

// ── Helper: extract phone from any WhatsApp URL ──
function extractPhone(url) {
  try {
    const u = new URL(url);
    // web.whatsapp.com/send?phone=X  or  wa.me/X  or  api.whatsapp.com/send?phone=X
    if (u.hostname === "wa.me") {
      return u.pathname.replace("/", "").replace(/\D/g, "");
    }
    return u.searchParams.get("phone")?.replace(/\D/g, "") || null;
  } catch {
    return null;
  }
}

function extractText(url) {
  try {
    return new URL(url).searchParams.get("text") || "";
  } catch {
    return "";
  }
}

// ── Send to background (reuses WA tab) ──
function sendToBackground(phone, text) {
  if (!phone) return;
  console.log("[Goberna WA] Opening chat:", phone, text);
  chrome.runtime.sendMessage({ action: "openChat", phone, text });
}

// ── 1. Listen for custom event from React ──
window.addEventListener("goberna:open-whatsapp", (e) => {
  const { phone, text } = e.detail || {};
  sendToBackground(phone, text);
});

// ── 2. Intercept ALL clicks on WhatsApp links ──
document.addEventListener("click", (e) => {
  // Walk up from clicked element to find an <a> or <button> with WA URL
  let el = e.target;
  for (let i = 0; i < 10 && el; i++) {
    // Check <a href="...whatsapp...">
    if (el.tagName === "A" && el.href) {
      const href = el.href;
      if (href.includes("whatsapp.com") || href.includes("wa.me")) {
        e.preventDefault();
        e.stopPropagation();
        const phone = extractPhone(href);
        const text = extractText(href);
        sendToBackground(phone, text);
        return;
      }
    }

    // Check window.open calls triggered by onclick — we handle this via
    // the custom event path, but also check data attributes
    if (el.dataset && el.dataset.waPhone) {
      e.preventDefault();
      e.stopPropagation();
      sendToBackground(el.dataset.waPhone, el.dataset.waText || "");
      return;
    }

    el = el.parentElement;
  }
}, true); // Capture phase — runs BEFORE the default handler

// ── 3. Monkey-patch window.open to intercept WA URLs ──
const _originalOpen = window.open;
window.open = function (url, target, features) {
  if (url && typeof url === "string" && (url.includes("whatsapp.com") || url.includes("wa.me"))) {
    const phone = extractPhone(url);
    const text = extractText(url);
    if (phone) {
      console.log("[Goberna WA] Intercepted window.open:", url);
      sendToBackground(phone, text);
      return null;
    }
  }
  return _originalOpen.call(this, url, target, features);
};
