# AGENTS.md - Web App Routes

> **Hereda de:** `/AGENTS.md` (root) y `apps/web/AGENTS.md`  
> **Ultima actualizacion:** 2026-02-20

## Objetivo

Visualizar Peru administrativo + tracking de agentes en tiempo real con UX fluida y bajo costo.

## Archivos clave

- `apps/web/app/(dashboard)/page.tsx` — Home (map view)
- `apps/web/app/(dashboard)/map/page.tsx` — Mapa interactivo
- `apps/web/app/(dashboard)/ops/page.tsx` — Panel operativo
- `apps/web/app/(dashboard)/cms/page.tsx` — CMS de contactos
- `apps/web/app/(dashboard)/cms-metrics/page.tsx` — Metricas CMS global
- `apps/web/app/(dashboard)/formularios/page.tsx` — Submissions
- `apps/web/app/(dashboard)/candidatos/page.tsx` — Gestion campanas
- `apps/web/app/(dashboard)/equipo/page.tsx` — Equipo
- `apps/web/app/(dashboard)/settings/` — Configuracion

## Contratos consumidos

- `GET /api/health`
- `GET /api/ready`
- `GET /api/config`
- `GET /api/agents/live`
- `GET /api/agents/stream`
- `GET /api/agents/health`
- `GET /api/metrics`
- `GET /api/cms/contacts`
- `GET /api/cms/stats`
- `GET /api/cms/metrics`
- `GET /api/cms/stream`

## Reglas de implementacion

- No usar `window` en render inicial para evitar mismatch.
- URL de tiles siempre sanitizada y sin credenciales.
- Feature hover por `feature-state` + `promoteId`.
- Reconexion SSE robusta sin loops de reconexion agresivos.
- Tolerar estado offline/online de agentes sin bloquear render.
- En `/ops`, mostrar outcome latencies y cards de alerta SLO sin romper tabla por ruta.

## Performance

- Minimizar setState en eventos de alta frecuencia.
- Mantener filtros de capas simples y cacheables.
- No cargar data historica en memoria del browser.
