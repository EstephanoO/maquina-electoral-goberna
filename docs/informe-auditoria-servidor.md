# Informe de Auditoría Integral — Plataforma Goberna

**Fecha:** 2026-03-22
**Servidor:** 161.132.39.165 (VPS, Ubuntu 20.04 LTS)
**Dominio API:** api.goberna.us
**Dashboard:** dashboard.grupogoberna.com (Vercel)
**Repositorio:** EstephanoO/maquina-electoral-goberna (privado)
**Auditor:** Claude Code (automated)

---

## Tabla de contenidos

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Arquitectura del sistema](#2-arquitectura-del-sistema)
3. [Auditoría Nginx](#3-auditoría-nginx)
4. [Auditoría de seguridad del servidor](#4-auditoría-de-seguridad-del-servidor)
5. [Auditoría de persistencia y backups](#5-auditoría-de-persistencia-y-backups)
6. [Auditoría Docker e infraestructura](#6-auditoría-docker-e-infraestructura)
7. [Auditoría GitHub y CI/CD](#7-auditoría-github-y-cicd)
8. [Auditoría de arquitectura de software](#8-auditoría-de-arquitectura-de-software)
9. [Plan estructural por fases](#9-plan-estructural-por-fases)
10. [Matriz de riesgos consolidada](#10-matriz-de-riesgos-consolidada)

---

## 1. Resumen ejecutivo

La plataforma Goberna es un SaaS multi-tenant para operaciones territoriales de campañas políticas en Perú. Corre sobre un solo VPS con 32 GB de RAM, un stack Docker de 6 contenedores, y un frontend Next.js en Vercel.

**Estado general: funcional pero frágil.**

El sistema opera correctamente en condiciones normales, pero tiene vulnerabilidades críticas que lo exponen a pérdida total de datos, acceso no autorizado, y caídas sin recuperación. Los hallazgos más graves son:

| Categoría | Críticos | Altos | Medios | Bajos |
|-----------|----------|-------|--------|-------|
| Nginx | 0 | 2 | 3 | 6 |
| Seguridad del servidor | 4 | 4 | 4 | 9 |
| Datos y backups | 1 | 3 | 3 | 0 |
| Docker e infra | 0 | 0 | 3 | 5 |
| GitHub y CI/CD | 1 | 2 | 3 | 3 |
| Arquitectura de software | 0 | 2 | 3 | 2 |
| **Total** | **6** | **13** | **19** | **25** |

Las 3 prioridades absolutas:
1. **Sin backup offsite** — si el VPS muere, se pierde todo (datos + backups).
2. **Kernel de 2020 + dpkg bloqueado** — no se aplican parches de seguridad desde hace 22 días.
3. **`deploy` con sudo sin contraseña** — una SSH key comprometida otorga root total.

---

## 2. Arquitectura del sistema

### 2.1 Diagrama de infraestructura

```
Internet
  │
  ├─── Cloudflare (proxy ON, DNS, WAF básico)
  │      │
  │      ├─── Vercel
  │      │      └── dashboard.grupogoberna.com
  │      │            Next.js 16.1 / React 19.2
  │      │            Proxy rewrites /api/* → api.goberna.us
  │      │
  │      └─── VPS 161.132.39.165
  │             └── Docker network: app_network (bridge)
  │                   │
  │                   ├── nginx:1.27-alpine (:80/:443)
  │                   │     TLS termination (Cloudflare Origin cert)
  │                   │     Tile disk cache (256 MB)
  │                   │     Reverse proxy → backend
  │                   │     Static file serving (/uploads/)
  │                   │
  │                   ├── backend (Fastify 5 + Bun) (:3001 internal)
  │                   │     31 módulos registrados
  │                   │     Redis Streams write-behind
  │                   │     JWT auth (JOSE + bcryptjs)
  │                   │     Gemini AI classification
  │                   │     ElevenLabs TTS / Twilio telephony
  │                   │
  │                   ├── postgis/postgis:15-3.4 (:5432 internal)
  │                   │     Database: appdb (699 MB lógico)
  │                   │     45 migraciones SQL
  │                   │     PostGIS para datos geoespaciales
  │                   │
  │                   ├── redis:7.4-alpine (:6379 internal)
  │                   │     AOF + RDB persistence
  │                   │     512 MB maxmemory, noeviction
  │                   │     Streams: tracking:events, forms:events
  │                   │
  │                   ├── tegola (:8080 internal)
  │                   │     Vector tile server (MVT)
  │                   │     Lee directamente de PostGIS
  │                   │
  │                   └── nexus-sms (:3900 PÚBLICO)
  │                         API SMS (fuera del compose principal)
  │
  └─── Mobile App (Expo SDK 54, en desarrollo)
         expo-location, expo-sqlite (offline queue)
         Se conecta a api.goberna.us
```

### 2.2 Flujo de datos

```
Agente de campo (mobile)
  → POST /api/agents/location (GPS cada 10s)
  → Redis Stream tracking:events
  → Worker batch flush → PostgreSQL agent_locations_live

WhatsApp Extension (Chrome MV3)
  → Intercepta mensajes enviados/recibidos
  → POST /api/cms/events (clasificación, scoring)
  → Gemini 2.5 Flash Lite (spam check + classify)
  → PostgreSQL cms_extension_events

Dashboard (Next.js)
  → SSE /api/agents/stream (tracking en tiempo real)
  → SSE /api/cms/stream (eventos CMS)
  → REST /api/* (CRUD operations)
  → MapLibre GL + Tegola (mapas vectoriales)

Blast/Call Center
  → 6 teléfonos WhatsApp simultáneos
  → Orchestrador en backend
  → Extension ejecuta envíos en WhatsApp Web
```

### 2.3 Stack tecnológico completo

| Capa | Tecnología | Versión |
|------|-----------|---------|
| **Backend runtime** | Bun | latest |
| **Backend framework** | Fastify + TypeScript | 5.6 / TS 5.9 |
| **ORM** | Drizzle ORM | 0.44 |
| **Validación** | Zod | 4.x |
| **Auth** | JOSE (JWT) + bcryptjs | 6.x |
| **Base de datos** | PostgreSQL 15 + PostGIS 3.4 | Docker |
| **Cache/Colas** | Redis 7.4 (Streams) | Docker |
| **Tiles vectoriales** | Tegola | latest (flotante) |
| **Web frontend** | Next.js / React / Tailwind | 16.1 / 19.2 / 4.x |
| **Mapas (web)** | MapLibre GL 5 | 5.x |
| **Data fetching** | TanStack Query 5 | 5.x |
| **UI** | Radix UI, Lucide, Recharts | varios |
| **Mobile** | Expo SDK 54 / React Native | 0.81 |
| **Extension** | Chrome MV3, esbuild IIFE | v9.0.0 |
| **TTS** | ElevenLabs API | — |
| **Telefonía** | Twilio | 5.x |
| **IA** | Google Gemini 2.5 Flash Lite | — |
| **Alertas** | Telegram Bot API | — |
| **Reverse proxy** | Nginx | 1.27-alpine |
| **DNS/TLS** | Cloudflare + Let's Encrypt | — |

### 2.4 Modelo RBAC

Seis roles con jerarquía numérica:

| Rol | Nivel | Alcance |
|-----|-------|---------|
| `admin` | 50 | Acceso total, todas las campañas |
| `consultor` | 40 | Lectura cross-campaign |
| `candidato` | 30 | Su campaña completa |
| `brigadista_zonal` | 20 | Su zona dentro de la campaña |
| `agente_campo` | 10 | Solo tracking y formularios |
| `agente_digital` | 10 | Solo CMS y extension |

---

## 3. Auditoría Nginx

**Versión:** nginx/1.27.5 (Alpine, OpenSSL 3.3.3)
**Config template:** `nginx/default.cloudflare-origin.conf.template`

### 3.1 SSL/TLS

| Aspecto | Configuración | Evaluación |
|---------|--------------|------------|
| Protocolos | `TLSv1.2 TLSv1.3` | Correcto — TLS 1.0/1.1 excluidos |
| Ciphers | No explícitos | Acepta defaults de OpenSSL 3.3.3 — funcional pero no hardened |
| Session timeout | `1d` | Correcto |
| Session cache | `shared:SSL:10m` | Correcto |
| Session tickets | `off` | Correcto — protege forward secrecy |
| HSTS | `max-age=31536000; includeSubDomains` | Falta `preload` |
| Certificado | Cloudflare Origin CA | Correcto para setup con CF proxy |
| `ssl_dhparam` | No configurado | Menos crítico con TLS 1.3 |

### 3.2 Headers de seguridad

| Header | Estado | Notas |
|--------|--------|-------|
| `X-Frame-Options: SAMEORIGIN` | Presente | Correcto |
| `X-Content-Type-Options: nosniff` | Presente | Correcto |
| `Referrer-Policy: strict-origin-when-cross-origin` | Presente | Correcto |
| `Strict-Transport-Security` | Presente | Falta `preload` |
| `Content-Security-Policy` | **AUSENTE** | Gap importante — XSS más explotable sin CSP |
| `Permissions-Policy` | **AUSENTE** | No restringe APIs del navegador |
| `X-XSS-Protection` | **AUSENTE** | Legacy pero útil para navegadores antiguos |
| `server_tokens off` | **NO CONFIGURADO** | Versión nginx visible en errores y headers |

**Bug de herencia de headers:** En nginx, `add_header` en un bloque hijo **reemplaza** todos los headers del padre para esa location. Los bloques `/api/tiles/` y `/uploads/` definen sus propios `add_header`, lo que causa que pierdan `X-Frame-Options`, `Referrer-Policy` y HSTS.

### 3.3 Rate limiting

**No existe ningún rate limiting.** No hay `limit_req_zone`, `limit_conn_zone`, ni `limit_req` en ninguna parte de la configuración.

Superficies expuestas sin throttle:
- `POST /api/auth/login` — brute-forceable
- `POST /api/forms` — spammable
- `GET /api/forms/check-phone` — oráculo de enumeración de teléfonos
- `/ws/` y `/api/agents/stream` — conexiones ilimitadas pueden agotar el thread pool

### 3.4 Proxy y buffers

| Setting | Valor | Evaluación |
|---------|-------|------------|
| `proxy_buffer_size` | `16k` | Recién agregado (fix del JWT grande) |
| `proxy_buffers` | `4 16k` (64k total) | Adecuado |
| `proxy_busy_buffers_size` | `32k` | Correcto |
| `proxy_read_timeout` (REST) | `65s` | Correcto |
| `proxy_read_timeout` (SSE/WS) | `300s` | Correcto para long-lived |
| `proxy_connect_timeout` | `10s` | Correcto |
| `client_max_body_size` | `10m` | Razonable |
| Upstream keepalive | **No configurado** | Nueva conexión TCP por cada request |

**Problema identificado y resuelto durante esta auditoría:** `upstream sent too big header while reading response header from upstream` — el JWT del usuario admin (15 campañas con permisos detallados) excedía el buffer default de 4k-8k de nginx. Se agregaron los proxy buffers al template y al servidor. El fix persiste en reinicios.

### 3.5 Cache de tiles vectoriales

| Setting | Valor | Evaluación |
|---------|-------|------------|
| Cache zone | `tiles_cache:10m` | Correcto |
| Max size | `256m` | Razonable |
| Cache key | `$uri` (sin query params) | Correcto para tiles |
| `proxy_cache_valid 200` | `2h` | Funcional (ver nota abajo) |
| `proxy_cache_use_stale` | `error timeout updating 500 502 503 504` | Excelente — sirve stale en falla |
| `proxy_cache_lock` | `on` (5s timeout) | Correcto — previene thundering herd |
| Tamaño actual | ~22 MB | Dentro del límite |

**Gap:** Los comentarios describen TTL por zoom (`z0-7=24h`, `z8-12=2h`, `z13+=30m`) pero la implementación usa un solo `proxy_cache_valid 200 2h` para todos. La lógica por zoom nunca fue implementada.

**Gap:** No hay mecanismo `proxy_cache_bypass` para invalidar cache sin reiniciar nginx.

### 3.6 SSE y WebSocket

Configuración correcta en ambos casos:
- `proxy_http_version 1.1` — requerido
- `Connection ''` (SSE) / `Connection "upgrade"` (WS) — correcto
- `proxy_buffering off` — esencial para streaming
- `chunked_transfer_encoding off` (SSE) — evita chunking de frames
- `proxy_cache off` — correcto
- Timeouts de 300s — apropiado para conexiones long-lived

Sin problemas encontrados en SSE/WebSocket.

### 3.7 Log de errores recientes

- JWT tokens visibles en query strings de WebSocket en el access log (`/ws/support/chat?token=eyJ...`) — se logean en texto plano al disco. El archivo de access log debe tratarse como sensible.
- Gateway Docker interno (`172.24.0.1`) hace requests HTTP a `/api/metrics` que reciben redirect 301 a HTTPS — scraper de métricas mal configurado.

### 3.8 Resumen de hallazgos Nginx

| # | Severidad | Hallazgo |
|---|-----------|----------|
| N1 | **ALTA** | Sin rate limiting — login, forms y phone check sin throttle |
| N2 | **ALTA** | Bug de herencia `add_header` — `/api/tiles/` pierde HSTS, X-Frame, Referrer-Policy |
| N3 | **MEDIA** | Sin `Content-Security-Policy` header |
| N4 | **MEDIA** | `server_tokens` no deshabilitado — versión nginx expuesta |
| N5 | **MEDIA** | Sin upstream keepalive — nueva conexión TCP por request |
| N6 | **BAJA** | SSL ciphers no explícitamente configurados |
| N7 | **BAJA** | HSTS sin directiva `preload` |
| N8 | **BAJA** | TTL por zoom descrito en comentarios pero no implementado |
| N9 | **BAJA** | Sin mecanismo de invalidación de cache de tiles |
| N10 | **BAJA** | `tcp_nopush` deshabilitado con `sendfile on` |
| N11 | **BAJA** | `/uploads/` usa `immutable` sin content-hash en filenames |

---

## 4. Auditoría de seguridad del servidor

**OS:** Ubuntu 20.04 LTS (EOL desde mayo 2025)
**Kernel:** 5.4.0-29-generic (abril 2020)
**RAM:** 30.63 GB | **Disco:** 630 GB (11 GB usados, 2%)

### 4.1 Hallazgos CRÍTICOS

#### CRIT-1: `deploy` tiene sudo sin contraseña (`NOPASSWD:ALL`)

```
# /etc/sudoers.d/99-deploy-bootstrap
deploy ALL=(ALL) NOPASSWD:ALL
```

El usuario `deploy` — que tiene acceso SSH — puede ejecutar cualquier comando como root sin contraseña. Una SSH key comprometida otorga **control total e inmediato** del servidor.

#### CRIT-2: Archivos `.env` con permisos permisivos

| Archivo | Permisos | Riesgo |
|---------|----------|--------|
| `/srv/app/.env` | `600` (solo owner) | Correcto |
| `/srv/app/apps/backend/.env` | `664` (world-readable) | **Expuesto** |
| `/home/deploy/vercel-watcher/.env` | `664` (world-readable) | **Expuesto** |

Cualquier usuario local puede leer API keys, credenciales de DB, tokens de Telegram, etc.

#### CRIT-3: Kernel severamente desactualizado

Kernel `5.4.0-29` de **abril 2020** — casi 6 años sin actualizar. El kernel HWE actual para 20.04 es 5.15.x. Este kernel tiene cientos de CVEs de escalación de privilegios conocidos:
- **Dirty Pipe** (CVE-2022-0847)
- Múltiples bugs de eBPF
- Vulnerabilidades de `io_uring`

Combinado con CRIT-1, la escalación de privilegios sería trivial.

#### CRIT-4: `apt-get` bloqueado desde hace 22 días

PID `1068317` (`apt-get install -y iptables-persistent`) ha estado corriendo desde **febrero 27** consumiendo ~92 MB de RAM. Está esperando en el frontend `debconf` (postinst de perl). Esto bloquea `dpkg` — **ningún parche de seguridad puede aplicarse** mientras esté colgado, y `unattended-upgrades` falla silenciosamente.

### 4.2 Hallazgos ALTOS

#### HIGH-1: Puerto 3900 (SMS API) expuesto a internet

UFW e iptables permiten `0.0.0.0:3900` desde cualquier fuente. El contenedor `nexus_sms` no tiene restricción de IP. Si la API tiene autenticación débil o nula, es alcanzable por cualquiera.

#### HIGH-2: Ataque de fuerza bruta SSH activo

Los logs de autenticación muestran decenas de intentos con usuarios inválidos desde múltiples IPs (`176.120.22.x`, `80.94.92.x`, `185.156.73.x`) en el momento de la auditoría. fail2ban solo ha baneado 2 IPs (`176.120.22.17`, `92.118.39.76`). El umbral puede ser demasiado permisivo.

#### HIGH-3: SSH en puerto 22 sin restricción por IP

Puerto 22 abierto a todo internet. No hay allowlist de IPs para SSH. Aunque la autenticación por contraseña está deshabilitada (key-only), mover SSH a un puerto no estándar o restringir por IP reduciría drásticamente el ruido de brute force.

#### HIGH-4: Solo una SSH key autorizada

`~/.ssh/authorized_keys` contiene exactamente una key atribuida a `estephano002@gmail.com`. Sin política de rotación, sin key de recuperación. La pérdida o compromiso de esta key tiene impacto severo sin alternativa de acceso.

### 4.3 Hallazgos MEDIOS

| # | Hallazgo | Detalle |
|---|----------|---------|
| MED-1 | `deploy` en grupo `docker` | Equivale a root — `docker run -v /:/host` da acceso al filesystem completo |
| MED-2 | Login de root registrado en feb 2026 | `last` muestra login SSH de root desde `161.132.10.62` el 13 de febrero, pese a `PermitRootLogin no` en sshd_config |
| MED-3 | `PubkeyAuthentication` comentado | Depende del default (`yes`), debería ser explícito |
| MED-4 | Redis sin filtrado de IP propio | Depende exclusivamente del aislamiento de red Docker |

### 4.4 Hallazgos BAJOS/INFORMATIVOS

| # | Hallazgo |
|---|----------|
| L1 | `unattended-upgrades` instalado y corriendo — pero bloqueado por CRIT-4 |
| L2 | fail2ban activo, 2 IPs baneadas — umbral posiblemente muy permisivo |
| L3 | UFW activo con default DROP INPUT — solo puertos 22, 80, 443, 3900 abiertos |
| L4 | `PasswordAuthentication` deshabilitado — correcto |
| L5 | `PermitRootLogin no` — correcto |
| L6 | Espacio en disco saludable (2% usado) |
| L7 | Solo 2 usuarios con shell: `root` y `deploy` — superficie mínima |
| L8 | `/srv/app/.env.example` es world-readable (664) — riesgo menor si tiene placeholders reales |
| L9 | Dos IPs en historial de login: `38.19.145.176` (frecuente, admin) y `38.253.170.242` (una sesión feb 17) — verificar legitimidad de la segunda |

### 4.5 Configuración del firewall (UFW)

```
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
80/tcp                     ALLOW       Anywhere
443/tcp                    ALLOW       Anywhere
3900/tcp                   ALLOW       Anywhere         ← RIESGO
5432/tcp                   ALLOW       38.19.145.176    ← Solo IP admin, correcto
```

PostgreSQL está correctamente restringido a una IP. SSH, HTTP, HTTPS y SMS están abiertos a todo.

---

## 5. Auditoría de persistencia y backups

### 5.1 Volúmenes Docker

| Volumen | Tamaño | Propósito | Respaldado |
|---------|--------|-----------|------------|
| `nexus_pgdata` | 1.3 GB | Datos PostgreSQL | Si (pg_dump diario) |
| `nexus_redis-data` | 85 MB | AOF + RDB Redis | **No** |
| `nexus_uploads` | 3.7 MB | Archivos subidos | **No** |
| `nexus_tile-cache` | 23 MB | Cache nginx tiles | No necesario (regenerable) |

Todos usan el driver `local` — datos solo en esta máquina.

### 5.2 PostgreSQL

**Tamaño de base de datos:** 699 MB (lógico), 1.3 GB en disco con índices.

**Top 10 tablas por tamaño:**

| Tabla | Tamaño |
|-------|--------|
| `form_validations` | 278 MB |
| `form_submissions` | 114 MB |
| `peru_distritos` | 90 MB |
| `voter_profiles` | 37 MB |
| `cms_extension_events` | 33 MB |
| `conversations` | 28 MB |

**Configuración de WAL/replicación:**

| Parámetro | Valor | Evaluación |
|-----------|-------|------------|
| `wal_level` | `replica` | Capaz de streaming replication |
| `archive_mode` | `off` | **Sin WAL archiving** |
| `max_wal_senders` | `10` | Configurado pero sin réplicas conectadas |
| Replication slots | Ninguno | Sin réplicas activas |

**Impacto:** Sin WAL archiving ni PITR, la ventana de pérdida de datos es de hasta **24 horas** (entre backups nocturnos).

### 5.3 Estrategia de backup actual

**Lo que funciona bien:**

- `backup.sh` ejecuta `pg_dump | gzip` diariamente a las **03:00 AM** (UTC-5)
- Backups almacenados en `/srv/backups/appdb_<timestamp>.sql.gz`
- 8 backups diarios consecutivos confirmados en disco (mar 14-21), cada uno ~110-122 MB comprimido
- Retención configurada a **7 días** (`BACKUP_RETENTION_DAYS=7`)
- `backup_verify.sh` ejecuta a las **03:20 AM**, restaura el backup más reciente en una DB temporal, y valida conteos de filas para `forms` y `agent_locations_live`
- Todas las verificaciones recientes pasaron exitosamente (confirmado hasta mar 21)

**Lo que falta (CRÍTICO):**

| Gap | Severidad | Detalle |
|-----|-----------|---------|
| Sin backup offsite | **CRÍTICO** | No hay `rclone`, `aws s3 cp`, `rsync` ni ningún upload remoto. Los 8 backups (909 MB total) viven en el mismo disco físico que la base de datos. Si el VPS es destruido, el hypervisor falla, o el disco se corrompe, **se pierden tanto los datos como todos los backups simultáneamente**. |
| Sin WAL archiving | **ALTO** | No hay PITR. Ventana de pérdida: hasta 24 horas. |
| Redis no respaldado | **MEDIO** | Streams, dedup keys, estado de tracking en vivo — no incluido en `backup.sh`. |
| Uploads no respaldados | **MEDIO** | 3.7 MB hoy pero crece. No hay copia fuera del volumen Docker local. |
| Retención de solo 7 días | **MEDIO** | Una corrupción silenciosa no detectada a tiempo es irrecuperable. |

### 5.4 Redis

| Configuración | Valor | Evaluación |
|---------------|-------|------------|
| `appendonly` | `yes` | Correcto — journaling de cada escritura |
| RDB snapshots | `900 1`, `300 10`, `60 10000` | Agresivo, bueno |
| `maxmemory-policy` | `noeviction` | Correcto — rechaza escrituras en vez de eliminar datos silenciosamente |
| Tamaño en disco | 85 MB | Saludable |

Redis tiene buena persistencia local pero **no tiene backup externo**.

### 5.5 Espacio en disco

```
Filesystem      Size  Used Avail Use%
/dev/sda1       630G   11G  588G   2%
```

Sin riesgo de espacio. A 7 x ~120 MB/día (~840 MB), la retención actual puede sostenerse por años.

---

## 6. Auditoría Docker e infraestructura

### 6.1 Contenedores en ejecución

| Contenedor | Imagen | Estado | Restart Policy | Healthcheck |
|------------|--------|--------|---------------|-------------|
| `nexus_backend` | `nexus-backend` (build local) | Up (healthy) | `always` | HTTP GET `/api/health` |
| `nexus_nginx` | `nginx:1.27-alpine` | Up | `always` | **Ninguno** |
| `nexus_tegola` | `gospatial/tegola:latest` | Up 28h | `always` | **Ninguno** |
| `nexus_postgres` | `postgis/postgis:15-3.4` | Up 28h (healthy) | `always` | `pg_isready` |
| `nexus_redis` | `redis:7.4-alpine` | Up 28h (healthy) | `always` | `redis-cli ping` |
| `nexus_sms` | `nexus-nexus-sms:latest` | Up 5 días | **`no`** | **Ninguno** |

**Problemas:**
- `nexus_sms` tiene restart policy `no` — si crashea, no se recupera.
- 3 contenedores sin healthcheck (nginx, tegola, sms) — Docker no puede detectar fallas silenciosas.
- 2 contenedores huérfanos detenidos: `nexus_backend_test` y `nexus_backend_test2` (exit code 1, debris de tests).

### 6.2 Uso de recursos

| Contenedor | CPU% | Memoria | Net I/O |
|------------|------|---------|---------|
| `nexus_backend` | 16.24% | 130.9 MiB | 4.4/3.4 MB |
| `nexus_postgres` | 2.47% | **1.03 GiB** | 275/66.4 MB |
| `nexus_redis` | 0.97% | 55.2 MiB | 202/215 MB |
| `nexus_nginx` | 0.27% | 11.9 MiB | 139/240 kB |
| `nexus_sms` | 0.01% | 19.4 MiB | 811/132 kB |
| `nexus_tegola` | 0.00% | 8.9 MiB | 45.4/47.9 MB |
| **Total** | ~20% | **~1.25 GiB / 30.63 GiB** | — |

Uso saludable. No hay riesgo de OOM actualmente. **Sin embargo, no hay `mem_limit` ni `cpus` configurados** en ningún contenedor — un proceso descontrolado puede consumir toda la RAM del host.

### 6.3 Log rotation

Todos los contenedores usan el driver `json-file` con **sin límite de tamaño configurado** (`max-size` y `max-file` no están definidos). Los logs crecen indefinidamente. En un servidor de producción long-running, esto es un riesgo de agotamiento de disco.

### 6.4 Almacenamiento Docker

| Tipo | Total | Activo | Tamaño | Recuperable |
|------|-------|--------|--------|-------------|
| Imágenes | 101 | 7 | 1.816 GB | **1.075 GB (59%)** |
| Contenedores | 8 | 6 | 15.64 kB | 0 B |
| Volúmenes | 4 | 4 | 1.415 GB | 0 B |
| Build Cache | 148 entries | 0 | **625 MB** | 625 MB (100%) |

**1.7 GB recuperables** con `docker system prune`.

### 6.5 Arranque del sistema

No hay un systemd unit personalizado para Nexus. Docker daemon se maneja via systemd (`docker.service` enabled). El stack sobrevive reboots porque Docker inicia automáticamente y los contenedores tienen `restart: always` — excepto `nexus_sms` que quedaría abajo.

### 6.6 Resumen de hallazgos Docker

| # | Severidad | Hallazgo |
|---|-----------|----------|
| D1 | **MEDIA** | `nexus_sms` con restart policy `no` — no se auto-recupera |
| D2 | **MEDIA** | Sin log rotation — logs crecen indefinidamente |
| D3 | **MEDIA** | Sin resource limits (CPU/RAM) en ningún contenedor |
| D4 | **BAJA** | `tegola` usa tag `latest` — rebuild puede traer versión inesperada |
| D5 | **BAJA** | 1.7 GB de imágenes/cache Docker recuperables |
| D6 | **BAJA** | 2 contenedores huérfanos de tests |
| D7 | **BAJA** | Sin healthcheck en nginx, tegola, sms |
| D8 | **BAJA** | Ops-alerts cron es solo `.example` — monitoreo local posiblemente no activo |

---

## 7. Auditoría GitHub y CI/CD

**Repo:** `EstephanoO/maquina-electoral-goberna` (privado)
**Branch default:** `main`
**Descripción:** (ninguna)

### 7.1 Workflows de GitHub Actions

#### `deploy.yml` — CI/CD VPS (pipeline principal)

Se ejecuta en cada push a `main` y en todos los PRs. Usa concurrency lock para evitar deploys simultáneos.

| Job | Qué hace |
|-----|----------|
| `quality` | Bun install → `tsc --noEmit` → smoke contract test → architecture contracts check |
| `security` | Secret scanning (gitleaks) → vulnerability scan (Trivy HIGH/CRITICAL) |
| `deploy` | Solo en push a `main`. SSH al VPS → `git pull` → `docker compose up --build` → migraciones → readiness poll (80s) → smoke checks → rollback automático si falla |

**El deploy script está bien diseñado:**
- Detecta y resetea drift en el VPS antes de hacer pull
- Ejecuta smoke checks reales (health, config, agents, GPS tracking con token real)
- Rollback automático al commit anterior si cualquier check falla
- Captura logs del contenedor en caso de falla

**Gap crítico del rollback:** No revierte migraciones. Si una migración se aplicó exitosamente antes de que falle un smoke check, el schema queda adelantado al código rolled-back. No existe mecanismo de down-migration.

#### `frontend-ci-cd.yml` — Frontend CI/CD

Filtrado por path (`apps/web/**`). Vercel maneja el deploy automáticamente; este workflow solo verifica la URL de producción después.

**Gap:** El secret `FRONTEND_PROD_URL` no está configurado, causando que el health check **siempre se salte silenciosamente** (`exit 0` cuando la variable está vacía).

#### `ops-alerts.yml` — Monitoreo operativo

Programado cada 15 minutos. SSH al VPS para ejecutar `scripts/ops/check_ops_alerts.py`.

**HALLAZGO CRÍTICO:** Todas las ejecuciones recientes (últimas 24+ horas) han fallado con:
> "The job was not started because recent account payments have failed or your spending limit needs to be increased."

**El monitoreo operativo ha estado completamente muerto desde al menos 2026-03-21 20:46 UTC.**

### 7.2 Branch protection

**No hay reglas de branch protection configuradas en `main`.**

Consecuencias:
- Push directo a `main` permitido sin review
- Sin status checks requeridos antes de merge
- Sin reviews requeridos (CODEOWNERS definido pero no enforced)

### 7.3 Configuración del repositorio

| Setting | Valor | Evaluación |
|---------|-------|------------|
| Visibilidad | Privado | Correcto |
| `allow_merge_commit` | true | |
| `allow_squash_merge` | true | 3 estrategias habilitadas = historial inconsistente |
| `allow_rebase_merge` | true | |
| `delete_branch_on_merge` | **false** | Branches se acumulan indefinidamente |
| `has_wiki` | false | OK |

### 7.4 Environments

| Nombre | Reglas de protección |
|--------|---------------------|
| `Preview` | Ninguna |
| `Production` | Ninguna |
| `Production – maquina-electoral-goberna-web` | Ninguna |
| `Production – nexus6.0` | Ninguna |

Sin required reviewers, sin wait timer, sin branch restrictions en ningún environment.

### 7.5 Secrets configurados

| Secret | Última actualización |
|--------|---------------------|
| `SSH_PRIVATE_KEY` | 2026-02-14 |
| `VPS_HOST` | 2026-02-14 |
| `VPS_PORT` | 2026-02-14 |

**Secrets faltantes referenciados en workflows:**
- `OPS_ALERT_WEBHOOK_URL` — usado por `ops-alerts.yml`
- `FRONTEND_PROD_URL` — usado por `frontend-ci-cd.yml`

### 7.6 PRs e Issues

- **PR #9** (`hotfix/extension`): abierto hace 17 días — stale
- **PR #5** (`feature/descargar-page`): abierto hace 21 días — stale
- Sin issues abiertos
- Sin releases publicados jamás

### 7.7 Herramientas de calidad

| Herramienta | Propósito | Estado |
|------------|-----------|--------|
| gitleaks + `.gitleaks.toml` | Secret scanning con allowlist | Activo, bien configurado |
| Trivy | Vulnerability scan (HIGH/CRITICAL) | Activo |
| `check_architecture_contracts.py` | Enforce boundaries hexagonales | Activo |
| `smoke_backend_contract.sh` | Contract testing del backend | Activo (con bug conocido en `form_validations`) |

### 7.8 Resumen de hallazgos GitHub

| # | Severidad | Hallazgo |
|---|-----------|----------|
| G1 | **CRÍTICO** | `ops-alerts.yml` falla 100% por billing — monitoreo completamente muerto |
| G2 | **ALTO** | Sin branch protection en `main` — push directo sin review |
| G3 | **ALTO** | Rollback no revierte migraciones — schema inconsistente con código |
| G4 | **MEDIO** | `FRONTEND_PROD_URL` no configurado — health check se salta silenciosamente |
| G5 | **MEDIO** | `OPS_ALERT_WEBHOOK_URL` posiblemente no configurado |
| G6 | **MEDIO** | 3 merge strategies + no delete branch on merge — historial inconsistente |
| G7 | **BAJA** | Environments sin reglas de protección |
| G8 | **BAJA** | Deploy job no referencia GitHub Environment — deploys VPS no trackeados en UI |
| G9 | **BAJA** | Sin releases publicados — sin historial versionado |

---

## 8. Auditoría de arquitectura de software

### 8.1 Estructura del monorepo

```
maquina-electoral-goberna/
├── apps/
│   ├── backend/        Fastify API (TypeScript + Bun)
│   ├── web/            Next.js 16.1 dashboard
│   ├── mobile/         Expo SDK 54 (en desarrollo)
│   └── nexus-sms/      API SMS
├── extensions/
│   └── wspp-store-tester/  Chrome MV3 extension (v9.0.0)
├── scripts/
│   ├── ci/             CI checks y contract tests
│   ├── ops/            Monitoreo operativo
│   └── perf/           Load/stress tests
├── nginx/              Templates de configuración
├── tegola/             Config del tile server
├── docs/               Documentación de arquitectura
├── docker-compose.yml
└── docker-compose.dev.yml
```

**No hay workspace tooling.** No existe `package.json` raíz ni configuración de Bun workspaces. Cada app tiene su propio `node_modules`, `bun.lock` y tsconfig independiente.

### 8.2 Backend — Arquitectura modular

**Entry point:** `server.ts` → `app.ts` (composition root, registra 31 módulos)

**Patrón canónico por módulo** (`src/modules/<name>/`):
- `routes.ts` — handler HTTP delgado (parse → call repo → respond)
- `repository.ts` — SQL raw via `pg.Pool`
- `schemas.ts` — validación Zod
- `types.ts` — tipos TypeScript (opcional)
- `service.ts` — lógica de negocio compleja (solo si necesario)

**Capa de infraestructura** (`src/infra/`):
- Auth: JWT dual-mode (cookie para web, Bearer para mobile/extension)
- RBAC: middleware con jerarquía de 6 niveles
- Métricas: registro in-process (latencias, contadores, gauges)
- Redis: cliente compartido
- Eventos: pipelines CMS y Support
- Integraciones: Telegram, ElevenLabs, Twilio, Gemini

**31 módulos registrados:**

| Categoría | Módulos |
|-----------|---------|
| Infra | `health`, `auth`, `map`, `uploads`, `analytics` |
| Campañas | `campaigns`, `org-hierarchy`, `invitations`, `access-requests`, `access-codes`, `objectives` |
| Operaciones de campo | `forms`, `form-submissions`, `form-definitions`, `agents`, `meets`, `zones`, `validacion`, `voluntarios`, `regional-leaders` |
| CRM/Comunicación | `cms`, `twilio`, `conversations`, `leads`, `support` |
| Inteligencia/Extension | `ai`, `voter-profiles`, `audio-catalog`, `blast`, `blast-orchestrator`, `wa-validator`, `qr-leads` |

**Patrón de respuesta estandarizado:**
```json
{ "ok": true, "request_id": "req-xx", ...data }
{ "ok": false, "request_id": "req-xx", "code": "ERROR_CODE", "message": "..." }
```

### 8.3 Write-behind con Redis Streams

Escrituras de alta frecuencia (GPS tracking, formularios) usan Redis Streams como buffer:

```
Mobile/Extension
  → POST /api/agents/location o /api/forms
  → Validar + encolar en Redis Stream
  → 202 Accepted inmediato
       ↓
  Background consumer workers
  → Batch flush a PostgreSQL
  → DLQ en max retries (tracking:dlq, forms:dlq)
```

Configuración:
- `FORMS_WB_BATCH_SIZE=200`, `FORMS_WB_FLUSH_MS=300`
- `TRACKING_WB_BATCH_SIZE=300`, `TRACKING_WB_FLUSH_MS=250`

### 8.4 Web Dashboard

Next.js App Router con layout groups:
- `(public)/` — login, register, invite, onboarding, descarga de extension
- `(dashboard)/` — rutas protegidas por auth

Auth via httpOnly cookie (`goberna_access_token`). Middleware fail-closed — rutas desconocidas se tratan como protegidas.

SSE con exponential backoff (base 1s, max 30s) y retry de refresh en 401.

### 8.5 Contratos compartidos

`/apps/backend/src/contracts/api-types.ts` es la fuente única de verdad para tipos request/response. Es importado por web y mobile. **Es mantenido manualmente** — no se auto-genera desde Zod schemas. Última actualización: 2026-02-18.

Cubre 60+ códigos de error tipados y tipos para: auth, campaigns, forms, agents, SSE events, CMS, maps, metrics, etc.

### 8.6 Hallazgos de arquitectura

| # | Severidad | Hallazgo |
|---|-----------|----------|
| A1 | **ALTA** | JWT expira en **365 días** — tokens efectivamente permanentes |
| A2 | **ALTA** | Binarios `.ipa`/`.aab` commiteados al repo — infla tamaño innecesariamente |
| A3 | **MEDIA** | `api-types.ts` manual — drift posible entre Zod schemas y contratos |
| A4 | **MEDIA** | Sin workspace tooling — cada app independiente sin coordinación |
| A5 | **MEDIA** | Single-node deployment sin réplica ni scaling |
| A6 | **BAJA** | Rutas `/brigadistas` y `/leads` protegidas por fail-closed implícito, no explícito |
| A7 | **BAJA** | Endpoint `POST /api/validacion/events` usado por extension no confirmado en backend |

---

## 9. Plan estructural por fases

### Fase 0 — Emergencia (inmediato)

*Lo que está roto ahora mismo y afecta producción.*

| # | Acción | Justificación | Esfuerzo |
|---|--------|--------------|----------|
| 0.1 | Matar proceso `apt-get` colgado + `dpkg --configure -a` | dpkg bloqueado 22 días, no entran parches | 5 min |
| 0.2 | Actualizar kernel y paquetes (`apt upgrade`) | Kernel de 2020 con CVEs críticos conocidos | 30 min + reboot |
| 0.3 | `chmod 600` archivos `.env` expuestos | Secrets legibles por cualquier usuario local | 1 min |
| 0.4 | Resolver billing de GitHub Actions | Ops monitoring 100% muerto desde hace 24h+ | 10 min |
| 0.5 | Limpiar containers/images huérfanos | 1.7 GB recuperables | 2 min |

**Tiempo estimado: ~1 hora**

### Fase 1 — Seguridad base (semana 1)

*Cerrar las puertas que están abiertas.*

| # | Acción | Detalle | Esfuerzo |
|---|--------|---------|----------|
| 1.1 | Rate limiting en nginx | `limit_req_zone` para login (5r/min) y API general (30r/s) | 1h |
| 1.2 | Restringir sudo de `deploy` | Reemplazar `NOPASSWD:ALL` por comandos específicos | 30 min |
| 1.3 | Restringir SSH por IP en UFW | Solo IPs admin conocidas en puerto 22 | 15 min |
| 1.4 | Agregar segunda SSH key | Eliminar single point of failure | 10 min |
| 1.5 | Restringir puerto 3900 por IP | SMS API expuesta a todo internet | 10 min |
| 1.6 | Reducir JWT expiry | Access: 24h, Refresh: 30d (en vez de 365d ambos) | 30 min |
| 1.7 | Security headers en nginx | `server_tokens off`, `Content-Security-Policy`, fix herencia `add_header` | 1h |
| 1.8 | Restart policy `always` para `nexus_sms` | Auto-recovery en crashes | 5 min |

### Fase 2 — Datos seguros (semana 2)

*Que una catástrofe no signifique perder todo.*

| # | Acción | Detalle | Esfuerzo |
|---|--------|---------|----------|
| 2.1 | Backup offsite (S3/R2/B2) | Agregar `rclone copy` al final de `backup.sh` | 2h |
| 2.2 | Incluir uploads en backup | Tarball del volumen de uploads junto al pg_dump | 30 min |
| 2.3 | Incluir Redis dump en backup | `redis-cli BGSAVE` + copia del RDB | 30 min |
| 2.4 | Habilitar WAL archiving | `archive_mode = on` con WAL-G o pg_basebackup → S3 | 4h |
| 2.5 | Extender retención a 30 días offsite | Barato en object storage | 15 min |
| 2.6 | Log rotation Docker | `max-size: 50m, max-file: 3` en compose | 30 min |

### Fase 3 — CI/CD robusto (semana 3)

*Que el pipeline proteja en vez de dar falsa confianza.*

| # | Acción | Detalle | Esfuerzo |
|---|--------|---------|----------|
| 3.1 | Branch protection en `main` | Require PR + 1 review + status checks | 15 min |
| 3.2 | Solo squash merge + delete branch on merge | Historial limpio, sin acumulación de branches | 5 min |
| 3.3 | Configurar secrets faltantes | `FRONTEND_PROD_URL`, `OPS_ALERT_WEBHOOK_URL` | 10 min |
| 3.4 | Estrategia de down-migration | Pre-check de compatibilidad o migration rollback scripts | 4h |
| 3.5 | Sacar binarios del repo | Usar GitHub Releases para `.ipa/.aab` | 1h |
| 3.6 | Crear primer release con tag | Iniciar historial versionado | 15 min |

### Fase 4 — Infraestructura resiliente (semana 4-5)

*Eliminar single points of failure.*

| # | Acción | Detalle | Esfuerzo |
|---|--------|---------|----------|
| 4.1 | Healthchecks para nginx, tegola, sms | Agregar al docker-compose | 1h |
| 4.2 | Resource limits en docker-compose | `mem_limit` + `cpus` por container | 1h |
| 4.3 | Fijar tag de tegola | Reemplazar `latest` por versión específica | 15 min |
| 4.4 | Upstream keepalive en nginx | `upstream backend { keepalive 32; }` | 30 min |
| 4.5 | Implementar TTL por zoom en tile cache | Usar `map` directive de nginx por URI pattern | 2h |
| 4.6 | Cache invalidation endpoint | `proxy_cache_bypass` con header secreto | 1h |
| 4.7 | Evaluar read replica PostgreSQL | Failover + offload de queries pesadas | 8h |

### Fase 5 — DX y mantenibilidad (semana 6+)

*Calidad de vida para desarrollo a largo plazo.*

| # | Acción | Detalle | Esfuerzo |
|---|--------|---------|----------|
| 5.1 | Bun workspaces en root | Coordinar deps entre apps, single lockfile | 4h |
| 5.2 | Auto-generar `api-types.ts` | Pipeline de Zod schemas → tipos exportados | 8h |
| 5.3 | Proteger rutas faltantes explícitamente | `/brigadistas`, `/leads` en `PROTECTED_PREFIXES` | 15 min |
| 5.4 | Upgrade Ubuntu 20.04 → 22.04/24.04 LTS | EOL desde mayo 2025 | 4h |
| 5.5 | Separar SMS a su propio compose | Lifecycle independiente, actualmente fuera del compose principal | 2h |

---

## 10. Matriz de riesgos consolidada

### Riesgos CRÍTICOS (6)

| ID | Área | Riesgo | Impacto | Probabilidad | Fase |
|----|------|--------|---------|-------------|------|
| CRIT-1 | Servidor | `deploy` con `NOPASSWD:ALL` | Compromiso total del servidor | Media | 1 |
| CRIT-2 | Servidor | `.env` world-readable | Leak de todos los secrets | Baja | 0 |
| CRIT-3 | Servidor | Kernel 5.4.0-29 (2020) | Escalación de privilegios trivial | Media | 0 |
| CRIT-4 | Servidor | dpkg bloqueado 22 días | No se aplican parches de seguridad | Alta (ya activo) | 0 |
| CRIT-5 | Datos | Sin backup offsite | Pérdida total e irrecuperable | Baja | 2 |
| CRIT-6 | GitHub | Ops monitoring muerto (billing) | Sin alertas operativas | Alta (ya activo) | 0 |

### Riesgos ALTOS (13)

| ID | Área | Riesgo | Fase |
|----|------|--------|------|
| HIGH-1 | Servidor | Puerto 3900 SMS expuesto a internet | 1 |
| HIGH-2 | Servidor | Brute force SSH activo | 1 |
| HIGH-3 | Servidor | SSH en puerto 22 sin IP allowlist | 1 |
| HIGH-4 | Servidor | Solo 1 SSH key (sin recovery) | 1 |
| HIGH-5 | Datos | Sin WAL archiving — 24h de pérdida posible | 2 |
| HIGH-6 | Datos | Ubuntu 20.04 EOL — 247 security updates pendientes | 5 |
| HIGH-7 | Datos | Sin replicación — zero redundancy | 4 |
| HIGH-8 | Nginx | Sin rate limiting en login y API | 1 |
| HIGH-9 | Nginx | Bug herencia `add_header` en tiles | 1 |
| HIGH-10 | GitHub | Sin branch protection en `main` | 3 |
| HIGH-11 | GitHub | Rollback no revierte migraciones | 3 |
| HIGH-12 | Arq | JWT expiry 365 días | 1 |
| HIGH-13 | Arq | Binarios .ipa/.aab en repo | 3 |

### Riesgos MEDIOS (19)

| ID | Área | Riesgo | Fase |
|----|------|--------|------|
| MED-1 | Servidor | `deploy` en grupo `docker` (equiv root) | 1 |
| MED-2 | Servidor | Login root registrado feb 2026 | 1 |
| MED-3 | Servidor | `PubkeyAuthentication` no explícito | 1 |
| MED-4 | Servidor | Redis sin filtrado IP propio | 4 |
| MED-5 | Datos | Redis no respaldado | 2 |
| MED-6 | Datos | Uploads no respaldados | 2 |
| MED-7 | Datos | Retención 7 días insuficiente | 2 |
| MED-8 | Docker | `nexus_sms` restart policy `no` | 1 |
| MED-9 | Docker | Sin log rotation | 2 |
| MED-10 | Docker | Sin resource limits | 4 |
| MED-11 | Nginx | Sin `Content-Security-Policy` | 1 |
| MED-12 | Nginx | `server_tokens` no deshabilitado | 1 |
| MED-13 | Nginx | Sin upstream keepalive | 4 |
| MED-14 | GitHub | `FRONTEND_PROD_URL` no configurado | 3 |
| MED-15 | GitHub | `OPS_ALERT_WEBHOOK_URL` posiblemente no configurado | 3 |
| MED-16 | GitHub | 3 merge strategies + no delete branch | 3 |
| MED-17 | Arq | `api-types.ts` manual — drift posible | 5 |
| MED-18 | Arq | Sin workspace tooling | 5 |
| MED-19 | Arq | Single-node sin scaling | 4 |

---

## Apéndice A: Comandos de verificación

```bash
# Verificar fix de proxy buffers en nginx
ssh deploy@161.132.39.165 'docker exec nexus_nginx cat /etc/nginx/conf.d/default.conf | grep proxy_buffer_size'

# Verificar backup más reciente
ssh deploy@161.132.39.165 'ls -lh /srv/backups/ | tail -5'

# Verificar estado de contenedores
ssh deploy@161.132.39.165 'docker ps --format "{{.Names}}: {{.Status}}"'

# Verificar logs de error nginx recientes
ssh deploy@161.132.39.165 'docker logs nexus_nginx --tail 20 2>&1 | grep error'

# Probar login del admin
curl -s https://api.goberna.us/api/health | jq .

# Verificar GitHub Actions
gh run list --repo EstephanoO/maquina-electoral-goberna --limit 5
```

## Apéndice B: Fix aplicado durante esta auditoría

**Problema:** `upstream sent too big header while reading response header from upstream`
**Causa:** JWT del admin (15 campañas con permisos detallados) excedía el buffer default de nginx (4k-8k)
**Fix:** Se agregaron proxy buffers al server block:
```nginx
proxy_buffer_size 16k;
proxy_buffers 4 16k;
proxy_busy_buffers_size 32k;
```
**Archivos modificados:**
- `nginx/default.cloudflare-origin.conf.template` (repo local)
- `/srv/app/nginx/default.cloudflare-origin.conf.template` (servidor)
**Estado:** Aplicado y verificado. Contenedor nginx reiniciado. Login del admin funciona correctamente.

**Cambio de contraseña:** Se actualizó la contraseña del usuario `admin@goberna.pe` a la solicitada. Login verificado via API interna del contenedor backend.

---

*Informe generado el 2026-03-22. Los hallazgos reflejan el estado del sistema al momento de la auditoría.*
