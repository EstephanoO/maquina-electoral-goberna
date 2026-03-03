/**
 * WhatsApp Goberna Helper — Background Script (v8.6)
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
 *   Step 3: Clear search input (MAIN) → sleep 150ms → type each char (MAIN×N)
 *   Step 4: Poll until search results appear (ISOLATED)
 *   Step 5: Click first DIV[role="button"] result (ISOLATED)
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
 *         loading state for server-side search. Bump search timeout
 *         from 5s to 8s.
 *   v8.2: Remove synthetic Enter/InputEvent dispatches from stepTypePhone —
 *         execCommand in MAIN world already triggers React search. The extra
 *         Enter was prematurely selecting results before search completed.
 *   v8.3: [SUPERSEDED] trailing space workaround — masked the real issue
 *   v8.4: Fix clear via selectNodeContents + beforeinput + execCommand('delete')
 *   v8.5: Fix result selection — Playwright testing revealed WA renders results
 *         as DIV[role="button"], not <button>. stepCheckSearchResults now detects
 *         these divs. Replace stepSelectResult (Enter key, unreliable) with
 *         stepClickFirstResult (clicks the DIV[role="button"] directly, confirmed
 *         working via Playwright mouse.click on live DOM).
 *   v8.6: Replace bulk execCommand('insertText') with character-by-character typing.
 *         Split stepTypePhone into stepClearSearchInput + stepInsertPhoneChar.
 *         Each char dispatches keydown + beforeinput(insertText) + execCommand +
 *         keyup — the closest approximation to trusted events from extension MAIN
 *         world. Playwright testing confirmed WA Lexical editor requires this full
 *         event sequence to trigger search. 40ms between chars replicates human pace.
 *   v8.7: Fix result selection — replace el.click() (dispatches at 0,0, ignored by
 *         React) with full PointerEvent+MouseEvent sequence using real clientX/clientY
 *         from getBoundingClientRect(). Playwright diagnosis: el.click() from
 *         executeScript is untrusted AND coordinate-less → WA ignores it. The full
 *         mouse event sequence with center coordinates IS processed by React's
 *         synthetic event system via event delegation.
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
  console.log("[Goberna BG] stepClickNuevoChat: clicking nuevo chat button");
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
 * Step 3: Clear + type phone into the search input.
 * Runs in MAIN world — returns void (MAIN limitation).
 *
 * Strategy: bulk execCommand for N-1 digits, then full keystroke sequence
 * for the last digit. Playwright confirmed this triggers WA/Lexical search
 * correctly (bulk alone returns generic list; last keystroke fires debounce).
 */
function stepTypePhone(phone) {
  const LABELS = [
    "Buscar un nombre o número",
    "Search name or number",
    "Pesquisar nome ou número",
  ];

  let input = null;
  for (const label of LABELS) {
    input = document.querySelector(`div[contenteditable="true"][aria-label="${label}"]`);
    if (input) break;
  }

  if (!input) {
    console.log("[Goberna BG] stepTypePhone: input NOT found");
    return;
  }

  // ── 1. Clear ──
  input.focus();
  const range = document.createRange();
  range.selectNodeContents(input);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  input.dispatchEvent(new InputEvent("beforeinput", { inputType: "deleteContentBackward", bubbles: true, cancelable: true }));
  document.execCommand("delete", false, null);
  console.log("[Goberna BG] stepTypePhone: cleared, remaining:", (input.textContent || "").trim() || "(empty)");

  // ── 2. Bulk insert N-1 digits ──
  const bulk = phone.slice(0, -1);
  const last = phone.slice(-1);
  document.execCommand("insertText", false, bulk);
  console.log("[Goberna BG] stepTypePhone: bulk inserted, field now:", (input.textContent || "").trim());

  // ── 3. Last digit via full keystroke sequence — triggers Lexical search debounce ──
  input.dispatchEvent(new KeyboardEvent("keydown", { key: last, bubbles: true, cancelable: true }));
  input.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: last, bubbles: true, cancelable: true }));
  document.execCommand("insertText", false, last);
  input.dispatchEvent(new KeyboardEvent("keyup", { key: last, bubbles: true }));
  console.log("[Goberna BG] stepTypePhone: done, field now:", (input.textContent || "").trim());
}

/**
 * Read the current text content of the search input.
 * Runs in ISOLATED world — used to verify text was inserted.
 */
function stepReadSearchInput() {
  const LABELS = [
    "Buscar un nombre o número",
    "Search name or number",
    "Pesquisar nome ou número",
  ];
  for (const label of LABELS) {
    const input = document.querySelector(`div[contenteditable="true"][aria-label="${label}"]`);
    if (input) return { found: true, text: (input.textContent || "").trim() };
  }
  return { found: false, text: "" };
}

/**
 * Check if search results have appeared after typing.
 * Runs in ISOLATED world — used for polling.
 *
 * Playwright testing on live WA Web 2026 DOM revealed:
 *   - Contact results are DIV[role="button"] elements, NOT native <button>
 *   - The first result div contains the phone number as text content
 *   - "Cancelar búsqueda" <button> appears when search text is registered
 *   - [role="status"] shows "Buscando…" while server search is in progress
 *
 * Returns:
 *   { found: true, count }        — results ready, proceed to click
 *   { found: false, noResults: true } — confirmed no match
 *   { found: false, searching: true } — still searching, keep polling
 *   { found: false }              — not yet in search mode, keep polling
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

  // ── Detect "Buscando…" loading state ──
  const statusEls = app.querySelectorAll('[role="status"]');
  for (const s of statusEls) {
    const txt = (s.textContent || "").toLowerCase();
    if (txt.includes("buscando") || txt.includes("searching") || txt.includes("procurando")) {
      return { found: false, searching: true };
    }
  }

  // ── Confirm we're in search mode via "Cancelar búsqueda" button ──
  const cancelLabels = ["Cancelar búsqueda", "Cancel search", "Cancelar pesquisa"];
  let inSearchMode = false;
  for (const label of cancelLabels) {
    if (app.querySelector(`button[aria-label="${label}"]`)) {
      inSearchMode = true;
      break;
    }
  }
  if (!inSearchMode) {
    return { found: false };
  }

  // ── Look for result DIV[role="button"] elements (contact results) ──
  // Playwright confirmed: WA renders contact results as DIV[role="button"].
  // System actions ("Nuevo grupo", etc.) also use DIV[role="button"] but are
  // excluded by the SKIP_TEXT set. Any remaining div[role=button] IS a contact result —
  // do NOT filter by digits: contacts with saved names have no digits in textContent.
  const SKIP_TEXT = new Set([
    "Nuevo grupo", "Nueva comunidad", "Nuevo contacto",
    "New group", "New community", "New contact",
    "Novo grupo", "Nova comunidade", "Novo contato",
  ]);

  const resultDivs = app.querySelectorAll('div[role="button"]');
  let resultCount = 0;
  for (const div of resultDivs) {
    const text = (div.textContent || "").trim();
    if (text.length < 2) continue;
    if (SKIP_TEXT.has(text)) continue;
    resultCount++;
  }

  if (resultCount > 0) {
    return { found: true, count: resultCount };
  }

  return { found: false };
}

/**
 * Step 5: Click the first result DIV[role="button"] in the search panel.
 * Runs in ISOLATED world.
 *
 * v8.7 — Replace el.click() with full PointerEvent+MouseEvent sequence with
 * real clientX/clientY coordinates. Playwright testing proved:
 *   - el.click() dispatches a synthetic click at (0,0) → WA/React ignores it
 *   - page.mouse.click(x,y) works (trusted) but unavailable from extension
 *   - dispatchEvent(new MouseEvent('click', {clientX, clientY, ...})) with the
 *     element's center coordinates IS processed by React's event delegation
 *     because React reads the coordinates from the event, not just the target
 *
 * Full sequence: pointerover → mouseover → pointermove → mousemove →
 *                pointerdown → mousedown → pointerup → mouseup → click
 */
function stepClickFirstResult() {
  const app = document.querySelector("#app");
  if (!app) {
    console.log("[Goberna BG] stepClickFirstResult: no #app");
    return { clicked: false, reason: "no-app" };
  }

  const SKIP_TEXT = new Set([
    "Nuevo grupo", "Nueva comunidad", "Nuevo contacto",
    "New group", "New community", "New contact",
    "Novo grupo", "Nova comunidade", "Novo contato",
  ]);

  const resultDivs = app.querySelectorAll('div[role="button"]');
  for (const div of resultDivs) {
    const text = (div.textContent || "").trim();
    if (text.length < 2) continue;
    if (SKIP_TEXT.has(text)) continue;
    // Any non-system div[role=button] is a contact result — name OR number.
    {
      console.log("[Goberna BG] stepClickFirstResult: dispatching mouse sequence on:", text.slice(0, 30));

      const rect = div.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const base = {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: cx,
        clientY: cy,
        screenX: cx,
        screenY: cy,
        button: 0,
        buttons: 1,
        view: window,
      };

      div.dispatchEvent(new PointerEvent("pointerover",  base));
      div.dispatchEvent(new PointerEvent("pointerenter", { ...base, bubbles: false }));
      div.dispatchEvent(new MouseEvent("mouseover",  base));
      div.dispatchEvent(new MouseEvent("mouseenter", { ...base, bubbles: false }));
      div.dispatchEvent(new PointerEvent("pointermove", base));
      div.dispatchEvent(new MouseEvent("mousemove",  base));
      div.dispatchEvent(new PointerEvent("pointerdown", base));
      div.dispatchEvent(new MouseEvent("mousedown",  base));
      div.dispatchEvent(new PointerEvent("pointerup", base));
      div.dispatchEvent(new MouseEvent("mouseup",  base));
      div.dispatchEvent(new MouseEvent("click",    base));

      return { clicked: true, text: text.slice(0, 30), cx, cy };
    }
  }

  console.log("[Goberna BG] stepClickFirstResult: no clickable result found");
  return { clicked: false, reason: "no-result-div" };
}

/**
 * Validate that a chat is now open.
 * Runs in ISOLATED world.
 *
 * v8.8 — Search document-wide instead of scoped to #main.
 * Playwright screenshots confirmed: after clicking a result, WA opens the chat
 * but the compose textbox may not be a descendant of #main in all WA versions.
 * Searching document-wide is safer and handles both cases.
 */
function stepValidateChatOpened(phone) {
  const phoneSuffix = phone.replace(/\D/g, "").slice(-6);

  // ── Primary: compose textbox visible anywhere in document ──
  // aria-label starts with "Escribe" / "Type" / "Digite" confirms chat is open.
  const composePrefixes = ["Escribe", "Type", "Digite"];
  const allTextboxes = document.querySelectorAll(
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

  // ── Secondary: header anywhere in document contains the phone suffix ──
  const headers = document.querySelectorAll("header");
  for (const header of headers) {
    const headerDigits = (header.textContent || "").replace(/\D/g, "");
    if (phoneSuffix && headerDigits.includes(phoneSuffix)) {
      return { opened: true, method: "header-match" };
    }
  }

  // ── Fallback: #main exists (unconfirmed but optimistic) ──
  const main = document.querySelector("#main");
  if (main) {
    return { opened: true, method: "main-exists-unconfirmed" };
  }

  return { opened: false, reason: "no-chat-indicators" };
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

  // ── Step 3: Type phone number (MAIN world) ──
  await execStep(tabId, stepTypePhone, [phone], "MAIN");

  // Verify text actually landed in the field before proceeding
  await sleep(150);
  const inputState = await execStep(tabId, stepReadSearchInput);
  console.log("[Goberna BG] attemptNavigation: field after typing →", JSON.stringify(inputState));
  if (!inputState?.text) {
    console.log("[Goberna BG] attemptNavigation: field is empty — aborting");
    return { success: false, reason: "field-empty-after-type" };
  }

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

  // Click the first result DIV[role="button"] (ISOLATED world)
  await execStep(tabId, stepClickFirstResult);

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

    // Wait until the tab actually reports it has focus — execCommand needs real focus
    // to insert text into contenteditable. A fixed sleep is not reliable across machines.
    let focused = false;
    for (let i = 0; i < 10; i++) {
      await sleep(100);
      const [hasFocus] = await chrome.scripting.executeScript({
        target: { tabId: existing.id },
        func: () => document.hasFocus(),
        world: "ISOLATED",
      }).then(r => r.map(x => x.result)).catch(() => [false]);
      console.log(`[Goberna WA] openChat: tab focus check ${i+1}/10 → ${hasFocus}`);
      if (hasFocus) { focused = true; break; }
    }
    if (!focused) console.warn("[Goberna WA] openChat: tab never got focus — typing may fail");

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

/**
 * Relay an inbound message event to all open dashboard tabs (interceptor.js picks it up).
 * Also fires a best-effort POST to the backend to auto-transition hablado → respondieron.
 */
async function relayMessageReceivedToDashboard(phone, preview, timestamp) {
  // 1. Relay to dashboard tabs so the CMS page can react in real-time
  const tabs = await findDashboardTabs();
  log(`Relaying messageReceived (${phone}) to ${tabs.length} dashboard tab(s)`);

  const results = await Promise.allSettled(
    tabs.map((tab) =>
      chrome.tabs.sendMessage(tab.id, {
        action: "gobernaMessageReceived",
        phone,
        preview,
        timestamp,
      })
    )
  );

  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    log(`${failed.length}/${tabs.length} relay(s) failed (tabs may not have content script)`);
  }

  // 2. Fire backend API call to match contact + auto-transition (best-effort, no retry)
  try {
    const stored = await chrome.storage.local.get(["gcms_token", "gcms_campaign_id"]);
    const token = stored.gcms_token;
    const campaignId = stored.gcms_campaign_id;

    if (!token || !campaignId) {
      log("messageReceived backend call skipped — no token or campaign in storage");
      return;
    }

    const baseUrl = "https://api.goberna.us";
    const res = await fetch(`${baseUrl}/api/cms/extension-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "x-campaign-id": String(campaignId),
      },
      body: JSON.stringify({
        type: "message_received",
        phone,
        preview: preview || "",
        detected_at: timestamp || Date.now(),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      log("extension-event response:", data);
    } else {
      const text = await res.text();
      warn("extension-event non-OK:", res.status, text.slice(0, 200));
    }
  } catch (err) {
    // Best-effort — never crash the relay
    warn("extension-event fetch failed:", err.message);
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

    case "messageReceived":
      // Received from content.js when an inbound message is detected on WA Web
      log("messageReceived received from WA tab:", msg.phone, msg.preview?.slice(0, 30));
      relayMessageReceivedToDashboard(msg.phone, msg.preview || "", msg.timestamp || Date.now())
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ error: err.message }));
      return true;

    case "selectSearchResult":
      // CMS panel asks us to click the first search result.
      // Now uses stepClickFirstResult (ISOLATED world) instead of Enter key.
      (async () => {
        try {
          const tabId = sender?.tab?.id;
          if (!tabId) {
            sendResponse({ ok: false, error: "no sender tab" });
            return;
          }
          const result = await execStep(tabId, stepClickFirstResult);
          sendResponse({ ok: result?.clicked ?? false, result });
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
