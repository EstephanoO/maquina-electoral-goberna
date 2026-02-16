# AGENTS.md - Modulo health

## Herencia obligatoria

Este archivo hereda de `AGENTS.md` root y de guias backend.

## Objetivo

Exponer estado vivo del backend y readiness real para deploy seguro.

## Skill obligatorio

- `nexus-web/.agents/skills/fastify-best-practices/SKILL.md`

## Archivo del modulo

- `apps/backend/src/modules/health/routes.ts`

## Contratos

- `GET /health`
- `GET /api/health`
- `GET /api/ready`
- `GET /api/metrics`
- `GET /api/ops/system`

## Reglas

- `/api/ready` debe fallar si cae DB, Tegola o Redis.
- `/api/health` es liveness y siempre rapido.
- No meter operaciones pesadas en health endpoints.
- `/api/metrics` es de observabilidad operativa, no de negocio.
- `/api/metrics` debe incluir `ingest_outcome_latencies` y gauges de flush-age para colas.
