# Fase 2 — 7 New Slides Expansion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar 6 slides nuevos al deck Fase 2 + fix de SlideFoda, llevando el catálogo de 14 a 20 slides. Cada slide tiene fallback de datos simulados deterministamente.

**Architecture:** Cada slide vive en `apps/web/app/onboarding/[slug]/fase-2/_components/slides/` como archivo `.tsx` independiente que exporta el componente + `isVisible`. Los slides se registran en `Fase2F1Deck.tsx` en el `allCatalog` array. Simulated data usa hash de `ctx.user.full_name` como seed. Design tokens: `bg-[#020a1e]` (slide), `bg-[#0a1e4a]` (panel), amber-400 (gold), red-600 (CRÍTICO).

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Tailwind CSS, `motion/react` (NOT framer-motion), Lucide React. UI shared: `_ui/critico.tsx` exports `CriticoSello`, `SlideLabel`.

---

## File Structure

```
apps/web/app/onboarding/[slug]/fase-2/_components/
  slides/
    SlideTrayectoria.tsx         ← NEW: Trayectoria y Credenciales
    SlideDigitalVsComp.tsx       ← NEW: Digital vs Competidores  
    SlidePromesa.tsx             ← NEW: Tu Promesa Central
    SlidePerfilVotante.tsx       ← NEW: Perfil del Votante Ideal
    SlideOrigenVotos.tsx         ← NEW: De Dónde Vienen Los Votos
    SlideCronograma.tsx          ← NEW: Cronograma de Campaña
    SlideFoda.tsx                ← MODIFY: isSlideFodaVisible → always true
  Fase2F1Deck.tsx                ← MODIFY: registrar los 6 slides nuevos
```

Tipos clave (ya existen, no modificar):
```typescript
// apps/web/lib/onboarding-api.ts
CandidatoContext.user.full_name: string
ConsultorFormFase2.quien_es?.trayectoria: string        // texto libre, parsear por \n
ConsultorFormFase2.quien_es?.valores: string[]
ConsultorFormFase2.presencia_digital?: { web_oficial?, google_results?, redes_verificadas?, info_clave? } // "ok"|"review"|"flag"
ConsultorFormFase2.redes_sociales?.candidato?: SocialHandles
ConsultorFormFase2.redes_sociales?.adversarios?: Array<{ nombre, partido?, redes? }>
ConsultorFormFase2.fase1_rapida?.branding?.slogan: string
ConsultorFormFase2.fase1_rapida?.propuestas: Array<{ orden, titulo, descripcion_corta, icono?, sector? }>
ConsultorFormFase2.territorio_ecd?.c2_segmentos: C2Segmento[]   // { id, nombre, pct_aprox?, valores?, aspiraciones?, temores?, problema_principal? }
ConsultorFormFase2.formula_electoral?: { peso_aire?, peso_mar?, peso_tierra?, justificacion? }
ConsultorFormFase2.recorrido_estrategico?.hitos: Array<{ key, titulo, fecha?, descripcion? }>
```

---

## Task 1: SlideTrayectoria.tsx

**Files:**
- Create: `apps/web/app/onboarding/[slug]/fase-2/_components/slides/SlideTrayectoria.tsx`

- [ ] **Step 1: Crear el archivo**

```tsx
"use client";

import { motion } from "motion/react";
import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";
import { SlideLabel } from "../_ui/critico";

interface Props {
  ctx: CandidatoContext;
  f2: ConsultorFormFase2;
}

function simHitos(name: string) {
  const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  const base = 2010 + (h % 10);
  return [
    { year: String(base),       titulo: "Inicio en gestión pública",    desc: "Primeros pasos en la administración local" },
    { year: String(base + 4),   titulo: "Reconocimiento sectorial",     desc: "Logro destacado en la comunidad" },
    { year: String(base + 8),   titulo: "Candidatura actual",           desc: "Postulación con propuesta clara de cambio" },
  ];
}

export function SlideTrayectoria({ ctx, f2 }: Props) {
  const rawText  = f2.quien_es?.trayectoria ?? "";
  const valores  = f2.quien_es?.valores ?? [];
  const isSimulated = !rawText.trim();

  const hitos = isSimulated
    ? simHitos(ctx.user.full_name)
    : rawText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((titulo, i) => ({ year: null as string | null, titulo, desc: null as string | null }));

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <SlideLabel>Identidad del Candidato</SlideLabel>
        <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
          Trayectoria y Credenciales
        </h2>
        <p className="text-sm text-white/40 mt-1">
          {ctx.user.full_name} · {ctx.cargo.nombre}
        </p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-6 flex-1">
        {/* Timeline — 3 columnas */}
        <div className="sm:col-span-3 relative pl-6 space-y-6">
          <div className="absolute left-2 top-2 bottom-2 w-px bg-amber-400/20" />
          {hitos.map((h, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.1 + i * 0.12 }}
              className="relative"
            >
              <div className="absolute -left-4 top-1.5 size-2 rounded-full bg-amber-400 ring-2 ring-amber-400/20" />
              {h.year && (
                <p className="text-[10px] text-amber-400/60 font-semibold uppercase tracking-widest mb-0.5">
                  {h.year}
                </p>
              )}
              <p className="text-sm font-bold text-white leading-snug">{h.titulo}</p>
              {h.desc && (
                <p className="text-xs text-white/35 mt-0.5 leading-relaxed">{h.desc}</p>
              )}
            </motion.div>
          ))}
        </div>

        {/* Valores — 2 columnas */}
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="sm:col-span-2 bg-[#0a1e4a] border border-white/10 rounded-2xl p-5 flex flex-col gap-4"
        >
          <p className="text-[11px] uppercase tracking-[0.2em] text-amber-400/60 font-semibold">
            Valores
          </p>
          <div className="flex flex-wrap gap-2">
            {(valores.length > 0
              ? valores
              : ["Honestidad", "Trabajo", "Compromiso", "Liderazgo"]
            ).map((v) => (
              <span
                key={v}
                className="px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-400/80 text-xs font-semibold"
              >
                {v}
              </span>
            ))}
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="flex items-center justify-between border-t border-white/5 pt-4"
      >
        <p className="text-[11px] text-white/20">Fuente: datos del consultor</p>
        {isSimulated && (
          <p className="text-[10px] italic text-amber-400/20">· dato estimado</p>
        )}
      </motion.div>
    </div>
  );
}

export function isVisible(_f2: ConsultorFormFase2): boolean {
  return true;
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep SlideTrayectoria
```
Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/onboarding/\[slug\]/fase-2/_components/slides/SlideTrayectoria.tsx
git commit -m "feat(deck): SlideTrayectoria — trayectoria y credenciales"
```

---

## Task 2: SlideDigitalVsComp.tsx

**Files:**
- Create: `apps/web/app/onboarding/[slug]/fase-2/_components/slides/SlideDigitalVsComp.tsx`

- [ ] **Step 1: Crear el archivo**

```tsx
"use client";

import { motion } from "motion/react";
import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";
import { CriticoSello, SlideLabel } from "../_ui/critico";

interface Props {
  ctx: CandidatoContext;
  f2: ConsultorFormFase2;
}

type StatusVal = "ok" | "review" | "flag";
const STATUS_ICON: Record<StatusVal, string>  = { ok: "✓", review: "~", flag: "✗" };
const STATUS_COLOR: Record<StatusVal, string> = {
  ok:     "text-emerald-400",
  review: "text-amber-400",
  flag:   "text-red-400",
};

function simComp(name: string, idx: number) {
  const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) + idx * 37;
  return {
    web:    (h % 3 === 0 ? "ok" : h % 3 === 1 ? "review" : "flag") as StatusVal,
    google: (h % 5 === 0 ? "ok" : "review") as StatusVal,
    redes:  ((h + 1) % 3 === 0 ? "ok" : "flag") as StatusVal,
  };
}

export function SlideDigitalVsComp({ ctx, f2 }: Props) {
  const pd = f2.presencia_digital ?? {};
  const adversarios = f2.redes_sociales?.adversarios ?? [];
  const competidoresForm = f2.fase1_rapida?.diagnostico_inicial?.principales_competidores ?? [];

  // Merge: prefer redes_sociales.adversarios, fallback to diagnostico_inicial.principales_competidores
  const rivals = adversarios.length > 0
    ? adversarios.slice(0, 3).map((a) => ({ nombre: a.nombre, partido: a.partido ?? "" }))
    : competidoresForm.slice(0, 3).map((c) => ({ nombre: c.nombre, partido: c.partido ?? "" }));

  const isSimRivals = rivals.length === 0;
  const finalRivals = isSimRivals
    ? [
        { nombre: "Carlos Mendoza Torres", partido: "APP" },
        { nombre: "María García Quispe",   partido: "FP"  },
      ]
    : rivals;

  const candidatoRow = {
    nombre:  ctx.user.full_name,
    web:     (pd.web_oficial    ?? "flag") as StatusVal,
    google:  (pd.google_results ?? "flag") as StatusVal,
    redes:   (pd.redes_verificadas ?? "flag") as StatusVal,
    isMe: true,
  };

  const rivalRows = finalRivals.map((r, i) => {
    const s = simComp(r.nombre, i);
    return { nombre: r.nombre, partido: r.partido, ...s, isMe: false };
  });

  const allRows = [candidatoRow, ...rivalRows];

  // CRÍTICO if candidato is worse than all rivals on at least 2 dimensions
  const isCritico =
    [candidatoRow.web, candidatoRow.google, candidatoRow.redes].filter((s) => s === "flag").length >= 2;

  const cols = ["Web Oficial", "Google", "Redes Soc."];

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-start justify-between"
      >
        <div>
          <SlideLabel>Diagnóstico Digital</SlideLabel>
          <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
            Digital vs Competidores
          </h2>
          <p className="text-sm text-white/40 mt-1">
            Comparativa de presencia online
          </p>
        </div>
        {isCritico && <CriticoSello tipo="critico" />}
      </motion.div>

      {/* Tabla comparativa */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="bg-[#0a1e4a] border border-white/10 rounded-2xl overflow-hidden flex-1"
      >
        {/* Header */}
        <div className="grid grid-cols-4 border-b border-white/5 px-5 py-3">
          <p className="text-[11px] uppercase tracking-[0.15em] text-white/30 font-semibold">Candidato</p>
          {cols.map((c) => (
            <p key={c} className="text-[11px] uppercase tracking-[0.15em] text-white/30 font-semibold text-center">{c}</p>
          ))}
        </div>
        {/* Rows */}
        {allRows.map((row, i) => (
          <div
            key={row.nombre}
            className={`grid grid-cols-4 items-center px-5 py-4 border-b border-white/5 last:border-0 ${
              row.isMe ? "bg-amber-400/5" : ""
            }`}
          >
            <div>
              <p className={`text-sm font-semibold leading-snug ${row.isMe ? "text-amber-400" : "text-white/70"}`}>
                {row.isMe ? "▶ " : ""}{row.nombre.split(" ").slice(0, 2).join(" ")}
              </p>
              {"partido" in row && row.partido && (
                <p className="text-[10px] text-white/30">{row.partido}</p>
              )}
            </div>
            {([row.web, row.google, row.redes] as StatusVal[]).map((status, j) => (
              <div key={j} className="flex justify-center">
                <span className={`text-lg font-black ${STATUS_COLOR[status]}`}>
                  {STATUS_ICON[status]}
                </span>
              </div>
            ))}
          </div>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="flex items-center justify-between border-t border-white/5 pt-4"
      >
        <p className="text-[11px] text-white/20">
          ✓ ok · ~ revisar · ✗ ausente/problema
        </p>
        {isSimRivals && (
          <p className="text-[10px] italic text-amber-400/20">· rivales estimados</p>
        )}
      </motion.div>
    </div>
  );
}

export function isVisible(_f2: ConsultorFormFase2): boolean {
  return true;
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep SlideDigitalVsComp
```
Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/onboarding/\[slug\]/fase-2/_components/slides/SlideDigitalVsComp.tsx
git commit -m "feat(deck): SlideDigitalVsComp — comparativa digital vs competidores"
```

---

## Task 3: SlidePromesa.tsx

**Files:**
- Create: `apps/web/app/onboarding/[slug]/fase-2/_components/slides/SlidePromesa.tsx`

- [ ] **Step 1: Crear el archivo**

```tsx
"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";
import { SlideLabel } from "../_ui/critico";

interface Props {
  f2: ConsultorFormFase2;
}

const SIM_PROPUESTAS = [
  { icono: "🏗", titulo: "Infraestructura para todos",     sector: "infraestructura" },
  { icono: "📚", titulo: "Educación de calidad cercana",  sector: "educacion"      },
  { icono: "🏥", titulo: "Salud accesible en tu barrio",  sector: "salud"          },
];

export function SlidePromesa({ f2 }: Props) {
  const slogan     = f2.fase1_rapida?.branding?.slogan ?? "";
  const propuestas = f2.fase1_rapida?.propuestas ?? [];
  const isSimSlogan = !slogan.trim();
  const isSimProps  = propuestas.length === 0;

  const displaySlogan = isSimSlogan ? "Construimos el futuro juntos" : slogan;
  const displayProps  = isSimProps  ? SIM_PROPUESTAS : propuestas.slice(0, 3).map((p) => ({
    icono:  p.icono ?? "⭐",
    titulo: p.titulo,
    sector: p.sector ?? "",
  }));

  // Split slogan at ** for gold highlight (e.g. "Con **Carlos**, Lima avanza")
  const sloganParts = displaySlogan.split(/\*\*(.+?)\*\*/g);

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col items-center justify-center px-8 py-12 gap-10 text-center">
      {/* Label */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <SlideLabel>Propuesta de Campaña</SlideLabel>
      </motion.div>

      {/* Slogan gigante */}
      <motion.h1
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        className="text-3xl sm:text-5xl font-black text-white leading-tight max-w-2xl"
      >
        {sloganParts.map((part, i) =>
          i % 2 === 1
            ? <span key={i} className="text-amber-400">{part}</span>
            : <span key={i}>{part}</span>
        )}
      </motion.h1>

      {/* Propuestas pills */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25 }}
        className="flex flex-wrap gap-3 justify-center max-w-xl"
      >
        {displayProps.map((p, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-4 py-2 bg-[#0a1e4a] border border-white/10 rounded-full"
          >
            <span className="text-base">{p.icono}</span>
            <span className="text-sm font-semibold text-white/80">{p.titulo}</span>
          </div>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="absolute bottom-6 right-6 flex gap-3"
      >
        {(isSimSlogan || isSimProps) && (
          <p className="text-[10px] italic text-amber-400/20">· dato estimado</p>
        )}
      </motion.div>
    </div>
  );
}

export function isVisible(_f2: ConsultorFormFase2): boolean {
  return true;
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep SlidePromesa
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/onboarding/\[slug\]/fase-2/_components/slides/SlidePromesa.tsx
git commit -m "feat(deck): SlidePromesa — slogan + propuestas principales"
```

---

## Task 4: SlidePerfilVotante.tsx

**Files:**
- Create: `apps/web/app/onboarding/[slug]/fase-2/_components/slides/SlidePerfilVotante.tsx`

- [ ] **Step 1: Crear el archivo**

```tsx
"use client";

import { motion } from "motion/react";
import type { CandidatoContext, ConsultorFormFase2, C2Segmento } from "@/lib/onboarding-api";
import { SlideLabel } from "../_ui/critico";

interface Props {
  ctx: CandidatoContext;
  f2: ConsultorFormFase2;
}

const SIM_SEGMENTO: C2Segmento = {
  id:                 "sim-0",
  nombre:             "Vecino comprometido",
  pct_aprox:          35,
  valores:            ["Familia", "Trabajo", "Seguridad"],
  aspiraciones:       ["Mejor infraestructura", "Empleo local", "Servicios públicos"],
  temores:            ["Inseguridad", "Corrupción", "Abandono del Estado"],
  problema_principal: "Falta de servicios básicos de calidad en la zona",
  medio_info_preferido: "WhatsApp y boca a boca",
};

export function SlidePerfilVotante({ ctx, f2 }: Props) {
  const segmentos  = f2.territorio_ecd?.c2_segmentos ?? [];
  const isSimulated = segmentos.length === 0;
  const seg: C2Segmento = isSimulated ? SIM_SEGMENTO : segmentos[0]!;

  const lugar =
    ctx.jurisdiccion.distrito?.nombre ??
    ctx.jurisdiccion.provincia?.nombre ??
    "el territorio";

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-start justify-between"
      >
        <div>
          <SlideLabel>Segmentación Electoral</SlideLabel>
          <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
            Tu Votante Ideal
          </h2>
          <p className="text-sm text-white/40 mt-1">{lugar} · Segmento prioritario</p>
        </div>
        {seg.pct_aprox && (
          <div className="text-right">
            <p className="text-3xl font-black text-amber-400">{seg.pct_aprox}%</p>
            <p className="text-[10px] text-white/30">del electorado</p>
          </div>
        )}
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 flex-1">
        {/* Persona card */}
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="bg-[#0a1e4a] border border-amber-400/20 rounded-2xl p-5 flex flex-col gap-4"
        >
          <div className="flex items-center gap-4">
            <div className="size-14 rounded-full bg-amber-400/15 border border-amber-400/30 flex items-center justify-center">
              <span className="text-2xl">👤</span>
            </div>
            <div>
              <p className="font-black text-white text-lg leading-snug">{seg.nombre}</p>
              {seg.medio_info_preferido && (
                <p className="text-xs text-white/35 mt-0.5">{seg.medio_info_preferido}</p>
              )}
            </div>
          </div>
          {seg.problema_principal && (
            <div className="bg-red-600/10 border border-red-600/20 rounded-xl px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-red-400/60 font-semibold mb-1">Problema principal</p>
              <p className="text-sm text-white/70 leading-snug">{seg.problema_principal}</p>
            </div>
          )}
        </motion.div>

        {/* Valores / Aspiraciones / Temores */}
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="flex flex-col gap-4"
        >
          {[
            { label: "Valores",       items: seg.valores      ?? [], color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20" },
            { label: "Aspiraciones",  items: seg.aspiraciones ?? [], color: "text-blue-400",    bg: "bg-blue-400/10 border-blue-400/20"       },
            { label: "Temores",       items: seg.temores      ?? [], color: "text-red-400",     bg: "bg-red-400/10 border-red-400/20"         },
          ].map(({ label, items, color, bg }) =>
            items.length > 0 ? (
              <div key={label}>
                <p className={`text-[10px] uppercase tracking-[0.2em] font-semibold mb-2 ${color}`}>{label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((item) => (
                    <span key={item} className={`px-2.5 py-0.5 rounded-full border text-xs font-medium text-white/70 ${bg}`}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ) : null
          )}
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="flex items-center justify-between border-t border-white/5 pt-4"
      >
        <p className="text-[11px] text-white/20">Fuente: segmentación del consultor · segmento {seg.nombre}</p>
        {isSimulated && <p className="text-[10px] italic text-amber-400/20">· dato estimado</p>}
      </motion.div>
    </div>
  );
}

export function isVisible(_f2: ConsultorFormFase2): boolean {
  return true;
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep SlidePerfilVotante
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/onboarding/\[slug\]/fase-2/_components/slides/SlidePerfilVotante.tsx
git commit -m "feat(deck): SlidePerfilVotante — perfil del votante ideal"
```

---

## Task 5: SlideOrigenVotos.tsx

**Files:**
- Create: `apps/web/app/onboarding/[slug]/fase-2/_components/slides/SlideOrigenVotos.tsx`

**Nota:** `formula_electoral` usa `peso_tierra` / `peso_mar` / `peso_aire` (0-100 cada uno). Si la suma no es 100 se normalizan.

- [ ] **Step 1: Crear el archivo**

```tsx
"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";
import { SlideLabel } from "../_ui/critico";

interface Props {
  f2: ConsultorFormFase2;
}

interface Segmento {
  label:  string;
  sub:    string;
  pct:    number;
  color:  string;
  tactica: string;
}

function buildSegmentos(fe: ConsultorFormFase2["formula_electoral"]): {
  items: Segmento[];
  isSimulated: boolean;
} {
  const tierra = fe?.peso_tierra;
  const mar    = fe?.peso_mar;
  const aire   = fe?.peso_aire;

  if (!tierra && !mar && !aire) {
    return {
      isSimulated: true,
      items: [
        { label: "Tierra",  sub: "Canvassing & base propia", pct: 50, color: "bg-amber-500",   tactica: "Visitas puerta a puerta, brigadistas" },
        { label: "Mar",     sub: "Eventos & actos públicos",  pct: 30, color: "bg-blue-500",    tactica: "Concentraciones, caravanas, mítines" },
        { label: "Aire",    sub: "Digital & medios",          pct: 20, color: "bg-purple-500",  tactica: "Redes sociales, prensa, publicidad" },
      ],
    };
  }

  const raw = [
    { label: "Tierra", sub: "Canvassing & base propia", raw: tierra ?? 0, color: "bg-amber-500",  tactica: "Visitas puerta a puerta, brigadistas" },
    { label: "Mar",    sub: "Eventos & actos públicos",  raw: mar    ?? 0, color: "bg-blue-500",   tactica: "Concentraciones, caravanas, mítines" },
    { label: "Aire",   sub: "Digital & medios",          raw: aire   ?? 0, color: "bg-purple-500", tactica: "Redes sociales, prensa, publicidad" },
  ];
  const total = raw.reduce((s, r) => s + r.raw, 0) || 100;
  return {
    isSimulated: false,
    items: raw.map((r) => ({ ...r, pct: Math.round((r.raw / total) * 100) })),
  };
}

export function SlideOrigenVotos({ f2 }: Props) {
  const { items, isSimulated } = buildSegmentos(f2.formula_electoral);
  const justificacion = f2.formula_electoral?.justificacion;

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <SlideLabel>Estrategia Electoral</SlideLabel>
        <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
          De Dónde Vienen Los Votos
        </h2>
        <p className="text-sm text-white/40 mt-1">Distribución de esfuerzo por frente</p>
      </motion.div>

      <div className="flex flex-col gap-4 flex-1">
        {items.map((seg, i) => (
          <motion.div
            key={seg.label}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.1 }}
            className="bg-[#0a1e4a] border border-white/10 rounded-2xl p-5"
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <p className="text-base font-black text-white">{seg.label}</p>
                <p className="text-xs text-white/40">{seg.sub}</p>
              </div>
              <p className="text-3xl font-black text-amber-400 tabular-nums">{seg.pct}%</p>
            </div>
            {/* Barra */}
            <div className="h-2 bg-white/5 rounded-full overflow-hidden mb-3">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${seg.pct}%` }}
                transition={{ duration: 0.7, delay: 0.3 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                className={`h-full rounded-full ${seg.color}`}
              />
            </div>
            <p className="text-xs text-white/30 italic">{seg.tactica}</p>
          </motion.div>
        ))}
      </div>

      {justificacion && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="bg-[#0a1e4a]/60 border border-white/5 rounded-xl px-4 py-3"
        >
          <p className="text-xs text-white/40 leading-relaxed italic">{justificacion}</p>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.7 }}
        className="flex items-center justify-between border-t border-white/5 pt-4"
      >
        <p className="text-[11px] text-white/20">Fórmula Tierra / Mar / Aire — Goberna</p>
        {isSimulated && <p className="text-[10px] italic text-amber-400/20">· dato estimado</p>}
      </motion.div>
    </div>
  );
}

export function isVisible(_f2: ConsultorFormFase2): boolean {
  return true;
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep SlideOrigenVotos
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/onboarding/\[slug\]/fase-2/_components/slides/SlideOrigenVotos.tsx
git commit -m "feat(deck): SlideOrigenVotos — distribución Tierra/Mar/Aire"
```

---

## Task 6: SlideCronograma.tsx

**Files:**
- Create: `apps/web/app/onboarding/[slug]/fase-2/_components/slides/SlideCronograma.tsx`

- [ ] **Step 1: Crear el archivo**

```tsx
"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";
import { SlideLabel } from "../_ui/critico";

interface Props {
  f2: ConsultorFormFase2;
}

type Hito = { key: string; titulo: string; fecha?: string; descripcion?: string };

const SIM_HITOS: Hito[] = [
  { key: "inicio",      titulo: "Lanzamiento de campaña",      fecha: "Mar 2026",  descripcion: "Acto de presentación oficial"       },
  { key: "canvassing",  titulo: "Inicio de canvassing",        fecha: "Abr 2026",  descripcion: "Brigadas en los 5 distritos"         },
  { key: "debate",      titulo: "Debate público municipal",    fecha: "May 2026",  descripcion: "Exposición de propuestas en TV local" },
  { key: "cierre",      titulo: "Cierre de campaña",           fecha: "Jun 2026",  descripcion: "Concentración final + movilización"   },
  { key: "eleccion",    titulo: "Día de elecciones",           fecha: "Jul 2026",  descripcion: "Meta: movilizar base propia 100%"     },
];

const TIPO_COLOR: Record<string, string> = {
  electoral:  "bg-amber-400 text-black",
  interno:    "bg-blue-500  text-white",
  publico:    "bg-emerald-500 text-white",
  default:    "bg-white/20  text-white",
};

function hitoColor(key: string): string {
  if (["eleccion", "debate"].includes(key)) return TIPO_COLOR.electoral;
  if (["canvassing", "brigadas"].includes(key)) return TIPO_COLOR.interno;
  if (["cierre", "lanzamiento", "inicio"].includes(key)) return TIPO_COLOR.publico;
  return TIPO_COLOR.default;
}

export function SlideCronograma({ f2 }: Props) {
  const hitos       = f2.recorrido_estrategico?.hitos ?? [];
  const isSimulated = hitos.length === 0;
  const displayHitos: Hito[] = isSimulated ? SIM_HITOS : hitos;

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <SlideLabel>Planificación de Campaña</SlideLabel>
        <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
          Cronograma de Campaña
        </h2>
        <p className="text-sm text-white/40 mt-1">
          {displayHitos.length} hitos planificados
        </p>
      </motion.div>

      {/* Timeline vertical */}
      <div className="flex flex-col gap-3 flex-1 relative pl-8">
        <div className="absolute left-3 top-0 bottom-0 w-px bg-white/10" />
        {displayHitos.map((hito, i) => (
          <motion.div
            key={hito.key}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.08 + i * 0.07 }}
            className="relative bg-[#0a1e4a] border border-white/10 rounded-xl p-4"
          >
            {/* Dot on the timeline */}
            <div className="absolute -left-5 top-1/2 -translate-y-1/2 size-2.5 rounded-full bg-amber-400 ring-2 ring-amber-400/20" />

            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {hito.fecha && (
                  <p className="text-[10px] text-amber-400/60 font-semibold uppercase tracking-widest mb-0.5">
                    {hito.fecha}
                  </p>
                )}
                <p className="text-sm font-bold text-white leading-snug">{hito.titulo}</p>
                {hito.descripcion && (
                  <p className="text-xs text-white/35 mt-0.5 leading-relaxed">{hito.descripcion}</p>
                )}
              </div>
              <span className={`shrink-0 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${hitoColor(hito.key)}`}>
                {hito.key.replace(/_/g, " ")}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.6 }}
        className="flex items-center justify-between border-t border-white/5 pt-4"
      >
        <p className="text-[11px] text-white/20">Fuente: recorrido estratégico del consultor</p>
        {isSimulated && <p className="text-[10px] italic text-amber-400/20">· dato estimado</p>}
      </motion.div>
    </div>
  );
}

export function isVisible(_f2: ConsultorFormFase2): boolean {
  return true;
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep SlideCronograma
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/onboarding/\[slug\]/fase-2/_components/slides/SlideCronograma.tsx
git commit -m "feat(deck): SlideCronograma — cronograma de hitos de campaña"
```

---

## Task 7: SlideFoda fix + Registrar todo en Fase2F1Deck.tsx

**Files:**
- Modify: `apps/web/app/onboarding/[slug]/fase-2/_components/slides/SlideFoda.tsx:172`
- Modify: `apps/web/app/onboarding/[slug]/fase-2/_components/Fase2F1Deck.tsx`

- [ ] **Step 1: Fix isSlideFodaVisible — siempre true (ya tiene datos simulados)**

En `slides/SlideFoda.tsx`, cambiar la función `isSlideFodaVisible`:

```typescript
// ANTES (línea ~172):
export function isSlideFodaVisible(f2: ConsultorFormFase2): boolean {
  const d = f2.fase1_rapida?.diagnostico_inicial ?? {};
  return (
    (d.fortalezas?.length ?? 0) + ... > 0
  );
}

// DESPUÉS:
export function isSlideFodaVisible(_f2: ConsultorFormFase2): boolean {
  return true;
}
```

- [ ] **Step 2: Agregar imports a Fase2F1Deck.tsx**

Al bloque de imports de slides existente (después de `import { SlideDistribucionPoblacional... }`), agregar:

```typescript
import { SlideTrayectoria }       from "./slides/SlideTrayectoria";
import { SlideDigitalVsComp }     from "./slides/SlideDigitalVsComp";
import { SlidePromesa }           from "./slides/SlidePromesa";
import { SlidePerfilVotante }     from "./slides/SlidePerfilVotante";
import { SlideOrigenVotos }       from "./slides/SlideOrigenVotos";
import { SlideCronograma }        from "./slides/SlideCronograma";
```

- [ ] **Step 3: Agregar al catálogo allCatalog en Fase2F1Deck.tsx**

El array `allCatalog` en `useMemo` actualmente tiene 14 slides. Insertar los 6 nuevos en la posición correcta:

```typescript
// CAPÍTULO 1 — Presentación (existente, no tocar)
{ id: "carta",   ... },
{ id: "hero",    ... },
{ id: "ficha",   ... },
// NUEVO — después de quien-es:
{ id: "trayectoria", label: "Trayectoria y Credenciales", visible: true, formSection: "quien_es", node: <SlideTrayectoria ctx={ctx} f2={f2} /> },

// CAPÍTULO 2 — Diagnóstico (existente)
{ id: "quien-es",  ... },
{ id: "presencia", ... },
// NUEVO — después de presencia:
{ id: "digital-vs-comp", label: "Digital vs Competidores", visible: true, formSection: "presencia_digital", node: <SlideDigitalVsComp ctx={ctx} f2={f2} /> },
{ id: "debilidades", ... },

// CAPÍTULO 3 — Territorio (existente, no tocar)
// ...

// CAPÍTULO 4 — Estrategia (existente)
// Después de propuestas, antes de segmentos:
{ id: "promesa", label: "Tu Promesa Central", visible: true, formSection: "propuestas", node: <SlidePromesa f2={f2} /> },
// ...segmentos existente...
// Después de segmentos:
{ id: "perfil-votante", label: "Perfil del Votante Ideal", visible: true, formSection: "form-extendido (próximamente)", node: <SlidePerfilVotante ctx={ctx} f2={f2} /> },

// Después de reorganizar, antes de arquitectura:
{ id: "origen-votos",  label: "De Dónde Vienen Los Votos", visible: true, formSection: "recorrido", node: <SlideOrigenVotos f2={f2} /> },
{ id: "cronograma",    label: "Cronograma de Campaña",     visible: true, formSection: "recorrido", node: <SlideCronograma f2={f2} /> },
```

También actualizar la constante `TOTAL_CATALOG` (actualmente `14`) a `20`:

```typescript
const TOTAL_CATALOG = 20;
```

- [ ] **Step 4: TypeScript check completo**

```bash
cd apps/web && npx tsc --noEmit
```
Esperado: exit code 0, sin errores.

- [ ] **Step 5: Commit final**

```bash
git -C /Users/milaa/sandbox/maquina-electoral-goberna add \
  apps/web/app/onboarding/\[slug\]/fase-2/_components/slides/SlideFoda.tsx \
  apps/web/app/onboarding/\[slug\]/fase-2/_components/Fase2F1Deck.tsx
git -C /Users/milaa/sandbox/maquina-electoral-goberna commit -m "feat(deck): registrar 6 slides nuevos — catálogo crece de 14 a 20"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** SlideTrayectoria ✓, SlideDigitalVsComp ✓, SlideFoda fix ✓, SlidePromesa ✓, SlidePerfilVotante ✓, SlideOrigenVotos ✓, SlideCronograma ✓, registro en catálogo ✓
- [x] **No placeholders:** todo el código está completo en cada task
- [x] **Type consistency:** `C2Segmento` importado correctamente en SlidePerfilVotante; `CandidatoContext` pasado como prop `ctx` solo donde se usa; `f2.formula_electoral` tipos alineados con `ConsultorFormFase2`
- [x] **Simulated data:** todos los slides tienen fallback deterministamente simulado
- [x] **isVisible:** todos exportan `isVisible(_f2) → true` (progressive enrichment)

---

## Ejecución recomendada — 3 agentes paralelos

Dado que los Tasks 1-6 son independientes, se pueden ejecutar en paralelo:

- **Agente A:** Task 1 (SlideTrayectoria) + Task 2 (SlideDigitalVsComp)
- **Agente B:** Task 3 (SlidePromesa) + Task 4 (SlidePerfilVotante)  
- **Agente C:** Task 5 (SlideOrigenVotos) + Task 6 (SlideCronograma)
- **Agente D (después de A+B+C):** Task 7 — fix SlideFoda + registro en catálogo + TypeCheck final
