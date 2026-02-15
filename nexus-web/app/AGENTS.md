# AGENTS.md - Modulo app map

## Herencia obligatoria

Este archivo hereda de `AGENTS.md` root y `nexus-web/AGENTS.md`.

## Objetivo

Visualizar Peru administrativo + tracking de agentes en tiempo real con UX fluida y bajo costo.

## Skills obligatorios

- `nexus-web/.agents/skills/vercel-react-best-practices/SKILL.md`

## Archivos del modulo

- `nexus-web/app/page.tsx`
- `nexus-web/app/ops/page.tsx`

## Contratos consumidos

- `GET /api/health`
- `GET /api/ready`
- `GET /api/config`
- `GET /api/agents/live`
- `GET /api/agents/stream`
- `GET /api/agents/health`
- `GET /api/metrics`
- `GET /api/ops/system`

## Reglas de implementacion

- No usar `window` en render inicial para evitar mismatch.
- URL de tiles siempre sanitizada y sin credenciales.
- Feature hover por `feature-state` + `promoteId`.
- Reconexion SSE robusta sin loops de reconexion agresivos.
- Tolerar estado offline/online de agentes sin bloquear render.

## Performance

- Minimizar setState en eventos de alta frecuencia.
- Mantener filtros de capas simples y cacheables.
- No cargar data historica en memoria del browser.
