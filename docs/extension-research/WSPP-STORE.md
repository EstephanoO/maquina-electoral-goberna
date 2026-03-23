# WSPP Store — Hallazgos Técnicos

> Última actualización: 2026-03-03  
> Extension: `extensions/wspp-store-tester`

---

## 1. Bundler

WhatsApp Web **NO usa webpack**. Usa **Metro/Haste** (bundler de Meta/Facebook).

| Señal | Valor |
|-------|-------|
| `window.__d` | `define(factory, moduleId, dependencyMap)` — registra módulos |
| `window.require` | `require(moduleId)` — carga módulos por nombre string |
| `window.requireLazy` | carga diferida |
| `window.__onAfterModuleFactory` | hook post-carga de módulo |
| `webpackChunkwhatsapp_web_client` | **NO existe** |

---

## 2. Método de inyección

```
manifest.json
  content_scripts:
    - js: inject.js
      world: MAIN          ← contexto real de la página (no aislado)
      run_at: document_start
    - js: content.js
      world: ISOLATED      ← bridge popup ↔ inject.js
      run_at: document_start
```

- `world: MAIN` es la única forma de acceder al `window` real de WhatsApp.
- `document_start` garantiza que corremos antes de los scripts de WhatsApp.
- **NO** envolver `__d` — rompe la firma interna (`e.indexOf is not a function`).
- **NO** envolver `require` — espera `moduleId` numérico, no string.

---

## 3. Módulos disponibles via `require()`

Todos se cargan con `window.require('NombreModulo')`:

| Módulo | Exports útiles | Tipo |
|--------|---------------|------|
| `WAWebChatCollection` | `ChatCollection`, `ChatCollectionImpl` | instancia + clase |
| `WAWebMsgCollection` | `MsgCollection`, `MsgCollectionImpl`, `MEDIA_QUERY_LIMIT` | instancia + clase |
| `WAWebContactCollection` | `ContactCollection`, `ContactCollectionImpl` | instancia + clase |
| `WAWebConnModel` | `Conn` | instancia Backbone |
| `WAWebChatModel` | `Chat` | clase |
| `WAWebMsgModel` | `Msg` | clase |
| `WAWebPresenceCollection` | `PresenceCollection` | instancia Backbone |
| `WAWebGroupMetadataCollection` | `GroupMetadataCollection` | instancia Backbone |
| `WAWebLabelCollection` | `LabelCollection` | instancia Backbone |
| `WAWebStatusCollection` | `StatusCollection` | instancia Backbone |
| `WAWebCallCollection` | `CallCollection` | instancia Backbone |
| `WAWebBlocklistCollection` | `BlocklistCollection` | instancia Backbone |

Módulos que **no existen** (nombre incorrecto):
- `WAWebStore`, `Store`, `WAWebStoreModel`
- `WAWebMsgSendUtils`, `WAWebStream`, `WAWebSocket`, `WAWebSendMsgCF`

---

## 4. Estructura de datos

### Conn (modelo Backbone)
```js
const Conn = window.require('WAWebConnModel').Conn;

Conn.get('pushname')   // → 'Estephano Orbegoso'
Conn.get('wid')        // → undefined al inicio, se llena async
Conn.get('connected')  // → undefined (campo distinto)
Conn.get('phone')      // → undefined al inicio

// Esperar inicialización:
Conn.on('change', () => {
  const wid = Conn.get('wid');
  if (wid) console.log(wid._serialized); // '51999...@c.us'
});

// Atributos internos (no usar directamente):
Conn.attributes // { id, ref, wid, pushname, platform, ... }
```

### ChatCollection (instancia Backbone)
```js
const { ChatCollection } = window.require('WAWebChatCollection');

ChatCollection._models          // Array de chats cargados
ChatCollection._models.length   // 102 chats (ejemplo)

// Cada chat:
chat.id._serialized             // '120363327994340402@g.us'
chat.get('name')                // 'Dsoul 3.0'
chat.get('unreadCount')         // 72
chat.get('isGroup')             // true/false

// Listeners:
ChatCollection.on('add', (chat) => { ... })
ChatCollection.on('remove', (chat) => { ... })
ChatCollection.on('change', (chat) => { ... })
```

### MsgCollection (instancia Backbone)
```js
const { MsgCollection } = window.require('WAWebMsgCollection');

MsgCollection._models.length    // 221 msgs en cola

// Listener de mensajes nuevos (TIEMPO REAL ✓):
MsgCollection.on('add', (msg) => {
  const isMine = msg.get('id')?.fromMe;
  const data = {
    id:        msg.get('id')._serialized,
    from:      msg.get('from')._serialized,   // '40415742926969@lid'
    body:      msg.get('body'),               // 'hola'
    type:      msg.get('type'),               // 'chat' | 'image' | ...
    timestamp: msg.get('t'),                  // unix timestamp
  };
});
```

### ContactCollection (instancia Backbone)
```js
const { ContactCollection } = window.require('WAWebContactCollection');

ContactCollection._models.length  // 647 contactos

// Cada contacto:
contact.get('name')
contact.get('pushname')
contact.get('id')._serialized    // '51999...@c.us'
```

---

## 5. IDs de WhatsApp

| Formato | Ejemplo | Tipo |
|---------|---------|------|
| `@c.us` | `51977764666@c.us` | contacto individual |
| `@g.us` | `120363327994340402@g.us` | grupo |
| `@lid` | `40415742926969@lid` | ID privacidad (nuevo sistema WA) |
| `@s.whatsapp.net` | `51999...@s.whatsapp.net` | alternativo c.us |

Los IDs `@lid` son el nuevo sistema de privacidad de WhatsApp — no contienen el número de teléfono directamente.

---

## 6. Comunicación Extension ↔ Página

```
inject.js (world: MAIN)
  ↕ window.postMessage({ type: 'WSPP_SCAN' / 'WSPP_RESULT' / 'WSPP_NEW_MSG' })
content.js (world: ISOLATED)
  ↕ chrome.runtime.sendMessage / chrome.tabs.sendMessage
popup.js
```

### Mensajes definidos

| Dirección | type | payload |
|-----------|------|---------|
| popup → content | `chrome.tabs.sendMessage({ action: 'scan' })` | — |
| content → inject | `postMessage({ type: 'WSPP_SCAN' })` | — |
| inject → content | `postMessage({ type: 'WSPP_RESULT', payload })` | storeFound, chats, contacts, me |
| inject → content | `postMessage({ type: 'WSPP_NEW_MSG', payload })` | id, from, body, type, timestamp |
| inject → content | `postMessage({ type: 'WSPP_ME', payload })` | pushname, wid, phone |

---

## 7. Errores conocidos y soluciones

| Error | Causa | Solución |
|-------|-------|----------|
| `e.indexOf is not a function` | Envolver `__d` rompe firma interna | No tocar `__d` |
| `multiple roots: existing=App new=App` | Inyectar script via DOM manipulation (innerHTML/prepend) | Usar `world: MAIN` en manifest |
| `Requiring unknown module "WAWebStore"` | No existe ese nombre | Usar módulos individuales |
| `Store.Msg.on is not a function` | `Msg` es la **clase**, no la instancia | Usar `MsgCollection` |
| `Store.Chat.getModelsArray is not a function` | `Chat` es clase | Usar `ChatCollection._models` |
| `registry: 0 módulos` | Intentar capturar `__d` tarde | Usar `world: MAIN` + `document_start` |

---

## 8. Próximos pasos — CRM

- [ ] Listar chats con nombre, foto, último mensaje, unread count
- [ ] Abrir chat y ver mensajes
- [ ] Listener tiempo real de mensajes nuevos
- [ ] Buscar contactos
- [ ] Estadísticas: total chats, mensajes pendientes, grupos
- [ ] Envío de mensajes (requiere encontrar `WAWebSendMsg*`)
