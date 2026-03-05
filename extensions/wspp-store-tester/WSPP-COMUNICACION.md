# WSPP Goberna — Arquitectura de Comunicación

> Última actualización: 2026-03-05  
> Scope: `extensions/wspp-store-tester/`  
> Versión: 4.0 (simplificada — contador de mensajes enviados)

---

## 0. Qué hace esta extensión

**Una sola responsabilidad:** contar cuántos mensajes de WhatsApp envía cada operadora y persistir ese conteo en el backend de Goberna para que aparezca en el dashboard `/cms-metrics`.

**Caso de uso:** 4 operadoras comparten el mismo número de WhatsApp en 4 laptops distintas. Cada una instala la extensión, hace login con sus credenciales propias de Goberna. El backend atribuye cada mensaje al `user_id` del JWT — no al número de WA.

---

## 1. Archivos y mundos

| Archivo | Mundo Chrome | Responsabilidad |
|---------|-------------|-----------------|
| `inject.js` | `MAIN` | Accede al `window.require` real de WhatsApp Web. Escucha mensajes salientes. |
| `content.js` | `ISOLATED` | Bridge: recibe `postMessage` de `inject.js` y lo pasa a `background.js` via `chrome.runtime.sendMessage`. |
| `background.js` | Service Worker | Incrementa contador local en `chrome.storage.local`. Envía evento al backend. |
| `popup.js` | Popup extensión | Login/logout. Muestra el contador en tiempo real. |
| `popup.html` | Popup extensión | UI del popup (240px, estilo WhatsApp dark). |

**Por qué dos content scripts:** `inject.js` necesita `world: MAIN` para acceder al `window` real de WA. Pero `world: MAIN` no tiene acceso a `chrome.runtime`. `content.js` en `ISOLATED` sí tiene `chrome.runtime`. El único puente entre los dos mundos es `window.postMessage`.

---

## 2. Flujo completo: operadora envía un mensaje

```
WhatsApp Web (window real)
  │
  inject.js (MAIN world)
  │  MsgCollection.on('add', msg)
  │  Filtra: id.fromMe === true  (solo mensajes MÍOS)
  │  Filtra: to no termina en @g.us  (solo DMs, no grupos)
  │  Extrae: phone = to.replace(/@.+$/, '').replace(/\D/g, '')
  │  → window.postMessage({ type: 'WSPP_SENT', payload: { phone, body, timestamp } }, '*')
  │
  content.js (ISOLATED)
  │  window.addEventListener('message') → filtra WSPP_SENT
  │  → chrome.runtime.sendMessage({ type: 'WSPP_SENT', payload })
  │
  background.js (Service Worker)
  │  chrome.runtime.onMessage → filtra WSPP_SENT
  │  chrome.storage.local.get(['wspp_count', 'wspp_token', 'wspp_campaign_id'])
  │  → wspp_count++  (inmediato, persiste entre reinicios)
  │  → fetch POST /api/cms/extension-event  (fire-and-forget)
  │      Authorization: Bearer {wspp_token}
  │      x-campaign-id: {wspp_campaign_id}
  │      body: { type: 'message_sent', phone, preview, detected_at }
  │
  popup.js (si el popup está abierto)
  │  chrome.storage.onChanged → actualiza #counter en tiempo real
```

---

## 3. Flujo de login

```
popup.html → popup.js

Usuario ingresa email + password
  → fetch POST /api/auth/login
      body: { identifier: email, password }
  ← { ok: true, access_token, user, campaigns[] }

chrome.storage.local.set({
  wspp_token:       access_token,
  wspp_user:        user.full_name || user.email,
  wspp_count:       0,              ← reset al loguearse
  wspp_campaign_id: campaigns[0].id ← primera campaña disponible
})

Muestra vista "dashboard" con contador y nombre del usuario.
```

---

## 4. Estado en `chrome.storage.local`

| Clave | Tipo | Quién escribe | Quién lee | Descripción |
|-------|------|--------------|-----------|-------------|
| `wspp_token` | `string` | `popup.js` (login) | `background.js` | JWT de acceso a Goberna |
| `wspp_user` | `string` | `popup.js` (login) | `popup.js` (init) | Nombre del operador |
| `wspp_campaign_id` | `string` | `popup.js` (login) | `background.js` | ID de la campaña activa |
| `wspp_count` | `number` | `background.js` (WSPP_SENT), `popup.js` (reset) | `popup.js` | Contador de mensajes enviados (sesión local) |
| `wspp_wa_active` | `boolean` | `background.js` (tabs events) | `popup.js` | Si hay alguna tab de WA abierta |

---

## 5. Endpoint de backend

**`POST /api/cms/extension-event`**

| Campo | Valor |
|-------|-------|
| Auth | `Authorization: Bearer {token}` + `x-campaign-id` |
| Body | `{ type: "message_sent", phone: string, preview?: string, detected_at?: number }` |
| Comportamiento | Persiste en `cms_extension_events`. Intenta hacer match del `phone` con un contacto de la campaña. Si `type === "message_received"` (reservado para uso futuro), auto-transiciona `hablado → respondieron`. |
| Respuesta | `{ ok: true, matched: bool, contact_id?, contact_name?, contact_status? }` |

**La extensión siempre envía `type: "message_sent"`** (mensajes salientes del operador).  
El tipo `"message_received"` está reservado para una futura funcionalidad de detección de respuestas entrantes.

---

## 6. Métricas en el dashboard

`GET /api/cms/metrics` → campo `wa_sent` por operador.

La query en `repository.ts` hace un LEFT JOIN con `cms_extension_events` agrupado por `(operator_id, campaign_id)` y lo expone como `wa_sent` en la respuesta. El frontend lo muestra como un pill azul "💬 WA enviados" en la tarjeta de cada operador en `/cms-metrics`.

---

## 7. Acceso a internals de WhatsApp Web

WhatsApp Web usa Metro/Haste bundler. El objeto `window.require` expone los módulos internos.

| Módulo | Nombre Metro | Uso en inject.js |
|--------|-------------|-----------------|
| Colección de mensajes | `WAWebMsgCollection` | `MsgCollection.on('add')` para detectar mensajes nuevos |

**Espera inicial:** `inject.js` espera 3 segundos antes del primer intento de `window.require('WAWebMsgCollection')`. Si no encuentra el módulo (WA aún cargando), reintenta cada 2 segundos hasta que lo encuentre.

**Detalles del mensaje:**
- `msg.get('id').fromMe` — `true` si lo envié yo
- `msg.get('to')._serialized` — `"51XXXXXXXXX@c.us"` para DMs, `"XXXX@g.us"` para grupos
- `msg.get('body')` — texto del mensaje
- `msg.get('t')` — unix timestamp

---

## 8. Lo que NO hace esta extensión (vs versión anterior)

Esta versión (4.0) es intencionalmente mínima. Lo siguiente fue eliminado:

| Feature eliminada | Razón |
|------------------|-------|
| CRM sidebar completo (`sidebar.js`) | Complejidad innecesaria |
| Ventana CRM (`crm.html` + `crm.js`) | Complejidad innecesaria |
| Automatización de UI via CDP (`debugger` permission) | Riesgo de detección por WA, permiso muy invasivo |
| SSE del backend en la extensión | `EventSource` no soporta headers custom; implementación era defectuosa |
| Header `x-wa-number` | No sirve para distinguir operadoras cuando comparten número |
| Métricas por número de WA (`/api/cms/metrics/extension`) | Reemplazado por métricas por `user_id` |
| Detección de mensajes entrantes | Reservado para v5 si se necesita |

---

## 9. Consideraciones de seguridad

- El JWT se guarda en `chrome.storage.local` (accesible solo por la extensión — no por páginas web).
- No se usa `localStorage` ni `sessionStorage` de WhatsApp Web.
- La extensión no tiene permiso `debugger` — no puede tomar control del browser.
- `inject.js` solo llama `window.postMessage` — no puede exfiltrar datos a dominios externos directamente.
- El `fetch` al backend lo hace `background.js` (Service Worker), que no tiene acceso al DOM de WA.
- El `preview` del mensaje se trunca a 100 caracteres antes de enviarse al backend.
