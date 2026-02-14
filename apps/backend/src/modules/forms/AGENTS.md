# AGENTS.md - Modulo forms

## Objetivo

Ingesta robusta de formularios con dedupe por `client_id` y validacion fuerte.

## Skill obligatorio

- `nexus-web/.agents/skills/fastify-best-practices/SKILL.md`

## Archivos del modulo

- `apps/backend/src/modules/forms/routes.ts`
- `apps/backend/src/modules/forms/repository.ts`
- `apps/backend/src/modules/forms/schema.ts`

## Contrato

- `POST /api/forms`

## Reglas

- Validacion schema-first.
- Insert atomico por item.
- Dedupe deterministico cuando viene `client_id`.

## Performance

- Evitar queries redundantes.
- Index y unique index obligatorios para dedupe.
