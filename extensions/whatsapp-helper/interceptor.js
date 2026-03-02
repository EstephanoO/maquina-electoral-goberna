/**
 * WhatsApp Goberna Helper — Universal Interceptor
 *
 * Runs on EVERY page. Catches any attempt to open a WhatsApp link
 * and routes it through the extension's background script which
 * reuses a single WhatsApp Web tab.
 *
 * Intercepts:
 *   - <a href="https://wa.me/...">
 *   - <a href="https://web.whatsapp.com/send?...">
 *   - <a href="https://api.whatsapp.com/send?...">
 *   - window.open("https://wa.me/...")
 *   - window.open("https://web.whatsapp.com/...")
 *   - window.open("https://api.whatsapp.com/...")
 */

console.log("[Goberna WA] Interceptor loaded on", location.hostname);

const WA_PATTERNS = ["wa.me", "web.whatsapp.com", "api.whatsapp.com"];

function isWhatsAppUrl(url) {
  if (!url || typeof url !== "string") return false;
  return WA_PATTERNS.some((p) => url.includes(p));
}

function extractPhone(url) {
  try {
    const u = new URL(url);
    if (u.hostname === "wa.me") {
      // wa.me/51935629463  or  wa.me/+51935629463
      return u.pathname.replace("/", "").replace(/[^\d]/g, "");
    }
    // web.whatsapp.com/send?phone=51935629463
    // api.whatsapp.com/send?phone=51935629463
    return (u.searchParams.get("phone") || "").replace(/[^\d]/g, "");
  } catch {
    return "";
  }
}

function extractText(url) {
  try {
    return new URL(url).searchParams.get("text") || "";
  } catch {
    return "";
  }
}

function routeToExtension(url) {
  const phone = extractPhone(url);
  if (!phone) return false;
  const text = extractText(url);
  console.log("[Goberna WA] Intercepted →", phone, text);
  chrome.runtime.sendMessage({ action: "openChat", phone, text });
  return true;
}

// ── 1. Intercept link clicks (capture phase — runs first) ──
document.addEventListener(
  "click",
  (e) => {
    let el = e.target;
    // Walk up the DOM to find the actual <a>
    for (let i = 0; i < 15 && el; i++) {
      if (el.tagName === "A" && el.href && isWhatsAppUrl(el.href)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        routeToExtension(el.href);
        return;
      }
      el = el.parentElement;
    }
  },
  true,
);

// ── 2. Intercept window.open ──
const _open = window.open;
window.open = function (url, target, features) {
  if (isWhatsAppUrl(url)) {
    if (routeToExtension(url)) return null;
  }
  return _open.call(this, url, target, features);
};

// ── 3. Intercept dynamically created <a> clicks via auxclick (middle-click) ──
document.addEventListener(
  "auxclick",
  (e) => {
    let el = e.target;
    for (let i = 0; i < 15 && el; i++) {
      if (el.tagName === "A" && el.href && isWhatsAppUrl(el.href)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        routeToExtension(el.href);
        return;
      }
      el = el.parentElement;
    }
  },
  true,
);
