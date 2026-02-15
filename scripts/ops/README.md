# Ops Alerts (sin Grafana/Prometheus)

Script principal:

- `scripts/ops/check_ops_alerts.py`

Umbrales:

- `scripts/ops/ops_alert_thresholds.json`

Ejemplo local:

```bash
python3 scripts/ops/check_ops_alerts.py --api-base http://127.0.0.1 --state-file /tmp/ops-alert-state.json
```

Exit codes:

- `0`: sin alertas activas
- `1`: WARN activo
- `2`: CRIT/P1 activo
- `3`: error tecnico

Webhook opcional:

- `OPS_ALERT_WEBHOOK_URL`
