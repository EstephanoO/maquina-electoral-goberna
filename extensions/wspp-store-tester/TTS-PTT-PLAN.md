# TTS → PTT: Plan de implementación

> Última actualización: 2026-03-09
> Estado: **Bloqueado — esperando resultado de Scan 9**

---

## Objetivo

Escribir texto en el composer de WhatsApp Web → click botón 🎤 → ElevenLabs genera audio con voz clonada (César Vásquez) → se envía como **nota de voz real (PTT)** — burbuja verde, NO adjunto de archivo.

---

## Estado actual (v5.0.0)

### Lo que YA funciona:
1. `manifest.json` actualizado a v5.0.0 con `host_permissions` para ElevenLabs
2. `background.js` llama a ElevenLabs TTS, devuelve base64 OGG opus
3. `content.js` bridge bidireccional: `GENERATE_VOICE` → background, `VOICE_READY` → inject
4. `inject.js` tiene botón 🎤 flotante, captura texto del composer, lo limpia, recibe audio base64
5. Pipeline completo text → ElevenLabs → base64 OGG → inject.js **funciona**

### Lo que NO funciona todavía:
- `sendAsPTT()` en inject.js usa `addAndSendMsgToChat(chat, msgAttrs, { mediaData })` — **no testeado**, probabilidad baja de funcionar porque `addAndSendMsgToChat` probablemente ignora `mediaData` en options

### ElevenLabs config:
- API Key: `d05e6426abf659ae8a19da2fe56fb35e`
- Voice ID: `iaSdolcffUuIlEi5pdbj` (César Vásquez — voz clonada)
- Modelo: `eleven_multilingual_v2`
- Formato: `ogg_24000` (OGG opus, requerido por WA PTT)

---

## Approaches investigados

### Approach A: Pipeline completo de módulos internos (estilo whatsapp-web.js)

**Flujo:**
```
base64 → File → OpaqueData.createFromData()
→ prepRawMedia(opaqueData, { isPtt: true })
→ mediaPrep.waitForPrep() → mediaData
→ getOrCreateMediaObject(filehash) → mediaObject
→ msgToMediaType({ type: 'ptt' }) → mediaType
→ uploadMedia({ mimetype, mediaObject, mediaType }) → uploaded
→ mediaData.set({ clientUrl, directPath, mediaKey, ... })
→ construir message object con id, from, to, ...mediaData
→ addAndSendMsgToChat(chat, message)
```

**Módulos requeridos (NO verificados — Scan 9 pendiente):**

| Módulo | Export | Propósito |
|--------|--------|-----------|
| `WAWebPrepRawMedia` | `prepRawMedia(opaqueData, params)` | Procesa media, genera waveform, detecta tipo |
| `WAWebMediaStorage` | `getOrCreateMediaObject(filehash)` | Crea objeto de storage para media |
| `WAWebMmsMediaTypes` | `msgToMediaType({type, isGif})` | Determina tipo de upload |
| `WAWebMediaMmsV4Upload` | `uploadMedia(opts)` | Cifra y sube media a servidores WA |
| `WAWebMediaDataUtils` | `shouldUseMediaCache(type)` | Chequea si cachear |
| `WAWebMediaInMemoryBlobCache` | `InMemoryMediaBlobCache.put(hash, formData)` | Cache en memoria |
| `WAWebMsgKey` | constructor + `newId()` | Crea ID de mensaje |
| `WAWebUserPrefsMeUser` | `getMaybeMeLidUser()`, `getMaybeMePnUser()` | WID del usuario actual |
| `WAWebWidFactory` | `createWid(id)`, `asUserWidOrThrow(wid)` | Crea objetos WID |
| `WAWebGetEphemeralFieldsMsgActionsUtils` | `getEphemeralFields(chat)` | Campos para mensajes temporales |
| `WAWebStartMediaUploadQpl` | `startMediaUploadQpl()` | Tracker de upload |

**Módulos YA confirmados que existen:**

| Módulo | Export |
|--------|--------|
| `WAWebSendMsgChatAction` | `addAndSendMsgToChat(chat, msg)` — 3 params |
| `WAWebMediaOpaqueData` | `createFromData(blob, mimetype)` |
| `WAWebMediaPrep` | `MediaPrep`, `getMediaPropsNew`, `sendMediaMsgToChat` |
| `WAWebChatCollection` | `ChatCollection._models` |
| `WAWebMsgCollection` | `MsgCollection._models` |
| `WAWebMsgModel` | `Msg` class |
| `WAWebChatModel` | `Chat` class |
| `WAWebConnModel` | `Conn` instance |
| `WAWebMediaObject` | `MediaObject`, `consolidate` |
| `WAWebUploadManager` | `_checkIfAlreadyUploaded`, `_memoizedUpload` |
| `WAWebStateUtils` | `unproxy` |
| `WAWebMediaUtils` | `convertToBase64`, `convertToDataURI` |
| `WAWebMsgType` | `MSG_TYPE.PTT = "ptt"` |

**Pros:**
- Más limpio, no depende de la UI
- No requiere permisos de micrófono
- Es instantáneo (no espera duración del audio)
- Es lo que usa whatsapp-web.js (probado por miles de usuarios)

**Contras:**
- Depende de ~12 módulos no verificados
- Si falla uno, falla todo
- WA puede cambiar nombres de módulos en cualquier update

**Probabilidad de éxito:** Alta si los módulos existen, nula si no.

---

### Approach B: Hook getUserMedia + click programático en botón mic

**Flujo:**
```
1. Hook navigator.mediaDevices.getUserMedia al arrancar (document_start)
2. Usuario clickea nuestro botón 🎤 → genera audio con ElevenLabs
3. Convertir OGG blob → AudioBuffer via decodeAudioData()
4. Crear MediaStream fake via AudioContext.createMediaStreamDestination()
5. Setear pendingTTSAudio = mediaStream
6. Click programático en botón mic de WA (mousedown)
7. WA llama getUserMedia → nuestro hook devuelve el stream fake
8. WA crea MediaRecorder con nuestro stream → "graba" nuestro audio
9. Esperar duración del audio
10. Click mouseup → WA procesa y envía como PTT normal
```

**APIs requeridas (todas estándar, Baseline Available):**
- `AudioContext.decodeAudioData(arrayBuffer)` → AudioBuffer
- `AudioContext.createBufferSource()` → AudioBufferSourceNode
- `AudioContext.createMediaStreamDestination()` → MediaStreamAudioDestinationNode con `.stream`
- `MediaRecorder(stream)` — WA lo crea internamente
- `navigator.mediaDevices.getUserMedia` — lo hookeamos

**Código clave del hook:**
```js
const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
let pendingTTSStream = null;

navigator.mediaDevices.getUserMedia = async function(constraints) {
  if (pendingTTSStream && constraints.audio && !constraints.video) {
    const stream = pendingTTSStream;
    pendingTTSStream = null;
    return stream;
  }
  return originalGetUserMedia(constraints);
};
```

**Código clave para crear stream desde blob:**
```js
async function createStreamFromBlob(oggBlob) {
  const audioCtx = new AudioContext();
  const arrayBuffer = await oggBlob.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  const dest = audioCtx.createMediaStreamDestination();
  const source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(dest);
  source.start(0);
  source.onended = () => audioCtx.close();
  return dest.stream;
}
```

**Pros:**
- WA maneja TODO: upload, cifrado, waveform, UI de grabación
- Solo usa Web APIs estándar
- No depende de módulos internos para el envío
- La UI de WA funciona normal (timer, waveform visual, indicador de grabación)

**Contras:**
- El click programático podría fallar por `isTrusted` (como pasó con drag-and-drop)
- La "grabación" es en tiempo real — hay que esperar la duración del audio
- Necesita que el usuario haya dado permiso de micrófono previamente
- WA usa press-and-hold — simular mousedown/mouseup puede ser frágil
- Si WA detecta el hook de getUserMedia, podría bloquearnos

**Probabilidad de éxito:** Media. El riesgo principal es `isTrusted` en mousedown.

**Mitigación del isTrusted:**
- Se podría hookear `MediaRecorder` constructor en vez de `getUserMedia` — más quirúrgico
- Se podría usar `dispatchEvent` con eventos custom que bypaseen la validación
- Se podría encontrar el handler interno de WA y llamarlo directamente

---

### Approach C (recomendado): Híbrido — Verificar módulos primero

**Estrategia:**
1. Correr Scan 9 para verificar qué módulos existen
2. Si `WAWebPrepRawMedia` + `WAWebMediaMmsV4Upload` existen → **Approach A**
3. Si no existen → **Approach B** (getUserMedia hook)
4. Si Approach B falla por isTrusted → hookear `MediaRecorder` constructor directamente

---

## Estructura del PTT real (referencia)

De un PTT enviado inspeccionado:

```json
{
  "type": "ptt",
  "mimetype": "audio/ogg; codecs=opus",
  "duration": "1",
  "size": 3104,
  "filehash": "vwez+4zat+uPCYYb7f/0iDm0noNnesoKnYXFNErcYCo=",
  "encFilehash": "/fh/jgRB4ZBFcyZOCknPKXZWH9vUYnxNzJgPGS0EJLQ=",
  "directPath": "/v/t62.7117-24/...",
  "mediaKey": "(exists)",
  "mediaKeyTimestamp": 1773076207
}
```

### mediaData de PTT enviado:
- `mediaStage: "RESOLVED"` (después de enviar)
- `type: "ptt"`
- `mimetype: "audio/ogg; codecs=opus"`
- `mediaBlob: null` (ya subido y liberado)
- `waveform`: objeto con claves numéricas (0-63), valores 0-100
- `duration`: string `"1"`

---

## Waveform helper (para Approach A)

Genera un waveform de 64 samples (0-100) para la visualización de la burbuja verde:

```js
async function generateWaveform(audioFile) {
  try {
    const audioData = await audioFile.arrayBuffer();
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(audioData);
    const rawData = audioBuffer.getChannelData(0);
    const samples = 64;
    const blockSize = Math.floor(rawData.length / samples);
    const filteredData = [];
    for (let i = 0; i < samples; i++) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(rawData[blockSize * i + j]);
      }
      filteredData.push(sum / blockSize);
    }
    const max = Math.max(...filteredData);
    const multiplier = max > 0 ? Math.pow(max, -1) : 1;
    return new Uint8Array(filteredData.map(n => Math.floor(100 * n * multiplier)));
  } catch (e) {
    return new Uint8Array(64).fill(50); // fallback: waveform plano
  }
}
```

---

## Lo que falló antes y por qué

| Intento | Resultado | Por qué |
|---------|-----------|---------|
| Drag-and-drop simulation | WA rechaza | Eventos sintéticos no son `isTrusted` |
| `MediaPrep.sendToChat({chat, ...})` | Silencioso, no envía | El pipeline de upload no se dispara |
| `sendMediaMsgToChat(options)` | Silencioso, no envía | Mismo problema, delega a internal `w()` |
| `getMediaPropsNew(prep, 'ptt')` | Error | `msgToMediaType` necesita un Msg model real |
| `addAndSendMsgToChat(chat, attrs, {mediaData})` | **No testeado** | Probablemente ignora mediaData en options |

---

## Próximo paso

**Correr Scan 9** (en `SCAN-MODULES.md`) en la consola de WA Web.

El scan verifica ~30 módulos de golpe y reporta cuáles existen con sus exports.
Con ese resultado se decide Approach A vs B y se implementa directamente.

---

## Módulos bonus descubiertos (para explorar)

| Módulo | Propósito |
|--------|-----------|
| `WAWebChatStateBridge` | `sendChatStateRecording(wid)` — mostrar "grabando..." al receptor |
| `WAWebFindChatAction` | `findOrCreateLatestChat(wid)` — buscar/crear chat |
| `WAWebCollections` | `.Chat`, `.Msg`, `.Contact` — collections alternativas |
| `WAWebDownloadManager` | `downloadAndMaybeDecrypt()` — para descargar media |

---

## Archivos modificados (resumen)

| Archivo | Cambios v5.0.0 |
|---------|-----------------|
| `manifest.json` | v5.0.0, `host_permissions` para ElevenLabs API |
| `background.js` | `GENERATE_VOICE` handler → ElevenLabs → base64 OGG |
| `content.js` | Bridge `GENERATE_VOICE` / `VOICE_READY` entre MAIN↔ISOLATED |
| `inject.js` | Botón 🎤, estados, `sendAsPTT()` (pendiente de fix), helpers |
| `SCAN-MODULES.md` | Scans 8, 9, 10 para verificación de módulos |
| `TTS-PTT-PLAN.md` | Este archivo |
