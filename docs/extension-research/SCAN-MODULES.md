# Scan de módulos Metro de WA Web

## Scan 8 — Inspeccionar mediaData de un PTT enviado + getMediaPropsNew

Abrí un chat donde hayas mandado una nota de voz y pegá esto:

```js
(async () => {
  const { MsgCollection } = window.require('WAWebMsgCollection');
  const { ChatCollection } = window.require('WAWebChatCollection');
  const { getMediaPropsNew, MediaPrep } = window.require('WAWebMediaPrep');
  const OpaqueData = window.require('WAWebMediaOpaqueData');

  // 1. Ver un PTT enviado (fromMe) y su mediaData
  const pttMsg = MsgCollection._models.filter(m => m.get('type') === 'ptt' && m.get('id')?.fromMe).pop();
  if (pttMsg) {
    console.log('=== PTT enviado — mediaData ===');
    const md = pttMsg.mediaData;
    if (md) {
      console.log('mediaData keys:', Object.keys(md.attributes || md).join(', '));
      console.log('mediaData.mediaStage:', md.get ? md.get('mediaStage') : md.mediaStage);
      console.log('mediaData.mediaBlob:', md.get ? md.get('mediaBlob') : md.mediaBlob);
      console.log('mediaData.type:', md.get ? md.get('type') : md.type);
      console.log('mediaData toString:', JSON.stringify(md.attributes || md, null, 2).slice(0, 500));
    } else {
      console.log('Sin mediaData');
    }
  }

  // 2. Probar crear un OpaqueData y ver getMediaPropsNew
  const testBlob = new Blob([new Uint8Array(100)], { type: 'audio/ogg; codecs=opus' });
  const opaqueData = await OpaqueData.createFromData(testBlob, 'audio/ogg; codecs=opus');
  console.log('\n=== OpaqueData test ===');
  console.log('type:', opaqueData.type);
  console.log('size:', await opaqueData.size());

  // 3. getMediaPropsNew — para ver qué devuelve
  console.log('\n=== getMediaPropsNew ===');
  console.log('length:', getMediaPropsNew.length);
  console.log('code:', getMediaPropsNew.toString().slice(0, 500));

  // 4. Probar getMediaPropsNew con un MediaPrep
  try {
    const prep = new MediaPrep('ptt', Promise.resolve({
      mediaBlob: opaqueData,
      mimetype: 'audio/ogg; codecs=opus',
    }));
    const props = await getMediaPropsNew(prep, 'ptt');
    console.log('\n=== getMediaPropsNew resultado ===');
    console.log(JSON.stringify(props, null, 2).slice(0, 800));
  } catch (e) {
    console.log('\n=== getMediaPropsNew error ===');
    console.log(e.message, e.stack?.slice(0, 300));
  }

  // 5. Probar addAndSendMsgToChat con log de qué es chat.id
  const chat = ChatCollection._models.find(c => c.active);
  if (chat) {
    console.log('\n=== Chat para envío ===');
    console.log('chat.id:', JSON.stringify(chat.id));
    console.log('chat.id._serialized:', chat.id?._serialized);
    console.log('tiene sendMsg?', typeof chat.sendMsg);
    console.log('tiene addMsg?', typeof chat.addMsg);
    const chatProto = Object.getOwnPropertyNames(Object.getPrototypeOf(chat) || {}).filter(k => /send|add|msg|media|ptt/i.test(k));
    console.log('métodos relevantes:', chatProto.join(', '));
  }
})();
```

---

## Scan 9 — Verificar módulos del pipeline PTT (whatsapp-web.js)

Pegá esto en la consola de WA Web. Verifica cuáles de los módulos que usa
whatsapp-web.js existen en esta versión.

```js
(() => {
  const modules = [
    // Pipeline de media PTT (core)
    'WAWebPrepRawMedia',
    'WAWebMediaStorage',
    'WAWebMmsMediaTypes',
    'WAWebMediaMmsV4Upload',
    'WAWebMediaDataUtils',
    'WAWebMediaInMemoryBlobCache',
    'WAWebStartMediaUploadQpl',
    // Identidad y claves de mensaje
    'WAWebMsgKey',
    'WAWebUserPrefsMeUser',
    'WAWebWidFactory',
    'WAWebGetEphemeralFieldsMsgActionsUtils',
    'WAWebFindChatAction',
    // Chat state (recording indicator)
    'WAWebChatStateBridge',
    // Collections alternativas
    'WAWebCollections',
    // Ya confirmados (referencia)
    'WAWebSendMsgChatAction',
    'WAWebMediaOpaqueData',
    'WAWebMediaPrep',
    'WAWebChatCollection',
    'WAWebMsgCollection',
    'WAWebMsgModel',
    'WAWebChatModel',
    'WAWebConnModel',
    'WAWebMediaObject',
    'WAWebUploadManager',
    'WAWebStateUtils',
    'WAWebMediaUtils',
    'WAWebMsgType',
  ];

  console.log('=== Scan 9: Verificación de módulos PTT pipeline ===\n');

  const found = [];
  const missing = [];

  for (const name of modules) {
    try {
      const mod = window.require(name);
      const exports = mod ? Object.keys(mod).slice(0, 10).join(', ') : '(empty)';
      const type = typeof mod;
      found.push({ name, type, exports });
      console.log(`✅ ${name} → [${type}] exports: ${exports}`);
    } catch (e) {
      missing.push(name);
      console.log(`❌ ${name} → ${e.message.slice(0, 60)}`);
    }
  }

  console.log('\n=== RESUMEN ===');
  console.log(`Encontrados: ${found.length}/${modules.length}`);
  console.log(`Faltantes: ${missing.length} → ${missing.join(', ')}`);

  // Si encontramos WAWebPrepRawMedia, inspeccionar sus exports
  if (found.some(f => f.name === 'WAWebPrepRawMedia')) {
    console.log('\n=== WAWebPrepRawMedia detalle ===');
    const mod = window.require('WAWebPrepRawMedia');
    for (const [k, v] of Object.entries(mod)) {
      console.log(`  ${k}: ${typeof v}${typeof v === 'function' ? ` (${v.length} params)` : ''}`);
    }
  }

  // Si encontramos WAWebMsgKey, inspeccionar
  if (found.some(f => f.name === 'WAWebMsgKey')) {
    console.log('\n=== WAWebMsgKey detalle ===');
    const mod = window.require('WAWebMsgKey');
    for (const [k, v] of Object.entries(mod)) {
      console.log(`  ${k}: ${typeof v}${typeof v === 'function' ? ` (${v.length} params)` : ''}`);
    }
  }

  // Si encontramos WAWebMediaMmsV4Upload, inspeccionar
  if (found.some(f => f.name === 'WAWebMediaMmsV4Upload')) {
    console.log('\n=== WAWebMediaMmsV4Upload detalle ===');
    const mod = window.require('WAWebMediaMmsV4Upload');
    for (const [k, v] of Object.entries(mod)) {
      console.log(`  ${k}: ${typeof v}${typeof v === 'function' ? ` (${v.length} params)` : ''}`);
    }
  }

  // Si encontramos WAWebUserPrefsMeUser, inspeccionar
  if (found.some(f => f.name === 'WAWebUserPrefsMeUser')) {
    console.log('\n=== WAWebUserPrefsMeUser detalle ===');
    const mod = window.require('WAWebUserPrefsMeUser');
    for (const [k, v] of Object.entries(mod)) {
      console.log(`  ${k}: ${typeof v}${typeof v === 'function' ? ` (${v.length} params)` : ''}`);
    }
  }

  // Si encontramos WAWebWidFactory, inspeccionar
  if (found.some(f => f.name === 'WAWebWidFactory')) {
    console.log('\n=== WAWebWidFactory detalle ===');
    const mod = window.require('WAWebWidFactory');
    for (const [k, v] of Object.entries(mod)) {
      console.log(`  ${k}: ${typeof v}${typeof v === 'function' ? ` (${v.length} params)` : ''}`);
    }
  }

  // Si encontramos WAWebMediaStorage, inspeccionar
  if (found.some(f => f.name === 'WAWebMediaStorage')) {
    console.log('\n=== WAWebMediaStorage detalle ===');
    const mod = window.require('WAWebMediaStorage');
    for (const [k, v] of Object.entries(mod)) {
      console.log(`  ${k}: ${typeof v}${typeof v === 'function' ? ` (${v.length} params)` : ''}`);
    }
  }

  return { found: found.map(f => f.name), missing };
})();
```

---

## Scan 10 — Test rápido de prepRawMedia + sendAsPTT (si Scan 9 confirma módulos)

Solo correr si Scan 9 confirma que `WAWebPrepRawMedia` existe.
Crea un audio de prueba y recorre todo el pipeline hasta justo antes de enviar.

```js
(async () => {
  console.log('=== Scan 10: Test completo del pipeline PTT ===\n');

  // 1. Crear un audio de prueba (silencio OGG)
  const testBlob = new Blob([new Uint8Array(3000).fill(0)], { type: 'audio/ogg; codecs=opus' });
  const file = new File([testBlob], 'tts.ogg', { type: 'audio/ogg; codecs=opus', lastModified: Date.now() });
  console.log('1. Test file creado:', file.size, 'bytes');

  // 2. OpaqueData
  const OpaqueData = window.require('WAWebMediaOpaqueData');
  const opaqueData = await OpaqueData.createFromData(file, 'audio/ogg; codecs=opus');
  console.log('2. OpaqueData creado:', typeof opaqueData);

  // 3. prepRawMedia
  try {
    const { prepRawMedia } = window.require('WAWebPrepRawMedia');
    console.log('3. prepRawMedia encontrado, length:', prepRawMedia.length);

    const mediaPrep = prepRawMedia(opaqueData, {
      isPtt: true,
      asSticker: false,
      asGif: false,
      asDocument: false,
    });
    console.log('3b. mediaPrep creado:', typeof mediaPrep);
    console.log('3c. mediaPrep methods:', Object.keys(mediaPrep).join(', '));

    // waitForPrep
    if (typeof mediaPrep.waitForPrep === 'function') {
      const mediaData = await mediaPrep.waitForPrep();
      console.log('4. waitForPrep() resuelto!');
      console.log('4a. mediaData type:', mediaData.type);
      console.log('4b. mediaData mimetype:', mediaData.mimetype);
      console.log('4c. mediaData filehash:', mediaData.filehash?.slice(0, 20));
      console.log('4d. mediaData duration:', mediaData.duration);
      console.log('4e. mediaData keys:', Object.keys(mediaData.attributes || mediaData).join(', '));

      // 5. mediaStorage
      try {
        const { getOrCreateMediaObject } = window.require('WAWebMediaStorage');
        const mediaObject = getOrCreateMediaObject(mediaData.filehash);
        console.log('5. mediaObject creado:', typeof mediaObject);
        console.log('5a. mediaObject keys:', Object.keys(mediaObject).slice(0, 15).join(', '));
      } catch (e) {
        console.log('5. WAWebMediaStorage error:', e.message);
      }

      // 6. msgToMediaType
      try {
        const { msgToMediaType } = window.require('WAWebMmsMediaTypes');
        const mediaType = msgToMediaType({ type: mediaData.type, isGif: false });
        console.log('6. mediaType:', mediaType);
      } catch (e) {
        console.log('6. WAWebMmsMediaTypes error:', e.message);
      }

    } else {
      console.log('4. waitForPrep no existe en mediaPrep');
      console.log('   mediaPrep es:', JSON.stringify(Object.keys(mediaPrep)));
    }
  } catch (e) {
    console.log('3. prepRawMedia FALLÓ:', e.message);
    console.log('   stack:', e.stack?.slice(0, 300));
  }
})();
```
