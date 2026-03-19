# Goberna Blast v2 — Arquitectura de Mensajería Semi-Automatizada a Escala

> **Fecha:** 2026-03-19
> **Autor:** Arquitectura generada sobre código real de producción
> **Estado:** RFC (Request for Comments) — no implementado
> **Basado en:** Extension v9.3.0, 30 módulos backend, blast-panel.js (1,372 loc), spam-detector.js (340 loc)
> **Objetivo:** Escalar de 200 a 1000 msgs/día/número con 6 phones y 18 laptops

---

## Tabla de contenidos

1. [Arquitectura de alto nivel](#1-arquitectura-de-alto-nivel)
2. [Módulos detallados](#2-módulos-detallados)
   - 2.1 [Messaging Orchestration Engine](#21-messaging-orchestration-engine)
   - 2.2 [Chrome Extension Architecture v10](#22-chrome-extension-architecture-v10)
   - 2.3 [Multi-Operator Response System](#23-multi-operator-response-system)
   - 2.4 [Data Model (SQL)](#24-data-model-sql)
   - 2.5 [Contact Intelligence System](#25-contact-intelligence-system)
   - 2.6 [Analytics Dashboard](#26-analytics-dashboard)
3. [Anti-Detection Strategy](#3-anti-detection-strategy)
4. [Scaling Playbook](#4-scaling-playbook)
5. [Risks and Mitigation](#5-risks-and-mitigation)
6. [Tech Stack](#6-tech-stack)
7. [Implementation Priority](#7-implementation-priority)

---

## 1. Arquitectura de alto nivel

### 1.1 Diagrama del sistema completo

```
                              ┌─────────────────────────────┐
                              │    Cloudflare DNS Proxy      │
                              └──────────┬──────────────────┘
                                         │
                    ┌────────────────────┬┴────────────────────┐
                    │                    │                      │
                    ▼                    ▼                      ▼
          ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐
          │  Vercel (Next.js)│  │  VPS 161.132.39.x│  │  VPS (futuro)    │
          │  Dashboard Web   │  │  Fastify :3001    │  │  Worker de colas │
          │  - Command Center│  │  PostgreSQL :5432 │  │  (Phase 3+)      │
          │  - Analytics     │  │  Redis :6379      │  │                  │
          │  - Operator UI   │  │  Tegola :8080     │  │                  │
          └────────┬────────┘  └────────┬──────────┘  └──────────────────┘
                   │                     │
                   │     REST/SSE/WS     │
                   └──────────┬──────────┘
                              │
        ┌─────────────────────┼──────────────────────┐
        │                     │                       │
   ┌────┴────┐          ┌────┴────┐            ┌────┴────┐
   │ Laptops │          │ Laptops │            │ Laptops │
   │ 1-6     │          │ 7-12    │            │ 13-18   │
   │ ENVÍO   │          │ ENVÍO   │            │ RESPUESTA│
   │ blast   │          │ blast   │            │ inbox    │
   │ panel   │          │ panel   │            │ panel    │
   └────┬────┘          └────┬────┘            └────┬────┘
        │                     │                      │
   ┌────┴────┐          ┌────┴────┐            ┌────┴────┐
   │ Chrome  │          │ Chrome  │            │ Chrome  │
   │ Ext v10 │          │ Ext v10 │            │ Ext v10 │
   │ +WA Web │          │ +WA Web │            │ +WA Web │
   └────┬────┘          └────┬────┘            └────┬────┘
        │                     │                      │
   ┌────┴────┐          ┌────┴────┐            ┌────┴────┐
   │ Phone 1 │          │ Phone 2 │...         │ Phone 6 │
   │ WA Acct │          │ WA Acct │            │ WA Acct │
   └─────────┘          └─────────┘            └─────────┘
```

**Roles de laptops:**

| Rol | Cantidad | Función |
|---|---|---|
| **SENDER** | 6-12 | Ejecuta blast-panel, envía mensajes |
| **RESPONDER** | 6-12 | Atiende inbox, responde conversaciones |
| **COORDINATOR** | 1-2 | Dashboard web, monitorea todo |

### 1.2 Evolución vs. sistema actual

**Lo que ya existe y funciona (no reinventar):**

| Componente | Estado actual | Decisión v2 |
|---|---|---|
| `blast-panel.js` (1,372 loc) | Funcional: spintax, dedup, checkpoints, typing sim | **Evolucionar**, no reescribir |
| `spam-detector.js` (340 loc) | 5 checks, cooldowns, server-side Gemini | **Extender** con señales de reply rate |
| Segmentación `hashtext % N` | Determinística, sin overlap | **Mantener**, agregar rebalanceo dinámico |
| `blast_log` + `blast_number_config` | DDL dinámico en startup | **Migrar a SQL files**, agregar columnas |
| CMS lifecycle | nuevo → hablado → respondieron → archivado | **Extender** con estados de engagement |
| Conversations module | Owner assignment, AI classify | **Integrar** como fuente de reply tracking |
| Checkpoint system (block_id, 50 msgs) | Pausa hasta 50% reply rate | **Sofisticar** con múltiples métricas |

**Lo que falta y es el núcleo de v2:**

| Necesidad | Componente v2 |
|---|---|
| Orquestación multi-laptop | **Orchestration Engine** (nuevo módulo backend) |
| Operator assignment sin overlap | **Conversation Router** (evolución de CMS claim) |
| Escalado adaptivo 200 → 1000 | **Adaptive Rate Controller** (nuevo en extensión + backend) |
| Analytics operativos | **Blast Dashboard** (evolución de `/api/blast/dashboard`) |
| A/B testing de templates | **Template Engine** (evolución del spintax actual) |

---

## 2. Módulos detallados

### 2.1 Messaging Orchestration Engine

**Ubicación:** Nuevo módulo backend `src/modules/blast-orchestrator/`

El problema central: hoy cada `blast-panel.js` opera de forma independiente. No hay coordinación entre los 6 (o 12) laptops. El backend solo registra (`blast_log`) pero no orquesta.

#### State machine por número WA

```
                          ┌──────────────┐
                          │   DORMANT    │◄──────── Fuera de horario (20:01-07:59)
                          └──────┬───────┘          o domingo
                                 │ Horario válido
                                 ▼
                          ┌──────────────┐
               ┌─────────►│   WARMING    │          Primeros 30 min del día
               │          └──────┬───────┘          Envía 1 msg cada 2-5 min
               │                 │ Warmed
               │                 ▼
               │          ┌──────────────┐
               │   ┌─────►│   SENDING    │◄───┐    Estado normal de envío
               │   │      └──┬───┬───┬───┘    │
               │   │         │   │   │         │
               │   │    block│   │   │reply    │
               │   │    done │   │   │detected │
               │   │         ▼   │   ▼         │
               │   │  ┌──────┐   │  ┌────────┐ │
               │   │  │CHECK-│   │  │COOLING │ │    Checkpoints: cada 50 msgs
               │   │  │POINT │   │  │(micro  │ │    Cooling: micro-break 30-90s
               │   │  │(wait │   │  │ break) │ │
               │   │  │50%   │   │  │        │ │
               │   │  │reply)│   │  │        │ │
               │   │  └──┬───┘   │  └───┬───┘ │
               │   │     │ OK    │      │done  │
               │   │     └───────┼──────┘      │
               │   │             │             │
               │   │     risk    │             │
               │   │     high    │             │
               │   │             ▼             │
               │   │      ┌──────────────┐     │
               │   │      │   THROTTLED  │     │    spam-detector score > 45
               │   │      │  (60-180s)   │     │    o daily_limit - sent < 10%
               │   │      └──────┬───────┘     │
               │   │             │ cooldown     │
               │   └─────────────┘ done         │
               │                                │
               │          ┌──────────────┐      │
               └──────────│   PAUSED     │──────┘    Operador manual, o
                          │  (manual)    │           ban risk = critical
                          └──────────────┘
```

**Estados:**

| Estado | Descripción | Duración típica |
|---|---|---|
| `dormant` | Fuera de horario operativo | Noche, domingo |
| `warming` | Primeros 30 min, envío lento | 30 min |
| `sending` | Envío normal, respetando rate | Horas |
| `checkpoint` | Pausa tras 50 msgs, esperando replies | 1-30 min |
| `cooling` | Micro-break entre batches | 30-90 seg |
| `throttled` | Reducción forzada por riesgo | 1-3 min |
| `paused` | Detenido manual o por ban risk | Indefinido |

#### Implementación del state machine

```typescript
// blast-orchestrator/state-machine.ts

interface PhoneState {
  wa_number:      string;
  campaign_id:    string;
  state:          'dormant' | 'warming' | 'sending' | 'checkpoint'
                  | 'cooling' | 'throttled' | 'paused';

  // Counters (reset diario a las 00:00 UTC-5)
  sent_today:     number;
  failed_today:   number;
  replied_today:  number;
  no_wa_today:    number;

  // Rate control
  daily_limit:    number;     // Calculado dinámicamente
  hourly_limit:   number;     // daily_limit / 8 horas operativas
  current_block:  string;     // UUID del block actual
  block_sent:     number;     // Msgs enviados en block actual

  // Timing
  last_sent_at:    Date | null;
  warmup_start_at: Date | null;
  state_entered_at: Date;
  cooldown_until:  Date | null;

  // Health
  spam_score:      number;    // 0-100 del spam-detector
  reply_rate_7d:   number;    // % de respuestas últimos 7 días
  quality_rating:  'green' | 'yellow' | 'red';
}

// Transición de estado — el backend calcula, la extensión ejecuta
function computeNextState(current: PhoneState, signal: Signal): PhoneState {
  const now = new Date();
  const peruHour = getPeruHour(now);
  const dayOfWeek = getPeruDayOfWeek(now);

  // Regla 1: Horario operativo
  if (dayOfWeek === 0 || peruHour < 8 || peruHour >= 20) {
    return { ...current, state: 'dormant' };
  }
  if (dayOfWeek === 6 && (peruHour < 9 || peruHour >= 14)) {
    return { ...current, state: 'dormant' };
  }

  // Regla 2: Daily limit alcanzado
  if (current.sent_today >= current.daily_limit) {
    return { ...current, state: 'paused' };
  }

  // Regla 3: Spam risk crítico
  if (signal.type === 'spam_score_update' && signal.score >= 70) {
    return { ...current, state: 'throttled',
             cooldown_until: addSeconds(now, 180) };
  }

  // Regla 4: Checkpoint (cada 50 mensajes del block)
  if (current.block_sent >= 50 && current.state === 'sending') {
    return { ...current, state: 'checkpoint' };
  }

  // Regla 5: Warming (primeros 30 min)
  if (current.state === 'dormant' && signal.type === 'schedule_tick') {
    return { ...current, state: 'warming', warmup_start_at: now };
  }
  if (current.state === 'warming') {
    const warmingMinutes = diffMinutes(now, current.warmup_start_at!);
    if (warmingMinutes >= 30) {
      return { ...current, state: 'sending' };
    }
  }

  return current;
}
```

#### Daily limit calculation (adaptive)

Reemplaza el warmup lineal estático del `getNumberHealth()` actual:

```typescript
// blast-orchestrator/rate-controller.ts

function computeDailyLimit(phone: PhoneHealthData): number {
  const { warmup_day, reply_rate_7d, blocks_without_incident,
          reports_received, quality_rating } = phone;

  // Base: curva de warmup (más conservadora que la actual)
  const warmupCurve: Record<number, number> = {
    1: 20,   2: 40,   3: 60,   4: 80,   5: 100,
    6: 130,  7: 160,  8: 200,  9: 240,  10: 280,
    11: 320, 12: 360, 13: 400, 14: 450, 15: 500,
    16: 550, 17: 600, 18: 650, 19: 700, 20: 750,
    21: 800, 25: 900, 30: 1000,
  };

  // Interpolar entre puntos de la curva
  let base = interpolateWarmupCurve(warmupCurve, warmup_day);

  // Multiplicador por reply rate (indicador MÁS importante)
  if (reply_rate_7d >= 0.40) {
    base *= 1.20; // +20% bonus
  } else if (reply_rate_7d >= 0.25) {
    base *= 1.00; // neutral
  } else if (reply_rate_7d >= 0.15) {
    base *= 0.80; // -20% penalty
  } else {
    base *= 0.50; // -50% penalty — DANGER ZONE
  }

  // Penalidad por incidentes recientes
  if (reports_received > 0) {
    base *= Math.max(0.30, 1 - (reports_received * 0.15));
  }

  // Bonus por racha sin incidentes (>10 blocks seguidos)
  if (blocks_without_incident >= 10) {
    base *= 1.10;
  }

  // Cap absoluto
  return Math.min(Math.round(base), 1000);
}
```

#### Gating conditions — cuándo es seguro escalar

```typescript
interface ScaleGate {
  // TODAS deben ser true para subir el daily_limit
  reply_rate_7d_above:      0.25;    // >25% respuestas en 7 días
  spam_score_below:         30;      // Score < 30 (low risk)
  consecutive_days_healthy: 3;       // 3 días sin incidentes
  no_wa_rate_below:         0.15;    // <15% de números inválidos
  failed_rate_below:        0.05;    // <5% fallos de envío
  daily_limit_utilization:  0.85;    // Usó >85% del límite actual
}

function canScaleUp(phone: PhoneHealthData, gates: ScaleGate): boolean {
  return (
    phone.reply_rate_7d >= gates.reply_rate_7d_above &&
    phone.spam_score < gates.spam_score_below &&
    phone.consecutive_healthy_days >= gates.consecutive_days_healthy &&
    phone.no_wa_rate <= gates.no_wa_rate_below &&
    phone.failed_rate <= gates.failed_rate_below &&
    phone.utilization >= gates.daily_limit_utilization
  );
}
```

---

### 2.2 Chrome Extension Architecture v10

**Principio: evolucionar, no reescribir.** El código actual funciona. Los cambios son quirúrgicos.

#### Separación de concerns (evolución del layout actual)

```
extensions/wspp-store-tester/
  manifest.json                    ← v10.0.0, sin cambios de permisos
  content.js                       ← Bridge (589 lines, add 3 new msg types)

  src/
    shared/
      message-types.js             ← NUEVO: constantes tipadas (Phase 3.1 del roadmap)
      config.js                    ← NUEVO: constantes compartidas inject/bg

    inject/
      # UI Layer
      sidebar.js                   ← Existente (1,010 lines) — agregar tab "Inbox"
      blast-panel.js               ← Existente (1,372 lines) — refactor: extraer rate logic
      inbox-panel.js               ← NUEVO: panel de respuesta para operadores

      # Automation Layer
      wa-module-installer.js       ← Existente (479 lines) — sin cambios
      send-hook.js                 ← Existente (89 lines) — sin cambios
      template-analyzer.js         ← Existente (169 lines) — extender con A/B tracking

      # Data Layer
      bootstrap.js                 ← Existente (47 lines) — agregar operator_id
      jid-resolver.js              ← Existente (305 lines) — sin cambios

    background/
      # Orchestration Layer
      blast-orchestrator-client.js ← NUEVO: poll state machine del backend
      rate-limiter-local.js        ← NUEVO: enforcer local del daily_limit

      # Processing Layer (existente)
      sent-handler.js              ← Agregar: report a orchestrator
      received-handler.js          ← Agregar: notify reply to orchestrator
      spam-detector.js             ← Agregar: nueva señal de reply_rate

      # API Layer (existente)
      blast-handlers.js            ← Agregar: orchestrator endpoints
      api-client.js                ← Sin cambios (173 lines, retry + offline queue)
```

#### Message queue en la extensión

El `blast-panel.js` actual tiene una cola implícita (array de contacts + `_inFlight` lock). La evolución:

```javascript
// blast-panel.js — evolución del sistema de cola actual

class BlastQueue {
  constructor() {
    this._queue = [];           // ContactRow[]
    this._inFlight = new Set(); // phones being sent now
    this._sentSession = new Set(); // dedup within session
    this._retryQueue = [];      // failed msgs to retry (max 2 retries)
    this._maxRetries = 2;
    this._batchSize = 5;        // BULK_SIZE actual
  }

  enqueue(contacts) {
    for (const c of contacts) {
      const phone = c.phone?.replace(/\D/g, '');
      if (!phone || this._sentSession.has(phone)) continue;
      if (this._inFlight.has(phone)) continue;
      this._queue.push({ ...c, retryCount: 0, enqueuedAt: Date.now() });
    }
  }

  // Retry failed sends (network errors, not no_wa)
  requeue(contact, error) {
    if (contact.retryCount >= this._maxRetries) {
      this._reportFailed(contact, error);
      return;
    }
    this._retryQueue.push({
      ...contact,
      retryCount: contact.retryCount + 1,
      retryAfter: Date.now() + (contact.retryCount + 1) * 30_000 // 30s, 60s
    });
  }

  // Next batch: retries first, then fresh contacts
  nextBatch() {
    const now = Date.now();
    const batch = [];

    // Retries first (if cooldown passed)
    while (batch.length < this._batchSize && this._retryQueue.length > 0) {
      const next = this._retryQueue[0];
      if (next.retryAfter > now) break;
      batch.push(this._retryQueue.shift());
    }

    // Then fresh contacts
    while (batch.length < this._batchSize && this._queue.length > 0) {
      batch.push(this._queue.shift());
    }

    // Mark in-flight
    for (const c of batch) this._inFlight.add(c.phone);

    return batch;
  }

  complete(phone, status) {
    this._inFlight.delete(phone);
    if (status === 'sent') this._sentSession.add(phone);
  }
}
```

#### Failure detection (evolución)

El sistema actual tiene `_failCount` con circuit breaker (3 fails → stop), `USyncQuery` pre-check, y spam detector con 5 checks. Se agrega:

```javascript
// Failure categories (señales nuevas)
const FAILURE_SIGNALS = {
  // WA Web disconnection (session drop)
  WA_DISCONNECTED: {
    detect: () => !document.querySelector('[data-testid="chat-list"]'),
    action: 'PAUSE_AND_ALERT',
    cooldown: 300_000, // 5 min
  },

  // DOM structure changed (WA deploy)
  DOM_STALE: {
    detect: () => {
      try {
        window.require('WAWebSendMsgChatAction');
        return false;
      } catch { return true; }
    },
    action: 'STOP_AND_ALERT', // Requiere update de extensión
    cooldown: Infinity,
  },

  // Message stuck (sent but no ACK in 60s)
  ACK_TIMEOUT: {
    detect: (msg) => msg.sentAt && Date.now() - msg.sentAt > 60_000 && msg.ack === 0,
    action: 'THROTTLE',
    cooldown: 120_000,
  },

  // Rapid consecutive failures (3 in 1 minute)
  BURST_FAILURES: {
    detect: (failLog) => failLog.filter(f => Date.now() - f.ts < 60_000).length >= 3,
    action: 'PAUSE_AND_ALERT',
    cooldown: 300_000,
  },
};
```

#### Performance: MutationObserver strategy

El `wa-module-installer.js` actual usa `MsgCollection.on('add', cb)` (Backbone events, no DOM). Esto es correcto y eficiente.

Donde SÍ hay DOM observation y riesgo de memory leaks:

```javascript
// Reglas de performance para v10:
// 1. NUNCA MutationObserver sin disconnect() en cleanup
// 2. NUNCA observar body entero — siempre target específico
// 3. SIEMPRE { subtree: false } cuando sea posible
// 4. Rate-limit callbacks con requestIdleCallback

function createSafeObserver(target, callback, options) {
  let pending = false;
  const observer = new MutationObserver((mutations) => {
    if (pending) return;
    pending = true;
    requestIdleCallback(() => {
      callback(mutations);
      pending = false;
    }, { timeout: 500 });
  });

  observer.observe(target, options);

  // Auto-disconnect if target removed from DOM
  const parentObserver = new MutationObserver(() => {
    if (!document.contains(target)) {
      observer.disconnect();
      parentObserver.disconnect();
    }
  });
  parentObserver.observe(document.body, { childList: true, subtree: true });

  return observer;
}
```

---

### 2.3 Multi-Operator Response System

**Problema actual:** El CMS tiene `claimContact` (deprecated) y `cms_claimed_by`, pero no hay routing real de conversaciones a operadores. El blast envía, los replies llegan, y nadie sabe quién los atiende.

#### Modelo de asignación

```
                    Blast sends message
                           │
                           ▼
                    Contact replies
                           │
                           ▼
              ┌────────────────────────┐
              │  Conversation Router   │
              │  (nuevo en backend)    │
              └────────┬───────────────┘
                       │
           ┌───────────┼───────────────┐
           │           │               │
      ┌────┴────┐ ┌────┴────┐   ┌────┴────┐
      │ Op. A   │ │ Op. B   │   │ Op. C   │
      │ Load: 3 │ │ Load: 5 │   │ Load: 1 │  ← Least-loaded wins
      └─────────┘ └─────────┘   └─────────┘
```

#### Conversation locking (evolución del CMS claim)

```typescript
// blast-orchestrator/conversation-router.ts

interface ConversationAssignment {
  conversation_id: string;
  jid:             string;
  wa_number:       string;
  assigned_to:     string;    // user_id del operador
  assigned_at:     Date;
  locked_until:    Date;      // Lock timeout (15 min)
  status:          'pending' | 'active' | 'resolved';
}

// Algoritmo: Weighted Least Connections
function assignConversation(
  conversationJid: string,
  waNumber: string,
  operators: OperatorStatus[],
  campaignId: string
): string {
  // 1. Filtrar operadores online y en el mismo wa_number
  const eligible = operators.filter(op =>
    op.is_online &&
    op.assigned_wa_numbers.includes(waNumber) &&
    op.active_conversations < op.max_concurrent  // default: 8
  );

  if (eligible.length === 0) {
    // Fallback: cualquier operador online del campaign
    const fallback = operators.filter(op => op.is_online);
    if (fallback.length === 0) throw new Error('NO_OPERATORS_ONLINE');
    return fallback
      .sort((a, b) => a.active_conversations - b.active_conversations)[0]
      .user_id;
  }

  // 2. Sticky: si el operador ya habló con este contacto, priorizar
  const previous = eligible.find(op =>
    op.previous_contacts.has(conversationJid)
  );
  if (previous && previous.active_conversations < previous.max_concurrent) {
    return previous.user_id;
  }

  // 3. Least-loaded
  return eligible
    .sort((a, b) => {
      const loadA = a.active_conversations / a.max_concurrent;
      const loadB = b.active_conversations / b.max_concurrent;
      return loadA - loadB;
    })[0].user_id;
}

// Lock timeout: si el operador no responde en 15 min, liberar
async function releaseExpiredLocks(campaignId: string): Promise<number> {
  const result = await pool.query(`
    UPDATE blast_operator_assignments
    SET status = 'pending', assigned_to = NULL
    WHERE campaign_id = $1
      AND status = 'active'
      AND locked_until < NOW()
    RETURNING conversation_id
  `, [campaignId]);

  return result.rowCount ?? 0;
}
```

#### Inbox panel (nuevo panel en la extensión)

```javascript
// inject/inbox-panel.js

class InboxPanel {
  constructor() {
    this._assignments = [];
    this._pollInterval = 15_000;
    this._operatorId = getOperatorId();
  }

  async init() {
    await this._loadAssignments();
    this._startPolling();
    this._listenSSE(); // SSE de /api/cms/stream ya existe
    this._renderInbox();
  }

  async _loadAssignments() {
    return new Promise((resolve) => {
      window.postMessage({
        type: 'INBOX_GET_ASSIGNMENTS',
        operator_id: this._operatorId
      }, WA_ORIGIN);

      const handler = (ev) => {
        if (ev.data?.type === 'INBOX_ASSIGNMENTS_READY') {
          this._assignments = ev.data.assignments;
          this._renderInbox();
          window.removeEventListener('message', handler);
          resolve();
        }
      };
      window.addEventListener('message', handler);
    });
  }

  _renderInbox() {
    // Lista de conversaciones asignadas
    // Cada una muestra: nombre, último mensaje, tiempo desde reply, badge prioridad
    // Click → abre chat via WAWebFindChatAction.findOrCreateLatestChat()
    // Operador escribe respuesta naturalmente en WA Web
    // Extension auto-detecta reply via MsgCollection.on('add') → marca resolved
  }

  async _onOperatorReplied(jid) {
    window.postMessage({
      type: 'INBOX_MARK_REPLIED',
      jid: jid,
      operator_id: this._operatorId,
    }, WA_ORIGIN);
  }
}
```

#### Operator dashboard UX (Next.js web)

```
┌─────────────────────────────────────────────────────────┐
│  COMMAND CENTER — Campaña: Cesar Vasquez 2026           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─── ENVÍO ──────────────────────────────────────────┐ │
│  │ Cel 1: ████████░░ 342/500  reply:38%  🟢 sending  │ │
│  │ Cel 2: ██████░░░░ 287/500  reply:42%  🟢 sending  │ │
│  │ Cel 3: ████████████ 500/500  reply:35%  ⏸ paused  │ │
│  │ Cel 4: █████░░░░░ 210/400  reply:28%  🟡 throttle │ │
│  │ Cel 5: ████████░░ 380/500  reply:41%  🟢 sending  │ │
│  │ Cel 6: ███████░░░ 315/500  reply:33%  🟢 sending  │ │
│  │                                                     │ │
│  │ Total hoy: 2,034 enviados | 712 replies (35%)      │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─── OPERADORES ─────────────────────────────────────┐ │
│  │ María L.   🟢 Online  Conv: 5/8  Avg resp: 2.3m   │ │
│  │ Carlos P.  🟢 Online  Conv: 7/8  Avg resp: 1.8m   │ │
│  │ Ana G.     🟢 Online  Conv: 3/8  Avg resp: 4.1m   │ │
│  │ Pedro M.   🔴 Offline Conv: 0/8  Last: 14:32      │ │
│  │ ... (14 más)                                        │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─── ALERTAS ────────────────────────────────────────┐ │
│  │ ⚠️  Cel 4: reply rate <30%, throttled a 400/día   │ │
│  │ ℹ️  Template "saludo_v2" tiene 45% reply vs 32%   │ │
│  │ ✅ Cel 3 completó cuota diaria sin incidentes     │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

### 2.4 Data Model (SQL)

Evolución del schema actual. Respeta las tablas existentes (`blast_log`, `blast_number_config`, `conversations`, `form_submissions`) y agrega lo necesario.

#### Migración: `040_blast_v2.sql`

```sql
-- 040_blast_v2.sql
-- Blast v2: Orchestration, operator assignment, A/B templates, engagement tracking

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Extend blast_number_config with orchestration fields
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE blast_number_config
  ADD COLUMN IF NOT EXISTS state            text NOT NULL DEFAULT 'dormant',
  ADD COLUMN IF NOT EXISTS daily_limit      int  NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS sent_today       int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS replied_today    int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_today     int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS no_wa_today      int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spam_score       int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reply_rate_7d    real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quality_rating   text NOT NULL DEFAULT 'green',
  ADD COLUMN IF NOT EXISTS state_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS counters_reset_at date NOT NULL DEFAULT CURRENT_DATE;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Extend blast_log with template tracking and reply tracking
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE blast_log
  ADD COLUMN IF NOT EXISTS template_id       text,
  ADD COLUMN IF NOT EXISTS template_variant  text,
  ADD COLUMN IF NOT EXISTS reply_received    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reply_at          timestamptz,
  ADD COLUMN IF NOT EXISTS reply_latency_s   int;

CREATE INDEX IF NOT EXISTS idx_blast_log_reply
  ON blast_log(campaign_id, wa_number, reply_received)
  WHERE reply_received = true;

CREATE INDEX IF NOT EXISTS idx_blast_log_template
  ON blast_log(campaign_id, template_id, template_variant);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Operator assignments (conversation routing)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS blast_operator_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES campaigns(id),
  conversation_id uuid REFERENCES conversations(id),
  jid             text NOT NULL,
  wa_number       text NOT NULL,
  assigned_to     uuid REFERENCES users(id),
  status          text NOT NULL DEFAULT 'pending',
  assigned_at     timestamptz DEFAULT now(),
  locked_until    timestamptz DEFAULT now() + interval '15 minutes',
  resolved_at     timestamptz,
  reply_count     int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blast_op_assign_operator
  ON blast_operator_assignments(campaign_id, assigned_to, status);

CREATE INDEX IF NOT EXISTS idx_blast_op_assign_jid
  ON blast_operator_assignments(campaign_id, jid);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Operator status (heartbeat)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS blast_operator_status (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES campaigns(id),
  user_id         uuid NOT NULL REFERENCES users(id),
  wa_number       text,
  role            text NOT NULL DEFAULT 'responder',
  is_online       boolean NOT NULL DEFAULT false,
  last_heartbeat  timestamptz NOT NULL DEFAULT now(),
  active_conversations int NOT NULL DEFAULT 0,
  max_concurrent  int NOT NULL DEFAULT 8,
  avg_response_ms int,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, user_id)
);

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Template A/B testing
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS blast_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES campaigns(id),
  template_id     text NOT NULL,
  variant         text NOT NULL DEFAULT 'A',
  body            text NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  weight          real NOT NULL DEFAULT 1.0,

  -- Metrics (updated by cron)
  sent_count      int NOT NULL DEFAULT 0,
  reply_count     int NOT NULL DEFAULT 0,
  reply_rate      real NOT NULL DEFAULT 0,

  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, template_id, variant)
);

-- ═══════════════════════════════════════════════════════════════════════
-- 6. Engagement scoring on voter_profiles
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE voter_profiles
  ADD COLUMN IF NOT EXISTS engagement_score    real DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engagement_tier     text DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS blast_contacted     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS blast_replied       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS blast_converted     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS blast_contact_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_blast_at       timestamptz;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. Daily phone metrics (for 7-day rolling analytics)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS blast_daily_metrics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES campaigns(id),
  wa_number       text NOT NULL,
  metric_date     date NOT NULL DEFAULT CURRENT_DATE,
  sent            int NOT NULL DEFAULT 0,
  delivered       int NOT NULL DEFAULT 0,
  replied         int NOT NULL DEFAULT 0,
  failed          int NOT NULL DEFAULT 0,
  no_wa           int NOT NULL DEFAULT 0,
  avg_reply_time_s int,
  spam_score_max  int NOT NULL DEFAULT 0,
  quality_rating  text NOT NULL DEFAULT 'green',
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, wa_number, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_blast_daily_metrics_range
  ON blast_daily_metrics(campaign_id, wa_number, metric_date DESC);
```

#### Entity-Relationship

```
campaigns (1) ──── (N) blast_number_config
    │                       │
    │                       │ wa_number ──── blast_log.wa_number
    │                       │ wa_number ──── blast_daily_metrics.wa_number
    │                       │
    │               (N) blast_templates (A/B variants per campaign)
    │
    ├──── (N) form_submissions ←── Source of contacts (data->>'telefono')
    │             │
    │             │ id FK ──── blast_log.contact_id
    │             │ CMS status: nuevo → hablado → respondieron → archivado
    │
    ├──── (N) conversations ←── Created when WA chat happens
    │             │
    │             │ id FK ──── blast_operator_assignments.conversation_id
    │             │ owner ──── First operator who interacted
    │
    ├──── (N) voter_profiles ←── Engagement score, conversion tracking
    │
    ├──── (N) blast_operator_status ←── Heartbeat per operator
    │             │
    │             │ user_id ──── blast_operator_assignments.assigned_to
    │
    └──── (N) users ←── Operators, coordinators
```

---

### 2.5 Contact Intelligence System

El sistema actual tiene piezas dispersas:
- `conversation-scorer.js` (617 lines) — score temporal en memory del service worker
- `conversations.repository.ts` — AI classify (Gemini: duro/blando/flotante)
- `form_submissions.cms_status` — lifecycle básico
- `voter_profiles` — created by conversations module, has WA counters

**Unificación en v2:**

```typescript
// blast-orchestrator/contact-intelligence.ts

interface ContactLifecycle {
  phone:            string;
  campaign_id:      string;

  // Stage tracking
  stage: 'new' | 'contacted' | 'replied' | 'engaged' | 'converted' | 'churned';
  stage_entered_at: Date;

  // Engagement signals
  blast_count:      number;
  reply_count:      number;
  avg_reply_time_s: number;
  last_contacted:   Date;
  last_replied:     Date | null;

  // Classification (from Gemini + conversation-scorer)
  vote_class: 'duro' | 'blando' | 'flotante' | 'invalido' | null;
  confidence: number;    // 0-1

  // Engagement score (0-100)
  score: number;
}

// Stage transitions (automatic based on events)
const STAGE_TRANSITIONS = {
  'new': (c, ev) => {
    if (ev.type === 'blast_sent') return 'contacted';
    return 'new';
  },
  'contacted': (c, ev) => {
    if (ev.type === 'reply_received') return 'replied';
    if (c.blast_count >= 3 && c.reply_count === 0) return 'churned';
    return 'contacted';
  },
  'replied': (c, ev) => {
    if (c.reply_count >= 2 && c.avg_reply_time_s < 3600) return 'engaged';
    return 'replied';
  },
  'engaged': (c, ev) => {
    if (ev.type === 'manual_convert') return 'converted';
    if (daysSince(c.last_replied) > 14) return 'churned';
    return 'engaged';
  },
};
```

#### Engagement score calculation

```typescript
function computeEngagementScore(c: ContactLifecycle): number {
  let score = 0;

  // Reply behavior (max 40 points)
  if (c.reply_count > 0)  score += 15;
  if (c.reply_count >= 2) score += 10;
  if (c.reply_count >= 5) score += 15;

  // Response speed (max 25 points)
  if (c.avg_reply_time_s < 300)       score += 25;  // <5 min
  else if (c.avg_reply_time_s < 3600) score += 15;  // <1 hour
  else if (c.avg_reply_time_s < 86400) score += 5;  // <1 day

  // Recency (max 20 points)
  const daysSinceReply = c.last_replied
    ? (Date.now() - c.last_replied.getTime()) / 86400000
    : Infinity;
  if (daysSinceReply < 1)       score += 20;
  else if (daysSinceReply < 3)  score += 15;
  else if (daysSinceReply < 7)  score += 10;
  else if (daysSinceReply < 14) score += 5;

  // Vote classification bonus (max 15 points)
  if (c.vote_class === 'duro')       score += 15;
  else if (c.vote_class === 'blando') score += 10;
  else if (c.vote_class === 'flotante') score += 5;

  return Math.min(score, 100);
}
```

---

### 2.6 Analytics Dashboard

**Endpoint:** `GET /api/blast/dashboard` (evolución del existente)

```typescript
interface BlastDashboardV2 {
  // Per-phone status (ya existe parcialmente)
  phones: Array<{
    wa_number:      string;
    label:          string;
    state:          PhoneState;
    sent_today:     number;
    daily_limit:    number;
    reply_rate:     number;
    quality:        'green' | 'yellow' | 'red';
    warmup_day:     number;
    can_scale:      boolean;
    next_milestone: number;
  }>;

  // Aggregate metrics
  totals: {
    sent_today:      number;
    replied_today:   number;
    reply_rate:      number;
    conversion_rate: number;
    avg_reply_time:  string;   // "2m 34s"
  };

  // Operator performance
  operators: Array<{
    user_id:               string;
    name:                  string;
    is_online:             boolean;
    active_conversations:  number;
    avg_response_time_s:   number;
    resolved_today:        number;
  }>;

  // Template A/B results
  templates: Array<{
    template_id: string;
    variant:     string;
    sent:        number;
    replied:     number;
    reply_rate:  number;
    is_winner:   boolean;
  }>;

  // Risk indicators
  alerts: Array<{
    level:      'info' | 'warning' | 'critical';
    phone:      string | null;
    message:    string;
    action:     string;
    created_at: Date;
  }>;

  // Historical trends (7 days)
  daily_trend: Array<{
    date:       string;
    sent:       number;
    replied:    number;
    failed:     number;
    reply_rate: number;
  }>;
}
```

**Real-time:** El CMS SSE endpoint (`/api/cms/stream`) ya existe. Se agrega:

```
Event types nuevos en el SSE stream:
  blast:phone_state_change   — cuando un phone cambia de estado
  blast:reply_received       — cuando llega reply a un blast contact
  blast:operator_assignment  — cuando se asigna una conversación
  blast:alert                — cuando se detecta un riesgo
```

#### A/B Testing

```typescript
// Template selection con weighted random determinístico
function selectTemplate(
  templates: BlastTemplate[],
  contactPhone: string
): BlastTemplate {
  const active = templates.filter(t => t.is_active);
  if (active.length <= 1) return active[0];

  // Determinístico: mismo contacto = mismo template siempre
  const hash = hashText(contactPhone);
  const totalWeight = active.reduce((sum, t) => sum + t.weight, 0);
  let roll = (Math.abs(hash) % 1000) / 1000 * totalWeight;

  for (const t of active) {
    roll -= t.weight;
    if (roll <= 0) return t;
  }

  return active[active.length - 1];
}

// Significancia estadística (chi-squared approximation)
function isWinner(a: TemplateStats, b: TemplateStats): boolean {
  if (a.sent < 100 || b.sent < 100) return false; // Not enough data

  const rateA = a.reply_count / a.sent;
  const rateB = b.reply_count / b.sent;
  const pooled = (a.reply_count + b.reply_count) / (a.sent + b.sent);
  const se = Math.sqrt(pooled * (1 - pooled) * (1/a.sent + 1/b.sent));
  const z = Math.abs(rateA - rateB) / se;

  return z > 1.96; // 95% confidence
}
```

---

## 3. Anti-Detection Strategy

### 3.1 Reglas absolutas (violar cualquiera = ban probable)

| Regla | Detalle | Estado en v1 |
|---|---|---|
| Nunca mismo texto a >3 destinatarios seguidos | Spintax obligatorio, min 4 variantes por segmento | Implementado (spintax con hash determinístico) |
| Nunca >20 msgs nuevos por minuto | spam-detector burst check | Implementado (12/min=warning, 20/min=critical) |
| Nunca fuera de horario "natural" | Mon-Fri 8-20h, Sat 9-14h, Sun OFF (Peru UTC-5) | Implementado en blast-panel.js |
| Nunca sin typing indicator previo | `sendChatStateComposing()` + delay proporcional | Implementado (30ms/char, 800-4000ms) |
| Nunca enviar a números sin WhatsApp | USyncQuery pre-check | Implementado en blast-panel.js |
| Nunca >50% msgs sin respuesta en un block | Checkpoint system | Implementado (block_id, 50 msgs) |

**Nuevas reglas para v2:**

| Regla | Detalle |
|---|---|
| Jitter en inicio de día | +-15 min aleatorios al entrar en WARMING |
| Cache de USyncQuery | Resultados válidos por 24h, no re-checkear |
| Umbral dinámico de checkpoint | Basado en warmup_day (día 1: 60% reply, día 30: 40%) |
| Session breaks | 15-30 min cada 2 horas (simula que el operador fue al café) |
| Min 8 variantes por template | Con 3+ segmentos de spintax por variante |

### 3.2 Reglas de escalado (violar = riesgo acumulativo)

| Regla | Valor actual | Valor escalado (>500/día) |
|---|---|---|
| Delay mínimo entre msgs | 10-22s (Gaussian, sigma=4s) | 8-15s (solo si reply >35%) |
| Micro-breaks | 30-90s cada 3-7 msgs | Sin cambios |
| Macro-breaks | 3-5 min cada 25 msgs | 2-7 min (log-normal) cada 30 msgs |
| Session breaks | No implementado | 15-30 min cada 2h |
| Warming diario | No implementado | 30 min de 1 msg cada 2-5 min |

### 3.3 Señales de peligro a monitorear

| Señal | Umbral | Acción |
|---|---|---|
| Reply rate <15% en últimas 100 msgs | 15% | THROTTLE 50% |
| 3+ msgs seguidos sin ACK (pending) | 3 | PAUSE 5 min |
| no_wa rate >20% en un block | 20% | Cambiar segmento, lista sucia |
| Tiempo de ACK promedio subió 3x | 3x baseline | WA throttleando, REDUCIR |
| Operador reporta "banned" | 1 | PARAR inmediatamente, no reintentar 24h |

### 3.4 Message variation system

Evolución del spintax actual:

```javascript
// Template con spintax mejorado
const TEMPLATE_EXAMPLE = {
  id: "saludo_v2",
  variant: "A",
  body: `[Hola|Buenos días|Buenas tardes|Qué tal] {nombre},

[Te escribo|Me comunico|Le escribo] porque [queremos conocer tu opinión|nos interesa saber qué piensas|tu voz es importante para nosotros] sobre [los cambios en {distrito}|lo que está pasando en tu zona|las propuestas para {distrito}].

[¿Podemos conversar un momento?|¿Tienes un minuto para charlar?|¿Me permites hacerte unas preguntas?|¿Qué opinas?]
---
[Soy {operador} del equipo de {candidato}|Formo parte del equipo de {candidato}|Trabajo con {candidato} en la zona de {distrito}]`,

  variables: {
    nombre:    "data->>'nombre'",
    distrito:  "data->>'distrito'",
    operador:  "assigned_operator_name",
    candidato: "campaign.candidate_name"
  }
};

// Resolver determinístico (mismo contacto = mismo resultado siempre)
function resolveSpintax(template, contactPhone) {
  const seed = hashCode(contactPhone);
  let optionIndex = 0;

  return template.replace(/\[([^\]]+)\]/g, (match, options) => {
    const choices = options.split('|');
    const idx = Math.abs(seed + optionIndex++) % choices.length;
    return choices[idx].trim();
  });
}
```

### 3.5 Warm-up strategy por número

```
Fase 1: NURSERY (Día 1-3)
  - 20-60 msgs/día
  - Solo contactos con alta probabilidad de responder
  - Delay largo: 20-40s entre mensajes
  - 1 template simple, sin links, sin media
  - Objetivo: establecer baseline de reply rate

Fase 2: GROWTH (Día 4-10)
  - 80-200 msgs/día (subir 30% por día si gates OK)
  - Mezclar contactos buenos con medianos
  - Delay medio: 12-25s
  - 2-3 templates en A/B test
  - Agregar media ocasional (1 de cada 10 msgs)
  - Objetivo: encontrar el template ganador

Fase 3: CRUISING (Día 11-20)
  - 200-500 msgs/día
  - Todo el segmento del número
  - Delay normal: 10-20s
  - Template ganador como principal (70% traffic)
  - Checkpoints activos (pausa si reply <25%)
  - Objetivo: velocidad sostenible

Fase 4: SCALED (Día 21+)
  - 500-1000 msgs/día (solo si reply_rate_7d >30%)
  - SPLIT: 2 laptops por número (1 envía, 1 responde)
  - Delay ajustado: 8-15s (permitido por alta reply rate)
  - Macro-breaks más largos (5-10 min cada 30 msgs)
  - Session breaks obligatorios (20 min cada 2h)
  - Monitoreo continuo: rollback a 500 si metrics caen
```

---

## 4. Scaling Playbook

### 4.1 Progresión semanal 200 → 1000

#### Semana 1: BASELINE (200 msgs/día/número = 1,200 total)

```
Setup:
  - 6 phones con WA Web
  - 6 laptops (1 sender per phone)
  - 0-6 responders (los senders responden cuando no envían)

Gates para avanzar:
  ✓ Reply rate >25% por 3 días consecutivos
  ✓ 0 bans
  ✓ no_wa rate <15%
  ✓ Todos los phones en quality 'green'
```

#### Semana 2: STEP-UP (300 msgs/día/número = 1,800 total)

```
Cambios:
  - Daily limit +50% para phones que pasaron gates
  - Agregar 6 laptops como responders dedicados

Gates para avanzar:
  ✓ Mismos que semana 1
  ✓ Operator response time <5 min promedio
  ✓ No throttle events en 48h
```

#### Semana 3: GROW (500 msgs/día/número = 3,000 total)

```
Cambios:
  - Daily limit +67%
  - 12 laptops: 6 senders + 6 responders
  - Agregar A/B testing
  - Session breaks obligatorios

Gates para avanzar:
  ✓ Reply rate >30% (con más volumen)
  ✓ 0 bans en semanas 1-3
  ✓ Template ganador identificado (p<0.05)
```

#### Semana 4-5: SCALE (700-1000 msgs/día/número = 4,200-6,000 total)

```
Cambios:
  - 18 laptops: 6 senders + 12 responders
  - Delays reducidos (8-15s) solo para phones con reply >35%
  - Rollback automático si reply cae bajo 25%
```

### 4.2 Rollback triggers

```typescript
const ROLLBACK_TRIGGERS = [
  {
    condition: 'reply_rate_24h',
    threshold: 0.15,        // Below 15%
    window_hours: 24,
    action: 'reduce_50',    // Cut daily limit by 50%
  },
  {
    condition: 'ban_detected',
    threshold: 1,
    window_hours: 1,
    action: 'pause_phone',  // Stop the specific phone
  },
  {
    condition: 'spam_score_sustained',
    threshold: 50,           // >50 for >1h
    window_hours: 1,
    action: 'reduce_30',
  },
  {
    condition: 'ack_failure_rate',
    threshold: 0.10,         // >10% no-ACK
    window_hours: 2,
    action: 'pause_phone',
  },
  {
    condition: 'operator_overload',
    threshold: 0.90,         // >90% capacity all operators
    window_hours: 0.5,
    action: 'reduce_30',     // Slow sending so operators catch up
  },
];
```

**Ejecución automática:** cron cada 5 minutos evalúa triggers y ejecuta rollback + notifica al coordinator.

### 4.3 Rollback manual de emergencia

```
Si un phone es baneado:
  1. PARAR inmediatamente ese phone (state → paused)
  2. NO reintentar con ese número por 7 días mínimo
  3. Reasignar el segmento de contactos a otro phone (si hay spare)
  4. Reducir daily_limit de TODOS los phones un 20% por precaución
  5. Auditar: ¿qué template se usaba? ¿reply rate del phone? ¿cuántos días de warmup tenía?
  6. Documentar en blast_daily_metrics con quality_rating = 'red'
```

---

## 5. Risks and Mitigation

### 5.1 Riesgos técnicos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| **WA Web DOM change** (module rename) | ALTA (mensual) | Blast se detiene | `_requireAny()` con 2-4 fallback names. Scan 9 diagnostic. Health badge alert. |
| **WA account ban** | MEDIA | 1 phone down | Warmup strategy, reply rate gating, rollback triggers. Spare phone ready. No retry 7 días. |
| **Service Worker eviction** (MV3) | MEDIA | Estado perdido | Todo persistido en `chrome.storage.session`. Scorer bootstrap desde backend. Queue en storage. |
| **Operator conflict** (double reply) | BAJA | Mal UX | Conversation locking 15-min timeout. SSE broadcast lock/unlock. Optimistic UI con conflict detection. |
| **Network interruption** (Perú) | ALTA | Queue se frena | `api-client.js` ya tiene offline queue (173 lines). Retry exponential backoff. Local queue en storage. |
| **Backend downtime** | BAJA | Extensión autónoma | Modo degradado: enviar desde local queue, reportar cuando backend vuelva. 5-min offline tolerance. |

### 5.2 Riesgos operativos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| **Operators go offline** | ALTA | Replies sin atender | Lock timeout libera. Alert en dashboard. Auto-reduce send rate si <50% operators online. |
| **Template fatigue** | MEDIA | Reply rate baja | A/B testing min 100 sends/variant. Winner detection automático. Rotación semanal. |
| **Contact list exhaustion** | MEDIA | No más targets | Re-engage 'contacted-no-reply' tras 7 días con otro template. QR leads para nuevos. |
| **Coordinator burnout** | MEDIA | Sin supervisión | Alerts accionables: cada alerta tiene una acción específica. Rollbacks automáticos. |

### 5.3 Riesgos de integridad de datos

| Riesgo | Mitigación |
|---|---|
| **Duplicate sends** (mismo contacto, mismo número) | Triple dedup: session Set + chrome.storage + `idx_blast_log_unique_send` UNIQUE index |
| **Cross-number duplicate** (contacto enviado por Phone 1 Y Phone 2) | Segmentación determinística `hashtext(phone) % N`. Cada contacto va a exactamente 1 phone. |
| **Lost blast reports** (extensión crashea antes de reportar) | Pending reports en `chrome.storage.local`. Al recargar, flush al backend. |
| **Orphaned conversations** (reply llega, nadie asignado) | Cron cada minuto: encontrar conversations con `status='pending'` sin assignment. Auto-asignar. |

---

## 6. Tech Stack

### 6.1 Stack confirmado (mantener)

| Capa | Tecnología | Versión | Notas |
|---|---|---|---|
| Backend | Fastify + Bun + TypeScript | 5.6 / 5.9 | 30 módulos, battle-tested |
| Database | PostgreSQL + PostGIS | 15 + 3.4 | Agregar tablas, no servicios nuevos |
| Cache/Queue | Redis Streams | 7.4 (noeviction) | Usar para orchestrator state pub/sub |
| Real-time (web) | SSE `/api/cms/stream` | Existente | Extender con blast events |
| Real-time (ext) | `chrome.runtime.onMessage` | MV3 | Agregar orchestrator polling c/30s |
| Extension build | esbuild IIFE | MV3 | Sin cambios de bundler |
| Web dashboard | Next.js + TanStack Query | 16 / 5.x | Agregar `/blast-command-center` |
| Deployment | Docker Compose on VPS | Existente | Agregar cron container si necesario |

### 6.2 Lo que explícitamente NO recomiendo

| Opción | Razón para rechazarla |
|---|---|
| WebSocket para dashboard | SSE es más simple, ya funciona, unidireccional es suficiente |
| Microservicio separado para orchestration | 1 módulo en Fastify existente alcanza, menor complejidad |
| RabbitMQ / BullMQ | Redis Streams ya disponible, menor complejidad operativa |
| Rewrite extensión en TypeScript | 1,372 líneas de blast-panel funcionan, TS agrega build complexity para browser globals |
| Puppeteer / Playwright headless WA | Detectado instantáneamente por WA, tasa de ban altísima |

---

## 7. Implementation Priority

### Sprint 1 (Semana 1): Foundation

```
□ Migration 040_blast_v2.sql
□ blast-orchestrator/state-machine.ts (PhoneState + transitions)
□ blast-orchestrator/rate-controller.ts (daily limit calculation)
□ GET /api/blast-orchestrator/phone-state/:waNumber
□ Extension: blast-orchestrator-client.js (poll state c/30s)
□ Extension: blast-panel.js respects backend daily_limit
```

### Sprint 2 (Semana 2): Operators

```
□ blast-orchestrator/conversation-router.ts
□ blast_operator_assignments CRUD
□ blast_operator_status heartbeat (POST c/60s desde extensión)
□ Extension: inbox-panel.js (básico: mostrar assignments, abrir chat)
□ Sidebar: agregar tab "Inbox"
```

### Sprint 3 (Semana 3): Analytics + A/B

```
□ blast_templates CRUD + selection logic
□ blast_daily_metrics aggregation (cron o trigger)
□ Extend GET /api/blast/dashboard con campos v2
□ Web: /blast-command-center page
□ A/B template tracking en blast_log
```

### Sprint 4 (Semana 4): Scaling + Rollback

```
□ Rollback trigger engine (cron c/5 min)
□ Scale gates evaluation
□ Contact intelligence (engagement score en voter_profiles)
□ Session breaks en blast-panel.js
□ Warming phase en state machine
```

---

## Conclusión

El 70% del sistema ya existe y funciona. El blast-panel.js de 1,372 líneas, el spam-detector de 5 señales, la segmentación determinística, el CMS con SSE — todo se queda.

Lo que falta es:
1. **Capa de orquestación** — state machine + rate controller + rollback (backend)
2. **Routing de operadores** — conversation assignments + inbox panel (backend + extensión)
3. **Analítica accionable** — dashboard + A/B + engagement scoring (backend + web)

No se reescribe. Se evoluciona. Cada pieza nueva se conecta a lo que ya corre en producción.
