# AGENTS.md - Modulo forms

## Herencia obligatoria

Este archivo hereda de `AGENTS.md` root, `apps/backend/AGENTS.md` y `apps/backend/src/modules/AGENTS.md`.
No redefine reglas globales.

## Objetivo

Ingesta robusta de formularios con write-behind durable, dedupe e idempotencia real.

## Skill obligatorio

- `nexus-web/.agents/skills/fastify-best-practices/SKILL.md`

## Archivos del modulo

- `apps/backend/src/modules/forms/routes.ts`
- `apps/backend/src/modules/forms/repository.ts`
- `apps/backend/src/modules/forms/schema.ts`
- `apps/backend/src/modules/forms/write-behind-queue.ts`

## Contrato

- `POST /api/forms`
- `POST /api/forms/batch`

## Reglas

- Validacion schema-first.
- Rate limit ponderado por costo de batch con modelo dual: actor + IP guardrail.
- Resolucion de actor para RL: `x-agent-id` -> `encuestador_id` -> `request.ip`.
- Persistencia por batch idempotente.
- Dedupe deterministico cuando viene `client_id`.
- Reclaim de pendientes + DLQ tras maximo de reintentos.

## Performance

- Evitar queries redundantes.
- Index/unique index obligatorios para dedupe.
- Exponer y monitorear `forms_queue_depth` y latencia de flush.
