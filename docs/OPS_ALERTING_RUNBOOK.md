# Ops Alerting Runbook (sin Grafana/Prometheus)

## Objetivo

Tener alertas operativas reales usando solo script + cron + GitHub Actions.

## Componentes

- Script: `scripts/ops/check_ops_alerts.py`
- Umbrales: `scripts/ops/ops_alert_thresholds.json`
- Cron ejemplo: `deploy/cron/ops-alerts.cron.example`
- Workflow: `.github/workflows/ops-alerts.yml`

## Instalacion en VPS

1. Crear rutas de runtime/log:
   - `/var/lib/nexus`
   - `/var/log/nexus`
2. Instalar cron usando `deploy/cron/ops-alerts.cron.example`.
3. Validar ejecucion manual:

```bash
cd /srv/app
python3 scripts/ops/check_ops_alerts.py --api-base http://127.0.0.1 --state-file /var/lib/nexus/ops-alert-state.json
```

## Semantica

- Ventana: 10m
- Persistencia minima: 5m
- Muestra minima: 200 requests

Exit codes:

- `0`: OK
- `1`: WARN
- `2`: CRIT/P1
- `3`: error tecnico

## Webhook opcional

Definir `OPS_ALERT_WEBHOOK_URL` para recibir transiciones de estado.
