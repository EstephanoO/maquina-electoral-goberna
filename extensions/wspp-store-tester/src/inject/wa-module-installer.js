// wa-module-installer.js — instala listeners de módulos internos de WA.
// Maneja: incoming messages, chat watcher, health check.

import { WA_ORIGIN, _ownNumber, setOwnNumber } from './bootstrap.js';
import { jidToNumber, resolvePhoneFromLid, getContactIndex, getChatIndex, getOwnNumber } from './jid-resolver.js';

let _msgListenerInstalled = false;
let _chatWatcherInstalled = false;
export let _lastActiveChatJid = null;

/**
 * Instala el listener de mensajes entrantes usando WAWebMsgCollection.
 * Usa window.require (Metro bundler) — solo disponible después de que WA cargue.
 */
function installIncomingMessageListener() {
  if (_msgListenerInstalled) return;
  try {
    const { MsgCollection } = window.require('WAWebMsgCollection');
    if (!MsgCollection || !MsgCollection.on) {
      console.log('[WSPP] MsgCollection no disponible aún');
      return;
    }

    MsgCollection.on('add', (msg) => {
      try {
        const isFromMe = !!msg.get('id')?.fromMe;

        // ── OUTGOING: fromMe=true → enrich phone via MsgCollection JID ──
        if (isFromMe) {
          const to = msg.get('to')?._serialized;
          if (!to || typeof to !== 'string') return;
          if (to.includes('@g.us') || to.includes('@broadcast') || to.includes('@newsletter')) return;

          let phone = jidToNumber(to);
          if (!phone && to.includes('@lid')) {
            phone = resolvePhoneFromLid(to);
          }

          // Also try to get name for the recipient
          // PERF v7.1.0: Use indexed Map instead of linear scan
          let contactName = null;
          try {
            const cidx = getContactIndex();
            if (cidx) {
              const contact = cidx.get(to);
              if (contact) contactName = contact.pushname || contact.name || contact.formattedName || null;
            }
          } catch (_) {}

          // Emit WSPP_SENT_RICH — higher fidelity than DOM-based WSPP_SENT
          // BUG FIX v7.1.0: capture outgoing message body for classification + spam detection
          const outBody = msg.get('body') || '';
          window.postMessage({
            type: 'WSPP_SENT_RICH',
            payload: {
              phone,
              contact_name: contactName || getActiveContactName_local(),
              own_number: getOwnNumber(),
              to_jid: to,
              timestamp: msg.get('t') || Math.floor(Date.now() / 1000),
              body: outBody.substring(0, 500),
            },
          }, WA_ORIGIN);
          return;
        }

        // ── INCOMING: fromMe=false → original flow ──
        const from = msg.get('from')?._serialized;
        if (!from || typeof from !== 'string') return;

        // Filtrar grupos, broadcasts, newsletters
        if (from.includes('@g.us') || from.includes('@broadcast') || from.includes('@newsletter')) return;

        // Extraer telefono del JID
        let phone = jidToNumber(from);
        const body = msg.get('body') || '';
        const msgType = msg.get('type') || 'chat';
        const timestamp = msg.get('t') || Math.floor(Date.now() / 1000);

        // Si es @lid, intentar resolver el teléfono real
        if (!phone && from.includes('@lid')) {
          phone = resolvePhoneFromLid(from);
        }

        // Obtener nombre del contacto si es posible
        // PERF v7.1.0: Use indexed Map instead of linear scan
        let contactName = null;
        try {
          const cidx = getContactIndex();
          if (cidx) {
            const contact = cidx.get(from);
            if (contact) {
              contactName = contact.pushname || contact.name || contact.formattedName || null;
            }
          }
        } catch (_) {}

        window.postMessage({
          type: 'WSPP_RECEIVED',
          payload: {
            phone,
            contact_name: contactName,
            from_jid: from,
            preview: body.substring(0, 500),
            msg_type: msgType,
            own_number: getOwnNumber(),
            timestamp,
          },
        }, WA_ORIGIN);

        console.log('[WSPP] ← recibido de:', phone ?? from, '| tipo:', msgType, '| preview:', body.substring(0, 60));
      } catch (err) {
        console.error('[WSPP] Error procesando mensaje:', err);
      }
    });

    _msgListenerInstalled = true;
    console.log('[WSPP] ✓ Listener de mensajes entrantes instalado (MsgCollection.on add)');
  } catch (err) {
    console.log('[WSPP] MsgCollection aún no disponible:', err.message);
  }
}

// Local helper — avoids circular dep with jid-resolver's getActiveContactName
// (it's a re-export of the same function, but keeps coupling explicit)
function getActiveContactName_local() {
  try {
    const selected = document.querySelector('#pane-side [aria-selected="true"]')
      ?? document.querySelector('[aria-selected="true"]');
    if (selected) {
      const spans = selected.querySelectorAll('span[title]');
      for (const s of spans) {
        const t = (s.getAttribute('title') || '').trim();
        if (t && t.length > 1 && !/^[\u200e\u200f\u202a-\u202e\s.]+$/.test(t)) return t;
      }
    }
  } catch (_) {}
  return null;
}

/**
 * Vigila el chat activo usando ChatCollection.
 * Cuando cambia, emite WSPP_CHAT_OPENED para que el background haga lookup.
 *
 * M-6: Event-driven chat watcher with polling fallback.
 * Primary: ChatCollection.on('change:active') — fires when active chat changes.
 * Fallback: 2s polling interval (reduced from 800ms) for compatibility.
 */
function installChatWatcher() {
  if (_chatWatcherInstalled) return;
  try {
    const { ChatCollection } = window.require('WAWebChatCollection');
    if (!ChatCollection || !ChatCollection._models) {
      console.log('[WSPP] ChatCollection no disponible aún');
      return;
    }

    function handleActiveChatChange() {
      try {
        const active = ChatCollection._models.find(c => c.active);
        if (!active) return;

        const jid = active.id?._serialized;
        if (!jid || jid === _lastActiveChatJid) return;

        _lastActiveChatJid = jid;

        // Solo chats individuales con teléfono
        if (jid.includes('@g.us') || jid.includes('@broadcast') || jid.includes('@newsletter')) return;

        let phone = jidToNumber(jid);
        // Try to resolve @lid to phone number
        if (!phone && jid.includes('@lid')) {
          phone = resolvePhoneFromLid(jid);
        }
        const name = active.name || active.formattedTitle || active.pushname || null;

        // H-3: Use specific origin instead of '*'
        window.postMessage({
          type: 'WSPP_CHAT_OPENED',
          payload: {
            phone,
            contact_name: name,
            jid,
          },
        }, WA_ORIGIN);

        console.log('[WSPP] Chat abierto:', phone ?? jid, '| nombre:', name ?? '-');
      } catch (_) {}
    }

    // M-6: Primary — event-driven via ChatCollection.on('change')
    let eventDriven = false;
    try {
      if (typeof ChatCollection.on === 'function') {
        ChatCollection.on('change:active', handleActiveChatChange);
        ChatCollection.on('change', handleActiveChatChange); // broader fallback
        eventDriven = true;
        console.log('[WSPP] ✓ Chat watcher instalado (event-driven: ChatCollection.on)');
      }
    } catch (_) {}

    // M-6: Fallback — polling at 2s (reduced frequency since events handle most cases)
    if (!eventDriven) {
      setInterval(handleActiveChatChange, 2000);
      console.log('[WSPP] ✓ Chat watcher instalado (polling fallback cada 2s)');
    }

    _chatWatcherInstalled = true;
  } catch (err) {
    console.log('[WSPP] ChatCollection aún no disponible:', err.message);
  }
}

// M-8: Max retry counts to prevent infinite retries
const MAX_WA_LISTENER_RETRIES = 30; // ~90s max wait
let _waListenerRetries = 0;

// S-3: Health check — validate all required WA modules on successful install
const WA_REQUIRED_MODULES = [
  'WAWebMsgCollection',
  'WAWebChatCollection',
  'WAWebContactCollection',
];
const WA_OPTIONAL_MODULES = [
  'WAWebMediaOpaqueData',      // PTT: media opaque data wrapper
  'WAWebPrepRawMedia',         // PTT: prepRawMedia({ isPtt: true }) pipeline
  'WAWebSendMsgChatAction',    // PTT: addAndSendMsgToChat
  'WAWebWidFactory',           // @lid resolution + chat lookup
  'WAWebFindChatAction',       // PTT: fallback chat resolver
];

function runModuleHealthCheck() {
  const missing = [];
  const missingOptional = [];
  for (const mod of WA_REQUIRED_MODULES) {
    try { window.require(mod); } catch (_) { missing.push(mod); }
  }
  for (const mod of WA_OPTIONAL_MODULES) {
    try { window.require(mod); } catch (_) { missingOptional.push(mod); }
  }

  if (missing.length > 0) {
    console.error('[WSPP HEALTH] CRITICAL — missing required modules:', missing.join(', '));
    showHealthBadge('error', 'Extension desactualizada — faltan modulos: ' + missing.join(', '));
  } else if (missingOptional.length > 0) {
    console.warn('[WSPP HEALTH] Optional modules missing:', missingOptional.join(', '));
    showHealthBadge('warn', 'Funciones limitadas — faltan: ' + missingOptional.join(', '));
  } else {
    console.log('[WSPP HEALTH] All modules OK');
  }
}

let _healthBadge = null;
function showHealthBadge(level, message) {
  if (_healthBadge) _healthBadge.remove();
  const badge = document.createElement('div');
  badge.id = 'wspp-health-badge';
  const isError = level === 'error';
  Object.assign(badge.style, {
    position: 'fixed',
    bottom: '16px',
    left: '16px',
    zIndex: '99999',
    background: isError ? '#dc2626' : '#ca8a04',
    color: '#fff',
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: '600',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    boxShadow: '0 2px 12px rgba(0,0,0,.3)',
    maxWidth: '320px',
    cursor: 'pointer',
  });
  badge.textContent = (isError ? 'WSPP: ' : 'WSPP: ') + message;
  badge.title = 'Click para cerrar';
  badge.addEventListener('click', () => badge.remove());
  document.body.appendChild(badge);
  _healthBadge = badge;
  // Auto-dismiss warnings after 15s, errors stay
  if (!isError) setTimeout(() => { if (_healthBadge === badge) badge.remove(); }, 15000);
}

/**
 * Auto-detect own phone number from WA Web internal modules.
 * Tries multiple strategies since WA changes module names across versions.
 * When found, updates _ownNumber in-process AND notifies content.js
 * to persist in chrome.storage.local (so it survives page reloads).
 */
function detectOwnNumber() {
  // Skip if already set (from storage via content.js)
  if (_ownNumber) return;

  let phone = null;

  // Strategy 1: WAWebUserPrefsMeUser — .getMeUser().user
  try {
    const mod = window.require('WAWebUserPrefsMeUser');
    const me = mod?.getMeUser?.() || mod?.getMaybeMeUser?.();
    if (me) {
      const raw = me.user || me._serialized || '';
      const digits = raw.replace(/\D/g, '');
      if (digits.length >= 9 && digits.length <= 15) phone = digits;
    }
  } catch (_) {}

  // Strategy 2: WAWebWidFactory — currentWid or toPhoneNumber
  if (!phone) try {
    const wid = window.require('WAWebWidFactory');
    const me = wid?.getMeWid?.() || wid?.getCurrentWid?.();
    if (me) {
      const raw = me.user || me._serialized || '';
      const digits = raw.replace(/\D/g, '');
      if (digits.length >= 9 && digits.length <= 15) phone = digits;
    }
  } catch (_) {}

  // Strategy 3: WAWebConnModel — Conn.wid
  if (!phone) try {
    const { Conn } = window.require('WAWebConnModel');
    const wid = Conn?.wid || Conn?.ref;
    if (wid) {
      const raw = typeof wid === 'string' ? wid : (wid.user || wid._serialized || '');
      const digits = raw.replace(/\D/g, '');
      if (digits.length >= 9 && digits.length <= 15) phone = digits;
    }
  } catch (_) {}

  // Strategy 4: WAWebComposeBoxActions / window.Store.Conn (legacy)
  if (!phone) try {
    const store = window.Store;
    if (store?.Conn?.wid) {
      const raw = store.Conn.wid.user || store.Conn.wid._serialized || '';
      const digits = raw.replace(/\D/g, '');
      if (digits.length >= 9 && digits.length <= 15) phone = digits;
    }
  } catch (_) {}

  // Strategy 5: Scan localStorage for WA's own phone cache
  if (!phone) try {
    const waMe = localStorage.getItem('last-wid-md') || localStorage.getItem('last-wid');
    if (waMe) {
      const digits = waMe.replace(/@.+$/, '').replace(/\D/g, '');
      if (digits.length >= 9 && digits.length <= 15) phone = digits;
    }
  } catch (_) {}

  if (!phone) return;

  // Set in-memory
  setOwnNumber(phone);
  console.log(
    '%c[WSPP] own_number auto-detectado: +' + phone,
    'color:#34c759;font-weight:700;font-size:13px'
  );

  // Notify content.js → chrome.storage.local (persists across reloads)
  window.postMessage({
    type: 'WSPP_OWN_NUMBER_DETECTED',
    number: phone,
  }, WA_ORIGIN);
}

export function tryInstallWAListeners() {
  if (!window.require) {
    _waListenerRetries++;
    if (_waListenerRetries < MAX_WA_LISTENER_RETRIES) {
      setTimeout(tryInstallWAListeners, 2000);
    } else {
      console.warn('[WSPP] window.require never appeared after', MAX_WA_LISTENER_RETRIES, 'retries — giving up');
      showHealthBadge('error', 'WhatsApp Web no detectado — recarga la pagina');
    }
    return;
  }

  installIncomingMessageListener();
  installChatWatcher();

  // Si no se instalaron, reintentar con limit
  if (!_msgListenerInstalled || !_chatWatcherInstalled) {
    _waListenerRetries++;
    if (_waListenerRetries < MAX_WA_LISTENER_RETRIES) {
      setTimeout(tryInstallWAListeners, 3000);
    } else {
      console.warn('[WSPP] WA listeners not installed after', MAX_WA_LISTENER_RETRIES, 'retries — giving up');
      showHealthBadge('error', 'No se pudieron instalar los listeners — recarga la pagina');
    }
  } else {
    // S-3: All listeners installed — run health check
    runModuleHealthCheck();
    // Auto-detect own phone number from WA internals
    detectOwnNumber();
  }
}
