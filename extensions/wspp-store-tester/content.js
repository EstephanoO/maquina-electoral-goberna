// content.js — ISOLATED world, document_start.
// Bridge entre inject.js (MAIN world) y el background service worker.
// También empuja wspp_own_number al MAIN world para que inject.js lo use
// sin depender del webpack hook.
'use strict';

// H-3: Use specific origin for postMessage instead of '*'
const WA_ORIGIN = 'https://web.whatsapp.com';

// ── Empujar own_number y user_role al MAIN world ─────────────────────
// inject.js vive en world MAIN y no tiene acceso a chrome.storage.
// content.js (ISOLATED) lee los valores y los envía via postMessage.
function pushOwnNumber(number) {
  window.postMessage({ type: 'WSPP_SET_OWN_NUMBER', number: number || null }, WA_ORIGIN);
}

function pushUserRole(role, audioAdmin) {
  window.postMessage({ type: 'WSPP_SET_USER_ROLE', role: role || 'agente_digital', perm_audio_admin: !!audioAdmin }, WA_ORIGIN);
}

// Al arrancar: leer del storage y empujar ambos valores
chrome.storage.local.get(['wspp_own_number', 'wspp_user_role', 'wspp_audio_admin'], (s) => {
  pushOwnNumber(s.wspp_own_number || null);
  pushUserRole(s.wspp_user_role || 'agente_digital', s.wspp_audio_admin);
});

// Si el usuario cambia valores desde el popup mientras WA está abierto: actualizar en caliente
chrome.storage.onChanged.addListener((changes) => {
  if (changes.wspp_own_number !== undefined) {
    pushOwnNumber(changes.wspp_own_number.newValue || null);
  }
  if (changes.wspp_user_role !== undefined || changes.wspp_audio_admin !== undefined) {
    // Re-read both values to ensure consistency
    chrome.storage.local.get(['wspp_user_role', 'wspp_audio_admin'], (s) => {
      pushUserRole(s.wspp_user_role || 'agente_digital', s.wspp_audio_admin);
    });
  }
});

// ── Bridge WSPP_SENT → background SW ────────────────────────────────
console.log('[WSPP BRIDGE] content.js loaded — listener registering');
window.addEventListener('message', (e) => {
  // H-4: Validate source — only accept from same window
  if (e.source !== window) return;

  const msgType = e.data?.type;
  if (msgType && msgType.startsWith('WSPP_')) {
    console.log('[WSPP BRIDGE] postMessage received:', msgType);
  }

  // --- WSPP_OWN_NUMBER_DETECTED (inject auto-detected own phone from WA modules) ---
  if (e.data?.type === 'WSPP_OWN_NUMBER_DETECTED' && e.data.number) {
    const num = e.data.number;
    console.log('[WSPP BRIDGE] own_number auto-detected:', num);
    // Persist to storage so popup shows it + survives reloads
    chrome.storage.local.set({ wspp_own_number: num });
    return;
  }

  // --- WSPP_SENT (contador de mensajes — DOM-based) ---
  // S-6: Exponential backoff on SW wake-up retries (300ms → 600ms → 1200ms)
  if (e.data?.type === 'WSPP_SENT') {
    function trySend(attemptsLeft, delay) {
      chrome.runtime.sendMessage({ type: 'WSPP_SENT', payload: e.data.payload })
        .catch((err) => {
          if (attemptsLeft > 0 && err?.message?.includes('Receiving end does not exist')) {
            setTimeout(() => trySend(attemptsLeft - 1, delay * 2), delay);
          }
        });
    }
    trySend(3, 300);
    return;
  }

  // --- WSPP_SENT_RICH (MsgCollection-based, higher fidelity phone resolution) ---
  if (e.data?.type === 'WSPP_SENT_RICH') {
    function trySendRich(attemptsLeft, delay) {
      chrome.runtime.sendMessage({ type: 'WSPP_SENT_RICH', payload: e.data.payload })
        .catch((err) => {
          if (attemptsLeft > 0 && err?.message?.includes('Receiving end does not exist')) {
            setTimeout(() => trySendRich(attemptsLeft - 1, delay * 2), delay);
          }
        });
    }
    trySendRich(3, 300);
    return;
  }

  // --- FETCH_AUDIO_CATALOG (catalog list: inject → background → inject) ---
  if (e.data?.type === 'FETCH_AUDIO_CATALOG') {
    console.log('[WSPP CATALOG bridge] Fetching catalog');
    chrome.runtime.sendMessage({ type: 'FETCH_AUDIO_CATALOG' }, (response) => {
      if (chrome.runtime.lastError) {
        window.postMessage({ type: 'AUDIO_CATALOG_READY', ok: false, error: chrome.runtime.lastError.message }, WA_ORIGIN);
        return;
      }
      window.postMessage({
        type: 'AUDIO_CATALOG_READY',
        ok: response?.ok ?? false,
        items: response?.items ?? [],
        error: response?.error ?? null,
      }, WA_ORIGIN);
    });
    return;
  }

  // --- GET_CATALOG_AUDIO (fetch single audio: inject → background → inject) ---
  if (e.data?.type === 'GET_CATALOG_AUDIO') {
    const audioId = e.data.id;
    console.log('[WSPP CATALOG bridge] Getting audio:', audioId);
    chrome.runtime.sendMessage({ type: 'GET_CATALOG_AUDIO', id: audioId }, (response) => {
      if (chrome.runtime.lastError) {
        window.postMessage({ type: 'CATALOG_AUDIO_READY', ok: false, error: chrome.runtime.lastError.message }, WA_ORIGIN);
        return;
      }
      window.postMessage({
        type: 'CATALOG_AUDIO_READY',
        id: audioId,
        ok: response?.ok ?? false,
        audioBase64: response?.audioBase64 ?? null,
        mimeType: response?.mimeType ?? null,
        label: response?.label ?? null,
        error: response?.error ?? null,
      }, WA_ORIGIN);
    });
    return;
  }

  // --- GENERATE_CATALOG_AUDIO (regenerate audio: inject → background → inject) ---
  if (e.data?.type === 'GENERATE_CATALOG_AUDIO') {
    const itemId = e.data.id;
    console.log('[WSPP CATALOG bridge] Generating audio:', itemId);
    chrome.runtime.sendMessage({ type: 'GENERATE_CATALOG_AUDIO', id: itemId }, (response) => {
      if (chrome.runtime.lastError) {
        window.postMessage({ type: 'GENERATE_CATALOG_AUDIO_DONE', ok: false, id: itemId, error: chrome.runtime.lastError.message }, WA_ORIGIN);
        return;
      }
      window.postMessage({
        type: 'GENERATE_CATALOG_AUDIO_DONE',
        ok: response?.ok ?? false,
        id: itemId,
        audioSize: response?.audioSize ?? 0,
        durationMs: response?.durationMs ?? 0,
        error: response?.error ?? null,
      }, WA_ORIGIN);
    });
    return;
  }

  // --- UPDATE_CATALOG_SCRIPT (update script: inject → background → inject) ---
  if (e.data?.type === 'UPDATE_CATALOG_SCRIPT') {
    const { id: itemId, script_text } = e.data;
    console.log('[WSPP CATALOG bridge] Updating script:', itemId);
    chrome.runtime.sendMessage({ type: 'UPDATE_CATALOG_SCRIPT', id: itemId, script_text }, (response) => {
      if (chrome.runtime.lastError) {
        window.postMessage({ type: 'UPDATE_CATALOG_SCRIPT_DONE', ok: false, id: itemId, error: chrome.runtime.lastError.message }, WA_ORIGIN);
        return;
      }
      window.postMessage({
        type: 'UPDATE_CATALOG_SCRIPT_DONE',
        ok: response?.ok ?? false,
        id: itemId,
        script_text: response?.script_text ?? script_text,
        error: response?.error ?? null,
      }, WA_ORIGIN);
    });
    return;
  }

  // --- DELETE_CATALOG_ITEM (delete item: inject → background → inject) ---
  if (e.data?.type === 'DELETE_CATALOG_ITEM') {
    const itemId = e.data.id;
    console.log('[WSPP CATALOG bridge] Deleting item:', itemId);
    chrome.runtime.sendMessage({ type: 'DELETE_CATALOG_ITEM', id: itemId }, (response) => {
      if (chrome.runtime.lastError) {
        window.postMessage({ type: 'DELETE_CATALOG_ITEM_DONE', ok: false, id: itemId, error: chrome.runtime.lastError.message }, WA_ORIGIN);
        return;
      }
      window.postMessage({
        type: 'DELETE_CATALOG_ITEM_DONE',
        ok: response?.ok ?? false,
        id: itemId,
        error: response?.error ?? null,
      }, WA_ORIGIN);
    });
    return;
  }

  // --- CREATE_CATALOG_ITEM (create item: inject → background → inject) ---
  if (e.data?.type === 'CREATE_CATALOG_ITEM') {
    const { data } = e.data;
    console.log('[WSPP CATALOG bridge] Creating item:', data?.label);
    chrome.runtime.sendMessage({ type: 'CREATE_CATALOG_ITEM', data }, (response) => {
      if (chrome.runtime.lastError) {
        window.postMessage({ type: 'CREATE_CATALOG_ITEM_DONE', ok: false, error: chrome.runtime.lastError.message }, WA_ORIGIN);
        return;
      }
      window.postMessage({
        type: 'CREATE_CATALOG_ITEM_DONE',
        ok: response?.ok ?? false,
        item: response?.item ?? null,
        error: response?.error ?? null,
      }, WA_ORIGIN);
    });
    return;
  }

  // --- FETCH_CATALOG_CATEGORIES (categories list: inject → background → inject) ---
  if (e.data?.type === 'FETCH_CATALOG_CATEGORIES') {
    chrome.runtime.sendMessage({ type: 'FETCH_CATALOG_CATEGORIES' }, (response) => {
      if (chrome.runtime.lastError) {
        window.postMessage({ type: 'CATALOG_CATEGORIES_READY', ok: false, error: chrome.runtime.lastError.message }, WA_ORIGIN);
        return;
      }
      window.postMessage({
        type: 'CATALOG_CATEGORIES_READY',
        ok: response?.ok ?? false,
        categories: response?.categories ?? [],
        error: response?.error ?? null,
      }, WA_ORIGIN);
    });
    return;
  }

  // --- CREATE_CATALOG_CATEGORY (create: inject → background → inject) ---
  if (e.data?.type === 'CREATE_CATALOG_CATEGORY') {
    chrome.runtime.sendMessage({ type: 'CREATE_CATALOG_CATEGORY', data: e.data.data }, (response) => {
      if (chrome.runtime.lastError) {
        window.postMessage({ type: 'CREATE_CATALOG_CATEGORY_DONE', ok: false, error: chrome.runtime.lastError.message }, WA_ORIGIN);
        return;
      }
      window.postMessage({
        type: 'CREATE_CATALOG_CATEGORY_DONE',
        ok: response?.ok ?? false,
        category: response?.category ?? null,
        error: response?.error ?? null,
      }, WA_ORIGIN);
    });
    return;
  }

  // --- DELETE_CATALOG_CATEGORY (delete: inject → background → inject) ---
  if (e.data?.type === 'DELETE_CATALOG_CATEGORY') {
    chrome.runtime.sendMessage({ type: 'DELETE_CATALOG_CATEGORY', id: e.data.id }, (response) => {
      if (chrome.runtime.lastError) {
        window.postMessage({ type: 'DELETE_CATALOG_CATEGORY_DONE', ok: false, error: chrome.runtime.lastError.message }, WA_ORIGIN);
        return;
      }
      window.postMessage({
        type: 'DELETE_CATALOG_CATEGORY_DONE',
        ok: response?.ok ?? false,
        id: e.data.id,
        error: response?.error ?? null,
      }, WA_ORIGIN);
    });
    return;
  }

  // --- Cache invalidation (inject → background, fire-and-forget) ---
  if (e.data?.type === 'BUST_AUDIO_CACHE' || e.data?.type === 'BUST_CATALOG_CACHE') {
    chrome.runtime.sendMessage({ type: e.data.type, id: e.data.id }, () => {});
    return;
  }

  // --- BLAST_GET_FORM_CONTACTS (form_submissions: inject → background → inject) ---
  if (e.data?.type === 'BLAST_GET_FORM_CONTACTS') {
    const { limit, offset, status, district, reqId, own_number } = e.data;
    chrome.runtime.sendMessage({ type: 'BLAST_GET_FORM_CONTACTS', limit, offset, status, district, own_number }, (response) => {
      if (chrome.runtime.lastError) {
        window.postMessage({ type: 'BLAST_FORM_CONTACTS_READY', ok: false, error: chrome.runtime.lastError.message, reqId }, WA_ORIGIN);
        return;
      }
      window.postMessage({
        type: 'BLAST_FORM_CONTACTS_READY',
        ok: response?.ok ?? false,
        contacts: response?.contacts ?? [],
        total: response?.total ?? 0,
        error: response?.error ?? null,
        reqId, // ← reenviar el reqId para que blast-panel resuelva el Promise correcto
      }, WA_ORIGIN);
    });
    return;
  }

  // --- BLAST_GET_CONTACTS (CMS conversations — legacy) ---
  if (e.data?.type === 'BLAST_GET_CONTACTS') {
    const { limit, offset, own_number } = e.data;
    chrome.runtime.sendMessage({ type: 'BLAST_GET_CONTACTS', limit, offset, own_number }, (response) => {
      if (chrome.runtime.lastError) {
        window.postMessage({ type: 'BLAST_CONTACTS_READY', ok: false, error: chrome.runtime.lastError.message }, WA_ORIGIN);
        return;
      }
      window.postMessage({
        type: 'BLAST_CONTACTS_READY',
        ok: response?.ok ?? false,
        contacts: response?.contacts ?? [],
        total: response?.total ?? 0,
        error: response?.error ?? null,
      }, WA_ORIGIN);
    });
    return;
  }

  // --- BLAST_MARK_HABLADO (inject → background, fire-and-forget) ---
  if (e.data?.type === 'BLAST_MARK_HABLADO') {
    chrome.runtime.sendMessage({ type: 'BLAST_MARK_HABLADO', ids: e.data.ids, own_number: e.data.own_number }, () => {});
    return;
  }

  // --- BLAST_GET_NUMBER_CONFIG (inject → background → inject) ---
  if (e.data?.type === 'BLAST_GET_NUMBER_CONFIG') {
    const own_number = e.data.own_number;
    chrome.runtime.sendMessage({ type: 'BLAST_GET_NUMBER_CONFIG', own_number }, (response) => {
      if (chrome.runtime.lastError) {
        window.postMessage({ type: 'BLAST_NUMBER_CONFIG_READY', config: null }, WA_ORIGIN);
        return;
      }
      window.postMessage({ type: 'BLAST_NUMBER_CONFIG_READY', config: response?.config ?? null }, WA_ORIGIN);
    });
    return;
  }

  // --- BLAST_REPORT_RESULTS (inject → background, fire-and-forget) ---
  if (e.data?.type === 'BLAST_REPORT_RESULTS') {
    chrome.runtime.sendMessage({ type: 'BLAST_REPORT', results: e.data.results }, () => {});
    return;
  }

  // --- BLAST_DEDUP_ADD (inject → storage, fire-and-forget) ---
  if (e.data?.type === 'BLAST_DEDUP_ADD') {
    const phone = e.data.phone;
    if (!phone) return;
    chrome.storage.local.get({ blast_dedup: [] }, (data) => {
      const arr = data.blast_dedup || [];
      if (arr.length > 5000) arr.splice(0, arr.length - 4000); // keep last 4000
      if (!arr.includes(phone)) arr.push(phone);
      chrome.storage.local.set({ blast_dedup: arr });
    });
    return;
  }

  // --- BLAST_DEDUP_REQUEST (inject asks for persisted dedup on load) ---
  if (e.data?.type === 'BLAST_DEDUP_REQUEST') {
    chrome.storage.local.get({ blast_dedup: [] }, (data) => {
      window.postMessage({ type: 'BLAST_DEDUP_LOADED', phones: data.blast_dedup || [] }, WA_ORIGIN);
    });
    return;
  }

  // --- BLAST_DEDUP_CLEAR (inject asks to clear persisted dedup) ---
  if (e.data?.type === 'BLAST_DEDUP_CLEAR') {
    chrome.storage.local.set({ blast_dedup: [] });
    return;
  }

  // --- BLAST_GET_NUMBER_HEALTH (inject → background → inject) ---
  if (e.data?.type === 'BLAST_GET_NUMBER_HEALTH') {
    const own_number = e.data.own_number;
    chrome.runtime.sendMessage({ type: 'BLAST_GET_NUMBER_HEALTH', own_number }, (response) => {
      if (chrome.runtime.lastError) {
        window.postMessage({ type: 'BLAST_NUMBER_HEALTH_READY', ok: false, can_send: true }, WA_ORIGIN);
        return;
      }
      window.postMessage({ type: 'BLAST_NUMBER_HEALTH_READY', ...response }, WA_ORIGIN);
    });
    return;
  }

  // ── VALIDATOR CONV SENT — record outgoing for spam detector ─────────
  // Called by wa-validator-panel conv mode after each successful message send.
  if (e.data?.type === 'WSPP_VALIDATOR_CONV_SENT') {
    chrome.runtime.sendMessage({ type: 'WSPP_VALIDATOR_CONV_SENT', payload: e.data.payload }, () => {});
    return;
  }

  // ── SPAM CHECK BRIDGE (inject → background, synchronous-like) ────────
  // Blast panel calls this before each send. Background runs checkSpamNow()
  // and replies so blast can pause if critical.
  if (e.data?.type === 'WSPP_SPAM_CHECK_NOW') {
    chrome.runtime.sendMessage({ type: 'WSPP_SPAM_CHECK_NOW', own_number: e.data.own_number }, (response) => {
      if (chrome.runtime.lastError) {
        window.postMessage({ type: 'WSPP_SPAM_CHECK_RESULT', result: null }, WA_ORIGIN);
        return;
      }
      window.postMessage({ type: 'WSPP_SPAM_CHECK_RESULT', result: response?.result || null }, WA_ORIGIN);
    });
    return;
  }

  // ── WA VALIDATOR BRIDGE ──────────────────────────────────────────────
  // WA_VALIDATOR_GET_CONTACTS — inject requests contacts from backend
  if (e.data?.type === 'WA_VALIDATOR_GET_CONTACTS') {
    const { limit, offset } = e.data;
    chrome.runtime.sendMessage({ type: 'WA_VALIDATOR_GET_CONTACTS', limit, offset }, (response) => {
      if (chrome.runtime.lastError) {
        window.postMessage({ type: 'WA_VALIDATOR_CONTACTS_READY', ok: false, error: chrome.runtime.lastError.message }, WA_ORIGIN);
        return;
      }
      window.postMessage({
        type: 'WA_VALIDATOR_CONTACTS_READY',
        ok: response?.ok ?? false,
        contacts: response?.contacts ?? [],
        total: response?.total ?? 0,
        error: response?.error ?? null,
      }, WA_ORIGIN);
    });
    return;
  }

  // WA_VALIDATOR_SAVE_RESULTS — inject sends batch of { id, wa_valid } to persist
  if (e.data?.type === 'WA_VALIDATOR_SAVE_RESULTS') {
    const { results, own_number } = e.data;
    chrome.runtime.sendMessage({ type: 'WA_VALIDATOR_SAVE_RESULTS', results, own_number }, () => {});
    return;
  }

  // WA_VALIDATOR_GET_STATS_REQ — inject requests brigadista stats
  if (e.data?.type === 'WA_VALIDATOR_GET_STATS_REQ') {
    chrome.runtime.sendMessage({ type: 'WA_VALIDATOR_GET_STATS' }, (response) => {
      if (chrome.runtime.lastError) {
        window.postMessage({ type: 'WA_VALIDATOR_STATS_READY', ok: false, error: chrome.runtime.lastError.message }, WA_ORIGIN);
        return;
      }
      window.postMessage({
        type: 'WA_VALIDATOR_STATS_READY',
        ok: response?.ok ?? false,
        summary: response?.summary ?? null,
        by_brigadista: response?.by_brigadista ?? [],
        error: response?.error ?? null,
      }, WA_ORIGIN);
    });
    return;
  }

  // --- WSPP_RECEIVED (mensaje entrante detectado) ---
  // Uses retry logic (like WSPP_SENT) because the MV3 service worker
  // may be sleeping and needs time to wake up.
  // S-6: Exponential backoff on SW wake-up retries (400ms → 800ms → 1600ms)
  if (e.data?.type === 'WSPP_RECEIVED') {
    const payload = e.data.payload;
    console.log('%c[WSPP BRIDGE] WSPP_RECEIVED → sending to background', 'color:#a855f7;font-weight:700', payload.preview?.slice(0, 50));
    function trySendReceived(attemptsLeft, delay) {
      chrome.runtime.sendMessage(
        { type: 'WSPP_RECEIVED', payload },
        (response) => {
          if (chrome.runtime.lastError) {
            const errMsg = chrome.runtime.lastError.message || '';
            console.warn('[WSPP BRIDGE] sendMessage error:', errMsg, '| retries left:', attemptsLeft);
            if (attemptsLeft > 0 && errMsg.includes('Receiving end does not exist')) {
              setTimeout(() => trySendReceived(attemptsLeft - 1, delay * 2), delay);
            }
            return;
          }
          console.log('%c[WSPP BRIDGE] background responded:', 'color:#22c55e;font-weight:700', JSON.stringify(response)?.slice(0, 200));
          // Si background devuelve datos de validacion, pasarlos a inject.js
          if (response?.validation) {
            window.postMessage({ type: 'WSPP_VALIDATION_DATA', payload: response.validation }, WA_ORIGIN);
          }
        }
      );
    }
    trySendReceived(3, 400);
    return;
  }

  // --- WSPP_CHAT_OPENED (operador abre un chat) ---
  if (e.data?.type === 'WSPP_CHAT_OPENED') {
    chrome.runtime.sendMessage(
      { type: 'WSPP_CHAT_OPENED', payload: e.data.payload },
      (response) => {
        if (chrome.runtime.lastError) return;
        if (response?.validation) {
          window.postMessage({ type: 'WSPP_VALIDATION_DATA', payload: response.validation }, WA_ORIGIN);
        } else {
          window.postMessage({ type: 'WSPP_VALIDATION_CLEAR' }, WA_ORIGIN);
        }
      }
    );
    return;
  }

  // --- WSPP_CLASSIFY (operador clasifica desde overlay) ---
  // S-6: Retry with backoff if SW is sleeping (400ms → 800ms → 1600ms)
  if (e.data?.type === 'WSPP_CLASSIFY') {
    function tryClassify(attemptsLeft, delay) {
      chrome.runtime.sendMessage(
        { type: 'WSPP_CLASSIFY', payload: e.data.payload },
        (response) => {
          if (chrome.runtime.lastError) {
            if (attemptsLeft > 0 && chrome.runtime.lastError.message?.includes('Receiving end does not exist')) {
              setTimeout(() => tryClassify(attemptsLeft - 1, delay * 2), delay);
              return;
            }
            window.postMessage({ type: 'WSPP_CLASSIFY_RESULT', ok: false, error: chrome.runtime.lastError.message }, WA_ORIGIN);
            return;
          }
          window.postMessage({
            type: 'WSPP_CLASSIFY_RESULT',
            ok: response?.ok ?? false,
            payload: response?.item ?? null,
            error: response?.error ?? null,
          }, WA_ORIGIN);
        }
      );
    }
    tryClassify(3, 400);
    return;
  }
});

// ── WSPP_SPAM_WARNING — background → content → inject.js overlay ────
// Background SW sends this when it detects spam patterns in outgoing messages.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'WSPP_SPAM_WARNING') {
    window.postMessage({
      type: 'WSPP_SPAM_WARNING',
      payload: msg.payload,
    }, WA_ORIGIN);
    return;
  }

  // ── WSPP_OPEN_CHAT — popup/background → content → inject.js ──────
  // Opens a chat by phone number inside WA Web.
  // Flow: popup sends chrome.tabs.sendMessage → content.js relays to inject.js
  //       inject.js responds with WSPP_OPEN_CHAT_RESULT via postMessage → content.js
  //       content.js relays result back via sendResponse.
  if (msg.type === 'WSPP_OPEN_CHAT') {
    const phone = msg.phone;
    console.log('[WSPP BRIDGE] WSPP_OPEN_CHAT → forwarding to inject.js for phone:', phone);

    // Listen for the result from inject.js (one-shot)
    const onResult = (e) => {
      if (e.source !== window) return;
      if (e.data?.type !== 'WSPP_OPEN_CHAT_RESULT') return;
      if (e.data.phone !== phone) return;
      window.removeEventListener('message', onResult);
      clearTimeout(timeout);
      sendResponse({ ok: e.data.ok, error: e.data.error || null });
    };
    window.addEventListener('message', onResult);

    // Timeout after 10s
    const timeout = setTimeout(() => {
      window.removeEventListener('message', onResult);
      sendResponse({ ok: false, error: 'Timeout — WA Web did not respond' });
    }, 10000);

    // Forward to inject.js
    window.postMessage({ type: 'WSPP_OPEN_CHAT', phone }, WA_ORIGIN);

    // Return true to signal async sendResponse
    return true;
  }
});
