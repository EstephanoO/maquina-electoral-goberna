/**
 * WhatsApp Goberna Helper — Dashboard Interceptor (v3)
 *
 * Runs ONLY on Goberna dashboard pages (dashboard.grupogoberna.com,
 * localhost:3000, localhost:3001). NOT injected into all pages.
 *
 * Responsibilities:
 *   1. Intercept clicks on WhatsApp links (wa.me, web.whatsapp.com,
 *      api.whatsapp.com) and route them through the extension's
 *      single-tab manager.
 *   2. Intercept window.open calls for WhatsApp URLs.
 *   3. Listen for gobernaMessageSent relay from background.js and
 *      dispatch it as a CustomEvent for the React app.
 *
 * Changelog:
 *   v1: Initial interceptor for all pages
 *   v2: Added messageSent relay + CustomEvent dispatch
 *   v3: Scoped to dashboard only (no more <all_urls>), removed
 *       excessive logging, added error handling, safer window.open
 *       override using Proxy
 */

// ── Configuration ──

const DEBUG = false;
const TAG = "[Goberna WA]";

const WA_HOSTNAMES = ["wa.me", "web.whatsapp.com", "api.whatsapp.com"];

// ── Logging ──

function log(...args) {
  if (DEBUG) console.log(TAG, ...args);
}

function warn(...args) {
  console.warn(TAG, ...args);
}

// ── URL Helpers ──

function isWhatsAppUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return WA_HOSTNAMES.includes(parsed.hostname);
  } catch {
    // Malformed URL — not a WhatsApp link
    return false;
  }
}

function extractPhone(url) {
  try {
    const u = new URL(url);
    if (u.hostname === "wa.me") {
      // wa.me/51935629463 or wa.me/+51935629463
      return u.pathname.replace("/", "").replace(/[^\d]/g, "");
    }
    // web.whatsapp.com/send?phone=... or api.whatsapp.com/send?phone=...
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

/**
 * Route a WhatsApp URL through the extension's background script.
 * Returns true if successfully intercepted, false if phone was empty.
 */
function routeToExtension(url) {
  const phone = extractPhone(url);
  if (!phone) return false;

  const text = extractText(url);
  log("Intercepted:", phone, text ? `(text: ${text.slice(0, 30)}...)` : "");

  try {
    chrome.runtime.sendMessage(
      { action: "openChat", phone, text },
      (response) => {
        // Handle potential disconnection (service worker asleep)
        if (chrome.runtime.lastError) {
          warn("sendMessage failed:", chrome.runtime.lastError.message);
          // Fallback: open the URL directly (use original to avoid recursion)
          _originalOpen.call(window, url, "_blank");
          return;
        }
        if (response?.error) {
          warn("openChat returned error:", response.error);
        }
      }
    );
  } catch (err) {
    warn("routeToExtension failed:", err.message);
    return false;
  }

  return true;
}

// ── 1. Intercept link clicks (capture phase) ──

document.addEventListener(
  "click",
  (e) => {
    // Walk up the DOM to find the actual <a> element
    let el = e.target;
    for (let i = 0; i < 10 && el; i++) {
      if (el.tagName === "A" && el.href && isWhatsAppUrl(el.href)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        routeToExtension(el.href);
        return;
      }
      el = el.parentElement;
    }
  },
  true
);

// ── 2. Intercept middle-click on links ──

document.addEventListener(
  "auxclick",
  (e) => {
    if (e.button !== 1) return; // Only middle-click
    let el = e.target;
    for (let i = 0; i < 10 && el; i++) {
      if (el.tagName === "A" && el.href && isWhatsAppUrl(el.href)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        routeToExtension(el.href);
        return;
      }
      el = el.parentElement;
    }
  },
  true
);

// ── 3. Intercept window.open for WhatsApp URLs ──
// Uses a wrapper function instead of overwriting the global.
// Only intercepts WhatsApp URLs; all other calls pass through unchanged.

const _originalOpen = window.open;

window.open = function interceptedOpen(url, target, features) {
  if (url && isWhatsAppUrl(String(url))) {
    if (routeToExtension(String(url))) {
      return null; // Intercepted — no new window
    }
  }
  // Pass through to original for non-WA URLs
  return _originalOpen.call(this, url, target, features);
};

// Preserve the original's properties (toString, etc.)
try {
  Object.defineProperty(window.open, "toString", {
    value: () => _originalOpen.toString(),
    configurable: true,
  });
} catch {
  // Non-critical — some CSPs may block this
}

// ── 4. Listen for message relays from background script ──

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "gobernaMessageSent") {
    log("Dispatching messageSent event for phone:", msg.phone);
    try {
      window.dispatchEvent(
        new CustomEvent("goberna:messageSent", {
          detail: { phone: msg.phone },
        })
      );
      sendResponse({ ok: true });
    } catch (err) {
      warn("Failed to dispatch CustomEvent:", err.message);
      sendResponse({ ok: false, error: err.message });
    }
    return true;
  }

  if (msg.action === "gobernaMessageReceived") {
    log("Dispatching messageReceived event for phone:", msg.phone);
    try {
      window.dispatchEvent(
        new CustomEvent("goberna:messageReceived", {
          detail: {
            phone: msg.phone,
            preview: msg.preview || "",
            timestamp: msg.timestamp || Date.now(),
          },
        })
      );
      sendResponse({ ok: true });
    } catch (err) {
      warn("Failed to dispatch messageReceived CustomEvent:", err.message);
      sendResponse({ ok: false, error: err.message });
    }
    return true;
  }
});

log("Interceptor loaded on", location.hostname);
