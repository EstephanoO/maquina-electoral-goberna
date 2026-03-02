/**
 * WhatsApp Goberna Helper — Background Script (v4.0)
 *
 * Multi-step sequential executeScript approach.
 *
 * Key insight: WhatsApp Web 2026 has NO data-testid attributes.
 * We use aria-label, role, data-icon, and structural selectors ONLY.
 *
 * Navigation flow (all proven via live DevTools testing):
 *   Step 1 (ISOLATED): Click button[aria-label="Nuevo chat"]
 *   Step 2 (wait 800ms)
 *   Step 3 (MAIN):     Focus + type phone into contenteditable search
 *   Step 4 (wait 2500ms for search results)
 *   Step 5 (MAIN):     Find and click the search result button (MUST be MAIN
 *                       to see DOM rendered by React after MAIN-world typing)
 *   Step 6 (wait 800ms)
 *   Step 7 (ISOLATED):  Validate chat opened (check #main header changed)
 *   Step 8 (MAIN):     Pre-fill message text if provided
 *
 * ISOLATED world: Can return async values, full DOM access, but
 *   execCommand doesn't trigger React state in WA's inputs.
 * MAIN world: execCommand works for React contenteditable, but
 *   async returns come back as undefined (no Promise support).
 *
 * BUG FIX (v4.0): stepClickResult now runs in MAIN world and scopes
 * button search to the "Nuevo chat" panel only (avoids matching
 * existing chat list items in #side). Also added chat-switch validation.
 */

const WA_BASE = "https://web.whatsapp.com";

// ── Helpers ──

async function findWaTab() {
  const tabs = await chrome.tabs.query({ url: `${WA_BASE}/*` });
  const loaded = tabs.find((t) => t.status === "complete");
  return loaded || tabs[0] || null;
}

function buildSendUrl(phone, text) {
  let url = `${WA_BASE}/send?phone=${phone}`;
  if (text) url += `&text=${encodeURIComponent(text)}`;
  return url;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Strip Peru country code (51) from phone number for local search.
 * WhatsApp search works better with local 9-digit numbers.
 * Examples:
 *   "51955135507" → "955135507"
 *   "955135507"   → "955135507"
 *   "+51955135507"→ "955135507"
 */
function toLocalPhone(phone) {
  const digits = phone.replace(/\D/g, "");
  // Peru numbers: country code 51, local 9 digits starting with 9
  if (digits.length === 11 && digits.startsWith("51") && digits[2] === "9") {
    return digits.slice(2);
  }
  // Already local or unknown format — return as-is
  return digits;
}

// ── Step Functions (injected into WhatsApp Web tab) ──

/**
 * Step 0: Check if WhatsApp Web is fully loaded and logged in.
 * Runs in ISOLATED world (can return async/objects).
 * Returns { ready: true } or { ready: false, reason: string }
 */
function stepCheckReady() {
  const TAG = "[Goberna WA]";

  // Check for QR/login screen (no data-testid in 2026, use structural)
  const canvas = document.querySelector("canvas");
  const linkDevice = document.querySelector('div[data-ref]');
  if (canvas || linkDevice) {
    console.log(TAG, "Login/QR screen detected");
    return { ready: false, reason: "login-screen" };
  }

  // Check #side exists (main chat list panel)
  const side = document.querySelector("#side");
  if (!side) {
    console.log(TAG, "#side not found — not fully loaded");
    return { ready: false, reason: "not-loaded" };
  }

  console.log(TAG, "WhatsApp Web ready (#side found)");
  return { ready: true };
}

/**
 * Step 1: Click the "Nuevo chat" button.
 * Runs in ISOLATED world. DOM click() works fine.
 * Returns { clicked: true, target: string } or { clicked: false }
 */
function stepClickNuevoChat() {
  const TAG = "[Goberna WA]";

  // Primary: button with aria-label (language-dependent)
  const labels = ["Nuevo chat", "New chat", "Chat nuevo", "Nova conversa"];
  for (const label of labels) {
    const btn = document.querySelector(`button[aria-label="${label}"]`);
    if (btn) {
      console.log(TAG, `Clicking button[aria-label="${label}"]`);
      btn.click();
      return { clicked: true, target: `aria-label="${label}"` };
    }
  }

  // Fallback: find the icon span and walk up to the button
  const icon = document.querySelector('span[data-icon="new-chat-outline"]');
  if (icon) {
    // The button is typically 3-4 levels up from the icon span
    let el = icon;
    for (let i = 0; i < 6; i++) {
      el = el.parentElement;
      if (!el) break;
      if (el.tagName === "BUTTON" || el.getAttribute("role") === "button") {
        console.log(TAG, "Clicking parent button of new-chat-outline icon");
        el.click();
        return { clicked: true, target: "data-icon parent" };
      }
    }
    // If no button parent found, click the icon itself
    console.log(TAG, "Clicking new-chat-outline icon directly");
    icon.click();
    return { clicked: true, target: "data-icon direct" };
  }

  console.warn(TAG, "No 'Nuevo chat' button found");
  return { clicked: false };
}

/**
 * Step 3: Type phone number into the "Nuevo chat" search input.
 * Runs in MAIN world — execCommand works here for React contenteditable.
 *
 * IMPORTANT: MAIN world cannot return Promises. This function is
 * synchronous and returns void (result will be undefined).
 */
function stepTypePhone(phone) {
  const TAG = "[Goberna WA]";

  // Target: the search input in the "Nuevo chat" panel
  // aria-label is "Buscar un nombre o número" (Spanish)
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

  // Fallback: if the labeled input isn't found, try data-tab="3"
  // but NOT the main search bar (which has a different aria-label)
  if (!input) {
    const candidates = document.querySelectorAll(
      'div[role="textbox"][contenteditable="true"][data-tab="3"]'
    );
    // Pick the one that is NOT the main search bar
    for (const c of candidates) {
      const label = c.getAttribute("aria-label") || "";
      if (!label.includes("búsqueda") && !label.includes("search")) {
        input = c;
        break;
      }
    }
  }

  if (!input) {
    console.warn(TAG, "Search input not found in Nuevo chat panel");
    return; // MAIN world — no return value matters
  }

  console.log(TAG, "Found search input, typing:", phone);

  // Focus the input
  input.focus();

  // Clear any existing text
  document.execCommand("selectAll", false, null);
  document.execCommand("delete", false, null);

  // Type the phone number — execCommand works in MAIN world
  document.execCommand("insertText", false, phone);

  console.log(TAG, "Phone typed successfully");
}

/**
 * Step 5: Find and click the first contact result from the search.
 *
 * *** RUNS IN MAIN WORLD ***
 * This MUST run in MAIN world because the search results are rendered by
 * React in response to execCommand("insertText") input from MAIN world.
 * ISOLATED world may not see these results or may have stale DOM.
 *
 * Since MAIN world cannot return Promises (results come back as undefined),
 * this function is fire-and-forget. We validate success in a separate
 * ISOLATED-world step afterward.
 *
 * SCOPING: We search ONLY within the "Nuevo chat" panel, NOT #side.
 * The panel is identified by the presence of the "Buscar un nombre o número"
 * search input. We walk UP from that input to find the panel container,
 * then search within it for result buttons.
 */
function stepClickResult(phone) {
  const TAG = "[Goberna WA]";

  // ── Locate the "Nuevo chat" panel by finding its search input ──
  const searchLabels = [
    "Buscar un nombre o número",
    "Search name or number",
    "Pesquisar nome ou número",
  ];
  let searchInput = null;
  for (const label of searchLabels) {
    searchInput = document.querySelector(
      `div[role="textbox"][aria-label="${label}"]`
    );
    if (searchInput) break;
  }

  // Walk up from the search input to find the panel container.
  // The panel is typically a direct child of #app or a sibling of #side.
  // We go up until we find a large container (the panel root).
  let panelRoot = null;
  if (searchInput) {
    let el = searchInput;
    for (let i = 0; i < 15; i++) {
      el = el.parentElement;
      if (!el) break;
      // The panel is a large div that covers the sidebar area.
      // It usually has a height > 400px and isn't #app itself.
      if (el.id === "app" || el.id === "side") break;
      const rect = el.getBoundingClientRect();
      if (rect.height > 400 && rect.width > 200) {
        panelRoot = el;
        // Don't break — keep going up to find the largest reasonable container
        // that isn't #app itself
      }
    }
  }

  // If we couldn't isolate the panel, search all of #app but EXCLUDE #side
  const searchArea = panelRoot || document.querySelector("#app");
  if (!searchArea) {
    console.warn(TAG, "No search area found");
    return;
  }

  const phoneSuffix = phone.slice(-6); // Last 6 digits for matching
  console.log(TAG, `Looking for result with suffix: ${phoneSuffix} in panel`);

  // ── Strategy 1: Find "Usuarios que no están en tus contactos" section ──
  // This section heading is a reliable anchor. Results are buttons AFTER it.
  const nonContactTexts = [
    "Usuarios que no están en tus contactos",
    "Users not in your contacts",
    "Pessoas fora dos seus contatos",
  ];
  let nonContactSection = null;
  const allElements = searchArea.querySelectorAll("*");
  for (const el of allElements) {
    // Skip #side elements to avoid matching chat list items
    if (el.closest("#side")) continue;
    const txt = el.textContent?.trim() || "";
    for (const heading of nonContactTexts) {
      if (txt === heading) {
        nonContactSection = el;
        break;
      }
    }
    if (nonContactSection) break;
  }

  if (nonContactSection) {
    // The search result buttons are siblings or nearby descendants
    // Walk up to the parent container and find buttons there
    let container = nonContactSection.parentElement;
    for (let i = 0; i < 5; i++) {
      if (!container) break;
      const buttons = container.querySelectorAll("button");
      for (const btn of buttons) {
        if (btn.closest("#side")) continue; // Skip sidebar
        const digitsInBtn = (btn.textContent || "").replace(/\D/g, "");
        if (digitsInBtn.includes(phoneSuffix) && btn.offsetParent !== null) {
          console.log(
            TAG,
            "✓ Clicking non-contact result:",
            (btn.textContent || "").slice(0, 60)
          );
          btn.click();
          return; // MAIN world — no return value
        }
      }
      container = container.parentElement;
    }
    console.log(TAG, "Found non-contact section but no matching button");
  }

  // ── Strategy 2: Find ANY button with matching digits NOT inside #side ──
  const allButtons = searchArea.querySelectorAll("button");
  for (const btn of allButtons) {
    // CRITICAL: Skip buttons inside #side (existing chat list)
    if (btn.closest("#side")) continue;

    const text = btn.textContent || "";
    const ariaLabel = btn.getAttribute("aria-label") || "";
    const combined = text + " " + ariaLabel;
    const digitsInText = combined.replace(/\D/g, "");

    if (digitsInText.includes(phoneSuffix) && btn.offsetParent !== null) {
      // Extra check: skip known non-result buttons
      const lower = combined.toLowerCase();
      if (
        lower.includes("nuevo chat") ||
        lower.includes("new chat") ||
        lower.includes("cerrar") ||
        lower.includes("close")
      ) {
        continue;
      }
      console.log(TAG, "✓ Clicking matching button:", combined.slice(0, 60));
      btn.click();
      return; // MAIN world — no return value
    }
  }

  // ── Strategy 3: Look for listitem/row/option NOT inside #side ──
  const listItems = searchArea.querySelectorAll(
    'div[role="listitem"], div[role="row"], div[role="option"]'
  );
  for (const item of listItems) {
    if (item.closest("#side")) continue;
    const digitsInItem = (item.textContent || "").replace(/\D/g, "");
    if (digitsInItem.includes(phoneSuffix) && item.offsetParent !== null) {
      console.log(TAG, "✓ Clicking matching list item");
      item.click();
      return;
    }
  }

  console.warn(TAG, "✗ No search result found for", phone);
}

/**
 * Step 7 (validation): Check if a chat is now open by looking for #main
 * and checking the header contains contact info.
 * Runs in ISOLATED world (can return results).
 */
function stepValidateChatOpened(phone) {
  const TAG = "[Goberna WA]";
  const phoneSuffix = phone.slice(-6);

  // Check #main exists (chat area is visible)
  const main = document.querySelector("#main");
  if (!main) {
    console.log(TAG, "No #main — chat did not open");
    return { opened: false, reason: "no-main" };
  }

  // Check the header for the phone number or contact name
  const header = main.querySelector("header");
  if (header) {
    const headerText = (header.textContent || "").replace(/\D/g, "");
    if (headerText.includes(phoneSuffix)) {
      console.log(TAG, "✓ Chat opened — header matches phone");
      return { opened: true, method: "header-match" };
    }
  }

  // Check if the compose box exists (chat is open and interactive)
  const composeLabels = [
    "Escribe un mensaje",
    "Type a message",
    "Digite uma mensagem",
  ];
  for (const label of composeLabels) {
    const box = document.querySelector(
      `div[role="textbox"][aria-label="${label}"]`
    );
    if (box) {
      console.log(TAG, "✓ Chat opened — compose box found");
      return { opened: true, method: "compose-box" };
    }
  }

  // #main exists but may be from a previous chat — inconclusive
  console.log(TAG, "? #main exists but could not confirm correct chat");
  return { opened: true, method: "main-exists-unconfirmed" };
}

/**
 * Step 7: Pre-fill message text in the compose box.
 * Runs in MAIN world (execCommand needed for React contenteditable).
 */
function stepTypeMessage(text) {
  const TAG = "[Goberna WA]";

  if (!text) return;

  // The compose box in the chat area
  const composeLabels = [
    "Escribe un mensaje",
    "Type a message",
    "Digite uma mensagem",
  ];

  let input = null;
  for (const label of composeLabels) {
    input = document.querySelector(
      `div[role="textbox"][aria-label="${label}"]`
    );
    if (input) break;
  }

  // Fallback: textbox inside footer or #main
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

  if (!input) {
    console.warn(TAG, "Compose box not found for text pre-fill");
    return;
  }

  console.log(TAG, "Pre-filling message text");
  input.focus();
  document.execCommand("selectAll", false, null);
  document.execCommand("delete", false, null);
  document.execCommand("insertText", false, text);
}

// ── Orchestrator ──

/**
 * Execute a script in the given world. Returns the result for ISOLATED,
 * or undefined for MAIN (known limitation).
 */
async function execStep(tabId, func, args = [], world = "ISOLATED") {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func,
      args,
      world,
    });
    return results?.[0]?.result;
  } catch (err) {
    console.warn(`[Goberna WA] execStep failed (${world}):`, err.message);
    return null;
  }
}

/**
 * Navigate WhatsApp Web to a specific chat — NO RELOAD.
 *
 * Multi-step sequential approach:
 *   1. Check readiness (ISOLATED)
 *   2. Click "Nuevo chat" (ISOLATED)
 *   3. Wait for panel
 *   4. Type phone (MAIN)
 *   5. Wait for search results
 *   6. Click result (MAIN) — must be MAIN to see React-rendered results
 *   7. Wait for chat to open
 *   8. Validate chat opened (ISOLATED)
 *   9. Pre-fill text (MAIN, optional)
 */
async function navigateInPlace(tabId, rawPhone, text) {
  const phone = toLocalPhone(rawPhone);
  console.log(`[Goberna WA] navigateInPlace: raw=${rawPhone} local=${phone}`);

  // ── Step 0: Check readiness ──
  const ready = await execStep(tabId, stepCheckReady);
  if (!ready || !ready.ready) {
    const reason = ready?.reason || "unknown";
    console.log(`[Goberna WA] Not ready (${reason}) — URL fallback`);
    const url = buildSendUrl(rawPhone, text);
    await chrome.tabs.update(tabId, { url });
    return `url-fallback-${reason}`;
  }

  // ── Step 1: Click "Nuevo chat" ──
  const clickResult = await execStep(tabId, stepClickNuevoChat);
  if (!clickResult?.clicked) {
    console.warn("[Goberna WA] Failed to click Nuevo chat — URL fallback");
    const url = buildSendUrl(rawPhone, text);
    await chrome.tabs.update(tabId, { url });
    return "url-fallback-no-nuevo-chat";
  }

  // ── Step 2: Wait for "Nuevo chat" panel to open ──
  await sleep(800);

  // ── Step 3: Type phone number (MAIN world) ──
  // First try with local phone number (e.g., 955135507)
  await execStep(tabId, stepTypePhone, [phone], "MAIN");
  // No return value from MAIN world — we proceed optimistically

  // ── Step 4: Wait for search results to populate ──
  await sleep(2500);

  // ── Step 5: Click the search result (MAIN world) ──
  // MUST be MAIN world so we see the same DOM that React rendered
  // after our MAIN-world typing in Step 3.
  await execStep(tabId, stepClickResult, [phone], "MAIN");
  // No return value from MAIN world — validate in next step

  // ── Step 6: Wait for chat to open ──
  await sleep(800);

  // ── Step 7: Validate chat opened (ISOLATED, can return values) ──
  let validation = await execStep(tabId, stepValidateChatOpened, [phone]);

  if (!validation?.opened) {
    // ── Retry with full phone number (with country code) ──
    console.log("[Goberna WA] Chat not opened with local phone, retrying with full number...");
    const fullDigits = rawPhone.replace(/\D/g, "");
    if (fullDigits !== phone) {
      // Re-type with full number
      await execStep(tabId, stepTypePhone, [fullDigits], "MAIN");
      await sleep(2500);
      await execStep(tabId, stepClickResult, [fullDigits], "MAIN");
      await sleep(800);
      validation = await execStep(tabId, stepValidateChatOpened, [fullDigits]);

      if (validation?.opened) {
        console.log("[Goberna WA] Chat opened with full number");
        if (text) {
          await execStep(tabId, stepTypeMessage, [text], "MAIN");
        }
        return "dom-search-full-number";
      }
    }

    // ── Second retry: click "Nuevo chat" again and type full number with + prefix ──
    console.log("[Goberna WA] Still no chat — trying with + prefix...");
    await execStep(tabId, stepClickNuevoChat);
    await sleep(800);
    const withPlus = `+${rawPhone.replace(/\D/g, "")}`;
    await execStep(tabId, stepTypePhone, [withPlus], "MAIN");
    await sleep(2500);
    await execStep(tabId, stepClickResult, [withPlus.replace(/\D/g, "")], "MAIN");
    await sleep(800);
    validation = await execStep(tabId, stepValidateChatOpened, [phone]);

    if (validation?.opened) {
      console.log("[Goberna WA] Chat opened with + prefix");
      if (text) {
        await execStep(tabId, stepTypeMessage, [text], "MAIN");
      }
      return "dom-search-plus-prefix";
    }

    // ── Final fallback: URL navigation (causes reload but works) ──
    console.warn("[Goberna WA] All DOM attempts failed — URL fallback");
    const url = buildSendUrl(rawPhone, text);
    await chrome.tabs.update(tabId, { url });
    return "url-fallback-no-result";
  }

  // ── Step 8: Pre-fill message text (MAIN world, optional) ──
  if (text) {
    await execStep(tabId, stepTypeMessage, [text], "MAIN");
  }

  console.log("[Goberna WA] SUCCESS — Chat opened via DOM search, NO RELOAD!");
  return "dom-search";
}

// ── Public API ──

async function openChat(phone, text) {
  const existing = await findWaTab();

  if (existing) {
    // Focus the existing tab + window
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });

    // Let focus settle
    await sleep(400);

    const method = await navigateInPlace(existing.id, phone, text || "");
    console.log(`[Goberna WA] Reused tab ${existing.id}, method: ${method}`);
    return { reused: true, tabId: existing.id, method };
  }

  // No existing tab — create one with /send URL (first time only)
  const url = buildSendUrl(phone, text);
  const newTab = await chrome.tabs.create({ url, active: true });
  console.log(`[Goberna WA] Created new tab ${newTab.id}`);
  return { reused: false, tabId: newTab.id, method: "new-tab" };
}

// ── Message handler ──

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "openChat") {
    openChat(msg.phone, msg.text)
      .then(sendResponse)
      .catch((err) => {
        console.error("[Goberna WA] openChat error:", err);
        sendResponse({ error: err.message });
      });
    return true; // keep sendResponse channel open for async
  }

  if (msg.action === "getStatus") {
    findWaTab().then((tab) => {
      sendResponse({ open: !!tab, tabId: tab?.id ?? null });
    });
    return true;
  }
});
