# AGENTS.md - Modulo health

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

## Reglas

- `/api/ready` debe fallar si cae DB o Tegola.
- `/api/health` es liveness y siempre rapido.
- No meter operaciones pesadas en health endpoints.
