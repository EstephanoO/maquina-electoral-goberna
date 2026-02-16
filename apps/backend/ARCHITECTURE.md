# Backend Fastify Architecture

## Objetivo

Backend modular, simple y mantenible para 2 devs, alineado a operabilidad en VPS.

## Capas

- `config/`: resolucion de entorno y politicas runtime.
- `infra/`: adaptadores externos (upstream HTTP con retry/timeout).
- `modules/`: vertical slices por dominio (`health`, `map`, `forms`, `agents`).
- `app.ts`: composicion de plugins Fastify + middlewares globales.
- `server.ts`: bootstrap del proceso y lifecycle.

## Slices

### `modules/health`

- `/health`, `/api/health`, `/api/ready`
- readiness con chequeos de DB y Tegola.

### `modules/map`

- `/api/config`, `/api/capabilities`, `/api/tiles/:z/:x/:y.vector.pbf`
- valida parametros tile y propaga headers de cache/revalidacion.

### `modules/forms`

- `/api/forms`
- validacion de payload + dedupe por `client_id`.

### `modules/agents`

- `/api/agents/location` (ingesta)
- `/api/agents/live` (snapshot)
- `/api/agents/stream` (SSE)

## Principios aplicados

- rutas delgadas, validacion explicita, reglas de dominio en modulos.
- dependencias de infra inyectadas por `env`.
- sin estado compartido opaco fuera de modulo.
- defaults seguros para timeout y cache.
