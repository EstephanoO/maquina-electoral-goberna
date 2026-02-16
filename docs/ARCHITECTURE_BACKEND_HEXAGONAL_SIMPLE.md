# Backend Hexagonal Simple (apps/backend)

## Capas

- **Entradas (adapters in):** `src/modules/*/routes.ts`
- **Aplicacion/servicio:** logica de orquestacion por modulo (colas, reglas, dedupe)
- **Puertos/infra (adapters out):** `src/db.ts`, `src/infra/redis.ts`, `src/infra/upstream.ts`
- **Bootstrap:** `src/app.ts`, `src/server.ts`

## Reglas

1. `modules/*` no importa `app.ts` ni `server.ts`.
2. Validacion de payload en bordes (routes/schema).
3. Side-effects encapsulados en infraestructura y queues.
4. Contrato expuesto por endpoints, no por detalles internos.

## Modulos dominantes

- `agents`: tracking ingest + live state + SSE + write-behind
- `forms`: ingest forms + dedupe + write-behind
- `health`: health/readiness/metrics
- `map`: proxy/tiles
