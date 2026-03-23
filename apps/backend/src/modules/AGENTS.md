# AGENTS.md - Guia comun de modulos backend

> **Hereda de:** `/AGENTS.md` (root) y `apps/backend/AGENTS.md`  
> **Alcance:** Solo `apps/backend/src/modules/**`  
> **Ultima actualizacion:** 2026-03-23

---

## Flujo de Desarrollo

Ver `/CONTRIBUTING.md` para el flujo GitHub Flow completo.  


---

## Convenciones

- Cada modulo define `routes.ts`, `schemas.ts` y capa de persistencia (`store.ts` o `repository.ts`).
- Sin dependencia circular entre modulos.
- Endpoints y payloads explicitos; cero contratos implicitos.

## Modulos registrados en app.ts (32 directorios en disco)

> Fuente de verdad: contar directorios en `src/modules/`. El root AGENTS.md lista 30 registrados.

Ver seccion 5 del root `/AGENTS.md` para la tabla completa de modulos y prefijos API.

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
