# Call Center WhatsApp — Documentación técnica
> Última actualización: 2026-03-17

---

## Qué es

Un sistema para usar 6 celulares del candidato como estaciones de envío masivo de WhatsApp,
coordinadas desde la extensión Chrome. Cada celular tiene WA Web abierto y un brigadista lo opera.

---

## Arquitectura

```
20,000 contactos en form_submissions (DB)
           │
           ▼
    Segmentación determinística
    MOD(hashtext(telefono), 6) = slot
           │
    ┌──────┴──────────────────────┐
    │  slot 0   slot 1  ...  slot 5 │
    │  3,333    3,333        3,333  │
    └──────────────────────────────┘
           │
    ┌──────┴─────────────────────────┐
    │  Celular 1  Celular 2  Celular 6 │
    │  WA Web     WA Web     WA Web   │
    │  Brigadista Brigadista Brigadista│
    └─────────────────────────────────┘
           │
    [blast-panel.js en cada Chrome]
    1. Pre-warm 30s (findOrCreateLatestChat)
    2. Enviar mensaje
    3. Delay 10-22s
    4. Repetir
           │
    POST /api/blast/report → blast_log (DB)
    PUT /api/blast/mark-hablado → form_submissions.cms_status = 'hablado'
```

---

## Setup inicial (una sola vez por campaña)

### 1. Registrar los 6 celulares

```bash
# Para cada celular, POST al backend (rol candidato+):
POST /api/blast/number-config
{
  "wa_number": "51901938157",   # número sin +
  "label": "Celular 1 — Lima Norte",
  "segment_idx": 0,             # slot 0-5
  "total_slots": 6
}
```

### 2. Verificar segmentación

```sql
-- Ver cuántos contactos tiene cada slot
SELECT
  ABS(hashtext(COALESCE(data->>'telefono', id::text))) % 6 AS slot,
  COUNT(*) AS contactos
FROM form_submissions
WHERE campaign_id = 'TU_CAMPAIGN_ID'
  AND COALESCE(data->>'telefono', '') != ''
GROUP BY slot
ORDER BY slot;
```

---

## Operación diaria

### Límites anti-baneo (por celular)

| Período | Mensajes seguros | Mensajes máximos |
|---|---|---|
| Por hora | 80-100 | 120 |
| Por día | 400-500 | 600 |
| 6 celulares / día | 2,400-3,000 | 3,600 |

### Ciclo por mensaje

```
Pre-warm 30s (findOrCreateLatestChat)
  → Envío (addAndSendMsgToChat)
  → Delay 10-22s
  → Micro-pausa c/10 msgs: 45-90s
  → Pausa larga c/25 msgs: 3-5 min
```

**Tiempo real por contacto:** ~40-52s → 70-90 contactos/hora por celular

**ETA para 20,000 contactos con 6 celulares:** ~7 días operando 8h/día

### Warmup de números nuevos

Números nuevos que nunca enviaron mensajes masivos necesitan un período de warmup:

| Día | Límite diario |
|---|---|
| 1-3 | 50 msgs |
| 4-7 | 100 msgs |
| 8-14 | 200 msgs |
| 14+ | 400-500 msgs |

---

## Endpoints del backend

| Endpoint | Método | Auth | Descripción |
|---|---|---|---|
| `/api/blast/form-contacts` | GET | cualquier usuario + campaña | Contactos del segmento (detecta slot por `x-wa-number` header) |
| `/api/blast/mark-hablado` | PUT | cualquier usuario + campaña | Marcar contactos como hablado |
| `/api/blast/report` | POST | cualquier usuario + campaña | Log de mensajes enviados |
| `/api/blast/stats` | GET | cualquier usuario + campaña | Progreso global + por número |
| `/api/blast/number-config` | POST | candidato+ | Registrar/actualizar slot de un celular |
| `/api/blast/number-config` | GET | cualquier usuario + campaña | Config del número activo (by `x-wa-number` header) |

---

## Tablas en DB

### `blast_log`
Log de cada mensaje enviado. Columnas principales:
- `wa_number` — celular que envió
- `contact_phone` — destinatario
- `status` — `sent` | `failed`
- `sent_at` — timestamp

> **Nota:** Esta tabla existía antes con schema diferente (`jid`, `phone`, `own_number`).
> El schema nuevo agrega columnas via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

### `blast_number_config`
Config de segmentación por celular:
- `wa_number` — número del celular
- `segment_idx` — slot asignado (0-5)
- `total_slots` — total de celulares
- `label` — nombre descriptivo

---

## Popup: tab "Call Center"

El popup muestra en tiempo real:
- Progreso global (total / enviados / pendientes / fallidos)
- Barra de porcentaje
- ETA estimado basado en 2,700 msgs/día
- Por cada celular: sent, fallidos, hoy, mini-barra de progreso
- Tabla de límites anti-baneo como referencia

Para actualizar: botón "↺ Actualizar" → llama `GET /api/blast/stats`

---

## Problemas conocidos y soluciones

### "No me aparecen contactos"
- Verificar que `blast_number_config` tiene un registro para el número activo
- Si no tiene config, el backend auto-asigna por `hash(numero) % 6`
- El número activo se detecta desde `_ownNumber` en bootstrap.js

### "El delay entre mensajes es muy corto"
- En producción los delays son 10-22s entre contactos + 30s de pre-warm
- Total ~40-52s por contacto, no se puede reducir sin riesgo de baneo

### "El blast se pausa solo"
- Si el spam detector detecta riesgo crítico, fuerza pausa
- Ver logs `[WSPP SPAM]` en la consola del service worker
- También puede pausarse si hay 3 fallos consecutivos (circuit breaker)
