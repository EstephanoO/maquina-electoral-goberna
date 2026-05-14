# Goberna Electoral — MVP Vendible

> Documento estratégico — versión 2026-05-13
> Audiencia: equipo Goberna + consultores socios + futuros stakeholders
> Estado: vivo, se actualiza con cada sprint

---

## TL;DR — en 5 líneas

1. Numinar resuelve campañas USA porque hay padrón comercial; en LATAM **no se puede empezar por el padrón**.
2. Goberna ya tiene todas las piezas para un modelo **bottom-up: pauta Meta → landing → bot WhatsApp → lead calificado → activación territorial**.
3. El producto vendible **hoy** no es "plataforma electoral con IA" — es **"deck consultor + funnel digital + brigadistas con app", todo retroalimentado en tiempo real**.
4. La diferencia real vs Numinar/VAN/NGP: **el deck del candidato se actualiza solo** con la data del funnel. El consultor no toca métricas, solo narrativa.
5. MVP: 4 sprints (4 semanas) usando lo que ya está construido. Sin esperar padrón. Sin reescribir.

---

## 1. Dónde estamos parados (auditoría honesta)

### 1.1 Lo que YA tenemos funcionando

**Adquisición digital**
- `nexus-meta` — sync de Meta Ads (FB/IG) hacia el backend, feeds para CRM
- `Apify + Gemini` — social listening, scoring de posts, detección de crisis/ataques/apoyos
- `goberna-builder` — visual page builder Astro, landings por candidato con inline editing
- `goberna-sites` — migración de sitios WordPress de clientes a Astro estático
- `goberna-builder-template` — template Astro que el publish worker inyecta

**Captura y conversación**
- `goberna-crm` + Baileys — WhatsApp con `ChannelProvider` abstraction, bot conversacional
- `leads-crm` (en VPS1) — bot con learned replies, intent mining, embeddings pgvector + Gemini 2.5
- QR codes desde mobile — captura de leads en campo

**Inteligencia territorial**
- `atlas-electoral` — dashboard ONPE Perú 2016/2021 1V/2V con DeckGL + PostGIS
- Geo hierarchy en backend: 25 departamentos / ~200 provincias / ~1900 distritos

**Activación campo**
- `maquina-electoral-goberna/apps/mobile` — Expo, ~60% funcional
  - Auth JWT + WhatsApp OTP
  - GPS tracking foreground + background
  - Offline queue SQLite con sync automático
  - Forms dinámicos, ranking de agentes
  - QR leads generation
- `maquina-electoral-goberna/apps/web` — Next.js war room, 40% funcional
  - 6 scenes (Narrative, Competitors, GeoHub, Social, Territory, Pulse)
  - MapLibre integrado, falta data binding

**Deck consultor (recién deployado)**
- `apps/web/app/onboarding/[slug]/` — flujo cinematográfico por candidato
  - Perfil hub
  - Fase 1 (rápida) + Fase 2 (estratégica) con slides editables
  - Hot-refresh con MCP, EditableText inline
  - Server-side render del deck Goberna estándar
- `apps/backend/src/modules/decks/` — fase2-form schema, endpoints por candidato, status flow (draft/review/published)
- `goberna-decks-consultor` (público) — kit consultor con Claude Code + MCP + plantillas HTML

**Infraestructura**
- `nexus-platform` — engine Go Vercel-like, multi-tenant
- `nexus-control` — admin panel multi-VPS (`labs.goberna.club`)
- `nexus-mail` + `nexus-mail-api` — Mailu stack propio (`mail.goberna.us`)
- `nexus-vimeo` — proxy Vimeo + MinIO para videos LMS
- `goberna-monitoring` — Grafana + Prometheus + cAdvisor
- VPS1 (Elastika, 30 GiB) — workhorse de apps custom
- VPS2 (Hetzner, 47 GiB) — plataforma + hosting WP clientes

**Productos complementarios**
- `goberna-escuela` — LMS reemplazo Moodle, live en `escuela.institutogoberna.com`
- `goberna-club` — directorio consultores políticos
- `certificaciones-goberna` — generador PDF + sync Moodle

### 1.2 Lo que NO tenemos (y por qué no es bloqueante)

**No tenemos el padrón electoral nominal.**
- En Perú, el JNE/RENIEC entrega padrón solo a partidos políticos registrados como organización.
- **Decisión estratégica**: no esperar padrón. Construir universo desde el funnel digital.
- Cuando llegue el padrón parcial vía cliente, se agrega como enrichment, no como base.

**No tenemos canvassing por votante específico todavía.**
- La mobile hoy recoge forms genéricos.
- Pero el modelo nuevo cambia esto: brigadista visita **leads** (que sí tenés), no votantes random.

**El war room está mockeado.**
- Las 6 scenes existen pero con data dummy.
- Lo solucionamos con SSE conectando al pipeline real (Sprint 3).

**No tenemos schema de leads unificado todavía.**
- Cada repo captura por su lado (Meta, landing, bot, QR).
- Sprint 2 unifica todo en una tabla `leads` central.

---

## 2. Hacia dónde vamos — el pivot estratégico

### 2.1 De top-down (Numinar) a bottom-up (Goberna)

```
NUMINAR USA:
  Padrón comercial → segmentación ML → canvassing masivo → conversión

GOBERNA LATAM:
  Pauta Meta → Landing personalizada → Bot WhatsApp →
  Lead calificado → Activación brigadista → Conversión medible
```

**Por qué es mejor para LATAM**:
1. No depende de data restringida
2. Cada persona en el sistema **se autoidentificó** — son leads calientes, no contactos fríos
3. La conversión es **trazable end-to-end**: clic en ad → mensaje en bot → visita brigadista → voto declarado
4. Funciona con cualquier tamaño de campaña (un alcalde distrital o un candidato presidencial)
5. Coincide con cómo se hacen las campañas en LATAM hoy (todo pasa por WhatsApp)

### 2.2 Arquitectura en 4 capas

```
┌─────────────────────────────────────────────────────────────┐
│  CAPA 1 — ADQUISICIÓN                                       │
│  nexus-meta · Apify+Gemini · atlas-electoral histórico      │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  CAPA 2 — CAPTURA                                           │
│  goberna-builder (landing) · goberna-crm (bot) · QR mobile  │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  CAPA 3 — INTELIGENCIA                                      │
│  Gemini scoring · cruce social × histórico × ad performance │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  CAPA 4 — ACTIVACIÓN                                        │
│  Mobile brigadistas · War room real-time · Deck dinámico    │
└─────────────────────────────────────────────────────────────┘
```

Cada capa **ya existe parcialmente**. El MVP es conectarlas.

### 2.3 El deck consultor como sistema vivo (la innovación)

**Problema actual de todos los productos electorales del mercado**:
El consultor vende un servicio donde tiene que armar manualmente:
- Una presentación inicial al candidato
- Reportes semanales/mensuales de avance
- Un deck final de cierre

Todo a mano. Cada vez. Lleva horas.

**Solución Goberna — Deck retroalimentable**:

El deck del candidato es **un objeto vivo** que crece con la campaña.

```
Onboarding (Fase 1)         → Deck inicial 5 slides
  ├─ Perfil candidato          (estático, editable consultor)
  ├─ Diagnóstico zona          (auto-fed: atlas-electoral histórico)
  ├─ Estrategia propuesta      (estático, editable)
  ├─ Roadmap 90 días           (estático, editable)
  └─ Capacidad Goberna         (estático, marketing)

Después de 1 semana de campaña → Deck 12 slides
  + Métricas Meta Ads          (auto-fed: nexus-meta)
  + Leads capturados           (auto-fed: goberna-crm)
  + Sentimiento social         (auto-fed: Apify+Gemini)
  + Cobertura territorial      (auto-fed: mobile brigadistas)

Después de 1 mes              → Deck 25 slides
  + Funnel completo            (auto-fed: pipeline analytics)
  + Mapa de calor leads        (auto-fed: territorial signals)
  + Comparativa rivales        (auto-fed: Competitors scene)
  + Top issues por zona        (auto-fed: Gemini narrative)
  + Recomendaciones IA         (auto-fed: scoring engine)

En cualquier momento → consultor presenta al candidato
  - 0 minutos preparando data
  - Solo editó la narrativa
  - Métricas siempre frescas (snapshot del día)
```

**El cambio que el consultor experimenta**:
- Antes: "tengo que armar el reporte del lunes" (4 horas)
- Después: "abro el deck, retoco 2 frases, lo publico" (15 minutos)

**El cambio que el candidato experimenta**:
- Antes: ve una presentación estática cada quince días
- Después: tiene una URL que le muestra su campaña actualizada todos los días

---

## 3. MVP vendible — qué entregamos

### 3.1 Producto: "Plataforma Goberna para Campaña Electoral"

Un único producto con cuatro vistas integradas:

**Vista 1: Web Consultor** (`electoral.goberna.club`)
- Admin de candidatos asignados
- Editor de decks (onboarding + reportes)
- War room por candidato (6 scenes con data real)
- Configuración de pauta Meta + landings + bot

**Vista 2: Web Candidato** (URL personalizada por candidato)
- Deck vivo del candidato (la URL que comparte)
- Dashboard simplificado: leads del día, gastos pauta, agenda

**Vista 3: App Mobile Brigadista** (iOS + Android, ya en App Store)
- Mi ruta del día (leads + zonas recomendadas)
- Registro de visitas + GPS + foto
- Ranking individual + del equipo
- Captura QR de leads nuevos en campo

**Vista 4: Web Public Landing** (por candidato, vía goberna-builder)
- Landing personalizada con propuestas
- Captura de lead → goberna-crm → bot WhatsApp
- Auto-respuesta + agendamiento

### 3.2 Pricing model sugerido (a validar)

| Tier | Pago mensual | Incluye |
|---|---|---|
| **Distrital** | $500 USD/mes | 1 candidato, 5 brigadistas, $200 pauta |
| **Provincial** | $1500 USD/mes | 1 candidato, 20 brigadistas, $800 pauta |
| **Regional** | $5000 USD/mes | 1 candidato, 100 brigadistas, $3000 pauta |
| **Nacional** | $20000+ USD/mes | Custom, multi-tier campaign |

Margen Goberna: setup + plataforma + consultoría + capacitación brigadistas (via goberna-escuela).

### 3.3 Diferenciadores reales vendibles

1. **Deck que se actualiza solo** — nadie en el mercado tiene esto
2. **WhatsApp-first** — todos los rivales asumen SMS/email
3. **Padrón opcional, no requerido** — funciona desde el día 1 sin esperar acceso
4. **Conversión trazable end-to-end** — pauta → lead → visita → voto declarado
5. **Brigadistas con app real** — no Google Forms, no spreadsheets
6. **Capacitación incluida** — Goberna Escuela como upsell o incluido
7. **Multi-candidato consultor** — un consultor maneja varios desde el mismo panel
8. **Soberanía del dato** — todo corre en VPS propios, no AWS/Azure

---

## 4. Roadmap de implementación — 4 sprints de 1 semana

### Sprint 1 — Cimientos de datos (Semana 1)

**Objetivo**: que el backend sepa todo lo que ya está pasando pero está disperso.

Tareas:
- [ ] Schema `leads` unificado en `apps/backend`
  ```
  leads: id, campaignId, source, phone, email, firstName,
         lastName, geoUbigeo, utmCampaign, utmAdset, metadata
  lead_interactions: id, leadId, channel, direction, content, timestamp
  ```
- [ ] Schema `territorial_signals` con import desde `atlas-electoral`
  ```
  territorial_signals: ubigeo, population, votersHistorical,
                       resultsPrevious (jsonb), swingZone, updatedAt
  ```
- [ ] Schema `meta_audiences` y `meta_ad_spend_by_zone` (sync desde nexus-meta)
- [ ] Job nocturno: cruzar atlas + nexus-meta + leads → `zone_priority`

**Entregable Sprint 1**: API `GET /api/zones/recommended?campaignId=X` que responde "estos son los 10 distritos más calientes hoy" — combinando histórico ONPE, performance de pauta, y densidad de leads.

### Sprint 2 — Lead pipeline unificado (Semana 2)

**Objetivo**: cada interacción con candidato queda en `leads`, con score IA.

Tareas:
- [ ] Webhook: landings de `goberna-builder` → backend → INSERT `leads`
- [ ] Integración `goberna-crm` (Baileys): cada conversación → INSERT `lead_interactions` + score con Gemini
- [ ] Migración QR leads del mobile: `qr_leads` → `leads` (mismo esquema)
- [ ] Endpoint `GET /api/leads?status=hot&zone=X` para coordinador
- [ ] Endpoint `GET /api/leads/:id` perfil completo (todas las interacciones, score histórico)

**Entregable Sprint 2**: un coordinador en web puede ver los 47 leads calientes del día, ordenados por score, con todo el historial de cada uno.

### Sprint 3 — Mobile canvassing + War room real-time (Semana 3)

**Objetivo**: brigadistas visitan leads reales, war room ve todo en vivo.

Tareas Mobile:
- [ ] Pantalla `mi-ruta.tsx` — fetch `/api/routes/my-active` + GPS sort
- [ ] Pantalla `lead/[id].tsx` — perfil con score, historial, botón visitar
- [ ] SQLite `pending_visits` (replicar patrón `pending_forms`)
- [ ] Form de visita: outcome, notas, foto, GPS auto
- [ ] Sync: `POST /api/routes/:id/visit` con `leadId`

Tareas Backend SSE:
- [ ] `eventBus` (EventEmitter in-memory)
- [ ] Endpoint `GET /api/events/stream` (Server-Sent Events con auth)
- [ ] Emit en cada: lead nuevo, visita registrada, conversación bot, sentiment alert

Tareas War Room:
- [ ] Hook `useFieldEvents()` (EventSource + state)
- [ ] Pulse scene → feed live
- [ ] Territory scene → choropleth de cobertura
- [ ] GeoHub scene → markers de brigadistas activos

**Entregable Sprint 3**: brigadista visita un lead caliente, war room lo ve en tiempo real, métricas se actualizan en el backend.

### Sprint 4 — Deck retroalimentable (Semana 4)

**Objetivo**: cada candidato tiene un deck que se actualiza solo todos los días.

Tareas:
- [ ] Schema `deck_snapshots`: snapshot diario de métricas del candidato
  ```
  deck_snapshots: id, candidatoId, date, metrics (jsonb), narrative (jsonb)
  ```
- [ ] Job nocturno `compute-daily-snapshot`: para cada candidato activo, calcular:
  - leads_today, leads_week, leads_total
  - conversion_rate (visited / total)
  - top_zones (top 5 ubigeos con más leads)
  - sentiment_score (Gemini sobre social del día)
  - ad_spend_today, ad_cpr (cost per registration)
  - territorial_coverage (% de zonas asignadas con visitas)
- [ ] Slides "vivos" en el deck — pull desde último snapshot
- [ ] Consultor abre `/onboarding/[slug]/fase-2` → ve métricas frescas pre-cargadas
- [ ] Botón "Publicar versión actual" → URL pública para candidato

**Entregable Sprint 4**: consultor abre deck del lunes, números del fin de semana ya están ahí, solo edita 2 párrafos de narrativa, publica.

---

## 5. La experiencia consultor — design principles

### 5.1 Onboarding del consultor

Cuando un consultor empieza con Goberna, en una sesión de 30 min ya tiene:
1. Sus candidatos asignados visibles en panel
2. Un MCP server configurado en Claude Desktop con setup-scripts (ya existe)
3. Acceso a deck templates Goberna (ya existe en `goberna-decks-consultor`)
4. Bot WhatsApp configurado por candidato
5. Landing template para personalizar

### 5.2 Día a día del consultor

```
Lunes 9am:
  abre electoral.goberna.club
  ve dashboard con sus 4 candidatos asignados
  
  Candidato A (Alcalde distrital Lima Norte):
  ├─ Leads fin de semana: +47 (warm: 12, hot: 5)
  ├─ Sentiment 7d: subiendo (+12%)
  ├─ Pauta CPL: $2.40 (objetivo $3.00) ✓
  ├─ Visitas brigadistas 7d: 89 / 120 plan
  └─ Deck listo para reunión 11am → click "abrir"
  
  Sistema pre-cargó:
    - Métricas frescas
    - Slide "leads top zones" con mapa actualizado
    - Slide "narrative tracker" con análisis Gemini
  
  Consultor:
    - retoca 3 frases en slide estratégico
    - agrega 1 párrafo en recomendaciones
    - publica
    - manda link al candidato por WhatsApp (vía bot Baileys)
```

### 5.3 Simplicidad como obsesión

Reglas de diseño para el panel consultor:
1. **0 clicks para ver el estado de un candidato** — al loguearse ya está todo
2. **Editar narrativa = click + escribir**, sin guardar manual (autosave)
3. **Publicar deck = 1 botón**, no wizard
4. **Métricas son lectura, no input** — el consultor nunca escribe un número
5. **Mobile-responsive** — el consultor revisa su panel desde el celular en tránsito

---

## 6. Cómo el sistema "crece" con cada campaña

### 6.1 Aprendizaje a nivel campaña

Cada campaña activa genera:
- Patrones de funnel (qué creativos convirtieron mejor)
- Mensajes de bot que funcionaron por demografía
- Zonas donde la pauta rindió más
- Tipos de visita brigadista con mejor outcome

Cada noche, un job analiza los snapshots y **actualiza templates internos**:
- Bot intent rules se ajustan
- Creativos sugeridos se reordenan por performance histórica
- Estrategias en deck templates se enriquecen

### 6.2 Aprendizaje a nivel plataforma

Cuando hay 10 campañas en paralelo, Gemini empieza a generar insights cross-campaña:
- "En campañas de alcaldía distrital, leads de 35-45 años convierten 2.3× más"
- "Pauta de video performa 18% mejor que estática en Lima Norte"
- "Visitas brigadista entre 6-8pm tienen 41% más outcomes positivos"

Estos insights aparecen como **recomendaciones automáticas** en el deck del consultor, atribuidas como "Goberna Intelligence dice…".

### 6.3 Deck templates evolutivos

`goberna-decks-consultor` empieza con 1 template estándar.
Después de 5 campañas exitosas, hay variantes especializadas:
- "Alcalde distrital con histórico negativo"
- "Diputado distrital primera postulación"
- "Senador con marca conocida"
- "Cierre de campaña en swing zone"

El consultor elige variante y el sistema pre-llena con los slides recomendados para ese contexto.

---

## 7. Riesgos y decisiones pendientes

### 7.1 Decisiones a tomar ya

1. **¿Schema multi-país desde día 1 o Perú-only?**
   - Recomendación: **multi-país con feature flag**. Agregar `country` y `geoCodeSystem` a tablas territoriales. No desarrollar Chile/México hasta tener Perú vendiendo.

2. **¿Las landings son por candidato (subdominios) o multi-candidato (paths)?**
   - Recomendación: **subdominio por candidato** (`luis.goberna.club`). Permite SEO independiente y branding personalizado. `nexus-platform` ya soporta multi-tenant.

3. **¿El bot WhatsApp es 1 instance por candidato o pool compartido?**
   - Recomendación: **1 instance por candidato**. Baileys ya soporta multi-instance (en goberna-crm). El número de WhatsApp es parte del branding del candidato.

4. **¿Los brigadistas son del candidato o de Goberna?**
   - Recomendación: **del candidato, pero capacitados por Goberna Escuela**. Tier upselling: paquete básico no incluye brigadistas, tier alto sí.

### 7.2 Riesgos operativos

1. **Baileys puede ser baneado por WhatsApp** — Plan B: WhatsApp Business API oficial (más caro pero estable). El abstraction `ChannelProvider` en goberna-crm ya prepara esta migración.

2. **Costo Gemini puede subir mucho con scale** — Plan B: clasificadores propios con embeddings + Gemini solo para casos ambiguos. Pipeline ya separa la lógica.

3. **Meta puede cerrar APIs de feeds** — Plan B: nexus-meta hace scraping fallback. No es trivial pero está diseñado para no depender 100% de API.

4. **Padrón llega tarde o nunca** — No bloqueante. El modelo bottom-up funciona sin padrón. Si llega, es enrichment.

### 7.3 Riesgos comerciales

1. **Convencer al primer cliente que pague antes de tener case studies** — Empezar con candidatos asociados a Goberna o consultores internos. Generar case studies primero.

2. **Consultores externos no quieren depender de plataforma** — Plan: el `goberna-decks-consultor` público y el MCP server abierto bajan la barrera. El consultor "lleva sus deck templates" entre clientes.

3. **Campañas son estacionales (cada 2-4 años por país)** — Modelo: hacer campañas permanentes para alcaldes/gobernadores en ejercicio (gestión, no campaña). El producto sirve para "comunicación política continua", no solo electoral.

---

## 8. Métricas de éxito MVP (90 días post-launch)

| Métrica | Target | Cómo se mide |
|---|---|---|
| Candidatos activos en plataforma | 5 | Login en últimos 7 días |
| Consultores onboardeados | 3 | Tienen al menos 1 candidato asignado |
| Leads capturados / campaña / mes | 500+ | Conteo en tabla `leads` |
| Conversión lead → visita | 30%+ | `visits` / `leads_warm_or_hot` |
| NPS consultor | 8+ | Survey en panel |
| Decks publicados / candidato / mes | 4+ | Snapshots con `published_at` |
| Uptime plataforma | 99.5% | Monitoring Grafana |
| Tiempo consultor preparando deck | <30 min | Self-reported |

---

## 9. Anti-objetivos (cosas que NO hacemos)

Para mantener foco:

1. **No competimos con plataformas USA (Numinar, VAN, NGP)** — mercado distinto, modelo distinto
2. **No construimos voter file** — esperar padrón sería paralizar 2 años
3. **No hacemos canvassing puerta-en-puerta a desconocidos** — la activación es a leads que ya levantaron la mano
4. **No reemplazamos a la agencia de comunicación del candidato** — somos plataforma, no creativos. Vendemos el dónde, no el qué decir
5. **No nos casamos con un proveedor cloud** — multi-VPS propio
6. **No prometemos "ganar elecciones"** — prometemos **medir y optimizar la operación** de la campaña. Ganar es del candidato

---

## 10. Estado al cierre 2026-05-13

- [x] Repos consolidados en Goberna-Lab (sync VPS1 ↔ org GitHub)
- [x] Onboarding cinematográfico live en `electoral.goberna.club` (commit `1e5f64b`)
- [x] Deck Fase 1/2 con inline editing funcionando
- [x] Mobile app v1.2.1 en stores
- [x] WhatsApp OTP unificado (login + join campaign)
- [x] Goberna Escuela funcional en `escuela.institutogoberna.com`
- [x] Vimeo thumbnails backfilled (1099 videos)
- [ ] Sprint 1 — Cimientos de datos (próximo)
- [ ] Sprint 2 — Lead pipeline unificado
- [ ] Sprint 3 — Mobile canvassing + SSE war room
- [ ] Sprint 4 — Deck retroalimentable con snapshots

---

## Apéndice A — Glosario rápido

- **Candidato** — persona que se postula a un cargo, cliente final del producto
- **Consultor** — operador del candidato, usuario power del panel
- **Brigadista** — voluntario o pagado que hace campo, usuario de la mobile
- **Lead** — persona que entró al sistema por algún funnel (Meta, landing, QR, bot)
- **Deck** — presentación viva del candidato, mezcla narrativa estática + métricas auto-fed
- **Snapshot** — fotografía diaria de métricas, base de los slides "vivos"
- **Funnel** — pauta Meta → landing → bot → lead → visita → conversión
- **Territory signals** — métricas histórico-electorales por ubigeo (de atlas-electoral)
- **Score** — propensión IA del lead (0-100) calculada con Gemini
- **Pauta** — gasto en publicidad Meta (FB/IG)

## Apéndice B — Referencias internas

- Arquitectura general: `docs/ARCHITECTURE.md`
- Roadmap legacy: `docs/ROADMAP.md`
- Deploy: `docs/DEPLOY.md`
- Auditoría servidor: `docs/informe-auditoria-servidor.md`
- Plan unificación CRMs: `docs/UNIFICATION_PLAN.md`
- Estrategia clasificación: `docs/CLASSIFICATION_STRATEGY.md`

## Apéndice C — Repos del ecosistema

Customer-facing:
- `Goberna-Lab/maquina-electoral-goberna` — este repo, producto central
- `Goberna-Lab/goberna-escuela` — LMS
- `Goberna-Lab/goberna-club` — directorio consultores
- `Goberna-Lab/goberna-crm` — CRM WhatsApp
- `Goberna-Lab/atlas-electoral` — dashboard ONPE
- `Goberna-Lab/certificaciones-goberna` — generador certificados PDF
- `Goberna-Lab/goberna-decks-consultor` — kit consultor (público)
- `Goberna-Lab/goberna-sites` — sites Astro tenants

Plataforma:
- `Goberna-Lab/nexus-platform` — engine Go multi-tenant
- `Goberna-Lab/nexus-control` — admin panel
- `Goberna-Lab/nexus-mail` + `nexus-mail-api` — Mailu stack
- `Goberna-Lab/nexus-vimeo` — videos
- `Goberna-Lab/nexus-meta` — Meta Ads sync
- `Goberna-Lab/goberna-monitoring` — observability

Builder:
- `Goberna-Lab/goberna-builder` — visual page builder
- `Goberna-Lab/goberna-builder-template` — template Astro

Legacy (a portar/cerrar):
- `Goberna-Lab/leads-crm-v2` — a portar a `goberna-crm`
- `Goberna-Lab/onboarding-goberna` — 413 MB, revisar

---

> Este documento se actualiza al cerrar cada sprint.
> Owner: Mila + Manuel Espinoza
> Última revisión: 2026-05-13
