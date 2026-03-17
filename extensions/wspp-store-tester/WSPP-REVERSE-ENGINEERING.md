# WhatsApp Web — Ingeniería Inversa Completa del Store Interno

> Última actualización: 2026-03-17
> Escaneado en vivo contra WA Web en producción
> Método: 6,298 nombres testeados via `window.require()` → **172 módulos encontrados**

---

## 0. Resumen ejecutivo

WhatsApp Web usa **Metro/Haste** (bundler de Meta), NO webpack.
Los módulos se registran con `window.__d(factory, moduleId, deps)` y se cargan con `window.require('NombreModulo')`.

| Dato | Valor |
|------|-------|
| Bundler | Metro/Haste (via `window.__d` / `window.require`) |
| Total módulos encontrados | **172** (de 6,298 testeados) |
| Colecciones Backbone | **51** (via `WAWebCollections`) |
| Chats cargados | 143 |
| Contactos cargados | 496 |
| Mensajes en memoria | 525 |
| Presencias tracked | 153 |
| Foto perfil cached | 103 |

---

## 1. Arquitectura del Store

```
WAWebCollections (51 colecciones)
  ├── Chat (143 modelos)           ← Backbone Collection + Model
  ├── Msg (525 modelos)            ← Backbone Collection + Model
  ├── Contact (496 modelos)        ← Backbone Collection + Model
  ├── Presence (153 modelos)       ← Online/typing/recording
  ├── Mute (154 modelos)           ← Silenciados
  ├── ProfilePicThumb (103)        ← Fotos de perfil
  ├── Label (4 modelos)            ← Etiquetas
  ├── BusinessProfile (51)         ← Perfiles de empresa
  ├── GroupMetadata (19)           ← Metadata de grupos
  ├── Newsletter (10)              ← Canales
  ├── NewsletterMetadata (11)      ← Metadata canales
  ├── Status (7)                   ← Estados/Stories
  ├── Blocklist (3)                ← Bloqueados
  └── 38 colecciones más...

Singletons (no colecciones):
  ├── Conn      ← Información de conexión y usuario
  ├── Stream    ← Estado del stream (NORMAL/SYNCING)
  └── Socket    ← Estado del WebSocket (CONNECTED/DISCONNECTED)
```

---

## 2. Identidad del usuario

### Módulos de identidad

```js
// WAWebUserPrefsMeUser (26 funciones)
getMeUser()                    // → { _serialized: '51955135507@c.us', user: '51955135507', server: 'c.us' }
getMaybeMePnUser()             // → mismo (Phone Number)
getMaybeMeLidUser()            // → { _serialized: '195997208682673@lid', user: '195997208682673', server: 'lid' }
getMeDisplayNameOrThrow()      // → nombre del usuario
isMeAccount(wid)               // → boolean
isMeAccountNonLid(wid)         // → boolean
getMePNandLIDWids()            // → ambos WIDs
setMeDisplayName(name)         // → cambiar nombre mostrado

// WAWebConnModel
Conn.get('pushname')           // → 'Estephano Orbegoso'
Conn.get('platform')           // → 'android'
Conn.get('ref')                // → token de referencia
Conn.get('meReadyTriggered')   // → true cuando está listo
// Eventos: change:phone, change:platform, me_ready, change:pushname
```

### WAWebWidFactory (17 funciones)

```js
createWid(jid)                          // '51999@c.us' → Wid object
createWidFromWidLike(obj)               // {server, user} → Wid
createUserWidOrThrow(user, server)      // → Wid
createUserLidOrThrow(user, server)      // → Wid
asChatWid(wid)                          // → Wid para chat
asGroupWidOrThrow(wid)                  // → Wid para grupo
asNewsletterWidOrThrow(wid)             // → Wid para canal
isWidlike(obj)                          // → boolean
```

### WAWebWid (27 funciones de validación)

```js
isUser(wid)                    // → true si es usuario
isGroup(wid)                   // → true si es grupo
isBroadcast(wid)               // → true si es broadcast
isNewsletter(wid)              // → true si es canal
isHosted(wid)                  // → true si es cuenta hosted
isStringLid(str)               // → true si es @lid
isXWid(wid)                    // → validación genérica
```

---

## 3. Chat Model (125 atributos)

### Atributos clave

| Atributo | Tipo | Descripción |
|----------|------|-------------|
| `id._serialized` | string | JID del chat (`@c.us`, `@g.us`, `@lid`) |
| `formattedTitle` | string | Nombre mostrado del chat |
| `name` | string | Nombre guardado (puede ser undefined) |
| `active` | boolean | Si es el chat actualmente seleccionado |
| `unreadCount` | number | Mensajes no leídos |
| `unreadMentionCount` | number | Menciones no leídas |
| `hasUnreadMention` | boolean | Flag de mención pendiente |
| `t` | number | Timestamp último mensaje (unix) |
| `muteExpiration` | number | Hasta cuándo está silenciado (0 = no silenciado) |
| `pin` | number/undefined | Pin timestamp (undefined = no fijado) |
| `archive` | boolean | Si está archivado |
| `isLocked` | boolean | Chat bloqueado con código |
| `isFavorite` | boolean | Marcado como favorito |
| `canSend` | boolean | Si se puede enviar mensaje |
| `isReadOnly` | boolean | Chat de solo lectura |
| `isAssignedToMe` | boolean | Asignado al usuario actual |
| `msgsLength` | number | Total mensajes en el chat |
| `ephemeralDuration` | number | Duración mensajes efímeros (0 = desactivado) |
| `disappearingModeInitiator` | string | Quién activó mensajes efímeros |
| `contact` | object | Modelo Backbone del contacto |
| `presence` | object | Modelo de presencia (online/typing) |
| `mute` | object | Modelo de silencio |
| `lastReceivedKey` | object | Key del último mensaje recibido |
| `endOfHistoryTransferType` | number | Tipo de transferencia de historial |
| `mediaCount` | number | Cantidad de media |
| `docCount` | number | Cantidad de documentos |
| `linkCount` | number | Cantidad de links |
| `productCount` | number | Cantidad de productos |
| `notSpam` | boolean | Marcado como no spam |
| `trusted` | boolean | Chat de confianza |

### Métodos del Chat (relevantes)

```js
// Consulta
chat.get('atributo')                    // Getter Backbone
chat.title()                            // Título formateado
chat.getParticipantCount()              // Participantes (grupo)
chat.iAmAdmin()                         // Soy admin del grupo?
chat.isBusinessGroup()                  // Es grupo de empresa?
chat.isCAG()                            // Es Community Action Group?
chat.hasMaybeSentMsgToChat()            // He enviado algún msg?
chat.hasUnreadEdit()                    // Tiene edit no leído?
chat.shouldShowUnreadDivider()          // Mostrar divisor no leídos?
chat.senderMsgCount()                   // Contador de msgs enviados

// Mensajes del chat
chat.getAllMsgs()                       // Todos los mensajes
chat.getStarredMsgs()                   // Mensajes destacados
chat.getMediaMsgs()                     // Mensajes con media
chat.getDocMsgs()                       // Documentos
chat.getLinkMsgs()                      // Links
chat.getKeptMsgs()                      // Mensajes mantenidos (keep)
chat.getEventMsgs()                     // Mensajes de eventos

// Acciones
chat.delete()                           // Eliminar chat
chat.deleteMessages(msgs)               // Eliminar mensajes
chat.clear()                            // Limpiar chat
chat.unstarAll()                        // Quitar todas las estrellas
chat.sortMsgs()                         // Reordenar mensajes

// Estado
chat.setComposeContents(contents)       // Setear borrador
chat.getComposeContents()               // Obtener borrador
chat.setAttachMediaContents(contents)   // Adjuntar media
chat.setChatWallpaper(wallpaper)        // Cambiar fondo
chat.setForceDismissAiAgentBlockingBar()// Ocultar barra de bot
```

### Eventos del Chat

```js
chat.on('change:active', fn)            // Chat seleccionado/deseleccionado
chat.on('change:unreadCount', fn)       // Cambio en no leídos
chat.on('change:t', fn)                 // Nuevo último mensaje
chat.on('change:muteExpiration', fn)    // Silencio cambiado
chat.on('change:archive', fn)           // Archivado/desarchivado
chat.on('change:isLocked', fn)          // Bloqueado/desbloqueado
chat.on('change:msgs', fn)             // Mensajes cambiaron
chat.on('change:msgsLength', fn)        // Cantidad de msgs cambió
chat.on('change:pendingSeenCount', fn)  // Msgs pendientes de "visto"
chat.on('change:id', fn)                // ID cambió (raro)
```

### ChatCollection — Eventos globales

```js
ChatCollection.on('add', fn)                    // Chat nuevo agregado
ChatCollection.on('remove', fn)                 // Chat eliminado
ChatCollection.on('sort', fn)                   // Reordenado
ChatCollection.on('change:unreadCount', fn)     // Cualquier chat cambió unread
ChatCollection.on('change:showUnreadInTitle', fn) // Badge del título
ChatCollection.on('collection_has_synced', fn)  // Sync completado
```

---

## 4. Message Model (416 atributos)

### Atributos clave — Mensaje de texto

| Atributo | Tipo | Descripción |
|----------|------|-------------|
| `id._serialized` | string | ID único del mensaje |
| `id.fromMe` | boolean | Si lo envié yo |
| `from._serialized` | string | Remitente JID |
| `to._serialized` | string | Destinatario JID |
| `body` | string | Texto del mensaje |
| `type` | string | Tipo: chat, image, video, ptt, document, sticker, etc. |
| `t` | number | Timestamp unix |
| `ack` | number | Estado de entrega (ver tabla ACK) |
| `star` | boolean | Mensaje destacado |
| `isForwarded` | boolean | Es reenviado |
| `forwardsCount` | number | Veces reenviado |
| `hasReaction` | boolean | Tiene reacción |
| `mentionedJidList` | array | Lista de mencionados |
| `isQuotedMsgAvailable` | boolean | Tiene mensaje citado |
| `isMdHistoryMsg` | boolean | Viene del historial multi-device |
| `viewMode` | string | 'VISIBLE' | 'REVOKED' |

### Atributos extra — Mensaje de media (PTT, video, imagen)

| Atributo | Tipo | Descripción |
|----------|------|-------------|
| `mimetype` | string | `audio/ogg; codecs=opus`, `video/mp4`, etc. |
| `duration` | string | Duración en segundos |
| `size` | number | Tamaño en bytes |
| `filehash` | string | Hash del archivo (base64) |
| `encFilehash` | string | Hash encriptado |
| `mediaKey` | string | Clave de encriptación media |
| `mediaKeyTimestamp` | number | Timestamp de la clave |
| `directPath` | string | Path directo para descarga |
| `deprecatedMms3Url` | string | URL MMS para descarga |
| `caption` | string | Pie de foto/video |
| `width` | number | Ancho (imagen/video) |
| `height` | number | Alto (imagen/video) |
| `waveform` | object | Forma de onda (PTT) |
| `isViewOnce` | boolean | Mensaje de ver una vez |
| `mediaData` | object | Modelo Backbone de datos de media |

### ACK — Estados de entrega

```js
// WAWebAck.ACK
{
  INACTIVE:             -6,  // Inactivo
  CONTENT_UNUPLOADABLE: -5,  // No se pudo subir
  CONTENT_TOO_BIG:      -4,  // Contenido muy grande
  CONTENT_GONE:         -3,  // Contenido ya no existe
  EXPIRED:              -2,  // Expirado
  FAILED:               -1,  // Falló
  CLOCK:                 0,  // Reloj (enviando)
  SENT:                  1,  // ✓ Enviado al servidor
  RECEIVED:              2,  // ✓✓ Recibido por destinatario
  READ:                  3,  // ✓✓ Leído (azul)
  PLAYED:                4,  // ✓✓ Reproducido (audio/video)
  PEER:                  5,  // Peer ACK
}

// WAWebAck.ACK_STRING
{
  SENDER:      'sender',       // Del remitente
  DELIVERY:    'delivery',     // Entrega
  READ:        'read',         // Lectura
  PLAYED:      'played',       // Reproducción
  INACTIVE:    'inactive',     // Inactivo
  READ_SELF:   'read-self',    // Leído por mí
  PLAYED_SELF: 'played-self',  // Reproducido por mí
}
```

### MSG_TYPE — Todos los tipos de mensaje

```js
// WAWebMsgType.MSG_TYPE (65 tipos)
{
  CHAT:            'chat',             // Texto plano
  IMAGE:           'image',            // Imagen
  VIDEO:           'video',            // Video
  AUDIO:           'audio',            // Audio
  PTT:             'ptt',              // Nota de voz (Push-to-Talk)
  PTV:             'ptv',              // Video nota (circle video)
  DOCUMENT:        'document',         // Documento
  STICKER:         'sticker',          // Sticker
  VCARD:           'vcard',            // Contacto
  MULTI_VCARD:     'multi_vcard',      // Múltiples contactos
  LOCATION:        'location',         // Ubicación
  REVOKED:         'revoked',          // Mensaje eliminado
  REACTION:        'reaction',         // Reacción emoji
  REACTION_ENC:    'reaction_enc',     // Reacción encriptada
  POLL_CREATION:   'poll_creation',    // Creación de encuesta
  POLL_UPDATE:     'poll_update',      // Voto en encuesta
  HSM:             'hsm',              // Mensaje de plantilla (HSM)
  INTERACTIVE:     'interactive',      // Mensaje interactivo
  LIST:            'list',             // Mensaje de lista
  LIST_RESPONSE:   'list_response',    // Respuesta a lista
  GP2:             'gp2',              // Acción de grupo
  E2E_NOTIFICATION:'e2e_notification', // Notificación E2E
  CALL_LOG:        'call_log',         // Log de llamada
  PROTOCOL:        'protocol',         // Protocolo interno
  EVENT_CREATION:  'event_creation',   // Creación de evento
  EVENT_RESPONSE:  'event_response',   // Respuesta a evento
  // ... + 39 tipos más de sistema, negocio, etc.
}
```

### Métodos del Message

```js
msg.get('atributo')                    // Getter Backbone
msg.downloadMedia()                    // Descargar media
msg.cancelDownload()                   // Cancelar descarga
msg.cancelUpload()                     // Cancelar subida
msg.resumeUpload()                     // Reanudar subida
msg.resend()                           // Reenviar mensaje fallido
msg.delete()                           // Eliminar mensaje
msg.registerAndPrepMedia()             // Registrar y preparar media
msg.initializeMedia()                  // Inicializar media data
msg.mentionMap()                       // Mapa de menciones
msg.groupMentionMap()                  // Mapa de menciones de grupo
msg.msgContextInfo()                   // Info de contexto
msg.hideParentMessageInChat()          // Ocultar msg padre
msg.detachAssociatedMsg()              // Desadjuntar msg asociado
msg.getVcardWids()                     // WIDs de vcard
msg.getRawLinks()                      // Links crudos del mensaje
msg.getRawPhoneNumbers()               // Números del mensaje
msg.getForwardingScoreWhenForwarded()  // Score de forwarding
```

### Eventos del Message (cambios en tiempo real)

```js
// Para msgs de media (PTT, video, imagen):
msg.on('change:ack', fn)              // ✨ ACK cambió (enviado→recibido→leído→reproducido)
msg.on('change:mediaKey', fn)         // Clave media actualizada
msg.on('change:directPath', fn)       // Path de descarga actualizado
msg.on('change:size', fn)             // Tamaño actualizado
msg.on('change:filehash', fn)         // Hash actualizado
msg.on('change:duration', fn)         // Duración actualizada
msg.on('change:type', fn)             // Tipo cambió
msg.on('change:viewMode', fn)         // Visible→Revoked
msg.on('change:body', fn)             // Texto editado
msg.on('change:isViewOnce', fn)       // ViewOnce cambió
msg.on('change:waveform', fn)         // Waveform cambió (PTT)
msg.on('change:caption', fn)          // Caption cambió

// MsgCollection — Eventos globales
MsgCollection.on('add', fn)                // ✨ Mensaje nuevo (entrante o saliente)
MsgCollection.on('remove', fn)             // Mensaje eliminado
MsgCollection.on('new_msg_sent', fn)       // Mensaje enviado exitosamente
MsgCollection.on('change:type', fn)        // Tipo de msg cambió
MsgCollection.on('handle:msg_history', fn) // Historial cargado
MsgCollection.on('collection_has_synced', fn) // Sync completado
```

---

## 5. Contact Model (23 atributos)

### Atributos

| Atributo | Tipo | Descripción |
|----------|------|-------------|
| `id._serialized` | string | JID del contacto |
| `pushname` | string | Nombre que el contacto se puso |
| `type` | string | `'in'` (in address book) |
| `isBusiness` | boolean | Es cuenta de negocio |
| `isSmb` | boolean | Es pequeña/mediana empresa |
| `isEnterprise` | boolean | Es empresa grande |
| `isHosted` | boolean | Es cuenta hosted |
| `isContactBlocked` | boolean | Está bloqueado |
| `isContactOptedOut` | boolean | Optó por no recibir |
| `isFavorite` | boolean | Es favorito |
| `statusMute` | boolean | Status silenciado |
| `syncToAddressbook` | boolean | Sincronizado con agenda |
| `profilePicThumb` | object | Thumbnail de foto de perfil |
| `status` | object | Modelo de estado/about |
| `textStatusLastUpdateTime` | number | Última actualización del about |

### Métodos del Contact

```js
contact.getProfilePicThumb()           // Obtener thumbnail de foto
contact.getStatus()                    // Obtener about/status text
contact.isActive()                     // Está activo?
contact.getCurrentLidContact()         // Obtener contacto LID
contact.searchMatchExact(query)        // Búsqueda exacta
contact.searchMatchFuzzy(query)        // Búsqueda difusa
contact.searchMatchPrefix(query)       // Búsqueda por prefijo
contact.updateName(name)               // Actualizar nombre
contact.updateContactBlocked(blocked)  // Actualizar bloqueo
contact.canToggleFavorite()            // Puede ser favorito?
```

---

## 6. Presence Model (online/typing/recording)

### Atributos por modelo de presencia

| Atributo | Tipo | Descripción |
|----------|------|-------------|
| `id` | object | JID del contacto |
| `isOnline` | boolean | ✨ Está online ahora |
| `hasData` | boolean | Tiene datos de presencia |
| `isSubscribed` | boolean | Suscrito a actualizaciones |
| `chatActive` | boolean | Chat activo |
| `chatstate` | object | Estado de escritura |
| `typingUserIds` | object | IDs escribiendo (grupo) |
| `recordingUserIds` | object | IDs grabando audio (grupo) |
| `forceDisplay` | boolean | Forzar mostrar presencia |
| `withholdDisplayStage` | string | 'None' | estado de retención |

### Métodos

```js
presence.isActive()                    // Está activo?
presence.subscribe()                   // Suscribirse a updates
presence.getFormattedString()          // Texto formateado ("en línea", "escribiendo...")
presence.getUserSubtitleText()         // Subtítulo de usuario
presence.getGroupSubtitleText()        // Subtítulo de grupo
presence.getGroupStages()             // Estados del grupo
```

---

## 7. Connection State (Stream + Socket + Conn)

### Stream (estado del flujo de datos)

| Atributo | Valor actual | Descripción |
|----------|-------------|-------------|
| `info` | `'NORMAL'` | Estado: NORMAL, SYNCING, etc. |
| `mode` | `'MAIN'` | Modo: MAIN, COMPANION |
| `available` | `true` | App disponible |
| `uiActive` | `true` | UI activa |
| `phoneAuthed` | `true` | Teléfono autenticado |
| `isInConnectedCall` | `false` | En llamada conectada |
| `isHardRefresh` | `false` | Refresh forzado |
| `resumeCount` | `0` | Contador de resumes |

```js
// Stream methods
Stream.markAvailable()                 // Marcar como disponible
Stream.markUnavailable()               // Marcar como no disponible
Stream.sendAvailability()              // Enviar estado de disponibilidad
Stream.unobscure()                     // Des-ocultar

// Stream events
Stream.on('change:info', fn)           // ✨ NORMAL → SYNCING → NORMAL
Stream.on('change:mode', fn)           // Modo cambió
Stream.on('change:available', fn)      // Disponibilidad cambió
Stream.on('change:phoneAuthed', fn)    // Auth del teléfono cambió
Stream.on('change:uiActive', fn)       // UI activada/desactivada
```

### Socket (estado del WebSocket)

| Atributo | Valor actual | Descripción |
|----------|-------------|-------------|
| `state` | `'CONNECTED'` | Estado: CONNECTED, DISCONNECTED, OPENING |
| `stream` | `'CONNECTED'` | Stream: CONNECTED, DISCONNECTED |
| `hasSynced` | `true` | Ha sincronizado |
| `isIncognito` | `false` | Modo incógnito |

```js
// Socket methods
Socket.openStream()                    // Abrir stream
Socket.reconnect()                     // Reconectar
Socket.logout()                        // Cerrar sesión
Socket.sendCurrentLogout()             // Enviar logout
Socket.clearCredentials()              // Limpiar credenciales
Socket.clearCredentialsAndStoredData() // Limpiar todo
Socket.destroyStorage()               // Destruir storage
Socket.takeover()                      // Tomar control
Socket.summary()                       // Resumen del estado

// Socket events
Socket.on('change:state', fn)          // ✨ CONNECTED ↔ DISCONNECTED
Socket.on('change:stream', fn)         // Stream cambió
Socket.on('change:hasSynced', fn)      // Sync completado
```

---

## 8. Envío de mensajes

### Enviar mensaje de texto

```js
const { addAndSendMsgToChat } = window.require('WAWebSendMsgChatAction');
const { createWid } = window.require('WAWebWidFactory');
const { findOrCreateLatestChat } = window.require('WAWebFindChatAction');
const { unproxy } = window.require('WAWebStateUtils');
const { getMeUser } = window.require('WAWebUserPrefsMeUser');
const { newId } = window.require('WAWebMsgKey');

// 1. Resolver chat
const wid = createWid('51999999999@c.us');
const { chat } = await findOrCreateLatestChat(wid);

// 2. Enviar
await addAndSendMsgToChat(chat, {
  type: 'chat',
  body: 'Hola desde la extensión',
  id: newId(),
});
```

### Enviar PTT (nota de voz) — Pipeline completo

```js
const { createFromData } = window.require('WAWebMediaOpaqueData');
const { prepRawMedia } = window.require('WAWebPrepRawMedia');
const { getOrCreateMediaObject } = window.require('WAWebMediaStorage');
const { msgToMediaType } = window.require('WAWebMmsMediaTypes');
const { uploadMedia } = window.require('WAWebMediaMmsV4Upload');
const { addAndSendMsgToChat } = window.require('WAWebSendMsgChatAction');

// Pipeline documentado en docs/EXTENSION-WA-MODULES.md
// 1. File → 2. OpaqueData → 3. prepRawMedia → 4. waitForPrep
// → 5. mediaObject → 6. mediaType → 7. uploadMedia → 8. send
```

### Enviar media con helper (alto nivel)

```js
const { sendMediaMsgToChat, uploadMediaWithPrep } = window.require('WAWebMediaPrep');
// sendMediaMsgToChat(options) — envío directo
// uploadMediaWithPrep(mediaPrep, chat) — upload + send
```

### Typing indicators (ChatStateBridge) ✅ PROBADO

```js
const { sendChatStateComposing, sendChatStateRecording, sendChatStatePaused } = 
  window.require('WAWebChatStateBridge');

// ⚠️ PASAR chat.id (wid object), NO el chat model
// Internamente hace: WAWebWidToJid.widToChatJid(wid) → envía protocolo typing
sendChatStateComposing(chat.id)    // Mostrar "escribiendo..."
sendChatStateRecording(chat.id)    // Mostrar "grabando audio..."
sendChatStatePaused(chat.id)       // Parar indicador
```

---

## 9. Acciones sobre chats/mensajes

### Eliminar chat

```js
const { sendDelete } = window.require('WAWebDeleteChatAction');
sendDelete(chat, options);
```

### Revocar mensaje (eliminar para todos)

```js
const { sendRevoke, revoke } = window.require('WAWebRevokeMsgAction');
sendRevoke(chat, msg, options);
// revoke(msg, options) — revoke solo para mí
```

### Verificar ventana de revocación

```js
const { isWithinRevokeWindow } = window.require('WAWebRevoke');
isWithinRevokeWindow(msg);  // → boolean
```

### Limpiar chat

```js
const { initClearChat, finalizeClearChat } = window.require('WAWebClearChatUtils');
initClearChat(chat, options);
finalizeClearChat(chat, options);
```

### Bloquear/Desbloquear contacto

```js
const { blockContact, unblockContact } = window.require('WAWebBlockContactAction');
blockContact(wid);
unblockContact(wid, options);
```

### Bloquear/Desbloquear chat con código

```js
const { setChatAsLocked, setChatAsUnlocked } = window.require('WAWebChatLockAction');
setChatAsLocked(chat, options);
setChatAsUnlocked(chat, options);
```

### Crear grupo

```js
const { createGroup } = window.require('WAWebCreateGroupAction');
createGroup(subject, participants);
```

### Invitaciones de grupo

```js
const { queryGroupInviteCode, revokeGroupInvite, joinGroupViaInvite } = 
  window.require('WAWebGroupInviteAction');

const code = await queryGroupInviteCode(groupWid);  // Obtener link de invitación
revokeGroupInvite(groupWid);                         // Revocar link
joinGroupViaInvite(code, options, extra);            // Unirse por link
```

### Estado de texto (About)

```js
const { getTextStatus, setMyTextStatus } = window.require('WAWebTextStatusAction');
getTextStatus(wid, options);
setMyTextStatus(text, emoji, duration, options1, options2);
```

### Info del mensaje (quién recibió/leyó)

```js
const { updateMsgInfo } = window.require('WAWebMsgInfoAction');
updateMsgInfo(chat, msg, options1, options2);
```

### Mensajes destacados (starred)

```js
const { addStarredMsgs, removeStarredMsgs, AllStarredMsgsCollection } = 
  window.require('WAWebStarredMsgCollection');
```

### Pin en chat

```js
const { getPinInChatId, isPinExpired, isPinValid, PinInChatCollection } = 
  window.require('WAWebPinInChatCollection');
```

---

## 10. Media Pipeline

### Módulos confirmados

| Módulo | Función clave | Estado |
|--------|--------------|--------|
| `WAWebMediaOpaqueData` | `createFromData(file, mime)`, `createFromBase64Jpeg(b64)` | ✅ |
| `WAWebPrepRawMedia` | `prepRawMedia(opaque, opts)` → `.waitForPrep()` | ✅ |
| `WAWebMediaPrep` | `MediaPrep`, `getMediaPropsNew`, `uploadMediaWithPrep`, `sendMediaMsgToChat` | ✅ |
| `WAWebMediaStorage` | `getOrCreateMediaObject(hash)`, `associateMediaWithMsg` | ✅ |
| `WAWebMmsMediaTypes` | `msgToMediaType({type, isGif})`, `MEDIA_TYPES` | ✅ |
| `WAWebMediaMmsV4Upload` | `uploadMedia(opts)`, `cancelUploadMedia`, `getOrDownloadBlob` | ✅ |
| `WAWebMediaObject` | `MediaObject`, `consolidate(mediaObj, data)` | ✅ |
| `WAWebMediaDataUtils` | `processRawImage`, `processRawAudioVideo`, `fetchMedia` | ✅ |
| `WAWebMediaInMemoryBlobCache` | `InMemoryMediaBlobCache.get(hash)` | ✅ |
| `WAWebMediaUtils` | `convertToBase64(blob)`, `convertToDataURI(blob)` | ✅ |
| `WAWebStartMediaUploadQpl` | `startMediaUploadQpl(options)` | ✅ |
| `WAWebMedia` | `registerMsg`, `deregisterMsg`, `cancelDownloadMedia`, etc. (28 fns) | ✅ |
| `WAWebMediaData` | Modelo Backbone para media data | ✅ |
| `WAWebMediaStore` | `MediaStore`, `LruMediaStore` | ✅ |
| `WAWebMediaTypes` | `MEDIA_TO_MSG`, `MSG_TO_MEDIA`, `UploadStage`, `DownloadStage`, `MediaDataStage` | ✅ |
| `WAWebMediaConstants` | Constantes: `IMG_THUMB_MAX_EDGE`, etc. | ✅ |
| `WAWebUploadManager` | `_checkIfAlreadyUploaded`, `_getExistingOrUpload` | ✅ |
| `WAWebDownloadManager` | `downloadManager` | ✅ |
| `WAWebVideoUtils` | `getVideoUrl`, `isMsgStreamable` | ✅ |
| `WAWebImageUtils` | `crop`, `rotateAndResize`, `toWebpSticker`, `generateVideoThumbsAndDuration` | ✅ |

---

## 11. Utilidades y constantes

### Phone utils

```js
const { formatPhone, isPotentiallyPhoneNumber, formattedPhoneNumber } = 
  window.require('WAWebPhoneUtils');
```

### Search

```js
const { normalizeString, filterPaginate } = window.require('WAWebSearchUtils');
```

### Stickers

```js
const { addStickerToFavorites, removeStickerFromFavorites, isStickerFilehashFavorited } = 
  window.require('WAWebFavoriteStickerAction');
const { removeStickerFromRecent } = window.require('WAWebRecentStickerAction');
```

### Vcard

```js
const { getNameString, mergeVcards, vcardGetType } = window.require('WAWebVcardUtils');
```

### Labels

```js
const { getAllLabelColors, colorIndexToHex, sortLabels } = window.require('WAWebListUtils');
// Labels actuales: No leídos, Favoritos, Grupos, Comunidades
```

### Group utils

```js
const { amIGroupAdmin, amIGroupAdminGivenParticipants } = window.require('WAWebGroupUtils');
```

### Bot detection

```js
const { isMetaAiBot, isManusBot, META_BOT_PN_WID } = window.require('WAWebBotUtils');
```

### Spam detection

```js
const { isMsgTypeSupportedForMsgLevelReporting, isSpamSupportedForMessageType } = 
  window.require('WAWebSpamUtils');
```

### Storage

```js
const { Storage } = window.require('WAWebStorage');
// Acceso al almacenamiento interno IndexedDB de WA
```

### Drawer management

```js
const { DrawerManager, closeDrawerRight, closeDrawerLeft } = 
  window.require('WAWebDrawerManager');
```

### UI Listener

```js
const { Listener } = window.require('WAWebUIListener');
```

### Signal (E2E encryption)

```js
const { Cipher, Session } = window.require('WAWebSignal');
```

---

## 12. Todas las colecciones WAWebCollections (51)

| # | Nombre | Modelos | Eventos clave |
|---|--------|---------|---------------|
| 1 | Chat | 143 | change:t, change:unreadCount, change:active, add, remove |
| 2 | Msg | 525 | add, remove, new_msg_sent, change:type |
| 3 | Contact | 496 | collection_has_synced, add, remove, sort |
| 4 | Presence | 153 | — |
| 5 | Mute | 154 | change:notificationsEnabled, add |
| 6 | ProfilePicThumb | 103 | change:tag |
| 7 | BusinessProfile | 51 | — |
| 8 | RecentStickerMD | 32 | — |
| 9 | GroupMetadata | 19 | change:parentGroup, change:isParentGroup |
| 10 | NewsletterMetadata | 11 | — |
| 11 | Newsletter | 10 | change:t, add, change, remove |
| 12 | UserDisclosure | 7 | — |
| 13 | Status | 7 | add, remove, change:unreadCount |
| 14 | FavoriteSticker | 80 | — |
| 15 | Label | 4 | remove, change:count, change:name, add, reorder |
| 16 | Blocklist | 3 | add, remove, reset |
| 17 | TextStatus | 2 | — |
| 18 | DailyAggregatedStats | 1 | — |
| 19 | ChatPreference | 1 | — |
| 20 | AdCollection | 0 | — |
| 21 | OptOutList | 0 | — |
| 22 | BotProfile | 0 | — |
| 23 | BusinessCategoryResult | 0 | — |
| 24 | CallCollection | 0 | change:activeCall, change:isInConnectedCall |
| 25 | Catalog | 0 | — |
| 26 | ChatAssignment | 0 | add, remove, change |
| 27 | ConversionTuple | 0 | — |
| 28 | EmojiVariant | 0 | — |
| 29 | FavoriteCollection | 0 | add, remove, change |
| 30 | FeatureFlagCollection | 0 | add, remove, change:enabled, reset |
| 31 | MsgInfo | 0 | — |
| 32 | Order | 0 | — |
| 33 | PollVote | 0 | — |
| 34 | QuickReply | 0 | — |
| 35 | RecentEmoji | 0 | change:weight |
| 36 | RecentSticker | 0 | — |
| 37 | StarredMsg | 0 | — |
| 38 | Sticker | 0 | — |
| 39 | StickerSearch | 0 | — |
| 40 | StickerPackMD | 0 | — |
| 41 | Reactions | 0 | — |
| 42 | RecentReactions | 0 | — |
| 43 | UnjoinedSubgroupMetadata | 0 | — |
| 44 | AgentCollection | 0 | remove, reset, add |
| 45 | SubscriptionCollection | 0 | — |
| 46 | UnattributedMessage | 0 | — |
| 47 | CommunityActivity | 0 | — |
| 48 | CommentCollection | 0 | — |
| 49 | PinInChat | 0 | — |
| 50 | PremiumMessage | 0 | — |
| 51 | EventResponse | 0 | — |

---

## 13. Catálogo completo de módulos (172 encontrados)

### Colecciones (con su módulo individual)

```
WAWebChatCollection          WAWebMsgCollection           WAWebContactCollection
WAWebPresenceCollection      WAWebGroupMetadataCollection WAWebLabelCollection
WAWebStatusCollection        WAWebCallCollection          WAWebBlocklistCollection
WAWebStickerCollection       WAWebSearchCollection        WAWebOrderCollection
WAWebCartCollection          WAWebProductCollection       WAWebCatalogCollection
WAWebButtonCollection        WAWebAgentCollection         WAWebSubscriptionCollection
WAWebFavoriteCollection      WAWebMuteCollection          WAWebRecentEmojiCollection
WAWebRecentStickerCollection WAWebFavoriteStickerCollection
WAWebCommentCollection       WAWebPinInChatCollection     WAWebEventResponseCollection
WAWebMsgInfoCollection       WAWebProfilePicThumbCollection
WAWebNewsletterCollection    WAWebNewsletterMetadataCollection
WAWebStarredMsgCollection    WAWebChatPreferenceCollection
WAWebConversionTupleCollection WAWebCommunityActivityCollection
WAWebUnjoinedSubgroupMetadataCollection WAWebPremiumMessageCollection
WAWebUserDisclosureCollection WAWebUnattributedMessageCollection
WAWebAdCollection            WAWebPollVoteCollection (via WAWebCollections)
```

### Modelos

```
WAWebChatModel     WAWebMsgModel      WAWebContactModel    WAWebPresenceModel
WAWebLabelModel    WAWebCallModel     WAWebBlocklistModel  WAWebStickerModel
WAWebSearchModel   WAWebOrderModel    WAWebCartModel       WAWebProductModel
WAWebCatalogModel  WAWebButtonModel   WAWebAgentModel      WAWebSubscriptionModel
WAWebFavoriteModel WAWebMuteModel     WAWebStickerPackModel
WAWebGroupMetadataModel WAWebStatusModel WAWebAdModel
WAWebRecentStickerModel WAWebFavoriteStickerModel WAWebChatPreferenceModel
WAWebConversionTupleModel WAWebCommentModel WAWebPinInChatModel
WAWebEventResponseModel WAWebMsgInfoModel WAWebNewsletterMetadataModel
WAWebMediaData     WAWebMediaObject
```

### Acciones

```
WAWebSendMsgChatAction       WAWebFindChatAction          WAWebDeleteChatAction
WAWebRevokeMsgAction         WAWebBlockContactAction      WAWebChatLockAction
WAWebCreateGroupAction       WAWebGroupInviteAction       WAWebTextStatusAction
WAWebMsgInfoAction           WAWebRecentStickerAction     WAWebFavoriteStickerAction
```

### Media Pipeline

```
WAWebMediaOpaqueData         WAWebPrepRawMedia            WAWebMediaPrep
WAWebMediaStorage            WAWebMmsMediaTypes           WAWebMediaMmsV4Upload
WAWebMediaDataUtils          WAWebMediaInMemoryBlobCache  WAWebStartMediaUploadQpl
WAWebMedia                   WAWebMediaStore              WAWebMediaUtils
WAWebUploadManager           WAWebDownloadManager         WAWebVideoUtils
WAWebImageUtils
```

### Identidad

```
WAWebWidFactory              WAWebWid                     WAWebWidStore
WAWebUserPrefsMeUser         WAWebMsgKey                  WAWebConnModel
WAWebPhoneUtils
```

### Estado/Conexión

```
WAWebStreamModel             WAWebSocketModel             WAWebChatStateBridge
WAWebStateUtils              WAWebSocketConstants
```

### Utilidades

```
WAWebGroupUtils              WAWebGroupType               WAWebGroupConstants
WAWebContactUtils            WAWebContactType             WAWebContactSync
WAWebContactSyncUtils        WAWebContactSyncBridge
WAWebSearchUtils             WAWebForwardUtils            WAWebClearChatUtils
WAWebQuotedMsgUtils          WAWebVcardUtils              WAWebStickerUtils
WAWebStickerPackUtils        WAWebEmojiUtils (WAWebEmoji) WAWebEventUtils
WAWebBlocklistUtils          WAWebChatLockUtils           WAWebMsgKeyUtils
WAWebMsgInfoUtils            WAWebMediaTypes              WAWebMediaConstants
WAWebStickerConstants        WAWebStickerPackConstants    WAWebLabelConstants
WAWebEphemeralConstants      WAWebSpamUtils               WAWebSpamConstants
WAWebNotificationConstants   WAWebWamConstants            WAWebChatConstants
WAWebTextStatusUtils         WAWebBusinessProfileUtils    WAWebBotUtils
WAWebBotTypes                WAWebListUtils               WAWebPresenceEnum
WAWebStatusUtils             WAWebReportUtils
```

### Almacenamiento

```
WAWebStorage                 WAWebDrawerManager           WAWebDrawerUtils
```

### Telemetría

```
WAWebWam                     WAWebWamUtils                WAWebQplUtils
WAWebQplConfig
```

### Criptografía

```
WAWebSignal                  WAWebGetEphemeralFieldsMsgActionsUtils
```

### UI

```
WAWebUIListener              WAWebThemeType               WAWebWallpaper
```

### Otros

```
WAWebRevoke                  WAWebAck                     WAWebMsgType
WAWebFindChat                WAWebChatGetExistingBridge   WAWebParseMsgKeyString
WAWebCollections
```

---

## 14. Capacidades desbloqueadas

Con estos 172 módulos mapeados, podemos controlar:

| Capacidad | Módulos necesarios | Estado |
|-----------|-------------------|--------|
| **Enviar texto** | SendMsgChatAction, WidFactory, FindChatAction, MsgKey | ✅ Listo |
| **Enviar PTT** | MediaOpaqueData, PrepRawMedia, MediaStorage, MmsMediaTypes, MmsV4Upload, SendMsgChatAction | ✅ Listo |
| **Enviar imagen/video/doc** | MediaPrep.sendMediaMsgToChat | ✅ Listo |
| **Recibir msgs en tiempo real** | MsgCollection.on('add') | ✅ Producción |
| **Detectar chat activo** | ChatCollection.on('change:active') | ✅ Producción |
| **Trackear ACK en tiempo real** | msg.on('change:ack') — ACK enum completo | ✅ Nuevo |
| **Detectar online/typing** | PresenceCollection, presence.isOnline, chatstate | ✅ Nuevo |
| **Typing indicator (enviar)** | ChatStateBridge.sendChatStateComposing | ✅ Nuevo |
| **Recording indicator** | ChatStateBridge.sendChatStateRecording | ✅ Nuevo |
| **Estado de conexión** | Stream.on('change:info'), Socket.on('change:state') | ✅ Nuevo |
| **Eliminar mensaje** | RevokeMsgAction.sendRevoke | ✅ Nuevo |
| **Eliminar chat** | DeleteChatAction.sendDelete | ✅ Nuevo |
| **Bloquear contacto** | BlockContactAction.blockContact | ✅ Nuevo |
| **Lockear chat** | ChatLockAction.setChatAsLocked | ✅ Nuevo |
| **Crear grupo** | CreateGroupAction.createGroup | ✅ Nuevo |
| **Link de invitación** | GroupInviteAction.queryGroupInviteCode | ✅ Nuevo |
| **Cambiar about** | TextStatusAction.setMyTextStatus | ✅ Nuevo |
| **Info de mensaje** | MsgInfoAction.updateMsgInfo (quién leyó/recibió) | ✅ Nuevo |
| **Buscar contactos** | ContactCollection + SearchUtils | ✅ Nuevo |
| **Labels** | LabelCollection (4 labels, extensible) | ✅ Nuevo |
| **Llamadas (log)** | CallCollection + change:activeCall | ✅ Nuevo |
| **Newsletters** | NewsletterCollection + MetadataCollection | ✅ Nuevo |
| **Stickers** | StickerCollection + FavoriteSticker + RecentSticker | ✅ Nuevo |
| **Media download** | DownloadManager.downloadManager | ✅ Nuevo |
| **Profile pics** | ProfilePicThumbCollection | ✅ Nuevo |
| **Validar número WA** | USyncQuery + USyncUser (batch: in/out/invalid) | ✅ Probado |
| **Archivar chat** | ChatArchiveBridge.sendConversationArchive | ✅ Verificado |
| **Silenciar chat** | ChatMuteBridge.sendConversationMute | ✅ Verificado |
| **Fijar chat** | ChatPinBridge.setPin (limit: 3) | ✅ Verificado |
| **Marcar leído/no leído** | ChatSeenBridge.sendConversationSeen/Unseen | ✅ Verificado |
| **Enviar reacción** | SendReactionMsgAction.sendReactionToMsg(msg, emoji) | ✅ Verificado |

---

## 15. Módulos descubiertos en pruebas en vivo (reemplazan los "no encontrados")

> Todos los siguientes fueron probados en vivo el 2026-03-17. Los nombres de módulo
> son diferentes a los esperados — WA usa naming interno que cambia con cada deploy.

### Verificar si un número existe en WhatsApp — `WAWebUsync` ✅ PROBADO

```js
const { USyncQuery } = window.require('WAWebUsync');
const { USyncUser } = window.require('WAWebUsyncUser');

// Verificar UN número
const query = new USyncQuery()
  .withContext('interactive')
  .withContactProtocol()
  .withUser(new USyncUser().withPhone('51999999999'));

const result = await query.execute();
// result.list[0].contact.type:
//   'in'      → ✅ REGISTRADO en WhatsApp
//   'out'     → ❌ No en WhatsApp (pero número válido)
//   'invalid' → ❌ Número inválido

// Verificar BATCH (múltiples números de una vez)
const batchQuery = new USyncQuery().withContext('interactive').withContactProtocol();
for (const num of ['51955135507', '51999999999', '11111111111']) {
  batchQuery.withUser(new USyncUser().withPhone(num));
}
const batchResult = await batchQuery.execute();
// batchResult.list = [
//   { contact: { type: 'in', content: '51955135507' }, id: '51955135507@c.us' },
//   { contact: { type: 'out', content: '51999999999' }, id: '51999999999@c.us' },
//   { contact: { type: 'invalid', content: '11111111111' } },
// ]
```

### Archivar/Desarchivar chat — `WAWebChatArchiveBridge` ✅ VERIFICADO

```js
const { sendConversationArchive } = window.require('WAWebChatArchiveBridge');
// sendConversationArchive(chat, shouldArchive: boolean, options)
await sendConversationArchive(chat, true, {});   // Archivar
await sendConversationArchive(chat, false, {});  // Desarchivar
```

### Silenciar/Desilenciar chat — `WAWebChatMuteBridge` ✅ VERIFICADO

```js
const { sendConversationMute } = window.require('WAWebChatMuteBridge');
// sendConversationMute(chat, muteExpiration, ...rest)
// muteExpiration: 0 = unmute, unix timestamp futuro = mute hasta esa fecha
const oneWeek = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
await sendConversationMute(chat, oneWeek, null, null);  // Silenciar 1 semana
await sendConversationMute(chat, 0, null, null);         // Desilenciar
```

### Fijar/Desfijar chat — `WAWebChatPinBridge` ✅ VERIFICADO

```js
const { setPin, getPinLimit, getNumConversationsPinned } = window.require('WAWebChatPinBridge');
// setPin(chat, shouldPin: boolean, ...rest)
// NOTA: getPinLimit y getNumConversationsPinned necesitan chat.id (wid), no chat model
const limit = await getPinLimit(chat.id);     // → 3 (máximo pins permitidos)
const current = await getNumConversationsPinned(chat.id); // → número actual de pins
await setPin(chat, true, null, null);   // Fijar
await setPin(chat, false, null, null);  // Desfijar
```

### Marcar leído/no leído — `WAWebChatSeenBridge` ✅ VERIFICADO

```js
const { sendConversationSeen, sendConversationUnseen, markConversationSeen, markConversationUnseen } = 
  window.require('WAWebChatSeenBridge');

await sendConversationSeen(chat, ...params);     // Marcar como leído (envía al servidor)
await sendConversationUnseen(chat, ...params);   // Marcar como no leído
markConversationSeen(chatWid, unreadCount);      // Solo local (DB)
markConversationUnseen(chatWid);                  // Solo local (DB)
```

### Enviar reacción a mensaje — `WAWebSendReactionMsgAction` ✅ VERIFICADO

```js
const { sendReactionToMsg } = window.require('WAWebSendReactionMsgAction');
// sendReactionToMsg(msg, reactionEmoji: string)
await sendReactionToMsg(msg, '👍');   // Reaccionar con thumbs up
await sendReactionToMsg(msg, '');     // Quitar reacción (string vacío)
```

### Typing/Recording indicator — `WAWebChatStateBridge` ✅ PROBADO

```js
const { sendChatStateComposing, sendChatStateRecording, sendChatStatePaused } = 
  window.require('WAWebChatStateBridge');

// ⚠️ IMPORTANTE: Pasar chat.id (el wid object), NO el chat model
await sendChatStateComposing(chat.id);   // Mostrar "escribiendo..."
await sendChatStateRecording(chat.id);   // Mostrar "grabando audio..."
await sendChatStatePaused(chat.id);      // Parar indicador
```

### Módulos auxiliares descubiertos

| Módulo | Exports | Uso |
|--------|---------|-----|
| `WAWebUsyncUser` | `USyncUser` (class) | Constructor para queries de existencia |
| `WAWebUsyncDevice` | `USyncDeviceProtocol`, `deviceParser` | Info de dispositivos |
| `WAWebUsyncContact` | `USyncContactProtocol`, `contactParser` | Parser de contactos |
| `WAWebUsyncStatus` | `USyncStatusProtocol`, `statusParser` | Parser de status |

### Módulos que REALMENTE no existen (marzo 2026)

| Nombre esperado | Realidad |
|-----------------|----------|
| `WAWebQueryExistsService` | Reemplazado por `WAWebUsync` + `USyncQuery` |
| `WAWebArchiveAction` | Reemplazado por `WAWebChatArchiveBridge` |
| `WAWebMuteAction` | Reemplazado por `WAWebChatMuteBridge` |
| `WAWebPinAction` | Reemplazado por `WAWebChatPinBridge` |
| `WAWebReactionAction` | Reemplazado por `WAWebSendReactionMsgAction` |
| `WAWebMarkReadAction` | Reemplazado por `WAWebChatSeenBridge` |
| `WAWebForwardMsgAction` | Solo `WAWebForwardUtils` (sin acción directa) |
| `WAWebEditMsgAction` | No encontrado en esta versión |
| `WAWebStarMsgAction` | No encontrado — usar `msg.set('star', true/false)` |

---

## 16. Script de diagnóstico rápido

Pegá esto en la consola de WA Web para verificar que todo sigue funcionando:

```js
(() => {
  const check = (name) => {
    try { const m = window.require(name); return m && Object.keys(m).length > 0 ? '✅' : '⚠️ empty'; }
    catch(e) { return '❌'; }
  };
  const critical = [
    'WAWebMsgCollection', 'WAWebChatCollection', 'WAWebContactCollection',
    'WAWebSendMsgChatAction', 'WAWebFindChatAction', 'WAWebWidFactory',
    'WAWebUserPrefsMeUser', 'WAWebMsgKey', 'WAWebCollections',
    'WAWebMediaOpaqueData', 'WAWebPrepRawMedia', 'WAWebMediaMmsV4Upload',
    'WAWebMediaStorage', 'WAWebMmsMediaTypes', 'WAWebMediaPrep',
    'WAWebChatStateBridge', 'WAWebStreamModel', 'WAWebSocketModel',
    'WAWebConnModel', 'WAWebAck', 'WAWebPresenceCollection',
  ];
  console.log('=== WA Web Module Health Check ===');
  let ok = 0;
  for (const m of critical) {
    const status = check(m);
    if (status === '✅') ok++;
    console.log(`${status} ${m}`);
  }
  console.log(`\n${ok}/${critical.length} critical modules OK`);
})();
```
