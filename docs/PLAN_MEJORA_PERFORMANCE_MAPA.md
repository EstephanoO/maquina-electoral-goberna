# Plan de mejora de performance mapa realtime

## Objetivo

Maximizar fluidez del mapa y estabilidad de tracking en tiempo real, manteniendo compatibilidad con backend VPS + Redis Streams.

## Fase 1 (quick wins) - implementada

- Eliminar trabajo de render periodico no necesario en frontend.
- Reducir polling de ops en home map a 30s y pausar en background tab.
- Consolidar manejo de eventos de tracking para evitar churn en estado.

## Fase 2 (contrato realtime) - implementada

- SSE agrega `location.batch` para enviar updates agrupados.
- Frontend opera solo con `location.batch` (legacy removido).
- Documentacion de contrato actualizada en `NUEVO_CONTRATO_EXPO.md`.

## Fase 3 (backend escalable) - implementada parcialmente

- Fanout SSE con pruning de clientes lentos.
- Heartbeat global compartido (sin timer por cliente).
- Ingest path de tracking sin consulta de lag Redis por request; usa muestreo de profundidad.

## Siguientes mejoras recomendadas

1. Versionar formalmente stream SSE (`/api/agents/stream?v=2`) y fijar politica de deprecacion futura por evento.
2. Introducir throttling por viewport en frontend para capas de trails.
3. Persistir métricas en Prometheus/Grafana para trending real de p95/p99 por outcome.
4. Mantener smoke CI de `location.batch` y ausencia de eventos legacy.
