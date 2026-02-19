# Diseño: Configuración Twilio por Campaña

**Fecha:** 2026-02-19  
**Estado:** Aprobado  
**Depende de:** `2026-02-19-twilio-whatsapp-cms-design.md`

---

## 1. Problema

El módulo Twilio implementado lee credenciales de `.env` globales.  
Se necesita que **cada campaña tenga sus propias credenciales Twilio**, configurables por admin desde el frontend, sin exponer secretos en la respuesta API.

---

## 2. Decisiones

| Decisión | Elección | Razón |
|----------|----------|-------|
| Storage | `campaigns.config` JSONB (campo existente) | Sin migración de esquema, flexible, aislado por campaña |
| Cifrado | AES-256-GCM sobre `auth_token` | El token nunca se guarda en claro; clave maestra en `.env` |
| Clave maestra | `TWILIO_ENCRYPTION_KEY` (32 bytes hex) en `.env` | Única var sensible que queda en el servidor |
| Exposición API | Enmascarado: `****{últimos 4 chars}` | Estándar de industria, nunca devuelve el token completo |
| Permisos | Solo `role: admin` puede leer/escribir | Mínimo privilegio |
| UI | Modal en CMS header, botón visible solo para admin | Acceso contextual sin nueva ruta |

---

## 3. Estructura de datos

```jsonb
-- campaigns.config (campo JSONB existente)
{
  "tracking_enabled": true,
  "forms_enabled": true,
  "twilio": {
    "account_sid":   "ACxxxxxxxxxxxxxxxx",
    "auth_token":    "<AES-256-GCM cifrado en base64>",
    "whatsapp_from": "whatsapp:+14155238886"
  }
}
```

---

## 4. API

### GET `/api/campaigns/:id/integrations/twilio`
**Auth:** JWT + `role: admin`  
**Respuesta:**
```json
{
  "ok": true,
  "twilio": {
    "configured": true,
    "account_sid": "ACxxxxxxxxxxxxxxxx",
    "auth_token_hint": "****a1b2",
    "whatsapp_from": "whatsapp:+14155238886"
  }
}
```

### PUT `/api/campaigns/:id/integrations/twilio`
**Auth:** JWT + `role: admin`  
**Body:**
```json
{
  "account_sid": "ACxxxxxxxxxxxxxxxx",
  "auth_token": "token-completo-o-vacio-para-no-cambiar",
  "whatsapp_from": "whatsapp:+14155238886"
}
```
- Si `auth_token` viene vacío → conserva el token cifrado existente  
- Si viene con valor → cifra con AES-256-GCM y guarda

---

## 5. Cifrado AES-256-GCM

```typescript
// Encrypt (guardar)
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const tag = cipher.getAuthTag();
// Guardar: iv(12) + tag(16) + encrypted → base64

// Decrypt (usar)
const iv = buf.subarray(0, 12);
const tag = buf.subarray(12, 28);
const encrypted = buf.subarray(28);
const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
decipher.setAuthTag(tag);
```

**Variable de entorno nueva:**
```bash
TWILIO_ENCRYPTION_KEY=<64 chars hex = 32 bytes>
# Generar con: openssl rand -hex 32
```

---

## 6. Cambios en módulo Twilio existente

`twilio.service.ts` deja de leer `process.env.TWILIO_*` y en su lugar recibe la config de la campaña:

```typescript
// Antes (global)
const cfg = getTwilioConfig();  // lee process.env

// Después (por campaña)
const cfg = await getCampaignTwilioConfig(campaignId);  // lee DB + descifra
```

---

## 7. UI — Modal en CMS

- Botón `⚙ Configurar` en el header del CMS, solo visible si `user.role === 'admin'`
- Abre `<TwilioConfigModal>` (nuevo componente en `cms/_components/`)
- Al abrir: hace GET para obtener config enmascarada
- Campo Auth Token: muestra `****a1b2` con botón "Cambiar" → convierte en input editable
- Al guardar: hace PUT, si auth_token está vacío no lo envía (backend conserva existente)
- Muestra indicator de estado: `● Configurado` / `○ Sin configurar`

---

## 8. Archivos a crear/modificar

### Backend
| Archivo | Acción |
|---------|--------|
| `src/infra/crypto.ts` | NUEVO — helpers AES-256-GCM encrypt/decrypt |
| `src/modules/campaigns/routes.ts` | +2 endpoints GET/PUT integrations/twilio |
| `src/modules/twilio/twilio.service.ts` | Leer config de DB en lugar de process.env |
| `src/config/env.ts` | +`twilioEncryptionKey` |

### Frontend
| Archivo | Acción |
|---------|--------|
| `cms/_components/twilio-config-modal.tsx` | NUEVO — modal de configuración |
| `lib/services/cms.ts` | +funciones `getTwilioConfig`, `saveTwilioConfig` |
| `cms/page.tsx` | +botón ⚙ en header (solo admin) + montar modal |

---

## 9. Variables de entorno finales

```bash
# .env del backend — ÚNICO secreto Twilio que permanece en servidor
TWILIO_ENCRYPTION_KEY=<openssl rand -hex 32>

# Las demás (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM)
# ya NO se usan — viven en DB cifradas por campaña
```
