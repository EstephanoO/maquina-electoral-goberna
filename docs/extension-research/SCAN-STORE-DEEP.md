# Deep Scan del Store interno de WhatsApp Web

## Objetivo
Mapear completamente el sistema de módulos Metro de WA Web para control preciso de:
- Mensajes: ack, delivery, read receipts, typing indicators
- Chats: estado, mute, pin, archive, unread count
- Contactos: presencia (online/offline/typing), last seen
- Estado de conexión: socket state, QR, battery
- Media: upload, download, cache

---

## Scan 11 — Enumerar TODOS los módulos disponibles

Pegá esto en la consola de DevTools de WA Web.
Tarda ~5 segundos, NO rompe nada.

```js
(() => {
  // WA Web usa Metro/Haste bundler con window.__d (define) y window.require (load)
  // Los módulos se registran con window.__d(factory, moduleId, dependencyMap)
  // El registry interno está en el closure de require()
  
  const results = {
    collections: [],      // Backbone Collections (Chat, Msg, Contact, etc.)
    models: [],           // Backbone Models (Conn, Stream, etc.)
    actions: [],          // Action modules (sendMsg, findChat, etc.)
    services: [],         // Service modules (queryExists, etc.)
    utils: [],            // Utility modules
    factories: [],        // Factory modules (WidFactory, MsgKey, etc.)
    media: [],            // Media-related modules
    ephemeral: [],        // Ephemeral/disappearing message modules
    presence: [],         // Presence/typing modules
    state: [],            // State/connection modules
    other: [],            // Everything else
    errors: [],           // Modules that failed to load
  };

  // Strategy 1: Enumerate module registry via __r (Metro internal)
  // __r is the require function, its registry is in the closure
  const moduleNames = new Set();
  
  // Strategy 2: Brute-force common WAWeb* prefixes
  const prefixes = [
    'WAWeb', 'WASmaxWeb', 'WAWap', 'WASignal', 'WABinary',
    'WAJids', 'WAProto', 'WAE2e', 'WALogger',
  ];
  
  const knownPatterns = [
    // Collections
    'Collection', 'CollectionClass',
    // Models  
    'Model', 'ModelClass',
    // Actions
    'Action', 'Actions',
    // Services
    'Service', 'Services', 'Query',
    // Utils
    'Utils', 'Util', 'Helper', 'Helpers',
    // Media
    'Media', 'Upload', 'Download', 'Opaque', 'Prep', 'Mms',
    // Messaging
    'Msg', 'Message', 'Chat', 'Send', 'Recv',
    // Presence
    'Presence', 'Typing', 'Online', 'LastSeen', 'Available',
    // State
    'Conn', 'Socket', 'Stream', 'State', 'Status',
    // Identity
    'Wid', 'Jid', 'User', 'Contact', 'Phone',
    // Groups
    'Group', 'Participant',
    // Labels
    'Label',
    // Calls
    'Call',
    // Blocklist
    'Block',
    // Receipts
    'Receipt', 'Ack', 'Read', 'Deliver',
    // Notifications
    'Notification', 'Push',
    // Starred
    'Star',
    // Mute/Pin/Archive
    'Mute', 'Pin', 'Archive',
    // Reactions
    'Reaction',
    // Polls
    'Poll',
    // View once
    'ViewOnce',
    // Key/Crypto
    'Key', 'Crypto', 'Encrypt', 'Decrypt',
  ];

  // Build test list: WAWeb + all patterns
  const testNames = new Set();
  for (const prefix of prefixes) {
    for (const pattern of knownPatterns) {
      testNames.add(prefix + pattern);
      testNames.add(prefix + pattern + 's');
    }
  }
  
  // Also add ALL known modules from the extension
  const known = [
    'WAWebMsgCollection', 'WAWebChatCollection', 'WAWebContactCollection',
    'WAWebConnModel', 'WAWebCollections', 'WAWebPresenceCollection',
    'WAWebGroupMetadataCollection', 'WAWebLabelCollection',
    'WAWebStatusCollection', 'WAWebCallCollection', 'WAWebBlocklistCollection',
    'WAWebWidFactory', 'WAWebUserPrefsMeUser', 'WAWebMsgKey',
    'WAWebSendMsgChatAction', 'WAWebFindChatAction',
    'WAWebMediaOpaqueData', 'WAWebMediaOpaqueDataUtils',
    'WAWebPrepRawMedia', 'WAWebPrepareMediaUtils',
    'WAWebMediaStorage', 'WAWebMediaStorageUtils', 'WAWebMediaStorageManager',
    'WAWebMmsMediaTypes', 'WAWebMediaMsgTypes', 'WAWebMediaTypes',
    'WAWebMediaMmsV4Upload', 'WAWebMediaUploadUtils', 'WAWebUploadManager',
    'WAWebMediaMmsUpload', 'WAWebMmsUpload',
    'WAWebGetEphemeralFieldsMsgActionsUtils', 'WAWebEphemeralFields', 'WAWebEphemeralUtils',
    'WAWebQueryExistsService', 'WAWebPhoneExistsService',
    'WAWebPhoneNumberQueryService',
    'WAWebMediaPrep', 'WAWebMediaObject', 'WAWebMediaDataUtils',
    'WAWebMediaInMemoryBlobCache', 'WAWebStartMediaUploadQpl',
    'WAWebChatStateBridge', 'WAWebStateUtils', 'WAWebMediaUtils',
    'WAWebMsgType', 'WAWebMsgModel', 'WAWebChatModel',
    // Ack/receipt related
    'WAWebReceiptAction', 'WAWebReceiptActions', 'WAWebSendReadReceipt',
    'WAWebReadReceiptAction', 'WAWebDeliveryReceipt',
    'WAWebAckAction', 'WAWebAckActions', 'WAWebMsgAck',
    'WAWebMsgInfoAction', 'WAWebMsgInfoActions',
    // Presence
    'WAWebPresenceAction', 'WAWebPresenceActions', 'WAWebPresenceUtils',
    'WAWebPresenceModel', 'WAWebPresenceState',
    'WAWebChatStateAction', 'WAWebChatStateActions',
    'WAWebSendPresence', 'WAWebPresenceSend',
    // Typing
    'WAWebComposeAction', 'WAWebComposeActions',
    'WAWebTypingAction', 'WAWebTypingActions',
    'WAWebSendTyping', 'WAWebTypingSend',
    // Online status
    'WAWebOnlineStatus', 'WAWebOnlineAction',
    // Connection
    'WAWebStreamModel', 'WAWebSocketModel', 'WAWebConnectionState',
    // Status/Story
    'WAWebStatusV3Action', 'WAWebStatusV3Actions',
    // Reactions
    'WAWebReactionAction', 'WAWebReactionActions',
    'WAWebSendReaction', 'WAWebReactionModel',
    // Starred/Pin
    'WAWebStarAction', 'WAWebStarActions',
    'WAWebPinAction', 'WAWebPinActions',
    'WAWebMuteAction', 'WAWebMuteActions',
    'WAWebArchiveAction', 'WAWebArchiveActions',
    // Delete
    'WAWebDeleteAction', 'WAWebDeleteActions',
    'WAWebRevokeAction', 'WAWebRevokeActions',
    // Forward
    'WAWebForwardAction', 'WAWebForwardActions',
    'WAWebForwardMsg', 'WAWebForwardMessage',
    // Group
    'WAWebGroupAction', 'WAWebGroupActions',
    'WAWebGroupUtils', 'WAWebGroupParticipants',
    // Profile
    'WAWebProfilePicAction', 'WAWebProfileAction',
    'WAWebProfileUtils',
    // Business
    'WAWebBusinessProfile', 'WAWebBusinessAction',
    // Newsletter/Channel
    'WAWebNewsletterAction', 'WAWebNewsletterActions',
    'WAWebNewsletterCollection',
    // Polls
    'WAWebPollAction', 'WAWebPollActions', 'WAWebPollVoteAction',
    // View once
    'WAWebViewOnceAction', 'WAWebViewOnceActions',
    // Misc
    'WAWebQuotedMsgAction', 'WAWebQuotedMsg',
    'WAWebTemplateMessage', 'WAWebTemplateAction',
    'WAWebListMessage', 'WAWebButtonMessage',
    'WAWebPaymentAction', 'WAWebPaymentActions',
    'WAWebCatalogAction', 'WAWebCatalogActions',
    'WAWebProductAction', 'WAWebCartAction',
    'WAWebOrderAction', 'WAWebOrderActions',
  ];
  known.forEach(n => testNames.add(n));

  // Test each module
  let found = 0;
  for (const name of testNames) {
    try {
      const mod = window.require(name);
      if (!mod) continue;
      found++;
      moduleNames.add(name);
      
      const keys = Object.keys(mod);
      const types = {};
      for (const k of keys.slice(0, 30)) {
        const v = mod[k];
        types[k] = v === null ? 'null' : typeof v === 'function' ? `fn(${v.length})` : typeof v;
      }
      
      // Categorize
      const entry = { name, keys: keys.slice(0, 30), keyCount: keys.length, types };
      
      if (/Collection/i.test(name)) results.collections.push(entry);
      else if (/Model/i.test(name) || /Conn/i.test(name)) results.models.push(entry);
      else if (/Action/i.test(name)) results.actions.push(entry);
      else if (/Service|Query|Exists/i.test(name)) results.services.push(entry);
      else if (/Media|Opaque|Prep|Mms|Upload|Download/i.test(name)) results.media.push(entry);
      else if (/Factory|Key|Wid/i.test(name)) results.factories.push(entry);
      else if (/Ephemeral|Disappear/i.test(name)) results.ephemeral.push(entry);
      else if (/Presence|Typing|Online|Compose/i.test(name)) results.presence.push(entry);
      else if (/State|Stream|Socket|Connection/i.test(name)) results.state.push(entry);
      else if (/Utils?|Helper/i.test(name)) results.utils.push(entry);
      else results.other.push(entry);
    } catch (e) {
      // Module doesn't exist or failed — ignore
    }
  }
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`WA WEB STORE — DEEP SCAN RESULTS`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`Total tested: ${testNames.size} | Found: ${found}`);
  console.log(`${'─'.repeat(60)}`);
  
  for (const [cat, items] of Object.entries(results)) {
    if (!items.length || cat === 'errors') continue;
    console.log(`\n🔹 ${cat.toUpperCase()} (${items.length})`);
    for (const item of items) {
      console.log(`  ${item.name} [${item.keyCount} keys]`);
      console.log(`    keys: ${item.keys.join(', ')}`);
      const typeStr = Object.entries(item.types).map(([k,v]) => `${k}:${v}`).join(', ');
      console.log(`    types: ${typeStr}`);
    }
  }
  
  // Return as object for programmatic use
  return results;
})();
```

---

## Scan 12 — Inspeccionar MsgCollection: ack, delivery, events

Este scan inspecciona un mensaje enviado para ver qué campos de ack existen
y qué eventos emite el modelo cuando cambia el ack.

```js
(() => {
  const { MsgCollection } = window.require('WAWebMsgCollection');
  
  // Buscar el último mensaje enviado por mí
  const myMsgs = MsgCollection._models.filter(m => m.get('id')?.fromMe);
  const last = myMsgs[myMsgs.length - 1];
  
  if (!last) { console.log('No hay mensajes enviados'); return; }
  
  console.log('═══ LAST SENT MESSAGE ═══');
  console.log('type:', last.get('type'));
  console.log('body:', (last.get('body') || '').slice(0, 80));
  console.log('ack:', last.get('ack'));
  console.log('t:', last.get('t'), '=', new Date(last.get('t') * 1000).toLocaleString());
  
  // ALL attributes
  const attrs = last.attributes || {};
  console.log('\n═══ ALL ATTRIBUTES ═══');
  const keys = Object.keys(attrs).sort();
  console.log('Total keys:', keys.length);
  for (const k of keys) {
    const v = attrs[k];
    if (v === undefined || v === null || v === false || v === '') continue;
    const type = typeof v;
    if (type === 'object') {
      console.log(`  ${k}: [${Array.isArray(v) ? 'Array(' + v.length + ')' : 'Object'}]`);
    } else {
      console.log(`  ${k}: ${String(v).slice(0, 100)} (${type})`);
    }
  }
  
  // Ack-related fields
  console.log('\n═══ ACK FIELDS ═══');
  ['ack', 'ackTimestamp', 'readByMe', 'isRead', 'isDelivered',
   'deliveredTimestamp', 'readTimestamp', 'playedTimestamp',
   'isPlayed', 'star', 'isStarred', 'isSentByMe', 'self',
   'local', 'isNewMsg', 'kicNotified', 'bizBotType',
   'latestEditSenderTimestampMs', 'latestEditMsgKey',
  ].forEach(key => {
    const val = typeof last.get === 'function' ? last.get(key) : attrs[key];
    if (val !== undefined && val !== null) console.log(`  ${key}:`, val);
  });
  
  // Model events
  console.log('\n═══ MODEL EVENTS ═══');
  console.log('Has .on():', typeof last.on === 'function');
  console.log('Has .off():', typeof last.off === 'function');
  console.log('Has .trigger():', typeof last.trigger === 'function');
  console.log('Has .listenTo():', typeof last.listenTo === 'function');
  
  // Test: listen for ack changes
  if (typeof last.on === 'function') {
    console.log('\n🔔 Listening for ack changes on this message for 60s...');
    const handler = (model) => {
      console.log(`🔔 ACK CHANGED: ${model.get('ack')} at ${new Date().toLocaleTimeString()}`);
    };
    last.on('change:ack', handler);
    setTimeout(() => {
      last.off('change:ack', handler);
      console.log('🔕 Stopped listening for ack changes');
    }, 60000);
  }
  
  // Collection-level events
  console.log('\n═══ COLLECTION EVENTS ═══');
  console.log('MsgCollection.on:', typeof MsgCollection.on === 'function');
  console.log('MsgCollection._events:', Object.keys(MsgCollection._events || {}).join(', '));
})();
```

---

## Scan 13 — Inspeccionar Presence y Typing

```js
(() => {
  // Presence: quién está online, quién está escribiendo
  const mods = {};
  const tryLoad = (name) => {
    try { const m = window.require(name); if (m) { mods[name] = m; return m; } } catch(_) {}
    return null;
  };
  
  // Presence modules
  [
    'WAWebPresenceCollection', 'WAWebPresenceModel', 'WAWebPresenceAction',
    'WAWebPresenceActions', 'WAWebPresenceUtils', 'WAWebPresenceState',
    'WAWebChatStateAction', 'WAWebChatStateActions', 'WAWebChatStateBridge',
    'WAWebComposeAction', 'WAWebComposeActions',
    'WAWebTypingAction', 'WAWebTypingActions',
    'WAWebSendPresence', 'WAWebPresenceSend',
    'WAWebOnlineStatus', 'WAWebOnlineAction',
    'WAWebAvailabilityUtils', 'WAWebAvailableAction',
  ].forEach(tryLoad);
  
  console.log('═══ PRESENCE MODULES FOUND ═══');
  for (const [name, mod] of Object.entries(mods)) {
    const keys = Object.keys(mod);
    console.log(`${name}: [${keys.length} keys] ${keys.join(', ')}`);
  }
  
  // Check WAWebCollections for presence
  try {
    const coll = window.require('WAWebCollections');
    if (coll) {
      console.log('\n═══ WAWebCollections keys ═══');
      console.log(Object.keys(coll).join(', '));
      
      // Check for Presence in collections
      if (coll.Presence) {
        console.log('\nPresence collection exists!');
        console.log('  _models count:', coll.Presence._models?.length);
        console.log('  first model keys:', coll.Presence._models?.[0] ? Object.keys(coll.Presence._models[0].attributes || {}).join(', ') : 'none');
      }
    }
  } catch(_) {}
  
  // ChatStateBridge — typing indicators
  try {
    const csb = window.require('WAWebChatStateBridge');
    if (csb) {
      console.log('\n═══ ChatStateBridge ═══');
      console.log('keys:', Object.keys(csb).join(', '));
      for (const [k, v] of Object.entries(csb)) {
        if (typeof v === 'function') console.log(`  ${k}: fn(${v.length})`);
      }
    }
  } catch(_) {}
})();
```

---

## Scan 14 — Inspeccionar Chat model completo

```js
(() => {
  const { ChatCollection } = window.require('WAWebChatCollection');
  
  // Buscar un chat activo
  const active = ChatCollection._models.find(c => c.active);
  const chat = active || ChatCollection._models[0];
  
  if (!chat) { console.log('No hay chats'); return; }
  
  console.log('═══ ACTIVE CHAT MODEL ═══');
  console.log('Name:', chat.formattedTitle || chat.name || chat.get?.('name'));
  
  const attrs = chat.attributes || {};
  const keys = Object.keys(attrs).sort();
  console.log('\nTotal attributes:', keys.length);
  
  for (const k of keys) {
    const v = attrs[k];
    if (v === undefined || v === null || v === false || v === '' || v === 0) continue;
    const type = typeof v;
    if (type === 'object') {
      if (Array.isArray(v)) console.log(`  ${k}: Array(${v.length})`);
      else console.log(`  ${k}: Object {${Object.keys(v).slice(0, 5).join(', ')}${Object.keys(v).length > 5 ? '...' : ''}}`);
    } else {
      console.log(`  ${k}: ${String(v).slice(0, 120)} (${type})`);
    }
  }
  
  // Methods on the model
  console.log('\n═══ CHAT MODEL METHODS ═══');
  const proto = Object.getPrototypeOf(chat);
  const methods = Object.getOwnPropertyNames(proto).filter(n => typeof proto[n] === 'function' && !n.startsWith('_'));
  console.log('Methods:', methods.sort().join(', '));
  
  // Events
  console.log('\n═══ CHAT EVENTS ═══');
  console.log('_events:', Object.keys(chat._events || {}).join(', '));
  
  // Unread count
  console.log('\n═══ UNREAD ═══');
  ['unreadCount', 'muteExpiration', 'pin', 'archive', 'isReadOnly',
   'notSpam', 'ephemeralDuration', 'disappearingModeDuration',
   'lastReceivedKey', 'lastSeen', 'presenceState',
  ].forEach(k => {
    const v = typeof chat.get === 'function' ? chat.get(k) : attrs[k];
    if (v !== undefined && v !== null) console.log(`  ${k}:`, v);
  });
  
  // Contact info
  if (chat.contact) {
    console.log('\n═══ CHAT.CONTACT ═══');
    const cattrs = chat.contact.attributes || {};
    const ckeys = Object.keys(cattrs).sort();
    for (const k of ckeys) {
      const v = cattrs[k];
      if (v === undefined || v === null || v === false || v === '' || v === 0) continue;
      console.log(`  ${k}: ${typeof v === 'object' ? JSON.stringify(v).slice(0, 80) : String(v).slice(0, 80)}`);
    }
  }
})();
```

---

## Scan 15 — Buscar módulos de Receipt/Ack/Read/Delivery

```js
(() => {
  const patterns = [
    'Receipt', 'Ack', 'Read', 'Deliver', 'Seen',
    'MsgInfo', 'MessageInfo', 'SendReceipt', 'ReadReceipt',
    'DeliveryReceipt', 'PlayedReceipt',
  ];
  
  const found = {};
  
  for (const pat of patterns) {
    for (const prefix of ['WAWeb', 'WASmaxWeb', 'WAWap']) {
      const names = [
        `${prefix}${pat}`, `${prefix}${pat}Action`, `${prefix}${pat}Actions`,
        `${prefix}${pat}Utils`, `${prefix}${pat}Service`, `${prefix}${pat}Model`,
        `${prefix}Send${pat}`, `${prefix}${pat}Send`,
        `${prefix}Get${pat}`, `${prefix}${pat}Get`,
      ];
      for (const name of names) {
        try {
          const mod = window.require(name);
          if (mod) {
            found[name] = Object.keys(mod);
            console.log(`✅ ${name}: [${Object.keys(mod).join(', ')}]`);
            for (const [k, v] of Object.entries(mod)) {
              if (typeof v === 'function') console.log(`  ${k}: fn(${v.length}) ${v.toString().slice(0, 100)}`);
            }
          }
        } catch(_) {}
      }
    }
  }
  
  console.log(`\nTotal receipt/ack modules found: ${Object.keys(found).length}`);
  return found;
})();
```

---

## Cómo usar estos scans

1. Abrí WhatsApp Web en Chrome
2. F12 → Console
3. Pegá cada scan uno a la vez
4. Copiá el output completo y pegalo acá

Con la info de los 5 scans voy a poder:
- Trackear ack en tiempo real con events nativos (no polling)
- Detectar typing/online/last seen
- Controlar read receipts
- Saber exactamente qué módulos existen y qué funciones exponen
