# Diseño: Integración Twilio WhatsApp en CMS

**Fecha:** 2026-02-19  
**Estado:** Aprobado  
**Alcance:** Backend MVP aislado (sin modificar frontend CMS existente)  
**Enfoque:** Opción B — Twilio Messages API + webhooks custom

---

## 1. Contexto

El CMS actual (`apps/web/app/(dashboard)/cms/`) gestiona contactos via WhatsApp de forma manual: la operadora hace clic en un botón que abre `wa.me` en su dispositivo. No hay registro de mensajes enviados ni recepción de respuestas en la plataforma.

Se requiere agregar un canal programático bidireccional usando **Twilio WhatsApp Business API**, implementado primero como módulo backend aislado para hacer pruebas sin romper el flujo existente.

---

## 2. Decisiones de Diseño

| Decisión | Elección | Razón |
|----------|----------|-------|
| Proveedor | Twilio Messages API | Más simple y barata que Twilio Conversations; control total del storage |
| Canal | WhatsApp (vía Twilio) | Canal ya usado por el equipo; wa.me existente coexiste como fallback |
| Mensajes | Libres (escritos a mano) | El equipo prefiere personalización manual; templates Meta para futuro |
| Respuestas | Bidireccional con webhooks | Se registran respuestas entrantes en BD |
| Notificaciones | SSE existente (futuro sprint) | El stream SSE del CMS ya existe; se extenderá en sprint siguiente |
| Frontend | No modificado en este MVP | Backend-first para validar antes de exponer UI |

---

## 3. Arquitectura

```
Operadora (API call / futuro: dashboard)
    │
    ▼
POST /api/twilio/whatsapp/send
    │  (autenticado JWT)
    │  busca teléfono en form_submissions
    │  llama Twilio Messages API
    │  guarda en cms_twilio_messages
    ▼
Twilio → entrega a WhatsApp del ciudadano
    │
    │ (ciudadano responde)
    ▼
POST /api/webhooks/twilio/whatsapp   ← público, validado con X-Twilio-Signature
    │  valida firma HMAC
    │  guarda mensaje inbound en cms_twilio_messages
    │  (futuro: emite evento Redis Stream → SSE operadora)
    ▼
GET /api/twilio/whatsapp/messages/:contactId
    │  (autenticado JWT)
    ▼
historial de conversación
```

---

## 4. Estructura de Archivos

```
apps/backend/src/modules/twilio/
  twilio.service.ts       ← Wrapper Twilio SDK (send, validate webhook)
  twilio.routes.ts        ← Registro de rutas en Fastify
  twilio.schema.ts        ← Validación Zod de bodies/params
  twilio.types.ts         ← TypeScript types del módulo
```

El módulo se registra en `apps/backend/src/app.ts` con prefijo `/api/twilio` y `/api/webhooks/twilio`.

---

## 5. Endpoints

### `POST /api/twilio/whatsapp/send`
**Auth:** JWT Bearer  
**Body:**
```json
{
  "contact_id": "uuid",
  "campaign_id": "uuid",
  "body": "Hola Juan, le habla María del equipo Goberna..."
}
```
**Respuesta:**
```json
{
  "ok": true,
  "message_id": "uuid",
  "twilio_sid": "SMxxxxx",
  "status": "queued"
}
```

### `GET /api/twilio/whatsapp/messages/:contactId`
**Auth:** JWT Bearer + x-campaign-id  
**Respuesta:**
```json
{
  "ok": true,
  "messages": [
    {
      "id": "uuid",
      "direction": "outbound",
      "body": "...",
      "status": "delivered",
      "sent_by": "user_id",
      "created_at": "2026-02-19T..."
    }
  ]
}
```

### `POST /api/webhooks/twilio/whatsapp`
**Auth:** Ninguna (pública) — validada por firma `X-Twilio-Signature`  
**Body:** Form-encoded (formato Twilio)  
**Maneja:** Actualizaciones de status (`MessageStatus`) y mensajes entrantes (`Body` presente)

---

## 6. Esquema de Base de Datos

```sql
CREATE TABLE cms_twilio_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   UUID NOT NULL,
  campaign_id  UUID NOT NULL,
  direction    TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  body         TEXT NOT NULL,
  twilio_sid   TEXT UNIQUE,
  status       TEXT NOT NULL DEFAULT 'queued'
               CHECK (status IN ('queued','sent','delivered','read','failed','undelivered')),
  sent_by      UUID,          -- user_id del operador; NULL si inbound
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cms_twilio_messages_contact ON cms_twilio_messages(contact_id, created_at DESC);
CREATE INDEX idx_cms_twilio_messages_sid ON cms_twilio_messages(twilio_sid) WHERE twilio_sid IS NOT NULL;
```

---

## 7. Variables de Entorno (nuevas)

```bash
# apps/backend/.env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886   # Sandbox; producción: tu número aprobado
```

Las vars son **opcionales en desarrollo** — si no están presentes, el módulo desactiva el send y loguea un warning. Esto evita que el backend falle si Twilio no está configurado.

---

## 8. Seguridad

### Validación de webhook
Todo request a `/api/webhooks/twilio/whatsapp` es validado con la librería oficial de Twilio:
```typescript
twilio.validateRequest(authToken, signature, url, params)
```
Si la firma no coincide → 403 inmediato, sin procesar.

### Rate limiting
El endpoint `/api/twilio/whatsapp/send` hereda el rate limiting del backend (existente). Se puede agregar límite adicional por `contact_id` para evitar spam (futuro).

---

## 9. Costo Estimado (Twilio WhatsApp)

| Concepto | Precio (USD) |
|----------|-------------|
| Cuenta Twilio | Gratis ($15 trial) |
| Sandbox WhatsApp | Gratis (testing) |
| Mensaje saliente (ventana 24h activa) | ~$0.005/msg |
| Mensaje Template (iniciar conversación) | ~$0.08–$0.15/msg (Meta + Twilio) |
| Mensaje entrante | ~$0.005/msg |
| Número WhatsApp Business (producción) | ~$0–$1/mes |

> **Importante:** Para producción, los mensajes "de inicio" (cuando el ciudadano no ha escrito primero en 24h) **requieren templates aprobados por Meta**. El MVP puede probarse completamente en sandbox sin aprobación.

---

## 10. Plan de Implementación (siguiente paso)

1. Migración DB — crear tabla `cms_twilio_messages`
2. Instalar `twilio` SDK en `apps/backend`
3. Implementar `twilio.service.ts` con send y validate
4. Implementar `twilio.schema.ts` con schemas Zod
5. Implementar `twilio.routes.ts` con los 3 endpoints
6. Registrar módulo en `app.ts`
7. Configurar URL webhook en Twilio Console (ngrok en dev)
8. Test end-to-end con sandbox

---

## 11. Lo que NO entra en este MVP

- Modificar frontend CMS (`apps/web/`)
- Notificaciones SSE de mensajes entrantes (sprint siguiente)
- Templates Meta/Twilio aprobados
- UI de conversación en el dashboard
- Rate limiting avanzado por contacto
