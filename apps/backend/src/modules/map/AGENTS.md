# AGENTS.md - Modulo map

## Objetivo

Servir contrato de mapa y proxy de tiles Tegola con cache/revalidacion correctas.

## Skill obligatorio

- `nexus-web/.agents/skills/fastify-best-practices/SKILL.md`

## Archivos del modulo

- `apps/backend/src/modules/map/routes.ts`
- `apps/backend/src/modules/map/tiles.ts`

## Contratos

- `GET /api/config`
- `GET /api/capabilities`
- `GET /api/tiles/:z/:x/:y.vector.pbf`

## Reglas de modulo

- Validar siempre `z/x/y` antes de upstream.
- Propagar `ETag`, `Last-Modified`, `Cache-Control`.
- Soportar `304` con conditional request.
- No filtrar error upstream como 200.

## Performance

- Reducir transferencias con revalidacion.
- No parsear/transformar binary tile innecesariamente.
