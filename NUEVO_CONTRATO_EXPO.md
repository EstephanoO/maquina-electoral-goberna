# Contrato Unico - Expo + Backend (Tracking y Forms)

Estado: vigente y unico contrato operativo.

## 1) Principios no negociables

- No hay migracion de contrato en esta etapa.
- Se elimina soporte legacy: se implementa y opera solo el flujo nuevo.
- Toda decision de performance se valida con metricas reales, no por sensacion.
- Expo y Backend comparten semantica de errores y retries.

## 2) Tracking (ingesta)

Endpoint:

- `POST /api/agents/location`

Headers:

- `Content-Type: application/json`
- `x-agent-token` obligatorio en produccion

Payload:

- `agent_id`: string estable por dispositivo (no rotar)
- `seq`: numero monotono creciente por `agent_id`
- `ts`, `lat`, `lng` obligatorios
- `accuracy`, `speed`, `heading`, `battery` opcionales

Respuestas:

- `202`: accepted
- `200`: deduped
- `401`: auth invalida (bloquear envio y alertar)
- `429`: rate_limited (retry)
- `503`: backpressure (retry)

Retry policy:

- Retry solo en `429`, `503` o error de red
- Ventanas: `1-2s`, `3-5s`, `8-13s`
- Maximo: `5` intentos por item
- Si supera maximo: queda en pendientes para reconciliacion

## 3) Forms

Endpoints:

- `POST /api/forms`
- `POST /api/forms/batch`

Headers:

- `Content-Type: application/json`
- `x-agent-id` recomendado (actor id para rate-limit justo)

Payload clave:

- `client_id` idempotente por formulario (no regenerar en retry)
- `encuestador_id` obligatorio y no vacio

Respuestas:

- `202`: accepted
- `429`: rate_limited (retry)
- `503`: backpressure (retry)
- `400/413`: payload invalido o batch excesivo (sin retry)

Retry policy:

- Retry solo en `429`, `503` o error de red
- Misma politica de backoff+jitter que tracking

## 4) SSE (geovisor)

Endpoint:

- `GET /api/agents/stream`

Eventos activos:

- `snapshot` -> `{ ts, agents: AgentLocation[] }`
- `location.batch` -> `{ ts, agents: AgentLocation[] }` (hot-path obligatorio)
- `agent.offline` -> `{ agent_id, ts }`
- `heartbeat` -> `{ ts }`

Evento removido:

- `location.update` legacy eliminado del contrato operativo

## 5) SLO y alertas operativas

Latencia accepted forms:

- WARN: `p95 > 320ms` o `p99 > 380ms`
- CRIT: `p95 > 380ms` o `p99 > 450ms`

Latencia accepted tracking:

- WARN: `p95 > 320ms` o `p99 > 390ms`
- CRIT: `p95 > 380ms` o `p99 > 450ms`

Rate-limit forms:

- WARN: `> 2%`
- CRIT: `> 8%`
- P1: `> 20%`

Anti-ruido:

- Ventana movil: `10m`
- Persistencia minima: `5m`
- Minimo muestra: `200 requests`

## 6) Observabilidad minima obligatoria

En `GET /api/metrics`:

- `ingest_outcome_latencies.forms.accepted`
- `ingest_outcome_latencies.forms.rate_limited`
- `ingest_outcome_latencies.tracking.accepted`
- `gauges.forms_queue_depth`
- `gauges.forms_last_flush_age_ms`
- `gauges.tracking_queue_depth`
- `gauges.tracking_last_flush_age_ms`

## 7) Definicion de terminado (DoD)

- Expo envia `agent_id` estable y `seq` monotono
- Expo no envia tracking sin `x-agent-token` en prod
- Background y foreground respetan cadencias definidas
- Retries cumplen semantica (`429/503/network_error`)
- Backend refleja outcomes y latencias por outcome
- Dashboard `/ops` muestra salud operativa util para incidentes
