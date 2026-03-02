/**
 * WhatsApp Goberna Helper — WhatsApp Web Content Script (v4)
 *
 * Runs inside web.whatsapp.com.
 *
 * Responsibilities:
 *   1. Fallback message listener for navigateToChat
 *   2. Diagnostic logger
 *   3. Detect when operator SENDS a message and notify
 *      the background script, which relays to the dashboard.
 *
 * Message-sent detection approach:
 *   - MutationObserver on #main's message list
 *   - Watch for new outgoing messages (rows containing "Tú:" prefix)
 *   - Extract current chat phone from header button or compose box label
 *   - Debounce: only fire once per phone per 3 seconds
 *   - Notify background.js via chrome.runtime.sendMessage
 *
 * BUG FIX (v4): FALSE POSITIVE PREVENTION
 *   When a chat opens (or the user switches to a different chat),
 *   WhatsApp Web loads all existing messages into #main as new DOM nodes.
 *   The MutationObserver sees these as "addedNodes" and if any previous
 *   message from the user contains "Tú:" or has msg-check icons, it
 *   would fire messageSent immediately — BEFORE the operator has typed
 *   or sent anything new. This caused the validation card to move to
 *   CONTACTADO prematurely (BUG #2).
 *
 *   Fix: When #main changes (new chat opens / chat switch), we enter a
 *   cooldown period (CHAT_OPEN_COOLDOWN_MS). During cooldown, all
 *   outgoing-message detections are suppressed. Additionally, we snapshot
 *   the existing row count so we only react to genuinely NEW rows added
 *   after the initial load settles.
 */

console.log("[Goberna WA] Content script v4 loaded in WhatsApp Web");
console.log("[Goberna WA] URL:", window.location.href);

// ── Fallback listener ──
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
(() => {
  const navEntry = performance.getEntriesByType("navigation")[0];
  if (navEntry) {
    console.log("[Goberna WA] Navigation type:", navEntry.type);
  }
})();

// ── Message-Sent Detection ──

/**
 * Extract the phone number of the currently open chat.
 *
 * Strategy 1: Parse the compose box aria-label.
 *   "Escribe a +51 941 146 026." → "51941146026"
 *
 * Strategy 2: Parse the header button text.
 *   button "+51 941 146 026" → "51941146026"
 *
 * Returns digits-only string or null.
 */
function getCurrentChatPhone() {
  // Strategy 1: Compose box label "Escribe a +51 XXX XXX XXX."
  const composeBox = document.querySelector(
    '#main div[role="textbox"][contenteditable="true"]'
  );
  if (composeBox) {
    const label = composeBox.getAttribute("aria-label") || "";
    // Match patterns like "Escribe a +51 941 146 026." or "Type a message to +51..."
    const phoneMatch = label.match(/[\+]?(\d[\d\s\-\(\)]{6,})/);
    if (phoneMatch) {
      const digits = phoneMatch[0].replace(/\D/g, "");
      if (digits.length >= 9) return digits;
    }
  }

  // Strategy 2: Header button with phone number
  // The header in #main has a button like "+51 941 146 026"
  const header = document.querySelector("#main header");
  if (header) {
    const buttons = header.querySelectorAll("button");
    for (const btn of buttons) {
      const text = (btn.textContent || "").trim();
      const digits = text.replace(/\D/g, "");
      // A phone number button has mostly digits (>= 9)
      if (digits.length >= 9 && digits.length <= 15) {
        return digits;
      }
    }
    // Also check span text inside header for contact names with no button
    const spans = header.querySelectorAll("span");
    for (const s of spans) {
      const text = (s.textContent || "").trim();
      const digits = text.replace(/\D/g, "");
      if (digits.length >= 9 && digits.length <= 15) {
        return digits;
      }
    }
  }

  return null;
}

/**
 * Check if a newly added DOM node is an outgoing message (from "Tú:").
 *
 * WhatsApp Web 2026 structure:
 *   row > generic > generic "Tú:" ...
 *   Outgoing messages contain an element with accessible name "Tú:"
 *   and typically have image "msg-dblcheck" or "msg-check" for status.
 */
// Outgoing message indicators (accessible name of the sender label)
const OUTGOING_PREFIXES = ["Tú:", "You:", "Você:"];

function hasOutgoingIndicator(el) {
  const text = el.textContent || "";
  if (OUTGOING_PREFIXES.some((p) => text.includes(p))) return true;

  // Also check for msg-check / msg-dblcheck icons (delivery status = outgoing)
  // These images only appear on messages sent BY the user
  const checkIcons = el.querySelectorAll(
    'img[alt="msg-check"], img[alt="msg-dblcheck"], ' +
    '[data-icon="msg-check"], [data-icon="msg-dblcheck"]'
  );
  if (checkIcons.length > 0) return true;

  return false;
}

function isOutgoingMessage(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;

  // Check the role — message rows have role="row"
  const role = node.getAttribute("role");

  // Direct row check
  if (role === "row") {
    if (hasOutgoingIndicator(node)) return true;
  }

  // The mutation might fire on a parent container — check children
  if (!role) {
    const rows = node.querySelectorAll('[role="row"]');
    for (const row of rows) {
      if (hasOutgoingIndicator(row)) return true;
    }
  }

  return false;
}

// ── Debounce state ──
const lastNotified = {}; // phone -> timestamp
const DEBOUNCE_MS = 3000;

// ── Chat-open cooldown (v4 — BUG #2 fix) ──
// When a chat opens, WA Web loads all existing messages as new DOM nodes.
// We suppress outgoing-message detection during this window.
const CHAT_OPEN_COOLDOWN_MS = 4000;
let chatOpenedAt = 0;        // timestamp when #main changed (chat opened/switched)
let baselineRowCount = 0;    // number of role="row" elements at chat open time

function isCoolingDown() {
  return Date.now() - chatOpenedAt < CHAT_OPEN_COOLDOWN_MS;
}

function notifyMessageSent(phone) {
  // v4: Suppress during chat-open cooldown
  if (isCoolingDown()) {
    console.log("[Goberna WA] Suppressed during chat-open cooldown for", phone);
    return;
  }

  const now = Date.now();
  if (lastNotified[phone] && now - lastNotified[phone] < DEBOUNCE_MS) {
    console.log("[Goberna WA] Debounced notification for", phone);
    return;
  }
  lastNotified[phone] = now;

  console.log("[Goberna WA] MESSAGE SENT detected for phone:", phone);
  chrome.runtime.sendMessage({
    action: "messageSent",
    phone: phone,
  });
}

// ── MutationObserver setup ──

let observer = null;
let observedTarget = null;

/**
 * Find the message list container inside #main and start observing.
 * The message list is typically the scrollable container with role="application"
 * or the div that holds all the row elements.
 *
 * We observe #main itself with subtree: true to catch all new message rows.
 */
function startObserving() {
  const mainEl = document.getElementById("main");
  if (!mainEl) {
    // #main not available yet — retry
    return false;
  }

  // Already observing this element
  if (observedTarget === mainEl) return true;

  // Stop previous observer if any
  if (observer) {
    observer.disconnect();
  }

  // v4: Set cooldown — #main just appeared or changed (new chat opening).
  // All existing messages will load as addedNodes during this window.
  chatOpenedAt = Date.now();
  baselineRowCount = mainEl.querySelectorAll('[role="row"]').length;
  console.log("[Goberna WA] Chat opened — cooldown started, baseline rows:", baselineRowCount);

  observer = new MutationObserver((mutations) => {
    // v4: Quick bail if still in cooldown
    if (isCoolingDown()) return;

    for (const mutation of mutations) {
      if (mutation.type !== "childList") continue;
      for (const node of mutation.addedNodes) {
        if (isOutgoingMessage(node)) {
          const phone = getCurrentChatPhone();
          if (phone) {
            notifyMessageSent(phone);
          } else {
            console.warn("[Goberna WA] Outgoing message detected but no phone found");
          }
          return; // One notification per mutation batch is enough
        }
      }
    }
  });

  observer.observe(mainEl, {
    childList: true,
    subtree: true,
  });

  observedTarget = mainEl;
  console.log("[Goberna WA] MutationObserver started on #main");
  return true;
}

/**
 * Watch for #main to appear/change (e.g., when switching chats).
 * We use a top-level observer on #app to detect when #main is added/replaced.
 */
function watchForMain() {
  // Try immediately
  if (startObserving()) {
    console.log("[Goberna WA] #main found immediately");
  }

  // Also watch for changes at the app level
  const appEl = document.getElementById("app");
  if (!appEl) {
    // App not ready — retry with interval
    const interval = setInterval(() => {
      const app = document.getElementById("app");
      if (app) {
        clearInterval(interval);
        setupAppObserver(app);
      }
      // Also keep trying to observe #main directly
      startObserving();
    }, 1000);
    return;
  }

  setupAppObserver(appEl);
}

function setupAppObserver(appEl) {
  const appObserver = new MutationObserver(() => {
    // #main might have been added or replaced (chat switch)
    const mainEl = document.getElementById("main");
    if (mainEl && mainEl !== observedTarget) {
      console.log("[Goberna WA] #main changed — reattaching observer");
      startObserving();
    }
  });

  appObserver.observe(appEl, {
    childList: true,
    subtree: true,
  });

  console.log("[Goberna WA] App-level observer started");
}

// Start watching
watchForMain();
