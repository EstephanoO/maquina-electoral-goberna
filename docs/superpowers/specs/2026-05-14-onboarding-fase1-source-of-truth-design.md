# onboarding_fase1 como source of truth del CRM de candidatos

**Fecha:** 2026-05-14
**Estado:** propuesta (pendiente de aprobación)

## Contexto

Hoy hay dos Postgres relevantes en VPS1 (`nexus_postgres` container):

| DB | Rol actual | Notas |
|---|---|---|
| `appdb` | **Principal del producto**. Backend `maquina_electoral_backend` apunta acá. Auth (`public.users`), candidatos (`candidatos.postulacion` — 4 filas), análisis (`analisis.*` — vacío), operativa heredada de nexus-control (~80 tablas en `public.*`: CMS WhatsApp, blast, brigadistas, meets, leads, campaigns, etc.). | Sigue siendo el host del producto. **No se deprecia.** |
| `onboarding_fase1` | DB donde el **geógrafo** (rol `geografo`) cura catálogos políticos y geografía con población 2025. Conectado en vivo vía pgAdmin. | Va a crecer con data del proceso de onboarding de candidatos + datos externos enriquecedores. |

Hallazgos clave de la auditoría:

- `onboarding_fase1.geografia_politica.peru_distritos` ya tiene **1.891 distritos con `poblacion_total_2025`** (cobertura 100%, suma 34.4M habitantes — coincide con INEI). Es la fuente real, NO la copia que está en `appdb`.
- Los IDs de distrito son **secuenciales (1..1891), NO UBIGEO**. Carabayllo = `id 845`. Los CSV del MEF y ONPE vienen indexados por UBIGEO → el ingest tiene que hacer lookup por nombre + provincia.
- Las tablas del geógrafo (`fase_1.*`, `geografia_politica.*`) están siendo escritas activamente. **No las tocamos.**

## Decisión

`onboarding_fase1` se convierte en el lugar donde se construye un candidato durante el proceso de onboarding (sin auth de candidato — el candidato es data, no user). Cuando el onboarding termina y el candidato firma como cliente, se promueve a `appdb` como usuario activo. Ese paso de promoción se diseña aparte, cuando llegue el primer caso.

`appdb` queda como DB principal del producto (auth de empleados Goberna, operativa, clientes activos). No se toca su estructura.

## Modelo conceptual

```
┌─────────────────────────────────────┐         ┌──────────────────────────────────┐
│ appdb (principal — no tocar)        │         │ onboarding_fase1 (source of truth│
│                                     │  futuro │  del CRM de candidatos)          │
│ • Auth empleados Goberna            │  ◄──────│                                  │
│   (admin / consultor / geógrafo)    │ promoción│                                  │
│ • Clientes activos (post-aprobación)│         │ • Catálogos curados              │
│ • Operativa: campaigns, CMS WA,     │         │   (fase_1.* — geógrafo)          │
│   blast, brigadistas, meets, leads, │         │ • Geografía PE + población 2025  │
│   forms, QR, etc.                   │         │   (geografia_politica.* — geógrafo)│
│                                     │         │ • Candidatos en pipeline         │
│                                     │         │   (candidatos.* — NUEVO)         │
│                                     │         │ • Wizard fase-1 + deck fase-2    │
│                                     │         │   (deck.* — NUEVO)               │
│                                     │         │ • Data externa enriquecedora     │
│                                     │         │   (datos_externos.* — NUEVO)     │
└─────────────────────────────────────┘         └──────────────────────────────────┘
```

Pipeline del candidato (estado en `candidatos.candidato.estado_pipeline`):

```
lead → calificado → en_pitch → aprobado ──► [futuro] export a appdb ──► cliente_activo
                       │
                       ├──► rechazado
                       └──► pausado
```

## Schemas a crear en `onboarding_fase1`

Los schemas existentes del geógrafo (`fase_1.*`, `geografia_politica.*`) NO se tocan. Los nuevos van en namespaces paralelos.

### `candidatos.*` — pipeline del onboarding

| Tabla | Propósito |
|---|---|
| `candidato` | Datos básicos: nombres, apellidos, dni, telefono, email, foto_url, fecha_nac, lugar_nac, género, `estado_pipeline` (enum), `slug`, `creado_por_user_id` UUID (apunta a `appdb.public.users.id`, sin FK real porque cross-DB), `creado_en`, `actualizado_en`, `exported_user_id` (NULL hasta que se promueve a cliente), `exported_at`. |
| `postulacion` | FK `candidato` + FK `fase_1.cargo_gobierno` + FK `fase_1.organizacion_politica` + FK `fase_1.proceso_electoral` + jurisdicción (FK a `geografia_politica.peru_departamentos/provincias/distritos` según ámbito del cargo). |
| `formula` | Compañeros de fórmula: FK candidato_principal + nombre + dni + cargo del compañero + orden. |
| `evento` | Log auditable del funnel: `id_candidato`, `tipo` (creado/calificado/pitching/aprobado/rechazado/pausado), `user_id` (quién lo hizo), `payload` JSONB, `ocurrido_en`. |
| `nota` | Anotaciones internas del consultor: `id_candidato`, `user_id`, `texto`, `creado_en`. |
| `asset` | Fotos, logos, archivos del candidato: `id_candidato`, `tipo` (foto/logo_partido/cv/otro), `url` (S3/CDN), `mime`, `tamano_bytes`. |

### `deck.*` — wizard fase-1 + deck fase-2

| Tabla | Propósito |
|---|---|
| `consultor_form` | JSONB con todo lo que captura el wizard fase-1 (mínimo + extendido). Una fila por candidato. Auto-save debounced. |
| `deck_fase2` | Snapshots versionados del deck publicado: `id_candidato`, `version`, `payload` JSONB (slides config + data resuelta), `publicado_por`, `publicado_en`. |
| `analisis_electoral` | Análisis específico de la jurisdicción del candidato (FODA, segmentos, propuestas, etc.) — extraído del JSONB del consultor_form para queries directas si hace falta. Opcional, no MVP. |

### `datos_externos.*` — data enriquecedora que crece

| Tabla | Propósito |
|---|---|
| `eleccion` | Catálogo de elecciones (`codigo`: 'ERM2026'/'EG2021_1V'/'EG2021_2V'/'EG2026', `nombre`, `tipo`, `fecha_eleccion`). |
| `padron_electoral` | Cortes históricos del padrón por (distrito, elección, fuente). Append-only. Columnas: `id_distrito/id_provincia/id_departamento`, `id_eleccion`, `fuente` (ONPE/JNE/RENIEC), `fuente_url`, `fecha_corte`, `poblacion_electoral`, `votos_emitidos`. |
| `presupuesto_municipal` | PIM/PIA/devengado por (distrito, año, unidad ejecutora). UPSERT. Columnas: `id_distrito`, `anio`, `codigo_pliego`, `codigo_unidad_ejecutora`, `nombre_entidad`, `pia/pim/certificacion/compromiso/devengado/girado` NUMERIC(15,2), `fuente='MEF Transparencia Económica'`, `fuente_url`, `fecha_corte`. UNIQUE (id_distrito, anio, codigo_unidad_ejecutora). |
| `resultado_electoral` | Votos por (distrito, elección, partido). `id_distrito`, `id_eleccion`, `id_organizacion_politica`, `votos`, `porcentaje`. |
| `indicador_inei` | Indicadores INEI genéricos por (distrito, año, indicador). `id_distrito`, `anio`, `indicador` (TEXT: 'idh'/'pobreza'/'nbi'/'alfabetizacion'), `valor` NUMERIC, `unidad`. |

### Por qué esta agrupación

- **`candidatos.*` ≠ `deck.*`**: el candidato es **quién**; el deck es **qué le mostramos**. Separados, se puede iterar/borrar/versionar el deck sin tocar al candidato.
- **`deck.consultor_form` JSONB** en vez de 30+ columnas: el wizard cambia rápido y el form se rediseña; JSONB evita migrations por cada campo nuevo. Si una métrica se usa en query (e.g. "votos para ganar"), se promueve a columna.
- **`datos_externos.*` separado de `geografia_politica.*`**: el geógrafo cura `geografia_politica.*` (estructura territorial estable). Los ingest automáticos (MEF, ONPE, INEI) escriben en `datos_externos.*`. Sin conflictos de ownership.
- **`evento` separado de `candidato`**: en lugar de columnas `aprobado_en`/`rechazado_en`/`pausado_en` en `candidato`, una tabla `evento` registra todas las transiciones. Audit completo + no se rompe cuando se agregan estados.

## Conexión del backend

**Dual pool**. Cambio respecto a la decisión inicial de FDW: cuando supimos que el backend va a escribir bastante en `onboarding_fase1` (cada step del wizard fase-1 + publicación de deck), FDW pierde fuerza (DML cross-DB más lento y planes complejos rompen).

```ts
// apps/backend/src/db.ts
export const appdbPool      = new Pool({ connectionString: env.DATABASE_URL });
export const onboardingPool = new Pool({ connectionString: env.ONBOARDING_DATABASE_URL });
```

Reparto de pools:

| Repo / módulo | Pool |
|---|---|
| auth, sessions, users, refresh_tokens, password_resets, invitations | appdbPool |
| campaigns, cms, blast, meets, leads, brigadistas, forms, QR, agents, support (operativa legacy) | appdbPool |
| **onboarding/candidatos** (NUEVO) | onboardingPool |
| **onboarding/deck** (NUEVO) | onboardingPool |
| **onboarding/datos-externos** (NUEVO) | onboardingPool |
| **onboarding/catalogos** (lookup cargos/partidos/procesos) | onboardingPool |

Para queries cross-DB inevitables (e.g. "qué empleado creó este candidato"): guardar `user_id` UUID en `onboarding_fase1.candidatos.candidato.creado_por_user_id` sin FK; resolver nombre del empleado con segundo query a `appdbPool` desde aplicación. Cero FDW.

## Data flow concreto

```
1. Empleado Goberna login → POST /auth/login
   └─ appdbPool: public.users, public.sessions

2. Empleado crea candidato → POST /onboarding/candidatos
   ├─ onboardingPool: INSERT candidatos.candidato (estado='lead')
   ├─ onboardingPool: INSERT candidatos.evento ('creado')
   └─ slug generado, redirect → /onboarding/<slug>/perfil

3. Empleado define postulación → PATCH /onboarding/<slug>/postulacion
   ├─ Lee dropdowns:
   │  ├─ onboardingPool: fase_1.cargo_gobierno
   │  ├─ onboardingPool: fase_1.organizacion_politica
   │  ├─ onboardingPool: fase_1.proceso_electoral
   │  └─ onboardingPool: geografia_politica.peru_departamentos/provincias/distritos
   ├─ Escribe: onboardingPool.candidatos.postulacion (FKs locales)
   └─ Estado → 'calificado'

4. Empleado llena wizard fase-1 → POST /onboarding/<slug>/fase-1 (auto-save 1.5s debounce)
   └─ onboardingPool: UPSERT deck.consultor_form (JSONB)

5. Sistema genera deck fase-2 → al entrar a /onboarding/<slug>/fase-2
   ├─ onboardingPool: SELECT deck.consultor_form
   ├─ onboardingPool: SELECT candidatos.candidato + postulacion
   ├─ Enriquecimiento (lecturas en paralelo):
   │  ├─ geografia_politica.peru_distritos.poblacion_total_2025
   │  ├─ datos_externos.padron_electoral (último corte del distrito)
   │  ├─ datos_externos.presupuesto_municipal (PIM del año)
   │  └─ datos_externos.resultado_electoral (últimas elecciones)
   └─ Renderiza deck. Cada slide tiene predicate `visible` — si no hay data, se oculta.

6. Publica deck → POST /onboarding/<slug>/fase-2/publish
   └─ onboardingPool: INSERT deck.deck_fase2 (snapshot versionado)

7. Aprobado → [FUTURO] export a appdb (no diseñamos ahora)
```

## Cambios en el frontend

| Componente | Cambio |
|---|---|
| `SlideFichaTecnica` | Lee `candidato + postulacion` directo del endpoint, no del consultor_form. |
| `SlideVotosNecesarios` | Padrón viene de `datos_externos.padron_electoral` (último corte por distrito), ya no se pide al consultor. |
| `SlideContextoTerritorial` (NUEVO) | PIM del distrito + ranking nacional. Aparece automáticamente cuando hay data en `datos_externos.presupuesto_municipal`. |
| `SlideAnalisisElectoral` | Resultados últimas elecciones del distrito desde `datos_externos.resultado_electoral`. Si no hay data → slide se oculta. |
| `Fase1LivePreview` | Sigue funcionando. Lee mismo `consultor_form` de `onboarding_fase1`. |

## Datos externos: roadmap de ingesta

| Fuente | Tabla destino | Cómo se carga | Prioridad |
|---|---|---|---|
| MEF Transparencia Económica (PIM/PIA municipal) | `datos_externos.presupuesto_municipal` | CSV manual + `scripts/onboarding-fase1/ingest-mef-presupuesto.ts`, UPSERT | ALTA |
| ONPE (padrón histórico por corte) | `datos_externos.padron_electoral` | CSV manual + `ingest-padron-onpe.ts`, append | ALTA |
| ONPE/JNE (resultados elecciones pasadas) | `datos_externos.resultado_electoral` | CSV + `ingest-resultados-electorales.ts` | MEDIA |
| INEI (IDH, pobreza, NBI, alfabetización) | `datos_externos.indicador_inei` | CSV + `ingest-inei.ts` (genérica) | BAJA |

Lookup UBIGEO → `peru_distritos.id`: por nombre + provincia (no por id directo). El CSV del MEF trae código pliego = UBIGEO 6 dígitos + nombre. Se resuelve cruzando `nombre_entidad` contra `geografia_politica.peru_distritos.distrito + peru_provincias.provincia`.

## Promoción candidato → cliente activo (futuro, no diseñar ahora)

Cuando `candidato.estado_pipeline → 'aprobado'`, dispara export:

1. INSERT `appdb.public.users` con credenciales generadas + email.
2. INSERT `appdb.candidatos.postulacion` con la data del candidato.
3. UPDATE `onboarding_fase1.candidatos.candidato` con `exported_user_id = <appdb_user_id>`, `exported_at = now()`.
4. Email al cliente con credenciales.

Se diseña cuando el primer candidato esté cerca de aprobar. Por ahora, dejamos columnas `exported_user_id` y `exported_at` reservadas en la tabla `candidato`.

## Migración de las 4 postulaciones legacy en `appdb.candidatos.postulacion`

**Decisión: no migrar.** Son del modelo viejo, quedan como histórico en appdb. El CRM nuevo trabaja solo con candidatos nuevos. Revisable cuando confirmemos qué son esas 4 filas.

## Plan de ejecución (orden secuenciado)

1. **Coordinar con el geógrafo** que vamos a crear schemas paralelos `candidatos`, `deck`, `datos_externos` en `onboarding_fase1`. Confirmar que no toca esos namespaces.
2. **Sistema de migrations para `onboarding_fase1`**: `apps/backend/migrations-onboarding/` + `bun scripts/migrate-onboarding.ts`. Ledger en `onboarding_fase1.public._migrations`.
3. **Migration 001**: `CREATE SCHEMA candidatos, deck, datos_externos` + todas las tablas (con FKs a `geografia_politica.peru_*` y `fase_1.*`).
4. **Borrar artefactos viejos** que apuntaban mal:
   - `apps/backend/migrations/072_datos_externos.sql` (apunta a appdb, mal)
   - `apps/backend/scripts/ingest-mef-presupuesto.ts` (asume id=UBIGEO, mal)
   - `apps/backend/scripts/ingest-poblacion-electoral.ts` (ídem)
   - `apps/backend/scripts/INGEST.md` (asume datos_externos vive en appdb)
5. **Re-escribir scripts de ingest** apuntando a `onboarding_fase1`, con lookup UBIGEO→`peru_distritos.id` por nombre+provincia.
6. **Dual pool en backend**: agregar `ONBOARDING_DATABASE_URL` env + `onboardingPool` + repos nuevos en `apps/backend/src/modules/onboarding-fase1/{candidatos,deck,datos-externos,catalogos}/repository.ts`.
7. **Routes nuevas** en backend: `/onboarding/candidatos`, `/onboarding/<slug>/postulacion`, `/onboarding/<slug>/fase-1`, `/onboarding/<slug>/fase-2`.
8. **Refactor frontend**: wizard fase-1 + slides fase-2 leen de los endpoints nuevos.
9. **Migración legacy**: ninguna (opción 1).
10. **Ingest inicial**: PIM 2026 + padrón ONPE 2021/2026 para que la fase-2 tenga data real.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Geógrafo modifica una tabla mientras corremos DDL | Monitor activo (`/tmp/geografo-monitor.log`). Antes de cada DDL chequear que no haya queries activas o locks sobre `fase_1.*` o `geografia_politica.*`. |
| Backend cae si `ONBOARDING_DATABASE_URL` no está configurado | Validar en `config/env.ts` con fallback graceful: si no está, los endpoints de onboarding devuelven 503; el resto del backend sigue funcionando. |
| Cambio de schema del geógrafo rompe los joins (e.g. renombra `distrito` → `nombre`) | Tests de integración que verifican el contrato de columnas que leemos. Coordinación previa de cualquier rename. |
| Performance: queries del deck hacen 5-10 lecturas a onboarding_fase1 | Endpoint `/fase-2/data` que hace todas las lecturas en paralelo (`Promise.all`) + un único response. Caché HTTP `Cache-Control` por candidato. |
| Borrado accidental por el geógrafo de filas con FKs entrantes (e.g. `peru_distritos`) | Mantenemos los FKs `ON DELETE RESTRICT` en `candidatos.postulacion` y `datos_externos.*`. Postgres bloquea el delete con error claro. |
| Backup/restore: si onboarding_fase1 muere, perdemos candidatos en proceso | Backup diario del container `nexus_postgres` (cubre todas las DBs). Restore manual a partir de pg_dump si hace falta. |
