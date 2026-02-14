# AGENTS.md - Guia comun de modulos backend

## Convenciones

- Cada modulo define su `routes.ts` y contratos explicitos.
- Validaciones en `schema.ts`.
- Estado/almacenamiento de modulo en `store.ts` o `repository.ts`.
- Sin dependencia circular entre modulos.

## Checklist por cambio

1. Mantener contrato backwards-compatible o versionar.
2. Actualizar docs contractuales si cambia request/response.
3. Agregar smoke check CI cuando se agrega endpoint critico.
4. Revisar impacto en CPU/RAM (especialmente realtime).

## Skills

- Base: `nexus-web/.agents/skills/fastify-best-practices/SKILL.md`
