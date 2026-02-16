# Frontend Screaming Clean Simple (nexus-web)

## Principio

La estructura debe "gritar" casos de uso, no tecnologia.

## Casos de uso visibles

- `app/page.tsx` => geovisor realtime de agentes
- `app/ops/page.tsx` => observabilidad operativa + SLO

## Reglas

1. UI consume solo contratos HTTP/SSE (`/api/*`).
2. No importar internals del backend desde frontend.
3. Estado transitorio intenso (mapa/realtime) optimizado para minimizar rerender.
4. `/ops` monitorea outcomes y colas (no solo status code por ruta).

## Calidad en CI/CD

- `nexus-web` siempre pasa `tsc` + `build` en PR y en `main`.
- Check de arquitectura evita acoplamientos no permitidos.
