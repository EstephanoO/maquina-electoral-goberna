# AGENTS.md - Backend Fastify

## Herencia obligatoria

Este archivo hereda de `AGENTS.md` root y aplica solo a `apps/backend/**`.
No redefine arquitectura global. Si hay conflicto, prevalece el root.

## Contexto del modulo

Backend productivo en `apps/backend` con Fastify + Drizzle + Postgres.
Ingesta critica por Redis Streams (tracking/forms) con write-behind y batch a DB.

## Skills obligatorios

- `nexus-web/.agents/skills/fastify-best-practices/SKILL.md`

## Rutas importantes

- Bootstrap: `apps/backend/src/server.ts`
- Composicion app: `apps/backend/src/app.ts`
- Config/env: `apps/backend/src/config/env.ts`
- Redis/streams: `apps/backend/src/infra/redis.ts`
- Health/readiness: `apps/backend/src/modules/health/routes.ts`
- Tracking: `apps/backend/src/modules/agents/**`
- Forms: `apps/backend/src/modules/forms/**`
- Map/Tegola: `apps/backend/src/modules/map/**`

## Reglas de arquitectura

- Handlers delgados; negocio en modulo/infra.
- Validacion schema-first en todo ingreso externo.
- Nada hardcodeado de timeout/retry/rate-limit; todo por env.
- Contratos backwards-compatible o versionados.
- Errores deterministicos y sin leakage de secretos.

## Reglas operativas de produccion

- `AGENT_INGEST_TOKEN` obligatorio en prod para `/api/agents/location`.
- Forms en prod usa rate limit dual (actor + IP guardrail) configurable por env.
- Readiness valida DB + Tegola + Redis (`/api/ready`).
- Redis de produccion en politica `noeviction`.
- No drift: lo que corre en VPS sale de `main` + compose reproducible.
- `/api/metrics` debe incluir `latencies` por ruta e `ingest_outcome_latencies` con `p50/p90/p95/p99`.

## Definition of Done backend

- `bunx tsc --noEmit` en verde.
- Smoke minimo en verde: `/api/health`, `/api/ready`, `/api/metrics`, `/api/agents/health`.
- Contratos de Expo/backend actualizados cuando cambia request/response.
