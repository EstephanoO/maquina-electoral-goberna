# AGENTS.md - Guia comun de modulos backend

> **Hereda de:** `/AGENTS.md` (root) y `apps/backend/AGENTS.md`  
> **Alcance:** Solo `apps/backend/src/modules/**`  
> **Ultima actualizacion:** 2026-03-05

---

## Flujo de Desarrollo

Ver `/CONTRIBUTING.md` para el flujo GitHub Flow completo.  
Ver `/CMS_DEVELOPER_GUIDE.md` para guia tecnica del modulo CMS + Twilio.

---

## Convenciones

- Cada modulo define `routes.ts`, `schemas.ts` y capa de persistencia (`store.ts` o `repository.ts`).
- Sin dependencia circular entre modulos.
- Endpoints y payloads explicitos; cero contratos implicitos.

## Modulos registrados en app.ts (22 total)

| Modulo | Prefijo API | Tipo |
|--------|-------------|------|
| `health` | `/api/health`, `/api/ready`, `/api/ops/system` | Ops |
| `auth` | `/api/auth/*`, `/api/users/*` | Core |
| `campaigns` | `/api/campaigns/*`, `/api/candidates`, `/api/consultors/*` | Core |
| `forms` | `/api/forms/*` | Ingesta (write-behind) |
| `form-submissions` | `/api/form-submissions/*` | Ingesta (directo) |
| `form-definitions` | `/api/form-definitions/*` | Config |
| `agents` | `/api/agents/*`, `/ws/tracking` | Ingesta (write-behind + WS) |
| `meets` | `/api/meets/*` | Operativo |
| `zones` | `/api/zones/*` | Geo |
| `org-hierarchy` | `/api/org-hierarchy/*` | Operativo |
| `invitations` | `/api/invitations/*` | Onboarding |
| `access-requests` | `/api/access-requests/*` | Onboarding |
| `map` | `/api/config`, `/api/tiles/*`, `/api/capabilities` | Geo |
| `uploads` | `/api/uploads/*` | Archivos |
| `analytics` | `/api/campaigns/:id/analytics`, `/api/analytics/*` | Digital |
| `cms` | `/api/cms/*` | CMS (SSE realtime) |
| `objectives` | `/api/objectives/*` | Operativo |
| `twilio` | `/api/twilio/*`, `/api/webhooks/twilio/*` | Messaging |
| `leads` | `/api/leads/*` | Operativo (+ Telegram notify) |
| `support` | `/api/support/*` | Soporte interno |
| `validacion` | `/api/validacion/*` | Campo |
| `voluntarios` | `/api/voluntarios/*` | Campo |

**Ruta de metricas:** `GET /api/metrics` esta definido directamente en `app.ts` (no en un modulo).

## Checklist por cambio

1. Mantener contrato backwards-compatible o versionar.
2. Actualizar seccion 6 del root `/AGENTS.md` si cambia request/response.
3. Agregar smoke check CI cuando se agrega endpoint critico.
4. Medir impacto en CPU/RAM/latencia (sobre todo en realtime y SSE).
5. Verificar que no rompe operabilidad de deploy ni readiness.
6. Si cambia ingesta, validar `ingest_outcome_latencies` en `/api/metrics`.

## Guardrails de contexto actual

- Tracking/forms usan write-behind en Redis Streams con DLQ.
- Estado live de tracking no depende del historico.
- `/api/ready` debe contemplar DB + Tegola + Redis.
- CMS usa SSE en `/api/cms/stream` con broadcast por campaign_id.
- Twilio webhook es publico pero valida firma `X-Twilio-Signature`.

## Guardrails de seguridad (auth module)

- El modulo `auth/` usa cookie helpers (`setAuthCookies`, `clearAuthCookies`) definidos en `auth/routes.ts`.
- Ambos reciben `isProd: boolean` derivado de `env.nodeEnv` (NO de `process.env` directo).
- La funcion `parseCookies()` se importa de `infra/auth.ts` — NO duplicar con regex.
- `AUTH_COOKIE_NAMES` se importa de `infra/auth.ts` — es la fuente de verdad de los nombres de cookies.
- `/api/auth/refresh` tiene rate limit per-IP (`rateLimitAuthPerMinute`) igual que login y register.
- Si `service.refresh()` falla, el catch **DEBE** llamar `clearAuthCookies()` antes de responder.
- `/api/config` (modulo `map/`) no debe exponer URLs internas (`tegolaBaseUrl`).
- Endpoints de `agents/` validan `agentStatusSchema` (zod enum `"background" | "foreground"`) para el status.
