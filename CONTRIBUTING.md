# Guia de Desarrollo - Goberna Platform

> **Equipo:** EstephanoO (lead/reviewer) + Maximoff19 (dev CMS)  
> **Repo:** `git@github.com:EstephanoO/maquina-electoral-goberna.git`  
> **Regla de oro:** Nada llega a produccion sin pasar por un PR aprobado.

---

## 1. GitHub Flow

Un solo branch de produccion (`main`), branches de vida corta para todo lo demas.

```
main  ─────●─────────────●────────────────●─────────── (siempre deployable)
            \           / \              /
             feature/A ●  hotfix/B ────●
```

### Branches

| Prefijo | Para que | Vida | Ejemplo |
|---------|----------|------|---------|
| `feature/` | Funcionalidad nueva, mejora, refactor | 1-3 dias | `feature/cms-chat-ui` |
| `hotfix/` | Bug en produccion que necesita fix YA | Horas | `hotfix/twilio-webhook-500` |

Solo esos dos. Simple.

### Reglas

1. **`main` es produccion.** Nadie pushea directo. Todo va por PR.
2. **Branches cortas.** Si un feature tarda mas de 3 dias, es muy grande. Partirla.
3. **Un PR = un tema.** No mezclar cosas.
4. **Hotfix tiene prioridad.** Review y merge antes que cualquier feature.
5. **Squash merge siempre.** Main queda limpio, 1 commit = 1 feature/fix.
6. **Borrar branch despues del merge.** No acumular branches muertas.

---

## 2. Flujo Completo: Feature

```
Maximoff19                       GitHub                        EstephanoO
    |                               |                               |
    | 1. git checkout main          |                               |
    |    git pull                   |                               |
    |    git checkout -b feature/x  |                               |
    |                               |                               |
    | 2. Desarrolla en local        |                               |
    |    (tsc + build pasan)        |                               |
    |                               |                               |
    | 3. git push -u origin feat/x  |                               |
    |------------------------------>|                               |
    |                               |                               |
    | 4. Crea PR en GitHub          |                               |
    |------------------------------>| 5. CI corre automatico        |
    |                               |    (typecheck, security,      |
    |                               |     smoke tests)              |
    |                               |                               |
    |                               | 6. Notifica al reviewer ───-->|
    |                               |                               |
    |                               |                  7. Revisa PR |
    |                               |                     comenta   |
    |                               |<──────────────────────────────|
    |                               |                               |
    | 8. Pushea fixes si pide       |                               |
    |------------------------------>| CI corre de nuevo             |
    |                               |                               |
    |                               |               9. Aprueba     |
    |                               |          Squash & Merge ───-->|
    |                               |                               |
    |                               | 10. CI deploya a produccion   |
    |                               |     (VPS + Vercel automatico) |
    |                               |                               |
    | 11. git checkout main         |                               |
    |     git pull                  |                               |
    |     (empezar siguiente feat)  |                               |
```

### Comandos paso a paso

```bash
# 1. Sincronizar main
git checkout main
git pull origin main

# 2. Crear branch
git checkout -b feature/cms-chat-ui

# 3. Desarrollar... commits frecuentes
git add .
git commit -m "feat(cms): add chat panel component"

# 4. Verificar antes de push
cd apps/backend && bunx tsc --noEmit    # si tocaste backend
cd apps/web && bun run build            # si tocaste web

# 5. Push
git push -u origin feature/cms-chat-ui

# 6. Crear PR (desde terminal o GitHub web)
gh pr create --fill

# 7. Si piden cambios, pushear fixes
git add .
git commit -m "fix(cms): address review comments"
git push

# 8. Cuando aprueban y mergean, limpiar
git checkout main
git pull origin main
git branch -d feature/cms-chat-ui       # borrar local
```

---

## 3. Flujo Completo: Hotfix

Algo se rompio en produccion. Prioridad maxima.

```bash
# 1. Comunicar: "Bug en prod, hago hotfix"

# 2. Branch desde main actual
git checkout main
git pull origin main
git checkout -b hotfix/twilio-webhook-500

# 3. Fix MINIMO. No refactorizar. No agregar features.
# ... editar ...

# 4. Verificar
bunx tsc --noEmit
bun run build

# 5. Push + PR urgente
git push -u origin hotfix/twilio-webhook-500
gh pr create --label hotfix --fill

# 6. Review rapido -> Merge -> CI deploya automatico

# 7. Verificar produccion
curl https://api.goberna.us/api/health
curl https://api.goberna.us/api/ready
```

---

## 4. Que pasa despues del Merge

Todo es automatico. No hay que hacer nada manual.

```
Merge a main
    |
    +──> Backend CI (deploy.yml)
    |      1. bunx tsc --noEmit
    |      2. Smoke test completo (DB + Redis + API en CI)
    |      3. Security scan (gitleaks + trivy)
    |      4. SSH a VPS:
    |         git pull -> docker compose build -> migrate
    |      5. Health checks (80s timeout)
    |      6. Si falla: ROLLBACK automatico al commit anterior
    |
    +──> Frontend CI (frontend-ci-cd.yml)
    |      1. Typecheck + build
    |      2. Vercel deploya automatico (GitHub integration)
    |      3. Health check post-deploy
    |
    +──> Produccion live en ~3 minutos
```

**Rollback:** Si el deploy falla, el CI automaticamente revierte al commit anterior, rebuild y verifica health. No necesitas intervenir.

---

## 5. Setup Local (Primera Vez)

### Prerequisitos

| Tool | Version | Instalacion |
|------|---------|-------------|
| **Bun** | >= 1.2 | `curl -fsSL https://bun.sh/install \| bash` |
| **Docker** + Compose | latest | docker.com/desktop |
| **Git** | >= 2.40 | Con SSH key en GitHub |
| **Node.js** | >= 20 | Para Next.js |
| **GitHub CLI** | latest | `brew install gh` / apt |

### Paso a paso

```bash
# 1. Clonar
git clone git@github.com:EstephanoO/maquina-electoral-goberna.git
cd maquina-electoral-goberna

# 2. Levantar infra (PostgreSQL + Redis + Tegola)
docker compose -f docker-compose.dev.yml up -d

# 3. Backend
cd apps/backend
bun install
cp ../../.env.example .env    # Editar con valores de desarrollo (pedir a EstephanoO)
bun run migrate
bun run seed                  # Crea usuario de prueba
bun run dev                   # Puerto 3001

# 4. Web (otra terminal)
cd apps/web
bun install
echo "BACKEND_PROXY_TARGET=http://localhost:3001" > .env.local
bun run dev                   # Puerto 3000

# 5. Verificar
curl http://localhost:3001/api/health   # {"ok":true}
curl http://localhost:3001/api/ready    # {"ok":true, "checks":{...}}
# Abrir http://localhost:3000
```

### .env backend para desarrollo

```bash
# apps/backend/.env (NUNCA commitear)
DATABASE_URL=postgresql://appuser:password@localhost:5432/appdb
REDIS_URL=redis://localhost:6379
JWT_SECRET=development-secret-min-32-characters-long
AGENT_INGEST_TOKEN=dev-token
PORT=3001
LOG_LEVEL=debug
TEGOLA_BASE_URL=http://localhost:8080
# TWILIO_ENCRYPTION_KEY=      # Solo si pruebas WhatsApp real
```

EstephanoO pasa los valores reales por canal seguro. **Nunca por chat del repo.**

---

## 6. Convenciones

### Commits

Formato: `tipo(scope): descripcion`

```
feat(cms): add WhatsApp chat panel with message history
fix(cms): filter soft-deleted contacts from list
refactor(cms): extract SSE logic into useRealtimeContacts hook
ui(cms): improve status badge colors for accessibility
hotfix(twilio): fix webhook signature for multi-campaign
```

| Tipo | Cuando |
|------|--------|
| `feat` | Funcionalidad nueva |
| `fix` | Bug fix no urgente |
| `hotfix` | Fix critico de produccion |
| `refactor` | Reestructura sin cambio funcional |
| `ui` | Solo cambios visuales |

### Branches

```
feature/cms-chat-ui              # bien
feature/add-whatsapp-chat        # bien
hotfix/sse-dropping-connections   # bien
cms-chat                         # MAL - falta prefijo
feature/muchas-cosas-juntas      # MAL - muy ambiguo
```

Minusculas, guiones, prefijo obligatorio, descriptivo en 3-5 palabras.

---

## 7. Review de PRs

### Para EstephanoO (reviewer)

**Checklist rapido:**

1. CI verde? Si no, pedir que lo arregle antes de revisar.
2. Solo toca lo que dice el PR? No hay cambios random?
3. Archivos sensibles? (routes, repository, migraciones, .env)
4. Contratos API en sync entre backend y frontend?
5. Si es UI, `gh pr checkout <N>` y verlo en browser.

**Comandos utiles:**

```bash
gh pr list                             # PRs abiertos
gh pr diff 42 --name-only              # Ver archivos sin checkout
gh pr checkout 42                      # Probar localmente
gh pr review 42 --approve -b "LGTM"   # Aprobar
gh pr merge 42 --squash --delete-branch # Merge + limpiar
```

### Para Maximoff19 (dev)

**Antes de crear PR:**

| Check | Comando |
|-------|---------|
| Backend compila | `bunx tsc --noEmit` en `apps/backend/` |
| Web compila | `bun run build` en `apps/web/` |
| Funciona en local | Probar en browser |
| Sin secretos | `git diff --cached` no muestra .env |

**En el PR:** Llenar el template. Decir que cambio, por que, y como probarlo.

---

## 8. Archivos por Area

### CMS (Maximoff19)

```
# Tu dominio
apps/backend/src/modules/cms/          # Backend CMS (contactos + SSE)
apps/backend/src/modules/twilio/       # Backend WhatsApp
apps/web/app/(dashboard)/cms/          # Frontend CMS
apps/web/app/(dashboard)/cms-metrics/  # Frontend metricas
apps/web/lib/services/cms.ts           # API client CMS

# Preguntar antes de tocar
apps/backend/src/infra/                # Core (auth, DB, Redis)
apps/backend/src/modules/auth/         # Autenticacion
apps/backend/src/modules/campaigns/    # Campanas
docker-compose*.yml                    # Infraestructura
.github/workflows/                     # CI/CD
```

### EstephanoO (todo)

Acceso completo. Review extra cuidadoso en: infra, auth, CI/CD, migraciones DB.

---

## 9. Resolver Problemas

### Conflictos de merge

```bash
git checkout main
git pull origin main
git checkout feature/mi-branch
git rebase main
# Resolver conflictos en los archivos marcados
git add .
git rebase --continue
git push --force-with-lease   # force seguro (solo reescribe tu branch)
```

### CI falla en el PR

1. Ir a la tab "Actions" en GitHub
2. Leer los logs del job que fallo
3. Fix local, commit, push. El PR se re-evalua automatico.

### Branch desactualizada

```bash
git checkout main && git pull
git checkout feature/mi-branch
git rebase main
git push --force-with-lease
```

### Errores comunes

| Error | Solucion |
|-------|----------|
| Push directo a main | Crear branch. Revertir si ya se pusheo. |
| PR gigante (+20 archivos) | Partir en PRs mas chicos |
| `.env` en el commit | Ya esta en `.gitignore` pero verificar `git status` |
| `tsc` falla | Arreglar tipos antes de push |
| Build web falla | Verificar imports y que no falten dependencias |

---

## 10. Produccion

### URLs

| Servicio | URL |
|----------|-----|
| API | `https://api.goberna.us` |
| Dashboard | `https://dashboard.grupogoberna.com` |

### Health checks

```bash
curl https://api.goberna.us/api/health    # {"ok":true}
curl https://api.goberna.us/api/ready     # {"ok":true,"checks":{"database":true,"tegola":true,"redis":true}}
```

### VPS

| Dato | Valor |
|------|-------|
| IP | `161.132.39.165` |
| User | `deploy` |
| Path | `/srv/app` |
| Deploy | Automatico via CI (merge a main) |

**Nunca editar codigo en el VPS.** Todo cambio pasa por git.

---

## 11. Cheatsheet

```bash
# === DESARROLLO ===
git checkout main && git pull                          # Sincronizar
git checkout -b feature/cms-xxx                        # Branch nueva
git add . && git commit -m "feat(cms): descripcion"    # Commit
bunx tsc --noEmit                                      # Typecheck backend
bun run build                                          # Build web
git push -u origin feature/cms-xxx                     # Push

# === PRs ===
gh pr create --fill                                    # Crear PR
gh pr list                                             # Ver abiertos
gh pr checkout 42                                      # Probar local
gh pr review 42 --approve                              # Aprobar
gh pr merge 42 --squash --delete-branch                # Merge

# === VERIFICAR PROD ===
curl https://api.goberna.us/api/health
curl https://api.goberna.us/api/ready
```
