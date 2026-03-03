/**
 * WhatsApp Goberna Helper — Background Script (v8.1)
 *
 * Orchestrates multi-step DOM navigation in WhatsApp Web to open a chat
 * by phone number WITHOUT reloading the page.
 *
 * Architecture:
 *   - ISOLATED world: Can return values, full DOM access, but execCommand
 *     doesn't trigger React state in WA's contenteditable inputs.
 *   - MAIN world: execCommand works for React contenteditable, but
 *     cannot return Promises (results come back as undefined).
 *
 * Navigation flow:
 *   Step 0: Check WhatsApp Web is loaded + logged in (ISOLATED)
 *   Step 1: Click "Nuevo chat" button (ISOLATED)
 *   Step 2: Poll until search input appears (ISOLATED)
 *   Step 3: Type phone number into search (MAIN)
 *   Step 4: Poll until search results appear (ISOLATED)
 *   Step 5: Press Enter to select first result (MAIN)
 *   Step 6: Poll until chat opens (ISOLATED)
 *   Step 7: Pre-fill message text if provided (MAIN)
 *
 * Changelog:
 *   v5.1: Panel-scoped search for "Nuevo chat" button
 *   v5.2: Relaxed SKIP_LABELS — WA embeds icon names as invisible text
 *   v6.0: Discovered .click() creates untrusted events ignored by WA React
 *   v7.0: Use Enter key on search input instead of clicking results
 *   v8.0: Polling replaces fixed sleeps, input validation, error handling,
 *         debug logging, scoped permissions, retry logic improvements
 *   v8.1: Fix search results detection — use <button> elements instead of
 *         wrong role="listitem"/role="option" selectors. Detect "Buscando"
 *         loading state for server-side search. Dispatch InputEvent after
 *         execCommand to reinforce React state update. Bump search timeout
 *         from 5s to 8s.
 */

// ── Configuration ──

const WA_BASE = "https://web.whatsapp.com";

/** Set to true to enable verbose console logging */
const DEBUG = true;

/** Polling configuration */
const POLL_INTERVAL_MS = 250;
const POLL_SEARCH_INPUT_TIMEOUT_MS = 3000;
const POLL_SEARCH_RESULTS_TIMEOUT_MS = 8000;
const POLL_CHAT_OPEN_TIMEOUT_MS = 4000;

/** Dashboard URL patterns for relaying messageSent events */
const DASHBOARD_PATTERNS = [
  "dashboard.grupogoberna.com",
  "localhost:3000",
  "localhost:3001",
];

// ── Logging ──

const TAG = "[Goberna WA]";

function log(...args) {
  if (DEBUG) console.log(TAG, ...args);
}

function warn(...args) {
  console.warn(TAG, ...args);
}

function error(...args) {
  console.error(TAG, ...args);
}

// ── Helpers ──

async function findWaTab() {
  try {
    const tabs = await chrome.tabs.query({ url: `${WA_BASE}/*` });
    const loaded = tabs.find((t) => t.status === "complete");
    return loaded || tabs[0] || null;
  } catch (err) {
    warn("findWaTab failed:", err.message);
    return null;
  }
}

function buildSendUrl(phone, text) {
  let url = `${WA_BASE}/send?phone=${encodeURIComponent(phone)}`;
  if (text) url += `&text=${encodeURIComponent(text)}`;
  return url;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Strip Peru country code (51) from phone number for local search.
 * WhatsApp search works better with local 9-digit numbers.
 *
 * Examples:
 *   "51955135507"  -> "955135507"
 *   "955135507"    -> "955135507"
 *   "+51955135507" -> "955135507"
 *   ""             -> ""
 */
function toLocalPhone(phone) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  // Peru numbers: country code 51, local 9 digits starting with 9
  if (digits.length === 11 && digits.startsWith("51") && digits[2] === "9") {
    return digits.slice(2);
  }
  return digits;
}

/**
 * Validate a phone string has enough digits to be a real number.
 * Returns the cleaned digits or null if invalid.
 */
function validatePhone(phone) {
  if (!phone || typeof phone !== "string") return null;
  const digits = phone.replace(/\D/g, "");
  // Minimum 7 digits (some landlines), maximum 15 (ITU-T E.164)
  if (digits.length < 7 || digits.length > 15) return null;
  return digits;
}

// ── Step Functions (injected into WhatsApp Web tab) ──

/**
 * Step 0: Check if WhatsApp Web is fully loaded and logged in.
 * Runs in ISOLATED world.
 */
function stepCheckReady() {
  // QR/login screen detection
  const canvas = document.querySelector("canvas");
  const linkDevice = document.querySelector("div[data-ref]");
  if (canvas || linkDevice) {
    return { ready: false, reason: "login-screen" };
  }

  // #side is the main chat list panel — indicates logged in + loaded
  const side = document.querySelector("#side");
  if (!side) {
    return { ready: false, reason: "not-loaded" };
  }

  return { ready: true };
}

/**
 * Step 1: Click the "Nuevo chat" button.
 * Runs in ISOLATED world — DOM click() works on buttons.
 */
function stepClickNuevoChat() {
  const labels = ["Nuevo chat", "New chat", "Chat nuevo", "Nova conversa"];
  for (const label of labels) {
    const btn = document.querySelector(`button[aria-label="${label}"]`);
    if (btn) {
      btn.click();
      return { clicked: true, target: `aria-label="${label}"` };
    }
  }

  // Fallback: find the new-chat icon and walk up to its button
  const icon = document.querySelector('span[data-icon="new-chat-outline"]');
  if (icon) {
    let el = icon;
    for (let i = 0; i < 6; i++) {
      el = el.parentElement;
      if (!el) break;
      if (el.tagName === "BUTTON" || el.getAttribute("role") === "button") {
        el.click();
        return { clicked: true, target: "data-icon parent" };
      }
    }
    // Last resort: click the icon itself
    icon.click();
    return { clicked: true, target: "data-icon direct" };
  }

  return { clicked: false, reason: "button-not-found" };
}

/**
 * Check if the "Nuevo chat" search input is visible.
 * Runs in ISOLATED world — used for polling.
 */
function stepCheckSearchInput() {
  const searchLabels = [
    "Buscar un nombre o número",
    "Search name or number",
    "Pesquisar nome ou número",
  ];
  for (const label of searchLabels) {
    const input = document.querySelector(
      `div[role="textbox"][aria-label="${label}"]`
    );
    if (input) return { found: true, label };
  }

  // Fallback: data-tab="3" textbox that isn't the main search bar
  const candidates = document.querySelectorAll(
    'div[role="textbox"][contenteditable="true"][data-tab="3"]'
  );
  for (const c of candidates) {
    const label = c.getAttribute("aria-label") || "";
    if (!label.includes("búsqueda") && !label.includes("search")) {
      return { found: true, label: "data-tab-3-fallback" };
    }
  }

  return { found: false };
}

/**
 * Step 3: Type phone number into the "Nuevo chat" search input.
 * Runs in MAIN world — execCommand needed for React contenteditable.
 * Returns void (MAIN world limitation).
 */
function stepTypePhone(phone) {
  const searchLabels = [
    "Buscar un nombre o número",
    "Search name or number",
    "Pesquisar nome ou número",
  ];

  let input = null;
  for (const label of searchLabels) {
    input = document.querySelector(`div[role="textbox"][aria-label="${label}"]`);
    if (input) break;
  }

  // Fallback: data-tab="3" textbox
  if (!input) {
    const candidates = document.querySelectorAll(
      'div[role="textbox"][contenteditable="true"][data-tab="3"]'
    );
    for (const c of candidates) {
      const label = c.getAttribute("aria-label") || "";
      if (!label.includes("búsqueda") && !label.includes("search")) {
        input = c;
        break;
      }
    }
  }

  if (!input) return;

  input.focus();
  document.execCommand("selectAll", false, null);
  document.execCommand("delete", false, null);
  document.execCommand("insertText", false, phone);

  // Reinforce with synthetic InputEvent — React's event system may not
  // pick up execCommand alone on contenteditable divs. This ensures the
  // internal state updates and triggers the search query.
  try {
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: phone,
      })
    );
  } catch (_) {
    // InputEvent constructor not available in very old browsers — safe to ignore
  }
}

/**
 * Check if search results have appeared after typing.
 * Runs in ISOLATED world — used for polling.
 *
 * WhatsApp Web 2026 DOM structure for "Nuevo chat" panel:
 *   - The panel contains a search textbox + result buttons as siblings
 *   - Results are native <button> elements (NOT div[role="listitem/option"])
 *   - A [role="status"] element shows "Buscando fuera de tus contactos…"
 *     while the server search is in progress
 *   - "Cancelar búsqueda" button appears when search text is typed
 *   - Non-contact buttons exist: "Nuevo grupo", "Nuevo contacto", etc.
 *   - Contact result buttons contain phone digits or profile images
 *
 * Returns:
 *   { found: true, count, method }  — results ready, proceed to Enter
 *   { found: false, noResults: true } — confirmed no match
 *   { found: false, searching: true } — still searching, keep polling
 *   { found: false }                  — unknown state, keep polling
 */
function stepCheckSearchResults() {
  const app = document.querySelector("#app");
  if (!app) return { found: false };

  // ── Check for "no results" indicator ──
  const noResults = app.querySelector(
    'span[data-icon="search-no-results"], span[data-icon="no-results"]'
  );
  if (noResults) {
    return { found: false, noResults: true };
  }

  // ── Detect "Buscando fuera de tus contactos…" loading state ──
  // This is a [role="status"] element with live="polite"
  const statusEls = app.querySelectorAll('[role="status"]');
  for (const s of statusEls) {
    const txt = (s.textContent || "").toLowerCase();
    if (txt.includes("buscando") || txt.includes("searching") || txt.includes("procurando")) {
      return { found: false, searching: true };
    }
  }

  // ── Check for "Cancelar búsqueda" to confirm we're in search mode ──
  // This is reliable evidence that the search input has text
  const cancelLabels = ["Cancelar búsqueda", "Cancel search", "Cancelar pesquisa"];
  let inSearchMode = false;
  for (const label of cancelLabels) {
    if (app.querySelector(`button[aria-label="${label}"]`)) {
      inSearchMode = true;
      break;
    }
  }
  if (!inSearchMode) {
    // Search may not have registered yet — keep polling
    return { found: false };
  }

  // ── Look for result <button> elements ──
  // After "Cancelar búsqueda" exists, any button that isn't a known
  // system button ("Nuevo grupo", "Nuevo contacto", "Nueva comunidad",
  // "Cancelar búsqueda", "Atrás", "Número de teléfono") is a result.
  const SKIP_LABELS = new Set([
    // Spanish
    "Nuevo chat", "Nuevo grupo", "Nuevo contacto", "Nueva comunidad",
    "Cancelar búsqueda", "Atrás", "Número de teléfono",
    // English
    "New chat", "New group", "New contact", "New community",
    "Cancel search", "Back", "Phone number",
    // Portuguese
    "Chat novo", "Novo grupo", "Novo contato", "Nova comunidade",
    "Cancelar pesquisa", "Voltar", "Número de telefone",
  ]);

  // We scope to all buttons in the app — the "Nuevo chat" panel puts
  // result buttons as direct descendants of the panel container.
  const allButtons = app.querySelectorAll("button");
  let resultCount = 0;
  for (const btn of allButtons) {
    const ariaLabel = (btn.getAttribute("aria-label") || "").trim();
    const textContent = (btn.textContent || "").trim();

    // Skip known non-result buttons by aria-label
    if (ariaLabel && SKIP_LABELS.has(ariaLabel)) continue;

    // Skip buttons with very short or empty text (icon-only buttons)
    if (textContent.length < 3) continue;

    // Skip buttons whose full text matches a skip label
    if (SKIP_LABELS.has(textContent)) continue;

    // A contact/phone result button will either:
    //   a) Contain digits (phone number), or
    //   b) Have an <img> child (profile photo), or
    //   c) Have a "Usuarios que no están en tus contactos" section nearby
    const hasDigits = /\d{3,}/.test(textContent);
    const hasImg = btn.querySelector("img") !== null;

    if (hasDigits || hasImg) {
      resultCount++;
    }
  }

  if (resultCount > 0) {
    return { found: true, count: resultCount, method: "button-search" };
  }

  // In search mode, cancel exists, no loading indicator, but no results yet.
  // Could be an empty result about to show "no results" icon, or results
  // haven't rendered yet. Keep polling briefly.
  return { found: false };
}

/**
 * Step 5: Press Enter on the search input to select first result.
 * Runs in MAIN world — fire-and-forget.
 *
 * Enter on the contenteditable search input selects the first result.
 * This works because WA handles keydown on the input directly,
 * unlike mouse clicks which are filtered by isTrusted checks.
 */
function stepSelectResult() {
  console.log("[Goberna BG] stepSelectResult: searching for search input");

  // Try multiple selectors to find the search input in "Nuevo chat" panel
  const selectors = [
    'div[role="textbox"][aria-label="Buscar un nombre o número"]',
    'div[role="textbox"][aria-label="Search name or number"]',
    'div[role="textbox"][aria-label="Pesquisar nome ou número"]',
    'div[role="textbox"][contenteditable="true"][aria-label]',
    'div._akav[data-tab]',
    'div[aria-label*="Buscar"]',
    'input[placeholder*="Buscar"]',
    'input[placeholder*="Search"]',
  ];

  let input = null;
  for (const sel of selectors) {
    input = document.querySelector(sel);
    if (input) {
      console.log("[Goberna BG] stepSelectResult: found input with selector:", sel);
      break;
    }
  }

  if (!input) {
    console.log("[Goberna BG] stepSelectResult: input not found, checking what's in DOM");
    // Log what's in the DOM for debugging
    const textboxes = document.querySelectorAll('div[role="textbox"]');
    console.log("[Goberna BG] Found textboxes:", textboxes.length);
    return;
  }

  input.focus();
  console.log("[Goberna BG] stepSelectResult: dispatching Enter key");

  const enterProps = {
    key: "Enter",
    code: "Enter",
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true,
  };

  input.dispatchEvent(new KeyboardEvent("keydown", enterProps));
  input.dispatchEvent(new KeyboardEvent("keypress", enterProps));
  input.dispatchEvent(new KeyboardEvent("keyup", enterProps));
  console.log("[Goberna BG] stepSelectResult: Enter dispatched");
}

/**
 * Validate that a chat is now open.
 * Runs in ISOLATED world.
 */
function stepValidateChatOpened(phone) {
  const phoneSuffix = phone.slice(-6);

  const main = document.querySelector("#main");
  if (!main) {
    return { opened: false, reason: "no-main" };
  }

  // Check header for the phone number
  const header = main.querySelector("header");
  if (header) {
    const headerDigits = (header.textContent || "").replace(/\D/g, "");
    if (headerDigits.includes(phoneSuffix)) {
      return { opened: true, method: "header-match" };
    }
  }

  // Check for compose box (indicates chat is open and interactive)
  const composePrefixes = ["Escribe", "Type", "Digite"];
  const allTextboxes = main.querySelectorAll(
    'div[role="textbox"][contenteditable="true"]'
  );
  for (const box of allTextboxes) {
    const label = box.getAttribute("aria-label") || "";
    for (const prefix of composePrefixes) {
      if (label.startsWith(prefix)) {
        return { opened: true, method: "compose-box" };
      }
    }
  }

  // #main exists but could be from a previous chat — cautious success
  return { opened: true, method: "main-exists-unconfirmed" };
}

/**
 * Pre-fill message text in the compose box.
 * Runs in MAIN world.
 */
function stepTypeMessage(text) {
  if (!text) return;

  const composePrefixes = ["Escribe", "Type", "Digite"];

  let input = null;

  // Find compose box by aria-label prefix (not the search input)
  const allTextboxes = document.querySelectorAll(
    'div[role="textbox"][contenteditable="true"]'
  );
  for (const box of allTextboxes) {
    const label = box.getAttribute("aria-label") || "";
    for (const prefix of composePrefixes) {
      if (
        label.startsWith(prefix) &&
        !label.includes("Buscar") &&
        !label.includes("Search")
      ) {
        input = box;
        break;
      }
    }
    if (input) break;
  }

  // Fallback: textbox inside #main footer or #main
  if (!input) {
    input = document.querySelector(
      '#main footer div[role="textbox"][contenteditable="true"]'
    );
  }
  if (!input) {
    input = document.querySelector(
      '#main div[role="textbox"][contenteditable="true"]'
    );
  }

  if (!input) return;

  input.focus();
  document.execCommand("selectAll", false, null);
  document.execCommand("delete", false, null);
  document.execCommand("insertText", false, text);
}

// ── Script Execution ──

/**
 * Execute a function in the given world on a tab.
 * Returns the result for ISOLATED, undefined for MAIN.
 */
async function execStep(tabId, func, args = [], world = "ISOLATED") {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func,
      args,
      world,
    });
    return results?.[0]?.result ?? null;
  } catch (err) {
    warn(`execStep failed (${world}):`, err.message);
    return null;
  }
}

/**
 * Poll a condition by repeatedly running a check function in ISOLATED world.
 * Returns the first truthy check result, or null on timeout.
 *
 * The poller recognizes two "keep waiting" signals from check functions:
 *   - { searching: true } — active server-side search in progress
 *   - { noResults: true } — confirmed no match (returns immediately)
 */
async function pollCondition(tabId, checkFunc, args, timeoutMs, description) {
  const start = Date.now();
  let lastResult = null;
  let searchingLogged = false;

  while (Date.now() - start < timeoutMs) {
    lastResult = await execStep(tabId, checkFunc, args, "ISOLATED");

    // Success conditions
    if (lastResult && lastResult.found) {
      log(`Poll "${description}" succeeded in ${Date.now() - start}ms`);
      return lastResult;
    }
    if (lastResult && lastResult.opened) {
      log(`Poll "${description}" succeeded in ${Date.now() - start}ms`);
      return lastResult;
    }

    // Early exit: confirmed no results
    if (lastResult && lastResult.noResults) {
      log(`Poll "${description}": no results confirmed in ${Date.now() - start}ms`);
      return lastResult;
    }

    // Still searching (server-side) — log once, keep polling
    if (lastResult && lastResult.searching && !searchingLogged) {
      log(`Poll "${description}": server-side search in progress...`);
      searchingLogged = true;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  log(`Poll "${description}" timed out after ${timeoutMs}ms`);
  return lastResult;
}

// ── Navigation Orchestrator ──

/**
 * Attempt to navigate to a chat using a specific phone format.
 * Returns { success: true, method: string } or { success: false }.
 */
async function attemptNavigation(tabId, phone, text, isRetry) {
  // If retry, we need to reopen "Nuevo chat" panel
  if (isRetry) {
    const clickResult = await execStep(tabId, stepClickNuevoChat);
    if (!clickResult?.clicked) {
      return { success: false, reason: "nuevo-chat-failed-on-retry" };
    }

    // Poll for search input
    const searchReady = await pollCondition(
      tabId,
      stepCheckSearchInput,
      [],
      POLL_SEARCH_INPUT_TIMEOUT_MS,
      "search input (retry)"
    );
    if (!searchReady?.found) {
      return { success: false, reason: "search-input-not-found-on-retry" };
    }
  }

  // Type the phone number (MAIN world)
  await execStep(tabId, stepTypePhone, [phone], "MAIN");

  // Poll for search results
  const results = await pollCondition(
    tabId,
    stepCheckSearchResults,
    [],
    POLL_SEARCH_RESULTS_TIMEOUT_MS,
    `search results for "${phone}"`
  );

  if (results?.noResults) {
    log(`No search results for "${phone}"`);
    return { success: false, reason: "no-results" };
  }

  // Press Enter to select first result (MAIN world)
  await execStep(tabId, stepSelectResult, [], "MAIN");

  // Poll for chat to open
  const validation = await pollCondition(
    tabId,
    stepValidateChatOpened,
    [phone],
    POLL_CHAT_OPEN_TIMEOUT_MS,
    "chat open"
  );

  if (!validation?.opened) {
    return { success: false, reason: "chat-did-not-open" };
  }

  // Pre-fill message text if provided
  if (text) {
    // Small delay to let chat fully render compose box
    await sleep(300);
    await execStep(tabId, stepTypeMessage, [text], "MAIN");
  }

  return { success: true, method: validation.method };
}

/**
 * Navigate WhatsApp Web to a specific chat — NO RELOAD.
 *
 * Tries multiple phone formats with progressive fallback:
 *   1. Local number (e.g., 955135507)
 *   2. Full number with country code (e.g., 51955135507)
 *   3. Full number with + prefix (e.g., +51955135507)
 *   4. URL fallback (causes page reload but always works)
 */
async function navigateInPlace(tabId, rawPhone, text) {
  const localPhone = toLocalPhone(rawPhone);
  const fullDigits = rawPhone.replace(/\D/g, "");
  log(`navigateInPlace: raw=${rawPhone} local=${localPhone} full=${fullDigits}`);

  // ── Step 0: Check readiness ──
  const ready = await execStep(tabId, stepCheckReady);
  if (!ready?.ready) {
    const reason = ready?.reason || "unknown";
    log(`Not ready (${reason}) — URL fallback`);
    await chrome.tabs.update(tabId, { url: buildSendUrl(fullDigits, text) });
    return `url-fallback-${reason}`;
  }

  // ── Step 1: Click "Nuevo chat" ──
  const clickResult = await execStep(tabId, stepClickNuevoChat);
  if (!clickResult?.clicked) {
    warn("Failed to click Nuevo chat — URL fallback");
    await chrome.tabs.update(tabId, { url: buildSendUrl(fullDigits, text) });
    return "url-fallback-no-nuevo-chat";
  }

  // ── Step 2: Poll for search input ──
  const searchReady = await pollCondition(
    tabId,
    stepCheckSearchInput,
    [],
    POLL_SEARCH_INPUT_TIMEOUT_MS,
    "search input"
  );

  if (!searchReady?.found) {
    warn("Search input never appeared — URL fallback");
    await chrome.tabs.update(tabId, { url: buildSendUrl(fullDigits, text) });
    return "url-fallback-no-search-input";
  }

  // ── Attempt 1: Local phone number ──
  let result = await attemptNavigation(tabId, localPhone, text, false);
  if (result.success) {
    log("Chat opened via local phone");
    return "dom-search-local";
  }

  // ── Attempt 2: Full phone number (if different from local) ──
  if (fullDigits !== localPhone) {
    log("Retrying with full number:", fullDigits);
    result = await attemptNavigation(tabId, fullDigits, text, true);
    if (result.success) {
      log("Chat opened via full number");
      return "dom-search-full";
    }
  }

  // ── Attempt 3: Full number with + prefix ──
  const withPlus = `+${fullDigits}`;
  log("Retrying with + prefix:", withPlus);
  result = await attemptNavigation(tabId, withPlus, text, true);
  if (result.success) {
    log("Chat opened via + prefix");
    return "dom-search-plus";
  }

  // ── Final fallback: URL navigation ──
  warn("All DOM attempts failed — URL fallback");
  await chrome.tabs.update(tabId, { url: buildSendUrl(fullDigits, text) });
  return "url-fallback-all-failed";
}

// ── Public API ──

/**
 * Open a chat in WhatsApp Web by phone number.
 * Reuses existing tab if available, creates new one otherwise.
 */
async function openChat(phone, text) {
  // Validate phone
  const cleanPhone = validatePhone(phone);
  if (!cleanPhone) {
    // No phone = just open/focus WhatsApp Web
    const existing = await findWaTab();
    if (existing) {
      await chrome.tabs.update(existing.id, { active: true });
      await chrome.windows.update(existing.windowId, { focused: true });
      return { reused: true, tabId: existing.id, method: "focus-only" };
    }
    const newTab = await chrome.tabs.create({ url: WA_BASE, active: true });
    return { reused: false, tabId: newTab.id, method: "new-tab-no-phone" };
  }

  const existing = await findWaTab();

  if (existing) {
    // Focus the existing tab + window
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });

    // Brief pause to let focus settle before injecting scripts
    await sleep(300);

    const method = await navigateInPlace(existing.id, cleanPhone, text || "");
    log(`Reused tab ${existing.id}, method: ${method}`);
    return { reused: true, tabId: existing.id, method };
  }

  // No existing tab — create with /send URL
  const url = buildSendUrl(cleanPhone, text);
  const newTab = await chrome.tabs.create({ url, active: true });
  log(`Created new tab ${newTab.id}`);
  return { reused: false, tabId: newTab.id, method: "new-tab" };
}

// ── Dashboard Relay ──

function isDashboardUrl(url) {
  if (!url) return false;
  return DASHBOARD_PATTERNS.some((p) => url.includes(p));
}

async function findDashboardTabs() {
  try {
    const allTabs = await chrome.tabs.query({});
    return allTabs.filter((t) => isDashboardUrl(t.url));
  } catch (err) {
    warn("findDashboardTabs failed:", err.message);
    return [];
  }
}

/**
 * Relay a messageSent event to all open dashboard tabs.
 * The interceptor.js running on those tabs dispatches it
 * as a CustomEvent for the React app to consume.
 */
async function relayMessageSentToDashboard(phone) {
  const tabs = await findDashboardTabs();
  log(`Relaying messageSent (${phone}) to ${tabs.length} dashboard tab(s)`);

  const results = await Promise.allSettled(
    tabs.map((tab) =>
      chrome.tabs.sendMessage(tab.id, {
        action: "gobernaMessageSent",
        phone,
      })
    )
  );

  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    log(`${failed.length}/${tabs.length} relay(s) failed (tabs may not have content script)`);
  }
}

// ── Message Handler ──

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg?.action) {
    sendResponse({ error: "missing action" });
    return false;
  }

  switch (msg.action) {
    case "openChat":
      openChat(msg.phone, msg.text)
        .then(sendResponse)
        .catch((err) => {
          error("openChat error:", err);
          sendResponse({ error: err.message });
        });
      return true; // keep channel open for async response

    case "getStatus":
      findWaTab()
        .then((tab) => {
          sendResponse({ open: !!tab, tabId: tab?.id ?? null });
        })
        .catch((err) => {
          sendResponse({ open: false, error: err.message });
        });
      return true;

    case "messageSent":
      // Received from content.js on WhatsApp Web
      log("messageSent received from WA tab:", msg.phone);
      relayMessageSentToDashboard(msg.phone)
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ error: err.message }));
      return true;

    case "selectSearchResult":
      // CMS panel asks us to press Enter on the WA search input in MAIN world.
      // Content scripts run in ISOLATED world where synthetic keyboard events are
      // untrusted and ignored by WA's React. MAIN world events work.
      (async () => {
        try {
          const tabId = sender?.tab?.id;
          if (!tabId) {
            sendResponse({ ok: false, error: "no sender tab" });
            return;
          }
          await execStep(tabId, stepSelectResult, [], "MAIN");
          sendResponse({ ok: true });
        } catch (err) {
          error("selectSearchResult error:", err);
          sendResponse({ ok: false, error: err.message });
        }
      })();
      return true;

    case "cmsLogin":
      // Login from CMS panel — proxy to backend to avoid CORS
      (async () => {
        try {
          const baseUrl = msg.baseUrl || "https://api.goberna.us";
          const res = await fetch(`${baseUrl}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifier: msg.email, password: msg.password }),
          });
          const data = await res.json();
          if (!res.ok) {
            sendResponse({ ok: false, status: res.status, error: data.message || data.error || "Login failed" });
          } else {
            sendResponse({ ok: true, data });
          }
        } catch (err) {
          error("cmsLogin error:", err);
          sendResponse({ ok: false, error: err.message });
        }
      })();
      return true;

    case "cmsApiProxy":
      // Generic API proxy for CMS panel — avoids CORS restrictions
      // msg: { method, url, body?, headers? }
      (async () => {
        try {
          const fetchOpts = {
            method: msg.method || "GET",
            headers: msg.headers || {},
          };
          if (msg.body && msg.method !== "GET") {
            fetchOpts.body = typeof msg.body === "string" ? msg.body : JSON.stringify(msg.body);
            if (!fetchOpts.headers["Content-Type"]) {
              fetchOpts.headers["Content-Type"] = "application/json";
            }
          }
          const res = await fetch(msg.url, fetchOpts);

          // Handle SSE streams — can't proxy EventSource, return indicator
          const contentType = res.headers.get("content-type") || "";
          if (contentType.includes("text/event-stream")) {
            sendResponse({ ok: true, stream: true, status: res.status });
            return;
          }

          const text = await res.text();
          let data;
          try {
            data = JSON.parse(text);
          } catch (_) {
            data = text;
          }

          sendResponse({ ok: res.ok, status: res.status, data });
        } catch (err) {
          error("cmsApiProxy error:", err);
          sendResponse({ ok: false, error: err.message });
        }
      })();
      return true;

    default:
      sendResponse({ error: `unknown action: ${msg.action}` });
      return false;
  }
});
