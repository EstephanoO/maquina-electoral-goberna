/**
 * WhatsApp Goberna Helper — WhatsApp Web Content Script
 *
 * Runs inside web.whatsapp.com.
 * Listens for "navigateToChat" messages from the background script
 * and opens the chat WITHOUT reloading the page.
 *
 * Strategy: Use WhatsApp's internal URL routing.
 * web.whatsapp.com uses a SPA — we can change the URL hash/path
 * and WhatsApp navigates internally without a full reload.
 */

console.log("[Goberna WA] Content script loaded in WhatsApp Web");

/* ─── Navigate to chat without reloading ─── */

async function navigateToChat(phone, text) {
  console.log("[Goberna WA] Navigating to chat:", phone);

  // Strategy 1: Use the search input to find the contact
  const success = await trySearchNavigation(phone, text);
  if (success) return;

  // Strategy 2: Use WhatsApp's internal navigation via URL manipulation
  // This changes the URL but since WA is a SPA, React Router handles it
  console.log("[Goberna WA] Search failed, trying URL navigation...");
  const url = `https://web.whatsapp.com/send?phone=${phone}${text ? `&text=${encodeURIComponent(text)}` : ""}`;
  
  // Use history.pushState + dispatchEvent to trigger SPA navigation
  // without a full page reload
  try {
    // Try the WhatsApp internal API if available
    if (window.WWebJS || window.__x_module_loaded) {
      window.location.href = url;
      return;
    }
  } catch {}

  // Last resort: location change (will reload, but at least works)
  window.location.href = url;
}

async function trySearchNavigation(phone, text) {
  // Step 1: Find and click the search/new-chat area
  // WhatsApp Web has a "New chat" button or a search bar in the sidebar
  
  // Try clicking "New chat" button first (most reliable)
  const newChatBtn = findElement([
    '[data-testid="menu-bar-new-chat"]',
    '[aria-label="New chat"]',
    '[aria-label="Nuevo chat"]',
    '[aria-label="Chat nuevo"]',
    '[data-icon="new-chat-outline"]',
    '[data-icon="new-chat"]',
  ]);

  if (newChatBtn) {
    console.log("[Goberna WA] Found new-chat button");
    newChatBtn.click();
    await sleep(500);
  }

  // Step 2: Find the search input
  // It's a contenteditable div, not a regular input
  const searchInput = await waitForElement(() => findElement([
    // After clicking "New chat" — the search box in contacts panel
    '[data-testid="contact-search-input"]',
    '[data-testid="chat-list-search"]',
    'div[role="textbox"][data-tab="3"]',
    'div[contenteditable="true"][data-tab="3"]',
    'div[role="textbox"][title="Search input textbox"]',
    'div[role="textbox"][title="Cuadro de texto de búsqueda"]',
    // Generic fallback: any contenteditable in the side panel
    '#side div[contenteditable="true"][role="textbox"]',
    '#side div[contenteditable="true"]',
    // Even more generic
    'div[data-testid="search"] div[contenteditable="true"]',
  ]), 3000);

  if (!searchInput) {
    console.warn("[Goberna WA] Could not find search input");
    
    // Try clicking the existing search icon in the header
    const searchIcon = findElement([
      '[data-testid="search"]',
      '[data-icon="search"]',
      '[aria-label="Search"]',
      '[aria-label="Buscar"]',
    ]);
    
    if (searchIcon) {
      console.log("[Goberna WA] Found search icon, clicking...");
      searchIcon.click();
      await sleep(600);
      
      // Try finding input again
      const retryInput = await waitForElement(() => findElement([
        '#side div[contenteditable="true"]',
        'div[role="textbox"][data-tab="3"]',
        'div[contenteditable="true"][data-tab="3"]',
      ]), 2000);
      
      if (!retryInput) {
        console.warn("[Goberna WA] Still no search input after clicking search icon");
        return false;
      }
      
      return await typeAndSelect(retryInput, phone, text);
    }
    
    return false;
  }

  return await typeAndSelect(searchInput, phone, text);
}

async function typeAndSelect(searchInput, phone, text) {
  console.log("[Goberna WA] Typing in search:", phone);
  
  // Clear existing text
  searchInput.focus();
  
  // Select all existing text and delete
  searchInput.textContent = "";
  searchInput.dispatchEvent(new Event("input", { bubbles: true }));
  await sleep(100);
  
  // Type the phone number using execCommand (triggers React's onChange)
  document.execCommand("selectAll", false, null);
  document.execCommand("delete", false, null);
  document.execCommand("insertText", false, phone);
  
  // Also dispatch native events that WhatsApp listens to
  searchInput.dispatchEvent(new InputEvent("input", { 
    bubbles: true, 
    inputType: "insertText",
    data: phone 
  }));
  
  // Wait for search results
  await sleep(1500);

  // Step 3: Click the first result
  const chatResult = await waitForElement(() => findElement([
    // Chat list results
    '[data-testid="cell-frame-container"]',
    '[data-testid="chat-list-item"]',
    '[data-testid="contact-list-item"]',
    // Fallback: any listitem in the results
    '#side div[role="listitem"]',
    '#side div[role="row"]',
    // Even more generic: clickable div with the phone number
    `#side span[title*="${phone.slice(-4)}"]`,
  ]), 4000);

  if (chatResult) {
    // If we found a span with title, click its parent row
    const clickTarget = chatResult.closest('[data-testid="cell-frame-container"]') 
      || chatResult.closest('[role="listitem"]')
      || chatResult.closest('[role="row"]')
      || chatResult;
    
    clickTarget.click();
    console.log("[Goberna WA] Chat opened via search");

    // Step 4: Pre-fill message text if provided
    if (text) {
      await sleep(800);
      const msgInput = findElement([
        '[data-testid="conversation-compose-box-input"]',
        'footer div[contenteditable="true"]',
        'div[data-tab="10"][contenteditable="true"]',
        '#main div[contenteditable="true"][role="textbox"]',
        '#main footer div[contenteditable="true"]',
      ]);

      if (msgInput) {
        msgInput.focus();
        document.execCommand("insertText", false, text);
        msgInput.dispatchEvent(new InputEvent("input", { bubbles: true }));
        console.log("[Goberna WA] Message text pre-filled");
      }
    }
    
    return true;
  }

  console.warn("[Goberna WA] No chat result found for", phone);
  return false;
}

/* ─── Helpers ─── */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function findElement(selectors) {
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) return el;
    } catch {}
  }
  return null;
}

function waitForElement(selectorFn, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const el = selectorFn();
    if (el) return resolve(el);

    const start = Date.now();
    const interval = setInterval(() => {
      const found = selectorFn();
      if (found) {
        clearInterval(interval);
        resolve(found);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        resolve(null);
      }
    }, 150);
  });
}

/* ─── Listen for messages from background ─── */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "navigateToChat") {
    navigateToChat(msg.phone, msg.text)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ error: err.message }));
    return true; // async
  }
});
