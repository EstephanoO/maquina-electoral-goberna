# AGENTS.md - Modulo agents (realtime)

## Herencia obligatoria

Este archivo hereda de `AGENTS.md` root, `apps/backend/AGENTS.md` y `apps/backend/src/modules/AGENTS.md`.
Si hay conflicto, manda el root.

## Objetivo

Tracking en tiempo real con write-behind durable, estado live separado y fanout SSE estable.

## Skills obligatorios

- `nexus-web/.agents/skills/fastify-best-practices/SKILL.md`
- `nexus-web/.agents/skills/vercel-react-best-practices/SKILL.md`

## Archivos del modulo

- `apps/backend/src/modules/agents/routes.ts`
- `apps/backend/src/modules/agents/repository.ts`
- `apps/backend/src/modules/agents/store.ts`
- `apps/backend/src/modules/agents/schema.ts`
- `apps/backend/src/modules/agents/types.ts`
- `apps/backend/src/modules/agents/write-behind-queue.ts`

## Contratos

- `POST /api/agents/location`
- `GET /api/agents/live`
- `GET /api/agents/stream` (SSE)
- `GET /api/agents/health`

Referencia funcional obligatoria:

- `EXPO-CONTRATO-TRACKING-FORMS.md`

## Reglas de modulo

- `AGENT_INGEST_TOKEN` obligatorio en produccion.
- Deduplicacion por `seq` por `agent_id`.
- Dedupe en dos niveles: estado live y stream pending.
- Presencia por timeout (`agentStaleAfterMs`).
- Heartbeat SSE para detectar conexiones zombis.
- Reclaim de mensajes pendientes + DLQ tras maximo de reintentos.
- No bloquear event loop con operaciones pesadas.

## Performance

- Mantener payload SSE minimo.
- Sin historico pesado en memoria (solo estado vivo).
- Sweep de stale agentes con timer acotado y `unref()`.
- Medir `queue_depth`, `last_flush_age_ms`, `flush_duration_ms`, `online_agents` y `sse_clients`.
- Exponer y monitorear latencias por outcome (`accepted`, `deduped`, `auth_failed`, `rate_limited`, `backpressure`).
