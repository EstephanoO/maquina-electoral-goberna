# AGENTS.md - Web geovisor (Next.js)

## Herencia obligatoria

Este archivo hereda de `AGENTS.md` root y solo gobierna `nexus-web/**`.
No redefine arquitectura de backend/infra.

## Contexto

Frontend del geovisor en `nexus-web`, deploy en Vercel, consumo de backend propio (`/api/*`).

## Skills obligatorios

- `nexus-web/.agents/skills/vercel-react-best-practices/SKILL.md`
- `nexus-web/.agents/skills/playwright-e2e-testing/SKILL.md`

## Skills de soporte

- `nexus-web/.agents/skills/fastify-best-practices/SKILL.md` (para entender contratos backend)
- `nexus-web/.agents/skills/building-native-ui/SKILL.md` (cuando el cambio impacta contrato con Expo)

## Rutas clave

- Home mapa: `nexus-web/app/page.tsx`
- Config runtime: `nexus-web/.env.example`
- Build config: `nexus-web/next.config.ts`

## Reglas de arquitectura

- Evitar hydration mismatch (sin branch no determinista SSR/CSR).
- Estado de hover/transitorio con `ref`/`feature-state`, no con renders masivos.
- Contratos de API centralizados: `/api/health`, `/api/ready`, `/api/config`, `/api/metrics`, `/api/agents/live`, `/api/agents/stream`, `/api/ops/system`.
- `/ops` debe consumir `ingest_outcome_latencies` y reflejar SLO operativos (latencia accepted, ratio 429, colas).
- Si se toca contrato backend, actualizar `EXPO-CONTRATO-TRACKING-FORMS.md` y smoke.

## Performance

- Reducir rerenders en handlers intensivos (`mousemove`, `drag`).
- SSE para realtime unidireccional; no abrir sockets innecesarios.
- Mantener payload de marcadores de agentes minimo.
- Testear con dataset realista para no subestimar costo.
- No asumir historico en cliente: live state solamente.

## Definition of Done web

- `npm run build` en verde.
- Sin errores de hydration en consola.
- Mapa carga tiles y tracking online en `/`.
