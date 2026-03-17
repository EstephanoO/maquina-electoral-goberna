# Goberna — Roadmap técnico
> Última actualización: 2026-03-17

Sistema de prioridades: **P0** = bloqueo / P1 = semana actual / P2 = próxima semana / P3 = backlog

---

## Estado actual del sistema

| Área | Estado | Notas |
|---|---|---|
| Backend API | ✅ Estable | 30 módulos, producción |
| Web Dashboard | ✅ Estable | Vercel, producción |
| Extensión Chrome | 🟡 Funcional con deuda técnica | v9.0.0, varios bugs activos |
| Mobile | 🟡 En desarrollo | EAS builds, no en stores |
| Blast / Call Center | 🟡 Parcialmente funcional | Backend OK, UX incompleta |
| Audio PTT | 🟡 Bug intermitente | Upload pipeline frágil |
| WA Validator | ✅ Nuevo, sin testing real | Recién deployado |
| QR Leads | ✅ Nuevo, sin testing real | Recién deployado |

---

## FASE 1 — Estabilidad (Esta semana)

### 1.1 Extensión: consolidar el pipeline de PTT

**Problema:** `sendAudioAsPTT` tiene 11 steps con módulos WA que cambian con cada deploy de WA Web. Es frágil.

**Plan:**
- [ ] Agregar un scan real de módulos WA en producción (Scan 9 del SCAN-MODULES.md) para confirmar qué existe
- [ ] Extraer el pipeline PTT a `src/inject/ptt-sender.js` con tests unitarios aislados
- [ ] Agregar logging permanente (no solo debug) que vaya a `chrome.storage` para diagnóstico remoto

**Archivos afectados:**
- `src/inject/audio-catalog-panel.js` → extraer `sendAudioAsPTT`
- nuevo `src/inject/ptt-sender.js`

### 1.2 Extensión: live bindings audit

**Problema:** el bug de `_lastActiveChatJid` (esbuild IIFE snapshot) puede existir en otros módulos.

**Plan:**
- [ ] Auditar todos los `export let` en archivos inject
- [ ] Convertir a getter functions donde aplique
- [ ] Documentar el patrón en `SCAN-MODULES.md`

**Archivos afectados:**
- `src/inject/bootstrap.js` → `_ownNumber`, `_catalogIsConsultor`
- `src/inject/wa-module-installer.js` → ya corregido

### 1.3 Backend: bugs conocidos del CI

**Problema:** CI falla en smoke test por orden de migraciones.

**Plan:**
- [ ] `038_voter_profiles.sql` → ya tiene `CREATE EXTENSION IF NOT EXISTS pg_trgm` ✅
- [ ] Investigar por qué `form_validations` no existe en la DB de CI (orden de migraciones)
- [ ] Investigar FK violation de `audio_catalog` en CI seed
- [ ] Crear migración `039_ci_fixes.sql` que garantice el orden

**Archivos afectados:**
- `apps/backend/migrations/`

### 1.4 Extensión: `BLAST_GET_STATS` en popup

**Problema:** el popup tab "Call Center" llama `apiFetchPopup('/api/blast/stats')` pero `apiFetchPopup` no está definido — solo existe `apiFetch` en el background.

**Plan:**
- [ ] Verificar si el popup puede hacer fetch directo con el token de chrome.storage
- [ ] Si no puede, crear un mensaje `BLAST_GET_STATS_POPUP` que lo solicite via background

---

## FASE 2 — Funcionalidades pendientes (Próxima semana)

### 2.1 Blast: completar el loop

**Lo que falta para que el blast funcione end-to-end:**
- [ ] Configuración inicial de slots: UI en el popup para asignar `segment_idx` a cada celular
- [ ] `BLAST_MARK_HABLADO` / `BLAST_REPORT` → verificar que el backend recibe y persiste correctamente
- [ ] Panel de coordinación: que el administrador pueda ver el progreso de los 6 celulares en tiempo real

### 2.2 WA Validator: testing real y métricas

**Plan:**
- [ ] Testear modo silencioso con 20 números reales (mix válidos/inválidos)
- [ ] Verificar que `wa_valid` se persiste correctamente en `form_validations`
- [ ] Verificar que `GET /api/wa-validator/stats` devuelve datos correctos por brigadista
- [ ] Agregar columna `wa_valid` visible en el web dashboard (tabla de formularios)

### 2.3 Audio PTT: modo producción

**Plan:**
- [ ] Testear envío de PTT con el fix del getter aplicado
- [ ] Si el upload de WA Web sigue fallando, implementar alternativa: enviar el audio como adjunto normal (no PTT) usando `addAndSendMsgToChat` con `type: 'audio'`
- [ ] Cache de audios en `chrome.storage.local` para no refetcher del backend en cada uso

### 2.4 Mobile: completar tabs

**Plan:**
- [ ] QR Code screen: testear en dispositivo real
- [ ] Dashboard: verificar que el botón "Escribir por WA" funciona en iOS y Android
- [ ] Solicitudes: verificar que solo aparece para roles candidato+

---

## FASE 3 — Escalabilidad (Backlog)

### 3.1 Extensión: arquitectura de mensajes tipada

**Problema actual:** los tipos de mensajes son strings literales dispersos en 20+ archivos. Un typo no se detecta en compile time.

**Plan:**
- [ ] Crear `src/shared/message-types.js` con constantes para todos los tipos
- [ ] Reemplazar todos los strings literales por las constantes
- [ ] Documentar el protocolo de mensajes completo

### 3.2 Backend: documentación de API

**Plan:**
- [ ] Agregar Fastify Swagger (`@fastify/swagger`) en modo development
- [ ] Genera OpenAPI spec automática desde los schemas Zod
- [ ] Exponer en `/api/docs` (solo en desarrollo)

### 3.3 Web: rutas faltantes en middleware

**Problema:** `/brigadistas` y `/leads` no están en `PROTECTED_PREFIXES` (aunque están protegidas por fail-closed).

**Plan:**
- [ ] Agregar ambas rutas a `PROTECTED_PREFIXES` en `apps/web/middleware.ts`

### 3.4 Blast: anti-baneo mejorado

**Plan:**
- [ ] Implementar "warming schedule" automático: el sistema propone cuántos mensajes enviar por día según el día de warmup del celular
- [ ] Alertas proactivas si un celular supera el límite diario

### 3.5 QR Leads: leaderboard público

**Plan:**
- [ ] Pantalla de leaderboard en mobile que muestre ranking de brigadistas por scans
- [ ] Widget en web dashboard

---

## FASE 4 — Deuda técnica (Cuando haya margen)

### 4.1 Migrar `forms` legacy a `form-submissions`

Los módulos `forms` (write-behind) y `form-submissions` (directo) hacen lo mismo. El mobile ya usa `form-submissions`. Deprecar `forms` y eliminar el write-behind de formularios.

### 4.2 Eliminar `jefe_campana` de DB

Hay registros de usuarios con `role = 'jefe_campana'` en producción que no son válidos para el sistema actual. Necesita migración con cuidado.

### 4.3 Unificar `validacion` y `form-submissions`

`form_validations` y `form_submissions` son tablas muy similares que representan el mismo concepto en distintas versiones. Unificarlas reduce complejidad.

---

## Criterios de "listo"

Antes de marcar cualquier tarea como completada:

| Check | Comando |
|---|---|
| Backend TypeScript | `cd apps/backend && bunx tsc --noEmit` |
| Web build | `cd apps/web && bun run build` |
| Mobile TypeScript | `cd apps/mobile && bunx tsc --noEmit` |
| Extension build | `cd extensions/wspp-store-tester && node build.js` |
| Producción health | `curl https://api.goberna.us/api/health` → `{"ok":true}` |
| Producción ready | `curl https://api.goberna.us/api/ready` → `{"ok":true,"checks":{"database":true,"tegola":true,"redis":true}}` |
