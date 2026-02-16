# Sprints de Cierre de Operabilidad (Infra Produccion)

Este plan hereda el objetivo del root `AGENTS.md`: infraestructura estable, operable y mantenible por 2 devs, con prioridad en disponibilidad, seguridad basica y recuperacion.

---

## Sprint 0 - Baseline y control de danos (0.5 dia)

### Objetivo

Congelar estado real, eliminar drift y tener una base reproducible antes de tocar mas cosas.

### Checklist

- [ ] Confirmar branch de trabajo (`fix/development`) y politica de merge (`development -> main`).
- [ ] Verificar secretos requeridos en GitHub (`VPS_HOST`, `SSH_PRIVATE_KEY`, opcional `VPS_PORT`).
- [ ] Verificar `.env` en VPS con variables obligatorias (incluyendo `AGENT_INGEST_TOKEN`).
- [ ] Confirmar Redis en `noeviction` y que Postgres/Redis no exponen puertos publicos.
- [ ] Confirmar endpoints base respondiendo en VPS (`/api/health`, `/api/ready`, `/api/metrics`).

### Como solucionarlo (paso a paso)

1. Unificar cambios pendientes en una sola rama de integracion (`development`) y cortar releases solo desde ahi.
2. Ejecutar auditoria rapida de entorno: secretos GitHub + `.env` VPS + `docker compose config`.
3. Si falta una variable critica, se agrega en VPS y se reinicia solo backend (`docker compose up -d backend`).
4. Guardar evidencia en un log de control (fecha, commit, resultado health).

### DoD Sprint 0

- [ ] Estado base documentado y repetible.
- [ ] No hay secretos en repo.
- [ ] Health/ready/metrics en verde desde VPS.

---

## Sprint 1 - CI/CD confiable y rollback real (1 dia)

### Objetivo

Dejar pipelines verdes y con rollback automatico validado frente a fallos reales.

### Checklist

- [ ] Arreglar fallo `security` (gitleaks) en `CI CD VPS`.
- [ ] Arreglar fallo `quality` por smoke `502` en runner.
- [ ] Endurecer smoke para esperar readiness real (backend + nginx) con timeout explicito.
- [ ] Agregar diagnostico automatico al fallar smoke (`docker compose ps` + logs relevantes).
- [ ] Validar rollback automatico en un caso controlado de deploy fallido.

### Como solucionarlo (paso a paso)

1. **Gitleaks**: eliminar patrones que parezcan secretos hardcodeados en scripts de CI; usar valores generados en runtime.
2. **Smoke 502**: cambiar chequeo inicial a espera activa con reintentos y backoff antes de declarar fallo.
3. **Observabilidad de CI**: cuando smoke cae, imprimir estado de contenedores y ultimas lineas de logs para no debuggear a ciegas.
4. **Rollback test**: forzar un deploy de prueba que falle en smoke post-deploy y verificar retorno automatico al commit estable.
5. Repetir corrida hasta obtener 2 ejecuciones consecutivas verdes en `main`.

### DoD Sprint 1

- [ ] Workflow `CI CD VPS` en verde.
- [ ] Workflow frontend en verde.
- [ ] Rollback automatico probado y evidenciado.

---

## Sprint 2 - Operacion diaria: backups, SSL y alertas (1 dia)

### Objetivo

Reducir riesgo operativo diario: recuperacion, certificados y deteccion temprana de degradaciones.

### Checklist

- [ ] Backup diario de Postgres ejecutando con retencion (`BACKUP_RETENTION_DAYS`).
- [ ] Restore de prueba validado en entorno aislado.
- [ ] Certificado SSL valido y renovacion automatica sin errores.
- [ ] Cloudflare en `Full (strict)` con proxy ON.
- [ ] Alertas operativas activas (script + cron + workflow).

### Como solucionarlo (paso a paso)

1. Programar y ejecutar backup manual inicial para validar formato y permisos de `BACKUP_DIR`.
2. Correr restore de prueba (no alcanza con "existe el archivo", hay que restaurar y consultar).
3. Revisar cron de certbot y validar renovacion en modo dry-run.
4. Activar chequeo de alertas con estado persistente y webhook opcional.
5. Definir playbook P1/P2 corto (quien mira, que comando corre, cuando escalar).

### DoD Sprint 2

- [ ] Hay backup del dia y restore probado.
- [ ] SSL renovando automaticamente.
- [ ] Alertas con semaforo operativo funcionando.

---

## Sprint 3 - Capacidad y cierre de release (1 dia)

### Objetivo

Cerrar con confianza operativa para trafico esperado y release process limpio.

### Checklist

- [ ] Ejecutar matriz de carga en VPS y guardar reporte versionado.
- [ ] Ejecutar soak de al menos 30 min y revisar errores/picos de latencia.
- [ ] Verificar SLO operativos en `/ops` (ruta + outcome, p50/p90/p95/p99).
- [ ] Confirmar contrato Expo/backend sin legacy SSE (`location.update` fuera, `location.batch` vigente).
- [ ] Validar flujo final de release (`fix/feature -> development -> main`).

### Como solucionarlo (paso a paso)

1. Correr pruebas de capacidad con scripts actuales y guardar artefactos (`matrix-latest`, `soak-latest`).
2. Si hay degradacion, ajustar primero limites/colas/timeouts (no meter complejidad nueva).
3. Revisar `/ops` para confirmar que la telemetria expone por ruta y por outcome.
4. Congelar contrato de API y comunicar breaking changes si existieran.
5. Hacer release controlada a `main` con checklist de verificacion final.

### DoD Sprint 3

- [ ] Capacidad validada para carga objetivo.
- [ ] Observabilidad funcional para operar sin adivinar.
- [ ] Release process estable y repetible.

---

## Bloqueadores actuales y resolucion directa

### 1) `CI CD VPS` falla por `gitleaks`

- Causa probable: strings de ejemplo en scripts que matchean patron de secreto.
- Resolucion: reemplazar placeholders por valores generados en runtime y evitar formatos tipo token real.
- Validacion: workflow `security` en verde en 2 corridas seguidas.

### 2) Smoke de CI da `502`

- Causa probable: chequeo demasiado temprano (servicios aun no listos).
- Resolucion: readiness gate con retries + timeout y diagnostico al fallar.
- Validacion: `quality` en verde de forma consistente.

### 3) Riesgo de "esta deployado pero no operable"

- Causa probable: falta de chequeos post-deploy y rollback probado.
- Resolucion: smoke post-deploy obligatorio + rollback automatico testeado.
- Validacion: evidencia de rollback exitoso ante fallo inducido.

---

## Checklist final de salida a produccion

- [ ] `https://API_DOMAIN/health` responde 200.
- [ ] Deploy automatico en `main` funciona.
- [ ] Backup diario existe y restore fue probado.
- [ ] SSL valido y renovacion activa.
- [ ] Firewall con puertos minimos (`22/80/443`) y DB/Redis no expuestos.
- [ ] Dash `/ops` mostrando latencias por ruta y outcome (p50/p90/p95/p99).
- [ ] Runbooks actualizados y entendibles por 2 devs.

---

## Cadencia sugerida

- Sprint 0: hoy (medio dia)
- Sprint 1: dia 1
- Sprint 2: dia 2
- Sprint 3: dia 3

Si queres acelerar, se puede ejecutar Sprint 2 y 3 en paralelo solo cuando Sprint 1 ya este en verde estable.
