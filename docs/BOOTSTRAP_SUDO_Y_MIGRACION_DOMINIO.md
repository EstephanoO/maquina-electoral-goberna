# Bootstrap sudo + migracion futura de dominio

## Estado actual (temporal)

- Frontend temporal: `https://maquina-electoral-goberna-web.vercel.app`
- VPS objetivo backend: `161.132.39.165`
- Usuario operativo: `deploy`
- Cloudflare/dominio propio: pendiente para fase siguiente

## 1) Como darme bootstrap con sudo (recomendado)

Objetivo: habilitar privilegios temporales para que pueda instalar Docker/Nginx/firewall y dejar infraestructura operativa.

### Opcion recomendada: NOPASSWD temporal para `deploy`

Entrar al VPS con root (o usuario con sudo real) y ejecutar:

```bash
echo 'deploy ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/99-deploy-bootstrap
sudo chmod 440 /etc/sudoers.d/99-deploy-bootstrap
sudo visudo -cf /etc/sudoers.d/99-deploy-bootstrap
```

Verificacion:

```bash
su - deploy
sudo -n true && echo "sudo listo"
```

Cuando terminemos el bootstrap, revocar:

```bash
sudo rm -f /etc/sudoers.d/99-deploy-bootstrap
```

## 2) Alternativa (menos comoda)

Si no queres NOPASSWD, puedo guiarte y vos ejecutas los comandos con password manualmente. Es mas lento y propenso a errores.

## 3) Contexto para cuando migres al dominio propio

Cuando tengas dominio propio, pasar de estado temporal (`*.vercel.app`) a arquitectura final:

`Usuario -> Cloudflare -> Vercel (frontend) + Cloudflare -> Nginx VPS -> backend`

### Plan de migracion recomendado

1. Definir dominio frontend final (ej: `dashboard.tudominio.com`) en Vercel.
2. Definir API en subdominio separado (ej: `api.tudominio.com`) apuntando al VPS con proxy Cloudflare ON.
3. En backend, configurar `FRONTEND_ORIGIN=https://dashboard.tudominio.com`.
4. En Vercel, configurar `NEXT_PUBLIC_MAP_API_BASE=https://api.tudominio.com`.
5. En Cloudflare, SSL/TLS en `Full (strict)`.
6. En VPS, usar `NGINX_TEMPLATE=default.cloudflare-origin.conf.template` con Origin Certificate.
7. Validar `https://api.tudominio.com/health` en 200.
8. Recién después, retirar endpoints temporales.

## 4) Checklist rapido post-migracion

- DNS `api` en Cloudflare con proxy ON
- SSL `Full (strict)` activo
- `docker compose ps` sin reinicios
- backup diario generando archivos
- CI/CD deploy a `main` funcionando
- frontend consumiendo API por dominio final (no IP, no localhost)
