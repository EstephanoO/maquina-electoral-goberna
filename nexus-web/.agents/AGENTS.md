# AGENTS.md - Skills y enrutamiento (nexus-web)

## Herencia obligatoria

Este archivo hereda de `AGENTS.md` root, `.agents/AGENTS.md` y `nexus-web/AGENTS.md`.
Si hay contradiccion, manda el root.

## Skills instalados (via find-skills)

- `nexus-web/.agents/skills/find-skills/SKILL.md`
- `nexus-web/.agents/skills/vercel-react-best-practices/SKILL.md`
- `nexus-web/.agents/skills/fastify-best-practices/SKILL.md`
- `nexus-web/.agents/skills/building-native-ui/SKILL.md`
- `nexus-web/.agents/skills/playwright-e2e-testing/SKILL.md`

## Matriz agente -> skills

- `agent-web-map`
  - `vercel-react-best-practices`
  - `playwright-e2e-testing`

- `agent-backend-fastify`
  - `fastify-best-practices`

- `agent-realtime-tracking`
  - `fastify-best-practices`
  - `vercel-react-best-practices`

- `agent-mobile-contract-expo`
  - `building-native-ui`

- `agent-skills-curator`
  - `find-skills`

## Reglas de escalabilidad

- No crear skills locales duplicados para el mismo dominio.
- Al sumar feature nueva, primero mapear skill existente; si no existe, documentar gap.
- Cada PR con cambio estructural debe actualizar este archivo si cambia ownership o skill.
- Para cambios de contrato backend, sincronizar tambien docs de contrato Expo/backend.
