# AGENTS.md - Guia comun de modulos backend

## Herencia obligatoria

Este archivo hereda de `AGENTS.md` root y de `apps/backend/AGENTS.md`.
Solo define reglas para `apps/backend/src/modules/**`.

## Convenciones

- Cada modulo define `routes.ts`, `schema.ts` y capa de persistencia (`store.ts` o `repository.ts`).
- Sin dependencia circular entre modulos.
- Endpoints y payloads explicitos; cero contratos implicitos.

## Checklist por cambio

1. Mantener contrato backwards-compatible o versionar.
2. Actualizar docs contractuales si cambia request/response.
3. Agregar smoke check CI cuando se agrega endpoint critico.
4. Medir impacto en CPU/RAM/latencia (sobre todo en realtime).
5. Verificar que no rompe operabilidad de deploy ni readiness.
6. Si cambia ingesta, validar `ingest_outcome_latencies` en `/api/metrics`.

## Guardrails de contexto actual

- Tracking/forms usan write-behind en Redis Streams.
- Estado live de tracking no depende del historico.
- `/api/ready` debe contemplar DB + Tegola + Redis.

## Skills

- Base: `nexus-web/.agents/skills/fastify-best-practices/SKILL.md`
