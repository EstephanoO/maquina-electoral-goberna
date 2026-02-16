# Branching + CI/CD Policy (Produccion)

## Objetivo

Mantener deploy limpio y estable: solo `main` llega a internet/VPS.

## Ramas

- `main`: unica rama de release. Cada push a `main` dispara deploy backend al VPS.
- `development`: rama de integracion para probar en localhost y staging local.
- `fix/*`: rama corta para hotfix de produccion.
- `feature/*`: trabajo normal de producto.

## Flujo recomendado

1. Crear trabajo en `feature/*` o `fix/*` desde `development`.
2. Probar local (`nexus-web` + `apps/backend`).
3. PR a `development` para integrar cambios.
4. Cuando validaste, PR de `development` a `main`.
5. Merge a `main` => CI/CD ejecuta quality + security + deploy backend.

## Reglas de calidad obligatorias

- Backend: typecheck + smoke contract.
- Frontend: typecheck + build.
- Arquitectura: check automatizado (`scripts/ci/check_architecture_contracts.py`).

## Rollback

- Backend: si falla smoke post-deploy en VPS, workflow revierte al commit anterior automaticamente.
- Frontend (Vercel): si una nueva build falla, Vercel conserva la version productiva anterior.

## Secrets esperados

- `VPS_HOST`
- `SSH_PRIVATE_KEY`
- `VPS_PORT` (opcional)
- `FRONTEND_PROD_URL` (opcional, para health check post-main)
