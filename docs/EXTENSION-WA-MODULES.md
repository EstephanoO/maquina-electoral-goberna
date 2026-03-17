# Extensión Chrome — Módulos internos de WhatsApp Web
> Última actualización: 2026-03-17

WA Web expone sus módulos internos via `window.require('NombreModulo')`. Estos módulos
**cambian de nombre con cada deploy de WA Web**, por eso siempre se usan con fallbacks.

---

## Patrón de uso obligatorio

```js
// ❌ INCORRECTO — rompe cuando WA renombra el módulo
const mod = window.require('WAWebPrepRawMedia');

// ✅ CORRECTO — prueba múltiples nombres hasta encontrar uno
function _requireAny(...names) {
  for (const name of names) {
    try { const m = window.require(name); if (m) return m; } catch (_) {}
  }
  throw new Error('None of these WA modules found: ' + names.join(', '));
}
const prepMod = _requireAny('WAWebPrepRawMedia', 'WAWebPrepareMediaUtils');
```

---

## Módulos confirmados (2026-03-17)

### Mensajería
| Módulo | Alternativas | Uso | Función clave |
|---|---|---|---|
| `WAWebMsgCollection` | — | `wa-module-installer.js` | `.on('add', cb)` para mensajes nuevos |
| `WAWebChatCollection` | — | `wa-module-installer.js`, `jid-resolver.js` | `.find(c => c.active)` para chat activo |
| `WAWebContactCollection` | — | `jid-resolver.js` | Índice de contactos para resolver `@lid` |
| `WAWebSendMsgChatAction` | — | `blast-panel.js` | `addAndSendMsgToChat(chat, message)` |
| `WAWebFindChatAction` | — | múltiples | `findOrCreateLatestChat(wid)` |
| `WAWebCollections` | — | múltiples | `Chat.get(wid)` |

### Identidad
| Módulo | Alternativas | Uso | Función clave |
|---|---|---|---|
| `WAWebWidFactory` | — | múltiples | `createWid(jid)`, `numberForLid(wid)`, `getMeWid()` |
| `WAWebUserPrefsMeUser` | — | múltiples | `getMeUser()`, `getMaybeMePnUser()` |
| `WAWebConnModel` | — | `jid-resolver.js` | `Conn.wid` (número propio fallback) |
| `WAWebMsgKey` | — | `blast-panel.js` | `newId()`, constructor para crear key de mensaje |

### Media PTT (pipeline completo)
| Módulo | Alternativas | Función clave |
|---|---|---|
| `WAWebMediaOpaqueData` | `WAWebMediaOpaqueDataUtils` | `createFromData(file, mimeType)`, `.url()`, `.autorelease()` |
| `WAWebPrepRawMedia` | `WAWebPrepareMediaUtils` | `prepRawMedia(opaqueData, {isPtt: true})` → `.waitForPrep()` |
| `WAWebMediaStorage` | `WAWebMediaStorageUtils`, `WAWebMediaStorageManager` | `getOrCreateMediaObject(filehash)` |
| `WAWebMmsMediaTypes` | `WAWebMediaMsgTypes`, `WAWebMediaTypes` | `msgToMediaType({type, isGif})` |
| `WAWebMediaMmsV4Upload` | `WAWebMediaUploadUtils`, `WAWebUploadManager`, `WAWebMediaMmsUpload`, `WAWebMmsUpload` | `uploadMedia({chat, mediaData, mediaObject, mediaType})` |

### Validación de números (modo silencioso)
| Módulo | Alternativas | Función clave |
|---|---|---|
| `WAWebQueryExistsService` | `WAWebPhoneExistsService` | `queryExists(jid)` → boolean |
| `WAWebPhoneNumberQueryService` | — | `queryPhoneNumber(number)` |

### Mensajes efímeros (opcional)
| Módulo | Alternativas | Función clave |
|---|---|---|
| `WAWebGetEphemeralFieldsMsgActionsUtils` | `WAWebEphemeralFields`, `WAWebEphemeralUtils` | `getEphemeralFields(chat)` |

---

## Pipeline PTT completo (en orden)

```
1. Resolver chat
   WAWebWidFactory.createWid(jid)
   WAWebCollections.Chat.get(wid)
   WAWebFindChatAction.findOrCreateLatestChat(wid)  // si no está en store

2. Crear File
   new File([bytes], 'audio.ogg', { type: 'audio/ogg; codecs=opus' })

3. OpaqueData
   WAWebMediaOpaqueData.createFromData(file, mime)

4. PrepRawMedia → waitForPrep
   WAWebPrepRawMedia.prepRawMedia(opaqueData, { isPtt: true })
   await .waitForPrep()  → mediaData

5. mediaObject
   WAWebMediaStorage.getOrCreateMediaObject(mediaData.filehash)

6. mediaType
   WAWebMmsMediaTypes.msgToMediaType({ type: 'ptt', isGif: false })

7. OpaqueData guard (duck-typing, no instanceof)
   if (!rawBlob.url || !rawBlob.autorelease) re-wrap en OpaqueData

8. renderableUrl + consolidate
   mediaData.renderableUrl = pttBlob.url()
   mediaObject.consolidate(mediaData.toJSON())

9. Upload
   WAWebMediaMmsV4Upload.uploadMedia({ chat, mediaData, mediaObject, mediaType })
   pttBlob.autorelease()  ← DESPUÉS del upload

10. Patch mediaData con resultado del upload
    mediaData.set({ directPath, mediaKey, ... })  // o Object.assign si no tiene .set()

11. Build + send mensaje
    WAWebUserPrefsMeUser.getMeUser()
    WAWebMsgKey.newId()
    WAWebSendMsgChatAction.addAndSendMsgToChat(chat, {
      type: 'ptt', mimetype, id, from, to, ...mediaData.toJSON()
    })
```

---

## Script de diagnóstico (Scan 9)

Pegá esto en la consola de WA Web para verificar qué módulos existen en la versión actual:

```js
(() => {
  const check = (name) => {
    try { const m = window.require(name); return m ? '✅ ' + Object.keys(m).slice(0,5).join(', ') : '⚠️ empty'; }
    catch(e) { return '❌ ' + e.message.slice(0,40); }
  };
  const modules = [
    'WAWebPrepRawMedia','WAWebPrepareMediaUtils',
    'WAWebMediaOpaqueData','WAWebMediaOpaqueDataUtils',
    'WAWebMediaStorage','WAWebMediaStorageUtils','WAWebMediaStorageManager',
    'WAWebMmsMediaTypes','WAWebMediaMsgTypes','WAWebMediaTypes',
    'WAWebMediaMmsV4Upload','WAWebMediaUploadUtils','WAWebUploadManager','WAWebMediaMmsUpload','WAWebMmsUpload',
    'WAWebSendMsgChatAction','WAWebFindChatAction','WAWebWidFactory','WAWebCollections',
    'WAWebUserPrefsMeUser','WAWebMsgKey',
    'WAWebMsgCollection','WAWebChatCollection','WAWebContactCollection',
    'WAWebQueryExistsService','WAWebPhoneExistsService',
    'WAWebGetEphemeralFieldsMsgActionsUtils','WAWebEphemeralFields',
  ];
  console.log('=== Módulos WA Web ===');
  modules.forEach(m => console.log(m + ':', check(m)));
})();
```

Correr esto después de cada actualización de WA Web para detectar módulos renombrados.

---

## Notas críticas

**`uploadMedia` signature cambia entre builds de WA:**
- Versiones viejas: `uploadMedia({ mimetype, mediaObject, mediaType })`
- Versiones nuevas: `uploadMedia({ chat, mediaData, mediaObject, mediaType, mmsOptions })`
- Siempre pasar todos los parámetros — los que no entienda los ignora

**`autorelease()` timing:**
- `pttBlob.autorelease()` DESPUÉS de que `uploadMedia()` resuelve
- Si se llama antes, el blob URL se libera y el upload falla silenciosamente

**`mediaData.set()` puede no existir:**
- `waitForPrep()` puede devolver un Backbone model (tiene `.set()`) o un POJO
- Siempre: `if (typeof mediaData.set === 'function') mediaData.set(x); else Object.assign(mediaData, x)`

**`instanceof OpaqueData` no funciona:**
- El module loader de WA puede devolver distintas instancias de la misma clase
- Siempre usar duck-typing: `typeof blob.url === 'function' && typeof blob.autorelease === 'function'`
