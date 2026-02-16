# Runbook Migracion Neon -> VPS

## Objetivo

Ejecutar migracion real de base durante ventana nocturna con rollback claro.

## Pre-check (30 min antes)

1. Estado servicios
   - `ssh deploy@161.132.39.165 "docker ps --format 'table {{.Names}}\t{{.Status}}'"`
2. Salud API
   - `ssh deploy@161.132.39.165 "curl -sS http://127.0.0.1/api/ready"`
3. Backup diario + restore test
   - `ssh deploy@161.132.39.165 "cd /srv/app && ./scripts/backup.sh && ./scripts/backup_verify.sh"`
4. Snapshot pre-migracion
   - `ssh deploy@161.132.39.165 "cd /srv/app && ./scripts/pre_migration_snapshot.sh"`

## Ejecucion de migracion

1. Freeze escrituras en app (modo mantenimiento o cortar workers de ingestion).
2. Export desde Neon (schema + data) con credenciales de produccion.
3. Importar en `postgres` local (`appdb`) en VPS.
4. Reindex/analyze post-import.
5. Smoke checks:
   - `/api/health`
   - `/api/ready`
   - `/api/agents/health`
   - `/api/metrics`

## Verificaciones post-migracion

1. Conteos criticos (tablas negocio)
2. Insercion real de tracking/forms
3. Latencia y errores 5xx/429 en primer bloque de trafico

## Rollback

1. Restaurar ultimo snapshot pre-migracion:
   - `gunzip -c /srv/backups/pre_migration_appdb_<timestamp>.full.sql.gz | docker compose -f /srv/app/docker-compose.yml exec -T postgres psql -U appuser -d appdb`
2. Reiniciar backend:
   - `ssh deploy@161.132.39.165 "cd /srv/app && docker compose up -d --build backend"`

## Evidencias a guardar

- Nombre exacto de backup/snapshot usado
- Hash SHA256 (`*.sha256`)
- Logs de import
- Resultado de health/readiness
