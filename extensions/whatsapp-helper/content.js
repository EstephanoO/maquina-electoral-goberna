/**
 * WhatsApp Goberna Helper — WhatsApp Web Content Script (v6)
 *
 * Runs inside web.whatsapp.com only.
 *
 * Responsibilities:
 *   1. Detect when the operator SENDS a message in the active chat
 *   2. Detect when the contact RECEIVES a message (inbound message detection)
 *   3. Notify background.js, which relays to dashboard tabs and backend
 *   4. Fallback listener for navigateToChat messages
 *
 * Message detection:
 *   - MutationObserver on #main's subtree
 *   - Outgoing: "Tú:" prefix or delivery status icons (msg-check/msg-dblcheck)
 *   - Incoming: new [role="row"] without outgoing indicators = incoming message
 *   - Extracts current chat phone from compose box label or header
 *   - Chat-open cooldown prevents false positives from initial message load
 *   - Row count baseline ensures only genuinely NEW messages trigger events
 *   - Debounce: one notification per phone per 3 seconds
 *
 * Changelog:
 *   v4: Added chat-open cooldown to prevent false positives (BUG #2)
 *   v5: Actually use baselineRowCount for double-check, periodic cleanup
 *       of debounce map, runtime error handling, debug logging
 *   v6: Added inbound message detection — extracts text preview from incoming
 *       messages and notifies background.js with { action: "messageReceived" }
 */

// ── Configuration ──

const DEBUG = false;
const TAG = "[Goberna WA]";

/** Cooldown after a chat opens before we accept outgoing-message events */
const CHAT_OPEN_COOLDOWN_MS = 4000;

/** Debounce: suppress duplicate notifications for same phone within this window */
const DEBOUNCE_MS = 3000;

/** How often to clean up stale entries from the debounce map */
const DEBOUNCE_CLEANUP_INTERVAL_MS = 60_000;

/** Max age for debounce entries before cleanup (5 minutes) */
const DEBOUNCE_MAX_AGE_MS = 300_000;

/** Outgoing message sender labels across languages */
const OUTGOING_PREFIXES = ["Tú:", "You:", "Você:"];

// ── Logging ──

function log(...args) {
  if (DEBUG) console.log(TAG, ...args);
}

function warn(...args) {
  console.warn(TAG, ...args);
}

// ── Initialization ──

log("Content script v6 loaded");

// ── Fallback listener (for navigateToChat from background) ──

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "navigateToChat") {
    const { phone, text } = msg;
    log("navigateToChat received:", phone);

    try {
      const url = `https://web.whatsapp.com/send?phone=${encodeURIComponent(phone)}${
        text ? `&text=${encodeURIComponent(text)}` : ""
      }`;
      window.location.assign(url);
      sendResponse({ ok: true, method: "content-script-assign" });
    } catch (err) {
      warn("navigateToChat failed:", err.message);
      sendResponse({ ok: false, error: err.message });
    }
    return true;
  }
});

// ── Phone Number Extraction ──

/**
 * Extract the phone number of the currently open chat.
 *
 * Strategy 1: Parse compose box aria-label
 *   "Escribe a +51 941 146 026." -> "51941146026"
 *
 * Strategy 2: Parse header button/span text
 *   "+51 941 146 026" -> "51941146026"
 *
 * Returns digits-only string or null.
 */
function getCurrentChatPhone() {
  // Strategy 1: Compose box label
  const composeBox = document.querySelector(
    '#main div[role="textbox"][contenteditable="true"]'
  );
  if (composeBox) {
    const label = composeBox.getAttribute("aria-label") || "";
    const phoneMatch = label.match(/[+]?(\d[\d\s\-()]{6,})/);
    if (phoneMatch) {
      const digits = phoneMatch[0].replace(/\D/g, "");
      if (digits.length >= 9) return digits;
    }
  }

  // Strategy 2: Header buttons/spans
  const header = document.querySelector("#main header");
  if (header) {
    const elements = header.querySelectorAll("button, span");
    for (const el of elements) {
      const text = (el.textContent || "").trim();
      const digits = text.replace(/\D/g, "");
      if (digits.length >= 9 && digits.length <= 15) {
        return digits;
      }
    }
  }

  return null;
}

// ── Outgoing Message Detection ──

/**
 * Check if an element contains indicators of an outgoing message.
 * Outgoing messages have:
 *   - "Tú:" / "You:" / "Você:" text (sender label)
 *   - msg-check / msg-dblcheck icons (delivery status)
 */
function hasOutgoingIndicator(el) {
  const text = el.textContent || "";
  if (OUTGOING_PREFIXES.some((p) => text.includes(p))) return true;

  // Delivery status icons only appear on outgoing messages
  const checkIcons = el.querySelectorAll(
    'img[alt="msg-check"], img[alt="msg-dblcheck"], ' +
      '[data-icon="msg-check"], [data-icon="msg-dblcheck"]'
  );
  return checkIcons.length > 0;
}

/**
 * Determine if a DOM node represents a new outgoing message.
 */
function isOutgoingMessage(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;

  const role = node.getAttribute?.("role");

  // Direct row check
  if (role === "row" && hasOutgoingIndicator(node)) return true;

  // The mutation might fire on a parent — check child rows
  if (!role) {
    const rows = node.querySelectorAll('[role="row"]');
    for (const row of rows) {
      if (hasOutgoingIndicator(row)) return true;
    }
  }

  return false;
}

// ── Incoming Message Detection ──

/**
 * Extract visible text from a message row DOM node.
 * Targets the message bubble's text span; falls back to full textContent.
 * Returns at most 500 characters.
 */
function extractMessageText(node) {
  // WA message text lives in span[dir="ltr"] or span[class*="selectable-text"]
  const textSpan =
    node.querySelector('span[dir="ltr"]') ||
    node.querySelector('span.selectable-text') ||
    node.querySelector('[class*="message-text"]');

  const raw = textSpan
    ? (textSpan.textContent || "").trim()
    : (node.textContent || "").trim();

  return raw.slice(0, 500);
}

/**
 * Determine if a DOM node represents a new INCOMING message.
 * Incoming messages do NOT have outgoing indicators (delivery icons or "Tú:" prefix).
 * They also must have some meaningful text/media content.
 */
function isIncomingMessage(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;

  const role = node.getAttribute?.("role");

  // Direct row check
  if (role === "row") {
    // Must not be outgoing
    if (hasOutgoingIndicator(node)) return false;
    // Must contain some text content (exclude pure date separators / system messages)
    const text = (node.textContent || "").trim();
    if (text.length < 1) return false;
    // Skip "date separator" rows — these typically contain only a date string
    // WA renders them as [role="row"] with a specific data attribute
    if (node.querySelector('[data-id*="false_"]') === null &&
        node.querySelector('img, video, audio, [data-icon]') === null &&
        text.length < 10) {
      return false;
    }
    return true;
  }

  // The mutation might fire on a parent — check child rows
  if (!role) {
    const rows = node.querySelectorAll('[role="row"]');
    for (const row of rows) {
      if (!hasOutgoingIndicator(row)) {
        const text = (row.textContent || "").trim();
        if (text.length >= 1) return true;
      }
    }
  }

  return false;
}

// ── Debounce State ──

/** Map of phone -> timestamp of last notification */
const lastNotified = new Map();

/**
 * Periodically clean up stale debounce entries to prevent unbounded growth.
 */
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [phone, ts] of lastNotified) {
    if (now - ts > DEBOUNCE_MAX_AGE_MS) {
      lastNotified.delete(phone);
      cleaned++;
    }
  }
  if (cleaned > 0) log(`Cleaned ${cleaned} stale debounce entries`);
}, DEBOUNCE_CLEANUP_INTERVAL_MS);

// ── Chat-Open Cooldown State ──

let chatOpenedAt = 0;
let baselineRowCount = 0;

function isCoolingDown() {
  return Date.now() - chatOpenedAt < CHAT_OPEN_COOLDOWN_MS;
}

// ── Notification ──

function notifyMessageSent(phone) {
  // Suppress during chat-open cooldown
  if (isCoolingDown()) {
    log("Suppressed during cooldown for", phone);
    return;
  }

  // Debounce
  const now = Date.now();
  const lastTs = lastNotified.get(phone);
  if (lastTs && now - lastTs < DEBOUNCE_MS) {
    log("Debounced for", phone);
    return;
  }
  lastNotified.set(phone, now);

  log("MESSAGE SENT detected for phone:", phone);

  try {
    chrome.runtime.sendMessage({
      action: "messageSent",
      phone,
    });
  } catch (err) {
    // Service worker might be asleep — this is non-critical
    warn("Failed to send messageSent to background:", err.message);
  }
}

function notifyMessageReceived(phone, preview) {
  // Suppress during chat-open cooldown — initial messages loading look like new incoming
  if (isCoolingDown()) {
    log("Suppressed incoming during cooldown for", phone);
    return;
  }

  // Debounce — same phone+direction key, share the lastNotified map but prefix key
  const key = `in:${phone}`;
  const now = Date.now();
  const lastTs = lastNotified.get(key);
  if (lastTs && now - lastTs < DEBOUNCE_MS) {
    log("Debounced incoming for", phone);
    return;
  }
  lastNotified.set(key, now);

  log("MESSAGE RECEIVED detected for phone:", phone, "preview:", preview.slice(0, 40));

  try {
    chrome.runtime.sendMessage({
      action: "messageReceived",
      phone,
      preview,
      timestamp: now,
    });
  } catch (err) {
    // Service worker might be asleep — non-critical
    warn("Failed to send messageReceived to background:", err.message);
  }
}

// ── MutationObserver ──

let observer = null;
let observedTarget = null;

/**
 * Find #main and start observing for new outgoing messages.
 * Sets up cooldown + baseline to prevent false positives from initial load.
 */
function startObserving() {
  const mainEl = document.getElementById("main");
  if (!mainEl) return false;

  // Already observing this exact element
  if (observedTarget === mainEl) return true;

  // Disconnect previous observer
  if (observer) {
    observer.disconnect();
    observer = null;
  }

  // Set cooldown — #main just appeared/changed (new chat opening).
  // All existing messages will load as addedNodes during this window.
  chatOpenedAt = Date.now();
  baselineRowCount = mainEl.querySelectorAll('[role="row"]').length;
  log(`Chat opened — cooldown started, baseline rows: ${baselineRowCount}`);

  observer = new MutationObserver((mutations) => {
    // Quick bail during cooldown
    if (isCoolingDown()) return;

    // Double-check: only react if there are MORE rows than baseline
    // This catches edge cases where cooldown expires but initial load
    // mutations are still being processed in the queue.
    const currentRows = mainEl.querySelectorAll('[role="row"]').length;
    if (currentRows <= baselineRowCount) return;

    for (const mutation of mutations) {
      if (mutation.type !== "childList") continue;
      for (const node of mutation.addedNodes) {
        if (isOutgoingMessage(node)) {
          // Update baseline so the same rows don't trigger again
          baselineRowCount = currentRows;

          const phone = getCurrentChatPhone();
          if (phone) {
            notifyMessageSent(phone);
          } else {
            warn("Outgoing message detected but no phone found");
          }
          return; // One notification per mutation batch
        }

        if (isIncomingMessage(node)) {
          // Update baseline
          baselineRowCount = currentRows;

          const phone = getCurrentChatPhone();
          if (phone) {
            // Find the actual row node for text extraction
            const rowNode =
              node.getAttribute?.("role") === "row"
                ? node
                : node.querySelector('[role="row"]') || node;
            const preview = extractMessageText(rowNode);
            notifyMessageReceived(phone, preview);
          } else {
            warn("Incoming message detected but no phone found");
          }
          return; // One notification per mutation batch
        }
      }
    }
  });

  observer.observe(mainEl, {
    childList: true,
    subtree: true,
  });

  observedTarget = mainEl;
  log("MutationObserver started on #main");
  return true;
}

// ── App-Level Watcher ──

/**
 * Watch for #main to appear/change (chat switch, initial load).
 * Uses a top-level observer on #app.
 */
function watchForMain() {
  // Try immediately
  if (startObserving()) {
    log("#main found immediately");
  }

  const appEl = document.getElementById("app");
  if (!appEl) {
    // App not ready — poll until it appears
    const interval = setInterval(() => {
      const app = document.getElementById("app");
      if (app) {
        clearInterval(interval);
        setupAppObserver(app);
      }
      // Also keep trying #main directly
      startObserving();
    }, 1000);
    return;
  }

  setupAppObserver(appEl);
}

function setupAppObserver(appEl) {
  const appObserver = new MutationObserver(() => {
    const mainEl = document.getElementById("main");
    if (mainEl && mainEl !== observedTarget) {
      log("#main changed — reattaching observer");
      startObserving();
    }
  });

  appObserver.observe(appEl, {
    childList: true,
    subtree: true,
  });

  log("App-level observer started");
}

// Start
watchForMain();
