# Plan de mejora sistema + analisis servidor

## 1) Diagnostico real del servidor (161.132.39.165)

Fecha de auditoria: `2026-02-14`.

### Estado actual

- VPS sano y con headroom grande:
  - CPU: `8 vCPU`
  - RAM: `30 GiB` (uso actual < `1 GiB`)
  - Disco: `630 GiB` (uso ~`1%`)
- Contenedores activos y estables: `nginx`, `backend`, `tegola`, `postgres`, `redis`.
- Firewall activo (`22/80/443`) y `fail2ban` activo.

### Hallazgos criticos

1. **Drift de deploy** (critico):
   - En `/srv/app/docker-compose.yml` backend usa `context: ${BACKEND_CONTEXT:-./backend}`.
   - En `/srv/app/.env` no esta seteado `BACKEND_CONTEXT=./apps/backend`.
   - Resultado: esta corriendo backend viejo (sin `/api/agents/health` ni `/api/metrics`).

2. **Endpoints nuevos no desplegados**:
   - `/api/agents/health` y `/api/metrics` responden `404` en prod.
   - Backend logs muestran consultas repetidas a esos endpoints con `404`.

3. **Redis no configurado para cola durable**:
   - `maxmemory-policy=allkeys-lru`.
   - Para Redis Streams durable debe ser `noeviction`.

4. **Nginx de host inactivo**:
   - `systemctl nginx` aparece `inactive`.
   - No es bug si nginx se sirve solo por contenedor, pero debe quedar explicitado en runbook.

## 2) Objetivo tecnico

Dejar tracking y forms con:

- Ingesta asincrona durable (`Redis Streams`)
- Persistencia por batch en backend (`write-behind workers`)
- Dedupe fuerte (`agent_id+seq`, `client_id`)
- Estado vivo para geovisor
- Rate limit ponderado por costo de payload
- Observabilidad y readiness confiables

## 3) Plan de implementacion por fases

## Fase A - Cerrar drift y activar nueva arquitectura (inmediata)

1. En VPS, fijar contexto backend nuevo:

```bash
cd /srv/app
grep -n '^BACKEND_CONTEXT' .env || true
echo 'BACKEND_CONTEXT=./apps/backend' | sudo tee -a .env
echo 'BACKEND_DOCKERFILE=Dockerfile' | sudo tee -a .env
```

2. Confirmar variables nuevas en `.env`:

- `RATE_LIMIT_MAX_PER_MINUTE`
- `RATE_LIMIT_FORMS_PER_MINUTE`
- `RATE_LIMIT_AGENTS_LOCATION_PER_MINUTE`
- `TRACKING_STREAM_KEY`, `TRACKING_STREAM_GROUP`, `TRACKING_SEQ_HASH_KEY`
- `FORMS_STREAM_KEY`, `FORMS_STREAM_GROUP`, `FORMS_DEDUPE_PREFIX`, `FORMS_DEDUPE_TTL_SEC`
- `STREAM_CONSUMER_BLOCK_MS`

3. Redeploy limpio:

```bash
cd /srv/app
git pull
docker compose down
docker compose up -d --build
docker compose ps
```

4. Verificar endpoints nuevos:

```bash
curl -fsS http://127.0.0.1/api/health
curl -fsS http://127.0.0.1/api/ready
curl -fsS http://127.0.0.1/api/agents/health
curl -fsS http://127.0.0.1/api/metrics
```

## Fase B - Redis durable bien configurado (obligatoria)

1. Cambiar politica Redis:

- `maxmemory-policy noeviction`

2. Mantener AOF activado.

3. Validar:

```bash
docker exec nexus_redis redis-cli CONFIG GET maxmemory-policy
docker exec nexus_redis redis-cli INFO persistence
```

## Fase C - Performance tuning para 100 agentes

Valores iniciales recomendados:

- `RATE_LIMIT_AGENTS_LOCATION_PER_MINUTE=240` (por agente)
- `RATE_LIMIT_FORMS_PER_MINUTE=300` (ponderado por batch)
- `FORMS_BATCH_REQUEST_LIMIT=100`
- `TRACKING_WB_BATCH_SIZE=200`
- `TRACKING_WB_FLUSH_MS=200`
- `FORMS_WB_BATCH_SIZE=150`
- `FORMS_WB_FLUSH_MS=250`
- `TRACKING_WB_MAX_QUEUE=30000`
- `FORMS_WB_MAX_QUEUE=15000`
- `TRACKING_STREAM_MAX_LEN=50000`
- `FORMS_STREAM_MAX_LEN=30000`
- `DB_POOL_MAX=20`

## Fase D - Hardening final de workers

1. Implementar recuperacion de mensajes pendientes de consumer group (PEL) con `XAUTOCLAIM`.
2. Agregar DLQ basica para batches que fallan repetidamente.
3. Agregar metrica de `oldest_message_age_ms` por stream.

## 4) KPIs de aceptacion

- `/api/agents/location` p95 < `120ms` bajo 100 concurrentes.
- `/api/forms` y `/api/forms/batch` sin 5xx por saturacion normal.
- `queue_depth` estable (sin crecimiento sostenido > 5 min).
- `last_flush_age_ms` controlado (< 2x `flush_ms`).
- `404` en `/api/agents/health` y `/api/metrics` = `0`.

## 5) Riesgos y mitigaciones

- Riesgo: proceso cae entre `202` y flush.
  - Mitigacion: stream durable + consumer group + `XACK` solo post DB.
- Riesgo: Redis eviction borra eventos.
  - Mitigacion: `noeviction` + maxlen y alertas.
- Riesgo: rate limit por IP castiga agentes detras de NAT.
  - Mitigacion: enviar siempre `x-agent-id` desde Expo.

## 6) Cambios obligatorios en Expo

- Enviar `x-agent-id` y `x-agent-token`.
- Mantener `seq` monotono persistente por agente.
- Retry solo en `429/503/5xx` y errores de red.
- Batch forms en `20-100` items.
- Respetar contrato en `EXPO-CONTRATO-TRACKING-FORMS.md`.
