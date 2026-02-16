# Umbrales operativos recomendados

## Objetivo

Configurar alertas utiles para un equipo de 2 devs, minimizando ruido y priorizando degradaciones reales.

## Latencia forms accepted (`ingest_outcome_latencies.forms.accepted`)

- WARN: `p95 > 320 ms` o `p99 > 380 ms`
- CRIT: `p95 > 380 ms` o `p99 > 450 ms`

## Latencia tracking accepted (`ingest_outcome_latencies.tracking.accepted`)

- WARN: `p95 > 320 ms` o `p99 > 390 ms`
- CRIT: `p95 > 380 ms` o `p99 > 450 ms`

## Ratio de forms rate-limited (`rate_limited / (accepted + rate_limited)`)

- WARN: `> 2%`
- CRIT: `> 8%`
- P1: `> 20%`

## Colas write-behind

### Forms

- WARN: `forms_queue_depth > 100` o `forms_last_flush_age_ms > 3000`
- CRIT: `forms_queue_depth > 300` o `forms_last_flush_age_ms > 10000`

### Tracking

- WARN: `tracking_queue_depth > 150` o `tracking_last_flush_age_ms > 3000`
- CRIT: `tracking_queue_depth > 500` o `tracking_last_flush_age_ms > 10000`

## Anti-ruido

- Evaluar en ventana movil de 10m.
- Disparar alerta solo si persiste >= 5m.
- Exigir volumen minimo de 200 requests para alertas de latencia y rate-limit.
