# agents.md - Flujo de desarrollo y deploy

## Objetivo

Mantener `main` siempre deployable, sin drift entre VPS y GitHub, con cambios chicos y verificables.

## Flujo diario (obligatorio)

1. Crear rama corta desde `main` (`feat/*` o `fix/*`).
2. Desarrollar localmente (web + backend) en slices chicos.
3. Verificar local antes de push:
   - backend: `/api/health`, `/api/ready`, `/api/config`, `/api/metrics`
   - map tiles: `/api/tiles/{z}/{x}/{y}.vector.pbf`
   - forms: `POST /api/forms` + dedupe por `client_id`
4. Hacer commit con mensaje claro y atómico.
5. Push de rama y abrir PR.
6. Esperar CI verde (quality + security).
7. Merge a `main`.
8. Deploy automático al VPS por GitHub Actions.
9. Validación post-deploy en VPS.

## Regla de oro

- Nunca editar código directo en VPS.
- Nunca parchear producción fuera de git.
- Si algo falla: commit de fix y redeploy, o rollback por pipeline.

## Checklist post-deploy (VPS)

1. `docker compose ps` sin reinicios anormales.
2. `curl -fsS http://127.0.0.1/api/health`
3. `curl -fsS http://127.0.0.1/api/ready`
4. `curl -fsS http://127.0.0.1/api/config`
5. `curl -fsS -o /tmp/tile.pbf -w '%{http_code} %{size_download}\n' http://127.0.0.1/api/tiles/5/9/16.vector.pbf`
6. Insert de prueba a `/api/forms` con `client_id` único.
7. Validar `ingest_outcome_latencies` en `/api/metrics`.

## Reglas de seguridad mínimas

- No subir `.env`.
- Postgres y Redis nunca expuestos públicamente.
- CORS explícito solo para orígenes permitidos.
- Firewall mínimo (`22/80/443`) + fail2ban activo.

## Observabilidad básica

- Logs backend estructurados (winston).
- Access logs HTTP (morgan/nginx).
- Monitorear `5xx`, latencia y estado de `api/ready`.

## Backups y recuperación

- Backup diario activo.
- Restore smoke test periódico.
- Si no hay restore validado, el backup no cuenta.

## Estrategia de migración (sin big-bang)

1. Estabilizar contratos críticos (`health`, `forms`, `tiles`).
2. Migrar backend por vertical slices.
3. Merge rápido, feedback rápido, rollback simple.
