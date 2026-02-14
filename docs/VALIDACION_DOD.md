# Validacion DoD

Ejecutar estos checks despues del deploy automatico.

## 1) Health publico

```bash
curl -sS https://API_DOMAIN/health
```

Esperado: HTTP 200 y JSON con `ok: true`.

## 2) Deploy automatico

1. Hacer un commit trivial a `main`.
2. Verificar workflow `Deploy VPS` en GitHub Actions.
3. En VPS:

```bash
cd /srv/app
docker compose ps
```

Esperado: contenedores `Up` sin restart loop.

## 3) Backup del dia

```bash
ls -lah /srv/backups
```

Esperado: archivo `.sql.gz` del dia.

## 4) Restore de prueba

```bash
cd /srv/app
./scripts/restore-smoke-test.sh
```

Esperado: mensaje `restore smoke test OK`.

## 5) SSL y renovacion

Si usas Certbot:

```bash
sudo certbot certificates
sudo systemctl list-timers | grep certbot
```

Esperado: certificado activo para `API_DOMAIN` y timer de renovacion.

Si usas Cloudflare Origin Certificate:

- Cloudflare en `Full (strict)`.
- `docker compose logs nginx` sin errores de certificado.

## 6) Firewall minimo

```bash
sudo ufw status verbose
```

Esperado: solo `22/tcp`, `80/tcp`, `443/tcp` habilitados.
