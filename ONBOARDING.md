## 1. Setup local

```bash
# Clonar
git clone git@github.com:EstephanoO/maquina-electoral-goberna.git
cd maquina-electoral-goberna

# Infra (PostgreSQL, Redis, Tegola)
docker compose -f docker-compose.dev.yml up -d

# Backend (terminal 1)
cd apps/backend
bun install
cp ../../.env.example .env    # Pedir valores a EstephanoO
bun run migrate
bun run seed
bun run dev                   # http://localhost:3001

# Web (terminal 2)
cd apps/web
bun install
echo "BACKEND_PROXY_TARGET=http://localhost:3001" > .env.local
bun run dev                   # http://localhost:3000

# Verificar
curl http://localhost:3001/api/health   # {"ok":true}
curl http://localhost:3001/api/ready    # {"ok":true}
```

**Necesitas:** Bun, Docker, Node >= 20, Git con SSH key en GitHub.

---

## 2. Tu area de trabajo

Trabajas en el CMS (Contact Management) y la integracion WhatsApp con Twilio.

```
# Backend
apps/backend/src/modules/cms/         # Contactos + SSE realtime
apps/backend/src/modules/twilio/      # WhatsApp

# Frontend
apps/web/app/(dashboard)/cms/         # Pagina CMS
apps/web/lib/services/cms.ts          # API client

# Referencia
CMS_DEVELOPER_GUIDE.md               # Guia tecnica completa del CMS
```

Lee `CMS_DEVELOPER_GUIDE.md` para entender el modulo a fondo.

---

## 3. Flujo de trabajo

**Regla:** Nunca pushear directo a `main`. Todo va por PR.

```bash
# 1. Sincronizar
git checkout main
git pull origin main

# 2. Crear branch
git checkout -b feature/cms-lo-que-sea

# 3. Desarrollar + commits
git add .
git commit -m "feat(cms): descripcion corta"

# 4. Verificar ANTES de push
cd apps/backend && bunx tsc --noEmit    # si tocaste backend
cd apps/web && bun run build            # si tocaste web

# 5. Push + PR
git push -u origin feature/cms-lo-que-sea
gh pr create --fill

# 6. Esperar review de EstephanoO
#    Si pide cambios: fix, commit, push. El PR se actualiza solo.

# 7. Cuando mergea, volver a empezar
git checkout main
git pull origin main
git branch -d feature/cms-lo-que-sea
```

### Branches

| Prefijo    | Para que                     |
| ---------- | ---------------------------- |
| `feature/` | Funcionalidad nueva o mejora |
| `hotfix/`  | Bug urgente en produccion    |

### Commits

```
feat(cms): add WhatsApp chat panel
fix(cms): filter deleted contacts
refactor(cms): extract SSE hook
ui(cms): improve status badges
```

---

## 4. Antes de crear cualquier PR

- [ ] `bunx tsc --noEmit` pasa (si tocaste backend)
- [ ] `bun run build` pasa (si tocaste web)
- [ ] Probaste en local que funciona
- [ ] No subiste `.env` ni secretos
- [ ] El PR describe QUE cambio y COMO probarlo

---

## 5. Documentacion clave

| Archivo                  | Que tiene                                                             |
| ------------------------ | --------------------------------------------------------------------- |
| `CMS_DEVELOPER_GUIDE.md` | Arquitectura CMS, base de datos, endpoints, Twilio, estado actual     |
| `CONTRIBUTING.md`        | Flujo de desarrollo completo, convenciones, resoluciones de problemas |
| `AGENTS.md`              | Arquitectura general de la plataforma                                 |
| `apps/backend/AGENTS.md` | Convenciones del backend                                              |
| `apps/web/AGENTS.md`     | Convenciones del frontend                                             |

---

## 7. Comandos utiles

```bash
bun run dev                    # Levantar backend o web
bunx tsc --noEmit              # Typecheck backend
bun run build                  # Build web
bun run migrate                # Correr migraciones
bun run seed                   # Datos de prueba
gh pr create --fill            # Crear PR
gh pr list                     # Ver PRs abiertos
```
