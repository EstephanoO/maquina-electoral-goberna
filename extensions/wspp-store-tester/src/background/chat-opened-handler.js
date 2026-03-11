// ═══════════════════════════════════════════════════════════════════════
// CHAT OPENED HANDLER (WSPP_CHAT_OPENED)
// ═══════════════════════════════════════════════════════════════════════

import { getCachedValidation } from './validation-client.js';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'WSPP_CHAT_OPENED') return;

  const { phone, contact_name } = msg.payload;

  (async () => {
    const validation = await getCachedValidation(phone);
    sendResponse({ validation: validation || null });
  })();

  return true;
});
