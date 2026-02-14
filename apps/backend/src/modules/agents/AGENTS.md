# AGENTS.md - Modulo agents (realtime)

## Objetivo

Tracking en tiempo real de agentes de campo con costo bajo: ingest HTTP + SSE fanout.

## Skills obligatorios

- `nexus-web/.agents/skills/fastify-best-practices/SKILL.md`
- `nexus-web/.agents/skills/vercel-react-best-practices/SKILL.md`

## Archivos del modulo

- `apps/backend/src/modules/agents/routes.ts`
- `apps/backend/src/modules/agents/store.ts`
- `apps/backend/src/modules/agents/schema.ts`
- `apps/backend/src/modules/agents/types.ts`

## Contratos

- `POST /api/agents/location`
- `GET /api/agents/live`
- `GET /api/agents/stream` (SSE)
- `GET /api/agents/health`

Referencia funcional obligatoria:

- `EXPO-BACKEND.md`

## Reglas de modulo

- Deduplicacion por `seq` por `agent_id`.
- Presencia por timeout (`agentStaleAfterMs`).
- Heartbeat SSE para detectar conexiones zombis.
- No bloquear event loop con operaciones pesadas.

## Performance

- Mantener payload SSE minimo.
- Sin historico pesado en memoria (solo estado vivo).
- Sweep de stale agentes con timer acotado y `unref()`.
