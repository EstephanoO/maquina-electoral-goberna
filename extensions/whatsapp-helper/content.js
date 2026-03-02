/**
 * WhatsApp Goberna Helper — WhatsApp Web Content Script
 *
 * Runs inside web.whatsapp.com.
 * Listens for "navigateToChat" messages from the background script
 * and opens the chat by typing the phone number in the search bar.
 * This avoids reloading the entire WhatsApp Web app.
 */

console.log("[Goberna WA] Content script loaded in WhatsApp Web");

/* ─── Navigate to chat without reloading ─── */

async function navigateToChat(phone, text) {
  console.log("[Goberna WA] Navigating to chat:", phone);

  // Step 1: Click the search/new-chat icon to open search
  const searchBtn =
    document.querySelector('[data-testid="chat-list-search"]') ||
    document.querySelector('[aria-label="Search input textbox"]')?.closest("div") ||
    document.querySelector('[data-testid="search"]') ||
    document.querySelector('[title="Search input textbox"]');

  // If we can't find the search button, try the "New chat" button
  const newChatBtn =
    document.querySelector('[data-testid="menu-bar-new-chat"]') ||
    document.querySelector('[aria-label="New chat"]') ||
    document.querySelector('[data-icon="new-chat"]')?.closest("button") ||
    document.querySelector('[data-icon="new-chat"]')?.closest("div[role='button']");

  if (newChatBtn) {
    newChatBtn.click();
    await sleep(400);
  } else if (searchBtn) {
    searchBtn.click();
    await sleep(300);
  }

  // Step 2: Find the search input and type the phone number
  await sleep(300);
  const searchInput = await waitForElement(
    () =>
      document.querySelector('[data-testid="chat-list-search"]') ||
      document.querySelector('[aria-label="Search input textbox"]') ||
      document.querySelector('div[contenteditable="true"][data-tab="3"]') ||
      document.querySelector('div[contenteditable="true"][role="textbox"][title="Search input textbox"]'),
    3000,
  );

  if (!searchInput) {
    console.warn("[Goberna WA] Could not find search input, falling back to URL");
    window.location.href = `https://web.whatsapp.com/send?phone=${phone}${text ? `&text=${encodeURIComponent(text)}` : ""}`;
    return;
  }

  // Clear existing search text
  searchInput.focus();
  searchInput.textContent = "";
  // Dispatch input event to trigger WA's React handlers
  searchInput.dispatchEvent(new InputEvent("input", { bubbles: true }));
  await sleep(100);

  // Type the phone number (without country code prefix if it starts with common ones)
  const displayPhone = phone;
  document.execCommand("insertText", false, displayPhone);
  searchInput.dispatchEvent(new InputEvent("input", { bubbles: true }));

  // Step 3: Wait for results and click the first match
  await sleep(1200);

  const chatResult = await waitForElement(() => {
    // Look for the chat list result that matches
    const results = document.querySelectorAll('[data-testid="cell-frame-container"]');
    if (results.length > 0) return results[0];
    // Fallback: any clickable chat row in search results
    const rows = document.querySelectorAll('div[role="listitem"]');
    if (rows.length > 0) return rows[0];
    return null;
  }, 4000);

  if (chatResult) {
    chatResult.click();
    console.log("[Goberna WA] Chat opened via search");

    // Step 4: If we have pre-fill text, put it in the message input
    if (text) {
      await sleep(800);
      const msgInput =
        document.querySelector('[data-testid="conversation-compose-box-input"]') ||
        document.querySelector('div[contenteditable="true"][data-tab="10"]') ||
        document.querySelector('footer div[contenteditable="true"]');

      if (msgInput) {
        msgInput.focus();
        document.execCommand("insertText", false, text);
        msgInput.dispatchEvent(new InputEvent("input", { bubbles: true }));
      }
    }
  } else {
    // No result found — fall back to direct URL (will reload but at least works)
    console.warn("[Goberna WA] No chat found in search, falling back to URL");
    window.location.href = `https://web.whatsapp.com/send?phone=${phone}${text ? `&text=${encodeURIComponent(text)}` : ""}`;
  }
}

/* ─── Helpers ─── */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function waitForElement(selectorFn, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const el = selectorFn();
    if (el) return resolve(el);

    const start = Date.now();
    const interval = setInterval(() => {
      const el = selectorFn();
      if (el) {
        clearInterval(interval);
        resolve(el);
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
