# EXPO-CONTRATO-TRACKING-FORMS.md

Contrato recomendado para la app Expo con backend optimizado para alta concurrencia (write-behind + batch + estado vivo).

## 1) Tracking (ultima ubicacion por agente)

Endpoint:

- `POST /api/agents/location`

Headers:

- `Content-Type: application/json`
- `x-agent-token: <token>` (si backend lo tiene habilitado)
- `x-agent-id: <agent_id>` (recomendado para rate limit por agente)

Payload obligatorio:

```json
{
  "agent_id": "agente-001",
  "ts": "2026-02-14T23:00:00.000Z",
  "lat": -12.0464,
  "lng": -77.0428,
  "seq": 1201,
  "accuracy": 8,
  "speed": 1.4,
  "heading": 132,
  "battery": 78
}
```

Reglas:

- `seq` monotono por `agent_id` y persistido localmente.
- `lat` en `[-90,90]`, `lng` en `[-180,180]`.
- no reiniciar `seq` por reinicio de app.

Respuestas:

- `202`: aceptado en write-behind y visible en estado vivo.
- `200`: dedupe (`seq` viejo/repetido).
- `400`: payload invalido (no reintentar).
- `401`: token invalido (no reintentar).
- `429/503/5xx`: reintentar con backoff.

## 2) Forms

Endpoints:

- `POST /api/forms` (single o array)
- `POST /api/forms/batch` (single o array)

Payload minimo por form:

```json
{
  "nombre": "Juan Perez",
  "telefono": "999000000",
  "fecha": "2026-02-14T23:00:00.000Z",
  "x": 279854,
  "y": 8661420,
  "zona": "18S",
  "candidate": "A",
  "encuestador": "Agente 01",
  "encuestador_id": "agent-001",
  "candidato_preferido": "A",
  "client_id": "form-001-1201"
}
```

Reglas:

- `client_id` obligatorio e idempotente.
- `x/y` UTM validos (backend rechaza invalidos).
- para batch, respetar limite `FORMS_BATCH_REQUEST_LIMIT`.

Respuestas:

- `202`: encolado para write-behind.
- `400`: payload invalido.
- `413`: batch demasiado grande.
- `503`: backpressure de cola.
- `429/5xx`: reintento con backoff.

## 3) Estrategia cliente Expo (recomendada)

Tracking:

- movimiento: `10-15s`
- quieto: `30-60s`
- enviar solo si movio > `20m` o timeout maximo.

Retry policy:

- reintentar: `429/503/5xx` + network error.
- no reintentar: `400/401/403`.
- backoff: base `1s`, max `30s`, jitter `20%`.

Cola local:

- persistente (offline-first).
- estado por item: `queued/sent/retry/failed_permanent`.

## 4) Observabilidad minima operativa

Backend:

- `GET /api/agents/health`
- `GET /api/metrics`

Web UI:

- `nexus-web/app/page.tsx` ya muestra:
  - online agents
  - queue depth
  - counters de ingest/dedupe
  - p50/p95/p99

Cliente Expo (sin secretos):

- log de `agent_id`, `seq`, status HTTP, latencia, reintentos.

## 5) Checklist de implementacion correcta

1. Tracking repetido (`agent_id`,`seq`) devuelve `200` dedupe.
2. Tracking nuevo devuelve `202` y aparece en geovisor.
3. Forms repetido (`client_id`) dedupe en backend sin duplicar.
4. En picos, backend responde `503` (backpressure) en vez de degradar silenciosamente.
5. `api/metrics` y `api/agents/health` reflejan cola/latencia/counters.

## 6) Estrategias para que todo quede bien implementado

Arquitectura backend aplicada:

- Tracking y forms usan cola durable en Redis Streams (no memoria volatil).
- Persistencia a Postgres por batch (write-behind workers).
- Estado tracking en DB es solo ultima ubicacion por `agent_id`.
- Dedupe fuerte:
  - tracking por `agent_id + seq`
  - forms por `client_id`

Estrategias operativas recomendadas:

1. Mantener `x-agent-id` en requests de Expo para rate limit por agente real.
2. Enviar forms en lotes moderados (`20-100`) aunque el backend permita mas.
3. Revisar `queue_depth`, `last_flush_age_ms`, `tracking_ingest_total`, `forms_ingest_total` en `/api/metrics`.
4. Si sube `503` (backpressure), bajar frecuencia en cliente temporalmente.
5. Si sube `429`, reducir lote o cadencia por agente.
6. No desactivar dedupe (`seq`/`client_id`) en ningun flujo.
