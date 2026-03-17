# Extensión Chrome — Protocolo de mensajes
> Última actualización: 2026-03-17

Todos los mensajes que fluyen entre los 3 contextos de la extensión.

---

## Los 3 contextos

```
inject.js       → world: MAIN     → accede a window.require (módulos WA Web)
content.js      → world: ISOLATED → bridge entre inject y background
background.js   → Service Worker  → accede a chrome.* APIs y fetch al backend
```

**Comunicación:**
- `inject → content`: `window.postMessage(payload, WA_ORIGIN)`
- `content → inject`: `window.postMessage(payload, WA_ORIGIN)`
- `content → background`: `chrome.runtime.sendMessage(payload, callback)`
- `background → content`: `chrome.tabs.sendMessage(tabId, payload)`

---

## Mensajes inject → content → background (requests)

### Mensajes de conversación

| Type | Emitido desde | Handler background | Descripción |
|---|---|---|---|
| `WSPP_SENT` | `send-hook.js` | `sent-handler.js` | Mensaje saliente detectado por DOM |
| `WSPP_SENT_RICH` | `wa-module-installer.js` | `sent-handler.js` | Mensaje saliente detectado por WA internals |
| `WSPP_RECEIVED` | `wa-module-installer.js` | `received-handler.js` | Mensaje entrante detectado |
| `WSPP_CHAT_OPENED` | `wa-module-installer.js` | `chat-opened-handler.js` | Usuario abrió un chat |
| `WSPP_CLASSIFY` | `validation-overlay.js` | `classify-handler.js` | Clasificación manual de contacto |
| `WSPP_OWN_NUMBER_DETECTED` | `wa-module-installer.js` | `sent-handler.js` | Número propio detectado, actualizar storage |

### Mensajes de spam

| Type | Emitido desde | Handler background | Descripción |
|---|---|---|---|
| `WSPP_SPAM_CHECK_NOW` | `blast-panel.js`, `wa-validator-panel.js` | `sent-handler.js` | Check síncrono antes de enviar |
| `WSPP_VALIDATOR_CONV_SENT` | `wa-validator-panel.js` | `sent-handler.js` | Registrar msg enviado en modo conversación |

### Mensajes de catálogo de audio

| Type | Emitido desde | Handler background | Descripción |
|---|---|---|---|
| `FETCH_AUDIO_CATALOG` | `audio-catalog-panel.js` | `audio-catalog-handlers.js` | Listar items del catálogo |
| `GET_CATALOG_AUDIO` | `audio-catalog-panel.js` | `audio-catalog-handlers.js` | Obtener base64 de un audio específico |
| `GENERATE_CATALOG_AUDIO` | `audio-catalog-panel.js` | `audio-catalog-handlers.js` | Regenerar audio vía ElevenLabs |
| `UPDATE_CATALOG_SCRIPT` | `audio-catalog-panel.js` | `audio-catalog-handlers.js` | Actualizar guión de texto |
| `DELETE_CATALOG_ITEM` | `audio-catalog-panel.js` | `audio-catalog-handlers.js` | Eliminar item |
| `CREATE_CATALOG_ITEM` | `audio-catalog-panel.js` | `audio-catalog-handlers.js` | Crear item (con auto_generate) |
| `FETCH_CATALOG_CATEGORIES` | `audio-catalog-panel.js` | `audio-catalog-handlers.js` | Listar categorías dinámicas |
| `CREATE_CATALOG_CATEGORY` | `audio-catalog-panel.js` | `audio-catalog-handlers.js` | Crear categoría |
| `DELETE_CATALOG_CATEGORY` | `audio-catalog-panel.js` | `audio-catalog-handlers.js` | Eliminar categoría + sus items |
| `BUST_AUDIO_CACHE` | `audio-catalog-panel.js` | `audio-catalog-handlers.js` | Invalidar cache de audio específico |
| `BUST_CATALOG_CACHE` | `audio-catalog-panel.js` | `audio-catalog-handlers.js` | Invalidar todo el cache del catálogo |

### Mensajes de blast

| Type | Emitido desde | Handler background | Descripción |
|---|---|---|---|
| `BLAST_GET_FORM_CONTACTS` | `blast-panel.js` | `blast-handlers.js` | Contactos segmentados para este número |
| `BLAST_MARK_HABLADO` | `blast-panel.js` | `blast-handlers.js` | Marcar IDs como hablado post-envío |
| `BLAST_REPORT_RESULTS` → `BLAST_REPORT` | `blast-panel.js` | `blast-handlers.js` | Log de mensajes enviados/fallidos |
| `BLAST_GET_NUMBER_CONFIG` | `blast-panel.js` | `blast-handlers.js` | Config del slot del número activo |

### Mensajes del validador WA

| Type | Emitido desde | Handler background | Descripción |
|---|---|---|---|
| `WA_VALIDATOR_GET_CONTACTS` | `wa-validator-panel.js` | `wa-validator-handlers.js` | Contactos pendientes de validación |
| `WA_VALIDATOR_SAVE_RESULTS` | `wa-validator-panel.js` | `wa-validator-handlers.js` | Guardar lote de resultados |
| `WA_VALIDATOR_GET_STATS_REQ` → `WA_VALIDATOR_GET_STATS` | `wa-validator-panel.js` | `wa-validator-handlers.js` | Stats por brigadista |

---

## Mensajes background → content → inject (responses / events)

### Respuestas a requests

| Type | Origen | Consumidor inject | Descripción |
|---|---|---|---|
| `WSPP_VALIDATION_DATA` | `chat-opened-handler.js` | `validation-overlay.js` | Datos del contacto abierto |
| `WSPP_VALIDATION_CLEAR` | `chat-opened-handler.js` | `validation-overlay.js` | No hay datos para este contacto |
| `WSPP_CLASSIFY_RESULT` | `classify-handler.js` | `validation-overlay.js` | Resultado de clasificación manual |
| `WSPP_SPAM_CHECK_RESULT` | `sent-handler.js` | `blast-panel.js`, `wa-validator-panel.js` | Resultado del spam check |
| `AUDIO_CATALOG_READY` | `audio-catalog-handlers.js` | `audio-catalog-panel.js` | Items del catálogo listos |
| `CATALOG_AUDIO_READY` | `audio-catalog-handlers.js` | `audio-catalog-panel.js` | Audio base64 listo |
| `GENERATE_CATALOG_AUDIO_DONE` | `audio-catalog-handlers.js` | `audio-catalog-panel.js` | Generación completada |
| `UPDATE_CATALOG_SCRIPT_DONE` | `audio-catalog-handlers.js` | `audio-catalog-panel.js` | Guión actualizado |
| `DELETE_CATALOG_ITEM_DONE` | `audio-catalog-handlers.js` | `audio-catalog-panel.js` | Item eliminado |
| `CREATE_CATALOG_ITEM_DONE` | `audio-catalog-handlers.js` | `audio-catalog-panel.js` | Item creado |
| `CATALOG_CATEGORIES_READY` | `audio-catalog-handlers.js` | `audio-catalog-panel.js` | Categorías listas |
| `CREATE_CATALOG_CATEGORY_DONE` | `audio-catalog-handlers.js` | `audio-catalog-panel.js` | Categoría creada |
| `DELETE_CATALOG_CATEGORY_DONE` | `audio-catalog-handlers.js` | `audio-catalog-panel.js` | Categoría eliminada |
| `BLAST_FORM_CONTACTS_READY` | `blast-handlers.js` | `blast-panel.js` | Contactos del segmento listos |
| `BLAST_NUMBER_CONFIG_READY` | `blast-handlers.js` | `blast-panel.js` | Config del slot lista |
| `WA_VALIDATOR_CONTACTS_READY` | `wa-validator-handlers.js` | `wa-validator-panel.js` | Contactos para validar listos |
| `WA_VALIDATOR_STATS_READY` | `wa-validator-handlers.js` | `wa-validator-panel.js` | Stats por brigadista listas |

### Eventos push (background → tabs)

| Type | Emitido desde | Consumidor inject | Descripción |
|---|---|---|---|
| `WSPP_SPAM_WARNING` | `spam-detector.js` (broadcast a todas las tabs WA) | `validation-overlay.js` | Alerta de spam detectado |

### Mensajes de inicialización (content → inject al cargar)

| Type | Origen | Descripción |
|---|---|---|
| `WSPP_SET_OWN_NUMBER` | `content.js` desde `chrome.storage` | Número propio al abrir WA |
| `WSPP_SET_USER_ROLE` | `content.js` desde `chrome.storage` | Rol del usuario para controlar UI |
| `WSPP_OPEN_CHAT` | `content.js` relay desde `wa-module-installer.js` | Abrir chat programáticamente |
| `WSPP_OPEN_CHAT_RESULT` | `wa-module-installer.js` | Resultado de abrir chat |

---

## Reglas para agregar un mensaje nuevo

1. **Definir el type** en ambos extremos con el mismo string literal
2. **Content bridge** (inject→background): agregar en `content.js` el relay que captura el `window.addEventListener` y llama `chrome.runtime.sendMessage`
3. **Content bridge** (background→inject): si el background necesita pushear, usar `chrome.tabs.sendMessage` y agregar el relay en `content.js` que hace `window.postMessage`
4. **Handler background**: agregar `chrome.runtime.onMessage.addListener` con `return true` para async
5. **Consumidor inject**: agregar en el `window.addEventListener('message', ...)` del archivo correspondiente
6. **Documentar aquí** el nuevo mensaje

---

## Payload shapes estándar

### Request (inject → background via content)
```js
window.postMessage({ type: 'MI_REQUEST', ...params }, WA_ORIGIN)
```

### Response (background → content → inject)
```js
// Background responde via sendResponse o tabs.sendMessage:
{ type: 'MI_REQUEST_READY', ok: true, ...data }
// o en caso de error:
{ type: 'MI_REQUEST_READY', ok: false, error: 'mensaje descriptivo' }
```

### Fire-and-forget (no espera respuesta)
```js
window.postMessage({ type: 'MI_EVENT' }, WA_ORIGIN)
// content.js: chrome.runtime.sendMessage({ type: 'MI_EVENT' }, () => {})
```
