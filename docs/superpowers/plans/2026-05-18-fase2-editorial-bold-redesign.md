# Fase 2 — Editorial Bold Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Fase 2 candidate presentation deck with Editorial Bold visual language, 4-act narrative structure, MapLibre district polygon map, and GapBar electoral visualization.

**Architecture:** New shared component layer (`slides/shared/`) provides EditorialHeader, SlideChapter, GapBar, and SlideMap — all consumed by rebuilt/enhanced slides. The deck orchestrator (Fase2F1Deck.tsx) gains 4 chapter divider entries and a reordered catalog. No new API endpoints required; data flows from existing CandidatoContext + ConsultorFormFase2 types.

**Tech Stack:** React 19 + TypeScript strict, Next.js 15, @vis.gl/react-maplibre v8 (CARTO Dark Matter style), recharts v3, motion/react, Tailwind CSS, Bun

---

## Task 1: Design tokens

- [ ] **Create:** `apps/web/app/onboarding/[slug]/fase-2/_components/slides/shared/act-tokens.ts`

```typescript
export type ActNumber = 1 | 2 | 3 | 4;

export const ACT_TOKENS = {
  1: { color: "#fbbf24", label: "ACTO I",   title: "QUIÉN SOS",    subtitle: "Identidad, perfil y credenciales del candidato" },
  2: { color: "#ef4444", label: "ACTO II",  title: "DÓNDE ESTÁS",  subtitle: "Territorio, electorado y posición actual" },
  3: { color: "#3b82f6", label: "ACTO III", title: "CONTRA QUIÉN", subtitle: "Competencia, segmentos y campo de batalla" },
  4: { color: "#22c55e", label: "ACTO IV",  title: "CÓMO GANÁS",   subtitle: "Estrategia, núcleo y plan de cierre" },
} as const;

export type ActTokens = typeof ACT_TOKENS;
```

- [ ] Verification: `cd /Users/milaa/sandbox/maquina-electoral-goberna/apps/web && bunx tsc --noEmit 2>&1 | tail -3` — expected empty output.
- [ ] Commit: `feat(fase2): add 4-act design tokens`

---

## Task 2: EditorialHeader component

- [ ] **Create:** `apps/web/app/onboarding/[slug]/fase-2/_components/slides/shared/EditorialHeader.tsx`

Complete file content:

```tsx
"use client";

interface EditorialHeaderProps {
  microLabel: string;
  headline: string;
  accentColor?: string;
  headlineSize?: "sm" | "md" | "lg";
}

const HEADLINE_SIZE: Record<NonNullable<EditorialHeaderProps["headlineSize"]>, string> = {
  sm: "text-2xl sm:text-3xl",
  md: "text-3xl sm:text-4xl",
  lg: "text-4xl sm:text-5xl",
};

export function EditorialHeader({
  microLabel,
  headline,
  accentColor = "#fbbf24",
  headlineSize = "md",
}: EditorialHeaderProps) {
  const sizeClass = HEADLINE_SIZE[headlineSize];

  return (
    <div
      style={{ borderLeft: `3px solid ${accentColor}`, paddingLeft: "16px" }}
    >
      <p
        className="font-semibold uppercase tracking-widest mb-2"
        style={{ fontSize: "9px", color: `${accentColor}80` }}
      >
        {microLabel}
      </p>
      <h2 className={`${sizeClass} font-black text-white leading-tight`}>
        {headline}
      </h2>
      <div
        className="mt-3"
        style={{ width: "40px", height: "2px", backgroundColor: accentColor }}
      />
    </div>
  );
}
```

- [ ] Verification: `cd /Users/milaa/sandbox/maquina-electoral-goberna/apps/web && bunx tsc --noEmit 2>&1 | tail -5` — expected empty output.
- [ ] Commit: `feat(fase2): add EditorialHeader shared component`

---

## Task 3: SlideChapter component

- [ ] **Create:** `apps/web/app/onboarding/[slug]/fase-2/_components/slides/shared/SlideChapter.tsx`

Complete file content:

```tsx
"use client";

import { motion } from "motion/react";

interface SlideChapterProps {
  actNumber: "I" | "II" | "III" | "IV";
  actTitle: string;
  actSubtitle: string;
  accentColor: string;
}

export function SlideChapter({
  actNumber,
  actTitle,
  actSubtitle,
  accentColor,
}: SlideChapterProps) {
  return (
    <div className="relative flex-1 flex flex-col items-center justify-center bg-[#020a1e] overflow-hidden min-h-[70vh]">
      {/* Ghost act number — absolute, behind content */}
      <div
        className="absolute select-none pointer-events-none font-black leading-none"
        style={{
          fontSize: "200px",
          opacity: 0.06,
          color: accentColor,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          letterSpacing: "-0.05em",
        }}
      >
        {actNumber}
      </div>

      {/* Decorative horizontal lines */}
      <div className="absolute inset-x-0 top-0 flex flex-col gap-3 pt-8 px-12 pointer-events-none">
        {[0.4, 0.25, 0.15, 0.08].map((opacity, i) => (
          <div
            key={i}
            className="h-[1px]"
            style={{ backgroundColor: accentColor, opacity }}
          />
        ))}
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center gap-6 text-center px-8">
        {/* Badge pill */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <span
            className="inline-block text-[11px] font-black uppercase tracking-[0.25em] px-4 py-1.5 rounded-full"
            style={{
              color: accentColor,
              backgroundColor: `${accentColor}18`,
              border: `1px solid ${accentColor}40`,
            }}
          >
            ACTO {actNumber}
          </span>
        </motion.div>

        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="text-5xl sm:text-7xl font-black text-white leading-none tracking-tight"
        >
          {actTitle}
        </motion.h2>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="text-sm text-white/40 max-w-xs"
        >
          {actSubtitle}
        </motion.p>

        {/* Animated accent separator line */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.3, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="origin-left"
          style={{ width: "80px", height: "2px", backgroundColor: accentColor }}
        />
      </div>

      {/* Bottom decorative lines */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 pb-8 px-12 pointer-events-none">
        {[0.08, 0.15, 0.25, 0.4].map((opacity, i) => (
          <div
            key={i}
            className="h-[1px]"
            style={{ backgroundColor: accentColor, opacity }}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] Verification: `cd /Users/milaa/sandbox/maquina-electoral-goberna/apps/web && bunx tsc --noEmit 2>&1 | tail -5` — expected empty output.
- [ ] Commit: `feat(fase2): add SlideChapter full-bleed divider component`

---

## Task 4: GapBar component

- [ ] **Create:** `apps/web/app/onboarding/[slug]/fase-2/_components/slides/shared/GapBar.tsx`

Complete file content:

```tsx
"use client";

interface GapBarProps {
  current: number;   // current % (e.g. 35)
  target: number;    // target % (e.g. 51)
  weeks?: number;    // weeks to election
  totalVotes?: number; // padrón for calculating absolute votes
}

function fmt(n: number): string {
  return n.toLocaleString("es-PE");
}

export function GapBar({ current, target, weeks, totalVotes }: GapBarProps) {
  const gap = target - current;
  const votosGap = totalVotes
    ? Math.round(totalVotes * gap / 100)
    : null;

  // Clamp percentages for bar rendering (0–100)
  const currentClamped = Math.max(0, Math.min(100, current));
  const targetClamped = Math.max(0, Math.min(100, target));

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Big numbers row */}
      <div className="flex items-end justify-between gap-4">
        {/* Current % */}
        <div className="flex flex-col items-start">
          <span
            className="font-black leading-none tabular-nums"
            style={{ fontSize: "64px", color: "#ef4444" }}
          >
            {current}%
          </span>
          <span className="text-xs text-white/40 uppercase tracking-wider mt-1">
            Hoy
          </span>
        </div>

        {/* Gap indicator */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-2xl font-black text-white/60 tabular-nums">
            +{gap}pts
          </span>
          {weeks !== undefined && weeks > 0 && (
            <span
              className="text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full"
              style={{
                color: "#fbbf24",
                backgroundColor: "#fbbf2418",
                border: "1px solid #fbbf2440",
              }}
            >
              {weeks} sem.
            </span>
          )}
        </div>

        {/* Target % */}
        <div className="flex flex-col items-end">
          <span
            className="font-black leading-none tabular-nums"
            style={{ fontSize: "64px", color: "#22c55e" }}
          >
            {target}%
          </span>
          <span className="text-xs text-white/40 uppercase tracking-wider mt-1 text-right">
            Meta
          </span>
        </div>
      </div>

      {/* Progress bar — 40px tall */}
      <div className="relative w-full rounded-lg overflow-hidden" style={{ height: "40px", backgroundColor: "#1a2744" }}>
        {/* Solid red zone (0 → current%) */}
        <div
          className="absolute left-0 top-0 bottom-0 rounded-l-lg"
          style={{
            width: `${currentClamped}%`,
            background: "linear-gradient(to right, #b91c1c, #ef4444)",
          }}
        />

        {/* Hatched amber zone (current% → target%) */}
        {targetClamped > currentClamped && (
          <div
            className="absolute top-0 bottom-0"
            style={{
              left: `${currentClamped}%`,
              width: `${targetClamped - currentClamped}%`,
              background: "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(251,191,36,0.15) 3px, rgba(251,191,36,0.15) 4px)",
              borderLeft: "2px dashed rgba(251,191,36,0.6)",
            }}
          />
        )}

        {/* Green marker at target% */}
        <div
          className="absolute top-0 bottom-0"
          style={{
            left: `${targetClamped}%`,
            width: "2px",
            backgroundColor: "#22c55e",
          }}
        />
      </div>

      {/* Bar label */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/50">
          {votosGap !== null
            ? `${fmt(votosGap)} votos a conquistar`
            : `${gap} puntos de brecha`}
        </span>
        {totalVotes && (
          <span className="text-white/30">
            Padrón: {fmt(totalVotes)}
          </span>
        )}
      </div>

      {/* Caption */}
      <p className="text-[11px] text-white/30 leading-relaxed">
        GAP electoral: {gap} puntos · de {current}% actual a {target}% meta
        {weeks !== undefined && weeks > 0 ? ` · ${weeks} semanas disponibles` : ""}
        {votosGap !== null ? ` · ${fmt(votosGap)} votos adicionales` : ""}
      </p>
    </div>
  );
}
```

- [ ] Verification: `cd /Users/milaa/sandbox/maquina-electoral-goberna/apps/web && bunx tsc --noEmit 2>&1 | tail -5` — expected empty output.
- [ ] Commit: `feat(fase2): add GapBar electoral visualization component`

---

## Task 5: SlideMap component (MapLibre)

- [ ] **Create:** `apps/web/app/onboarding/[slug]/fase-2/_components/slides/shared/SlideMap.tsx`

Complete file content:

```tsx
"use client";

import { memo } from "react";
import { Map as MapLibre, Source, Layer } from "@vis.gl/react-maplibre";
import type { FillLayerSpecification, LineLayerSpecification } from "maplibre-gl";

interface SlideMapProps {
  geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  bbox: [number, number, number, number]; // [w, s, e, n]
  accentColor?: string;
  height?: string;
}

const DARK_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// Hoisted outside component to prevent re-render
const FILL_PAINT: FillLayerSpecification["paint"] = {
  "fill-color": "#fbbf24",
  "fill-opacity": 0.18,
};
const LINE_PAINT: LineLayerSpecification["paint"] = {
  "line-color": "#fbbf24",
  "line-width": 2.5,
  "line-opacity": 0.9,
};

function SlideMapInner({
  geojson,
  bbox,
  height = "100%",
}: SlideMapProps) {
  const [w, s, e, n] = bbox;
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  const span = Math.max(n - s, e - w);
  const zoom = Math.max(6, Math.min(12, Math.log2(360 / span) - 1));

  const geojsonData: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: geojson,
      },
    ],
  };

  return (
    <div
      style={{
        height,
        width: "100%",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      <MapLibre
        mapStyle={DARK_STYLE}
        initialViewState={{ longitude: cx, latitude: cy, zoom }}
        interactive={false}
        attributionControl={false}
      >
        <Source id="district-src" type="geojson" data={geojsonData}>
          <Layer id="district-fill" type="fill" paint={FILL_PAINT} />
          <Layer id="district-line" type="line" paint={LINE_PAINT} />
        </Source>
      </MapLibre>
    </div>
  );
}

export const SlideMap = memo(SlideMapInner);
```

**Important:** Parent slides must NOT import this directly. They must use:

```typescript
const SlideMapDynamic = dynamic<SlideMapProps>(
  () => import("../shared/SlideMap").then(mod => ({ default: mod.SlideMap })),
  { ssr: false }
);
```

Where `SlideMapProps` is re-typed locally or imported from `"../shared/SlideMap"` as a type-only import.

- [ ] Verification: `cd /Users/milaa/sandbox/maquina-electoral-goberna/apps/web && bunx tsc --noEmit 2>&1 | tail -5` — expected empty output.
- [ ] Commit: `feat(fase2): add SlideMap MapLibre wrapper`

---

## Task 6: Enhance SlideHero (editorial polish)

- [ ] **Modify:** `apps/web/app/onboarding/[slug]/fase-2/_components/slides/SlideHero.tsx`

**Change 1** — Add import at top of file (after existing imports):

```typescript
// Before (existing imports end):
import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";

// After — add new import:
import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";
import { EditorialHeader } from "./shared/EditorialHeader";
```

**Change 2** — In the right column (`lg:w-3/5` div), REPLACE the cargo/badge `<motion.div>` block:

Old block (lines 74–87 in the current file):

```tsx
        {/* Cargo label */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="text-[11px] uppercase tracking-[0.25em] text-amber-400/60 font-semibold mb-3">
            Candidato a
          </p>
          <div className="inline-block bg-amber-400/10 border border-amber-400/30 rounded px-3 py-1.5 mb-4">
            <span className="text-amber-400 font-black text-sm uppercase tracking-[0.15em]">
              {cargoLabel}
            </span>
          </div>
        </motion.div>
```

New block:

```tsx
        {/* Editorial header — Acto I */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <EditorialHeader
            microLabel="ACTO I · PERFIL DEL CANDIDATO"
            headline={`${cargoLabel}${territorio ? ` · ${territorio}` : ""}`}
            accentColor="#fbbf24"
            headlineSize="sm"
          />
        </motion.div>
```

**Change 3** — REMOVE the entire fortalezas pills block (lines 136–153):

```tsx
        {/* Fortalezas pills si hay diagnostico_inicial */}
        {(f2?.fase1_rapida?.diagnostico_inicial?.fortalezas?.length ?? 0) > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.5 }}
            className="flex flex-wrap gap-2 pt-2"
          >
            {f2!.fase1_rapida!.diagnostico_inicial!.fortalezas!.slice(0, 3).map((f, i) => (
              <span
                key={i}
                className="bg-amber-400/10 text-amber-400 border border-amber-400/20 px-3 py-1 rounded-full text-xs font-semibold"
              >
                {f}
              </span>
            ))}
          </motion.div>
        )}
```

This block is deleted entirely — no replacement.

**Change 4** — Strengthen the slogan block. Replace:

```tsx
            className="border-l-2 border-amber-400/50 pl-4"
          >
            <p className="text-white/80 text-base italic font-light leading-snug">
```

With:

```tsx
            className="border-l-[3px] border-amber-400/50 pl-4"
          >
            <p className="text-white/80 text-lg italic font-light leading-relaxed">
```

- [ ] Verification: `cd /Users/milaa/sandbox/maquina-electoral-goberna/apps/web && bunx tsc --noEmit 2>&1 | tail -5` — expected empty output.
- [ ] Commit: `feat(fase2): enhance SlideHero with EditorialHeader and remove fortalezas`

---

## Task 7: Rebuild SlideContextoTerritorial (map + urgency bars)

- [ ] **Modify:** `apps/web/app/onboarding/[slug]/fase-2/_components/slides/SlideContextoTerritorial.tsx`

Replace the entire file with the following complete content:

```tsx
"use client";

/**
 * SlideContextoTerritorial — rebuilt with MapLibre polygon + EditorialHeader.
 *
 * Layout: 2-col grid (55% map | 45% data).
 * Map is lazy-loaded via dynamic() to prevent SSR issues with MapLibre.
 * Falls back to stats-only layout when geojson/bbox are not available.
 */
import { useEffect, useState, memo } from "react";
import { motion } from "motion/react";
import dynamic from "next/dynamic";

import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";
import {
  fetchDistritoDetail,
  formatSoles,
  type DistritoDetail,
} from "@/lib/onboarding-fase1-api";
import { EditorialHeader } from "./shared/EditorialHeader";

// Lazy-load SlideMap — MapLibre requires window, cannot SSR
const SlideMapDynamic = dynamic(
  () => import("./shared/SlideMap").then(mod => ({ default: mod.SlideMap })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-white/5 rounded-xl animate-pulse" />
    ),
  }
);

// ── Urgency config ─────────────────────────────────────────────────────────────
const URGENCY_COLORS = ["#ef4444", "#f97316", "#fbbf24"] as const;
const URGENCY_WIDTHS = ["90%", "70%", "55%"] as const;

// ── Simulador de datos para fallback ──────────────────────────────────────────
function simTerritorio(seed: string) {
  const h = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0);
  return {
    poblacion: ((h % 500) + 50) * 1000,
    padron: Math.floor(((h % 400) + 30) * 1000 * 0.7),
    areakm2: (h % 800) + 50,
    pimMillones: (h % 150) + 20,
    rankingPim: (h % 50) + 5,
    totalDistritos: 50 + (h % 100),
    problemasTop: ["Agua y saneamiento", "Seguridad ciudadana", "Empleo"][h % 3]!,
  };
}

function fmt(n: number) {
  return n.toLocaleString("es-PE");
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  ctx: CandidatoContext;
  f2?: ConsultorFormFase2;
}

// ── Slide ─────────────────────────────────────────────────────────────────────
export function SlideContextoTerritorial({ ctx, f2 }: Props) {
  const [detail, setDetail] = useState<DistritoDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const idDistrito = ctx.jurisdiccion.distrito?.id ?? null;

  useEffect(() => {
    if (!idDistrito) { setLoading(false); return; }
    let cancelled = false;
    fetchDistritoDetail(idDistrito, { simplify: 0, anio: 2026 })
      .then((d) => { if (!cancelled) { setDetail(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [idDistrito]);

  if (!idDistrito) return null;

  const distritoNombre =
    detail?.distrito ?? ctx.jurisdiccion.distrito?.nombre ?? "—";

  // ── Map data from ctx snapshot ─────────────────────────────────────────────
  const mapGeojson = ctx.geojson as (GeoJSON.Polygon | GeoJSON.MultiPolygon) | null;
  const mapBbox = ctx.bbox ?? null;
  const hasMap = !!(mapGeojson && mapBbox);

  // ── Stats with fallback chain ──────────────────────────────────────────────
  const seed = ctx.user.full_name || distritoNombre;
  const sim = simTerritorio(seed);

  const fase1ctx = f2?.fase1_rapida?.contexto_territorio;

  const poblacionDB = detail?.poblacion_total_2025 ?? null;
  const poblacionF1 = fase1ctx?.poblacion_aproximada ?? null;
  const poblacion = poblacionDB ?? poblacionF1 ?? sim.poblacion;

  const areaDB = detail?.area_km2 ?? null;
  const area = areaDB ?? sim.areakm2;
  const areaSim = !areaDB;

  const densidad = poblacion && area ? Math.round(poblacion / area) : null;

  const padronDB = detail?.padron?.poblacion_electoral ?? null;
  const padron = padronDB ?? sim.padron;
  const padronSim = !padronDB;
  const padronLabel = detail?.padron?.eleccion_nombre ?? "Padrón electoral";

  const pimRaw = detail?.presupuesto?.pim ? Number(detail.presupuesto.pim) : null;
  const pimFormatted = pimRaw ? formatSoles(pimRaw) : `S/ ${sim.pimMillones} M`;
  const pimSim = !pimRaw;

  const ranking = detail?.ranking_pim ?? null;
  const rankingPos = ranking?.posicion ?? sim.rankingPim;
  const rankingTotal = ranking?.total ?? sim.totalDistritos;
  const rankingSim = !ranking;

  const problemasF1: string[] = fase1ctx?.principales_problemas ?? [];
  const problemasDisplay =
    problemasF1.length > 0
      ? problemasF1.slice(0, 3)
      : [sim.problemasTop, "Infraestructura vial", "Salud pública"];

  return (
    <div
      className="relative flex-1 flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/10 min-h-[70vh] bg-[#020a1e]"
    >
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[55%_45%] gap-0">
        {/* ── Left col: Map (only when data present) ─────────────────────── */}
        {hasMap && !loading && (
          <div className="relative min-h-[320px] lg:min-h-0 p-4">
            <SlideMapDynamic
              geojson={mapGeojson}
              bbox={mapBbox}
              height="100%"
            />
          </div>
        )}

        {/* When no map, make right col full width */}
        <div
          className={`flex flex-col px-8 py-8 gap-6 ${!hasMap || loading ? "lg:col-span-2" : ""}`}
        >
          {/* Loading indicator */}
          {loading && (
            <div className="flex items-center gap-2 text-white/30 text-sm animate-pulse">
              Cargando datos territoriales…
            </div>
          )}

          {/* Editorial header */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <EditorialHeader
              microLabel="ACTO II · TERRITORIO"
              headline={`${distritoNombre} — ${padronSim ? "~" : ""}${fmt(padron)} electores.`}
              accentColor="#ef4444"
            />
          </motion.div>

          {/* Mega number: padrón */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="flex flex-col"
          >
            <span className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-1">
              {padronLabel}
            </span>
            <span className="text-5xl font-black text-white tabular-nums leading-none">
              {fmt(padron)}
            </span>
            {padronSim && (
              <span className="text-[10px] italic text-amber-400/30 mt-1">estimado (sim)</span>
            )}
          </motion.div>

          {/* Urgency bars for problems */}
          {problemasDisplay.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="flex flex-col gap-3"
            >
              <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold">
                Problemas urgentes
              </p>
              {problemasDisplay.map((prob, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <span className="text-xs text-white/70">{prob}</span>
                  <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: URGENCY_WIDTHS[i] ?? "40%",
                        backgroundColor: URGENCY_COLORS[i] ?? "#6b7280",
                      }}
                    />
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {/* Stats 2×2 grid */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="grid grid-cols-2 gap-3"
          >
            <div className="bg-white/[0.04] border border-white/8 rounded-xl p-3">
              <p className="text-[9px] uppercase tracking-wider text-white/30 font-semibold mb-1">Área</p>
              <p className="text-xl font-black text-white">{fmt(area)} km²</p>
              {densidad && <p className="text-[10px] text-white/30">{fmt(densidad)} hab/km²{areaSim ? " (est.)" : ""}</p>}
            </div>
            <div className="bg-white/[0.04] border border-white/8 rounded-xl p-3">
              <p className="text-[9px] uppercase tracking-wider text-white/30 font-semibold mb-1">PIM 2026</p>
              <p className="text-xl font-black text-white">{pimFormatted}</p>
              {pimSim && <p className="text-[10px] text-amber-400/30 italic">estimado (sim)</p>}
            </div>
            <div className="bg-white/[0.04] border border-white/8 rounded-xl p-3">
              <p className="text-[9px] uppercase tracking-wider text-white/30 font-semibold mb-1">Ranking</p>
              <p className="text-xl font-black text-white">#{rankingPos}</p>
              <p className="text-[10px] text-white/30">de {fmt(rankingTotal)}{rankingSim ? " (est.)" : ""}</p>
            </div>
            <div className="bg-white/[0.04] border border-white/8 rounded-xl p-3">
              <p className="text-[9px] uppercase tracking-wider text-white/30 font-semibold mb-1">Densidad</p>
              <p className="text-xl font-black text-white">
                {densidad ? `${fmt(densidad)}` : "—"}
              </p>
              <p className="text-[10px] text-white/30">hab/km²</p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/** Predicate visible para registrar en el deck. */
export function isSlideContextoTerritorialVisible(ctx: CandidatoContext): boolean {
  return Boolean(ctx.jurisdiccion.distrito?.id);
}
```

- [ ] Verification: `cd /Users/milaa/sandbox/maquina-electoral-goberna/apps/web && bunx tsc --noEmit 2>&1 | tail -5` — expected empty output.
- [ ] Commit: `feat(fase2): rebuild SlideContextoTerritorial with MapLibre polygon`

---

## Task 8: Rebuild SlideConciencia (GapBar + migrate to territorio_ecd)

- [ ] **Modify:** `apps/web/app/onboarding/[slug]/fase-2/_components/slides/SlideConciencia.tsx`

Replace the entire file with:

```tsx
"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";
import { EditorialHeader } from "./shared/EditorialHeader";
import { GapBar } from "./shared/GapBar";

interface Props {
  f2: ConsultorFormFase2;
}

function fmt(n: number): string {
  return n.toLocaleString("es-PE");
}

export function SlideConciencia({ f2 }: Props) {
  const ecd = f2.territorio_ecd;
  const pctActual = ecd?.c5_intencion_voto?.pct_nuestro_candidato ?? null;
  const rival = ecd?.c5_intencion_voto?.candidato_puntero ?? null;
  const padron = f2.votos_para_ganar?.padron_actual ?? null;
  const fechaEleccion = f2.fase1_rapida?.postulacion?.fecha_eleccion ?? null;

  // Compute weeks to election
  const weeksToElection = fechaEleccion
    ? Math.max(0, Math.ceil(
        (new Date(fechaEleccion).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)
      ))
    : undefined;

  // Target: votos_meta as % of padron, or default 51
  const pctTarget =
    padron && f2.votos_para_ganar?.votos_meta
      ? Math.round((f2.votos_para_ganar.votos_meta / padron) * 100)
      : 51;

  const gap = pctActual !== null ? pctTarget - pctActual : null;
  const votosGap =
    padron && gap !== null ? Math.round(padron * gap / 100) : null;

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-8">
      {/* ── Editorial Header ──────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <EditorialHeader
          microLabel="ACTO II · CONCIENCIA ELECTORAL"
          headline={
            pctActual !== null && gap !== null
              ? `Necesitás ${gap} punto${gap !== 1 ? "s" : ""} más. Hay un plan.`
              : "Posición electoral del candidato."
          }
          accentColor="#ef4444"
        />
      </motion.div>

      {/* ── GapBar (only when data present) ──────────────────────────────── */}
      {pctActual !== null ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
        >
          <GapBar
            current={pctActual}
            target={pctTarget}
            weeks={weeksToElection}
            totalVotes={padron ?? undefined}
          />
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white/[0.03] border border-white/10 rounded-xl p-6"
        >
          <p className="text-sm text-white/40 italic">
            Completá la sección C5 del perfil ECD para ver la simulación del GAP.
          </p>
        </motion.div>
      )}

      {/* ── Rival info ────────────────────────────────────────────────────── */}
      {rival && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="flex items-center gap-3 bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3"
        >
          <div className="h-3 w-3 rounded-full bg-red-500 shrink-0" />
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wider text-red-400/60 font-semibold">
              Candidato puntero
            </span>
            <span className="text-sm font-bold text-white">{rival}</span>
          </div>
        </motion.div>
      )}

      {/* ── Editorial note ────────────────────────────────────────────────── */}
      {pctActual !== null && padron && votosGap !== null && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45, duration: 0.4 }}
          className="text-xs text-white/30 leading-relaxed border-t border-white/5 pt-4"
        >
          Para ganar con {pctTarget}% necesitás capturar{" "}
          <span className="text-white/60 font-semibold">{fmt(votosGap)} votos</span>{" "}
          adicionales de los{" "}
          <span className="text-white/60 font-semibold">{fmt(padron)}</span>{" "}
          electores habilitados.
        </motion.p>
      )}
    </div>
  );
}

export function isSlideConcienciaVisible(f2: ConsultorFormFase2): boolean {
  return f2.territorio_ecd?.c5_intencion_voto?.pct_nuestro_candidato != null;
}
```

- [ ] Verification: `cd /Users/milaa/sandbox/maquina-electoral-goberna/apps/web && bunx tsc --noEmit 2>&1 | tail -5` — expected empty output.
- [ ] Commit: `feat(fase2): rebuild SlideConciencia with GapBar and territorio_ecd data`

---

## Task 9: Rebuild SlideDecision ("órdenes de batalla")

- [ ] **Modify:** `apps/web/app/onboarding/[slug]/fase-2/_components/slides/SlideDecision.tsx`

Replace the entire file with:

```tsx
"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2, D5MatrixRow } from "@/lib/onboarding-api";
import { EditorialHeader } from "./shared/EditorialHeader";

interface Props {
  f2: ConsultorFormFase2;
}

const PROB_CAMBIO_COLOR: Record<NonNullable<D5MatrixRow["prob_cambio"]>, string> = {
  alta: "#ef4444",
  media: "#fbbf24",
  baja: "#22c55e",
};

const PROB_CAMBIO_LABEL: Record<NonNullable<D5MatrixRow["prob_cambio"]>, string> = {
  alta: "ALTA",
  media: "MEDIA",
  baja: "BAJA",
};

export function SlideDecision({ f2 }: Props) {
  const d5 = f2.territorio_ecd?.d5_matrix ?? [];

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-6">
      {/* ── Editorial Header ──────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <EditorialHeader
          microLabel="ACTO III · CONTRA QUIÉN"
          headline={`${d5.length > 0 ? d5.length : 3} segmento${d5.length !== 1 ? "s" : ""}. Cada uno necesita una estrategia diferente.`}
          accentColor="#3b82f6"
        />
      </motion.div>

      {/* ── D5 Battle Orders Table ────────────────────────────────────────── */}
      {d5.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="flex flex-col gap-2 flex-1"
        >
          {/* Table header */}
          <div className="grid grid-cols-[1fr_2fr_1fr_80px] gap-3 px-4 pb-2 border-b border-white/5">
            {["Segmento", "Mensaje clave", "Canal", "Prob. cambio"].map((h) => (
              <p key={h} className="text-[9px] uppercase tracking-[0.18em] text-white/25 font-semibold">
                {h}
              </p>
            ))}
          </div>

          {/* Table rows */}
          <div className="flex flex-col gap-1">
            {d5.map((row, i) => {
              const probColor = row.prob_cambio
                ? PROB_CAMBIO_COLOR[row.prob_cambio]
                : "#6b7280";
              const probLabel = row.prob_cambio
                ? PROB_CAMBIO_LABEL[row.prob_cambio]
                : "—";

              return (
                <motion.div
                  key={row.segmento_id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.07 }}
                  className="grid grid-cols-[1fr_2fr_1fr_80px] gap-3 items-start bg-white/[0.03] border border-white/8 rounded-xl px-4 py-3"
                  style={{ borderLeft: `3px solid ${probColor}` }}
                >
                  <p className="text-xs font-bold text-white leading-snug">
                    {row.segmento_id}
                  </p>
                  <p className="text-xs text-white/70 leading-snug">
                    {row.mensaje_clave ?? "—"}
                  </p>
                  <p className="text-xs text-white/50 leading-snug">
                    {row.canal_efectivo ?? "—"}
                  </p>
                  <span
                    className="text-[9px] font-black uppercase px-2 py-1 rounded text-center"
                    style={{
                      color: probColor,
                      backgroundColor: `${probColor}18`,
                      border: `1px solid ${probColor}40`,
                    }}
                  >
                    {probLabel}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white/[0.03] border border-white/10 rounded-xl p-6 flex-1 flex items-center justify-center"
        >
          <p className="text-sm text-white/40 italic text-center">
            Completá la sección D5 del análisis ECD para ver las órdenes de batalla.
          </p>
        </motion.div>
      )}
    </div>
  );
}

export function isSlideDecisionVisible(f2: ConsultorFormFase2): boolean {
  return !!(f2.territorio_ecd?.d5_matrix?.length);
}
```

- [ ] Verification: `cd /Users/milaa/sandbox/maquina-electoral-goberna/apps/web && bunx tsc --noEmit 2>&1 | tail -5` — expected empty output.
- [ ] Commit: `feat(fase2): rebuild SlideDecision with D5 battle orders table`

---

## Task 10: Rebuild SlideNucleoGoberna (proposal-centered)

- [ ] **Modify:** `apps/web/app/onboarding/[slug]/fase-2/_components/slides/SlideNucleoGoberna.tsx`

Replace the entire file with:

```tsx
"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";
import { EditorialHeader } from "./shared/EditorialHeader";

interface Props {
  f2: ConsultorFormFase2;
}

export function SlideNucleoGoberna({ f2 }: Props) {
  const nucleo = f2.territorio_ecd?.nucleo_goberna;
  const propuesta = nucleo?.propuesta_central ?? null;
  const diferenciador = nucleo?.diferenciador_clave ?? null;
  const segmentos = nucleo?.segmentos_prioritarios ?? [];

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-6">
      {/* ── Editorial Header ──────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <EditorialHeader
          microLabel="ACTO IV · CÓMO GANÁS"
          headline="La propuesta central define la campaña."
          accentColor="#22c55e"
        />
      </motion.div>

      {propuesta ? (
        <>
          {/* ── Main proposal card (~70% of remaining height) ─────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.55 }}
            className="flex-1 flex flex-col bg-black border rounded-2xl p-8 gap-4"
            style={{ borderLeft: "4px solid #22c55e", borderTopColor: "rgba(255,255,255,0.06)", borderRightColor: "rgba(255,255,255,0.06)", borderBottomColor: "rgba(255,255,255,0.06)" }}
          >
            <p
              className="font-black text-white leading-snug"
              style={{ fontSize: "clamp(18px, 2.5vw, 24px)" }}
            >
              {propuesta}
            </p>
            {diferenciador && (
              <p className="text-sm text-white/60 leading-relaxed border-t border-white/5 pt-4">
                {diferenciador}
              </p>
            )}
          </motion.div>

          {/* ── Segmentos prioritarios pills ──────────────────────────────── */}
          {segmentos.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="flex flex-wrap gap-2"
            >
              {segmentos.slice(0, 3).map((seg, i) => (
                <span
                  key={seg.segmento_id ?? i}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full"
                  style={{
                    color: "#22c55e",
                    backgroundColor: "#22c55e18",
                    border: "1px solid #22c55e40",
                  }}
                >
                  {seg.accion_inmediata ?? seg.segmento_id}
                </span>
              ))}
            </motion.div>
          )}
        </>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white/[0.03] border border-white/10 rounded-xl p-6 flex-1 flex items-center justify-center"
        >
          <p className="text-sm text-white/40 italic text-center">
            Completá la sección Núcleo Goberna en el perfil ECD.
          </p>
        </motion.div>
      )}
    </div>
  );
}

export function isSlideNucleoGobernaVisible(f2: ConsultorFormFase2): boolean {
  return !!(f2.territorio_ecd?.nucleo_goberna?.propuesta_central);
}
```

- [ ] Verification: `cd /Users/milaa/sandbox/maquina-electoral-goberna/apps/web && bunx tsc --noEmit 2>&1 | tail -5` — expected empty output.
- [ ] Commit: `feat(fase2): rebuild SlideNucleoGoberna with proposal-centered layout`

---

## Task 11: Enhance SlideCierre (+ 3 actions from nucleo_goberna)

- [ ] **Modify:** `apps/web/app/onboarding/[slug]/fase-2/_components/slides/SlideCierre.tsx`

**Change 1** — Add import after existing import of `ConsultorFormFase2`:

```typescript
import { EditorialHeader } from "./shared/EditorialHeader";
```

**Change 2** — Add the following data extraction inside the `SlideCierre` function body, right after `const { dias, esEstimado } = computeDaysToElection(fechaEleccion);`:

```typescript
  const accionesRaw = (f2?.territorio_ecd?.nucleo_goberna?.segmentos_prioritarios ?? [])
    .slice(0, 3)
    .map((s, i) => ({
      num: `0${i + 1}`,
      text: s.accion_inmediata ?? `Acción ${i + 1}`,
      color: (["#fbbf24", "#ef4444", "#22c55e"] as const)[i] ?? "#fbbf24",
    }));
  const fallbackAcciones = [
    { num: "01", text: "Activar red de brigadistas en zonas fuertes", color: "#fbbf24" as const },
    { num: "02", text: "Lanzar campaña de comunicación digital", color: "#ef4444" as const },
    { num: "03", text: "Agendar reunión con líderes territoriales clave", color: "#22c55e" as const },
  ];
  const displayAcciones = accionesRaw.length >= 3 ? accionesRaw : fallbackAcciones;
```

**Change 3** — Insert `<EditorialHeader>` at the TOP of the inner content `div` (with class `max-w-xl w-full flex flex-col items-center gap-7`), BEFORE the shield/logo `<motion.div>`:

```tsx
          {/* Editorial header */}
          <div className="w-full">
            <EditorialHeader
              microLabel="ACTO IV · CIERRE"
              headline="La batalla se decide en los próximos días."
              accentColor="#22c55e"
            />
          </div>
```

**Change 4** — After the countdown `<motion.div>` block (the amber number block), insert the 3 actions section:

```tsx
          {/* 3 acciones inmediatas */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="flex flex-col gap-2 w-full max-w-sm"
          >
            {displayAcciones.map((a) => (
              <div key={a.num} className="flex items-center gap-3 text-left">
                <span
                  className="text-xs font-black tabular-nums shrink-0"
                  style={{ color: a.color }}
                >
                  {a.num}
                </span>
                <span className="text-sm text-white/70">{a.text}</span>
              </div>
            ))}
          </motion.div>
```

- [ ] Verification: `cd /Users/milaa/sandbox/maquina-electoral-goberna/apps/web && bunx tsc --noEmit 2>&1 | tail -5` — expected empty output.
- [ ] Commit: `feat(fase2): enhance SlideCierre with 3 immediate actions`

---

## Task 12: Add EditorialHeader to Acto I support slides

- [ ] **Modify** 7 files in `apps/web/app/onboarding/[slug]/fase-2/_components/slides/`

For each file, the pattern is:
1. Add `import { EditorialHeader } from "./shared/EditorialHeader";`
2. Replace the header block (containing `<SlideLabel>` + `<h2>`) with an `<EditorialHeader>` component call
3. Remove `import { SlideLabel } from "../_ui/critico";` if no longer used in that file

### SlideFichaTecnica.tsx

Current header block to replace:

```tsx
        <div>
          <SlideLabel>Perfil del candidato</SlideLabel>
          <h2 className="text-3xl lg:text-4xl font-black uppercase text-white tracking-tight leading-none">
            Ficha del Candidato
          </h2>
          <div className="mt-2 inline-block bg-amber-400/10 border border-amber-400/30 rounded px-3 py-1">
            <span className="text-amber-400 text-xs font-black uppercase tracking-[0.15em]">
              {cargoLabel}
            </span>
          </div>
        </div>
```

Replace with:

```tsx
        <div>
          <EditorialHeader
            microLabel="ACTO I · FICHA DEL CANDIDATO"
            headline={`${cargoLabel} · ${ctx.jurisdiccion.distrito?.nombre ?? ctx.jurisdiccion.provincia?.nombre ?? ""}`}
            accentColor="#fbbf24"
          />
        </div>
```

Remove the `import { CriticoSello, SlideLabel }` and change to `import { CriticoSello } from "../_ui/critico";` (keep `CriticoSello` since it's still used in the file).

### SlideN1Identidad.tsx

Current header block to replace:

```tsx
        <SlideLabel>N1 · Identidad del candidato</SlideLabel>
        <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
          {n1?.nombres_completos ?? "Sin nombre"}
        </h2>
        {n1?.profesion_declarada && (
          <p className="text-sm text-white/40 mt-1">{n1.profesion_declarada}</p>
        )}
```

Replace with:

```tsx
        <EditorialHeader
          microLabel="ACTO I · N1 IDENTIDAD"
          headline={n1?.nombres_completos ? `${n1.nombres_completos} — quién es.` : "Identidad del candidato."}
          accentColor="#fbbf24"
        />
        {n1?.profesion_declarada && (
          <p className="text-sm text-white/40 mt-3">{n1.profesion_declarada}</p>
        )}
```

Remove `import { SlideLabel } from "../_ui/critico";` entirely.

### SlidePerfil5N.tsx

Find the header block with `<SlideLabel>` and `<h2>` and replace:

```tsx
        <SlideLabel>{/* existing label content */}</SlideLabel>
        <h2 className="...">
          {/* existing heading */}
        </h2>
```

With:

```tsx
        <EditorialHeader
          microLabel="ACTO I · PERFIL 5N"
          headline="Cinco dimensiones que definen la posición del candidato."
          accentColor="#fbbf24"
        />
```

Remove `SlideLabel` import.

### SlideN2Trayectoria.tsx

Replace the `<SlideLabel>` + `<h2>` header block with:

```tsx
        <EditorialHeader
          microLabel="ACTO I · N2 TRAYECTORIA"
          headline="Historial que respalda la candidatura."
          accentColor="#fbbf24"
        />
```

Remove `SlideLabel` import.

### SlideN3Riesgo.tsx

Replace the `<SlideLabel>` + `<h2>` header block with:

```tsx
        <EditorialHeader
          microLabel="ACTO I · N3 RIESGO"
          headline="Vulnerabilidades conocidas y su nivel de exposición."
          accentColor="#fbbf24"
        />
```

Remove `SlideLabel` import.

### SlideN4Patrimonio.tsx

Replace the `<SlideLabel>` + `<h2>` header block with:

```tsx
        <EditorialHeader
          microLabel="ACTO I · N4 PATRIMONIO"
          headline="Declaración patrimonial y transparencia."
          accentColor="#fbbf24"
        />
```

Remove `SlideLabel` import.

### SlideResumenEjecutivo.tsx

Replace the `<SlideLabel>` + `<h2>` header block with:

```tsx
        <EditorialHeader
          microLabel="ACTO I · SÍNTESIS"
          headline="Todo lo esencial en una sola página."
          accentColor="#fbbf24"
        />
```

Remove `SlideLabel` import.

- [ ] Verification after all 7: `cd /Users/milaa/sandbox/maquina-electoral-goberna/apps/web && bunx tsc --noEmit 2>&1 | tail -5` — expected empty output.
- [ ] Commit: `feat(fase2): add EditorialHeader to Acto I slides`

---

## Task 13: Add EditorialHeader to Acto II–IV support slides

- [ ] **Modify** 5 files:

### SlideTerreno.tsx

Add import: `import { EditorialHeader } from "./shared/EditorialHeader";`

Replace the header block containing `<SlideLabel>Terreno de Postulación</SlideLabel>` + `<h2>Triada ECD · {lugar}</h2>` + `<p>Estructura · Conciencia · Decisión</p>` with:

```tsx
        <EditorialHeader
          microLabel="ACTO II · TERRENO ECD"
          headline="El campo de batalla: estructura, conciencia y decisión."
          accentColor="#ef4444"
        />
```

Remove `SlideLabel` import if no longer used.

### SlideEstructura.tsx

Add import: `import { EditorialHeader } from "./shared/EditorialHeader";`

Replace the `<SlideLabel>` + `<h2>` header block with:

```tsx
        <EditorialHeader
          microLabel="ACTO II · ESTRUCTURA"
          headline="La arquitectura organizativa del territorio."
          accentColor="#ef4444"
        />
```

Remove `SlideLabel` import if no longer used.

### SlideSintesis.tsx

Add import: `import { EditorialHeader } from "./shared/EditorialHeader";`

Replace the `<SlideLabel>` + `<h2>` header block with:

```tsx
        <EditorialHeader
          microLabel="ACTO IV · SÍNTESIS ECD"
          headline="Los tres ejes se cruzan en un punto."
          accentColor="#22c55e"
        />
```

Remove `SlideLabel` import if no longer used.

### SlidePentaDComparativa.tsx

Add import: `import { EditorialHeader } from "./shared/EditorialHeader";`

Replace the `<SlideLabel>` + `<h2>` header block with:

```tsx
        <EditorialHeader
          microLabel="ACTO III · PRESENCIA DIGITAL"
          headline="Dónde está el candidato vs. la competencia."
          accentColor="#3b82f6"
        />
```

Remove `SlideLabel` import if no longer used.

### SlideHerramientas.tsx

Add import: `import { EditorialHeader } from "./shared/EditorialHeader";`

Replace the `<SlideLabel>` + `<h2>` header block with:

```tsx
        <EditorialHeader
          microLabel="ACTO IV · GOBERNA"
          headline="La plataforma que acompaña toda la campaña."
          accentColor="#22c55e"
        />
```

Remove `SlideLabel` import if no longer used.

- [ ] Verification after all 5: `cd /Users/milaa/sandbox/maquina-electoral-goberna/apps/web && bunx tsc --noEmit 2>&1 | tail -5` — expected empty output.
- [ ] Commit: `feat(fase2): add EditorialHeader to Acto II–IV slides`

---

## Task 14: Reorganize Fase2F1Deck.tsx (4-act structure + chapter slides)

- [ ] **Modify:** `apps/web/app/onboarding/[slug]/fase-2/_components/Fase2F1Deck.tsx`

**Change 1** — Add import after the `MissingSlidesIndicator` import:

```typescript
import { SlideChapter } from "./slides/shared/SlideChapter";
```

**Change 2** — Replace the entire `allCatalog` `useMemo` array (lines 73–103 in current file). The new array has 22 entries (18 content slides + 4 chapter slides). Note that `isChapter: true` entries use `formSection: null` and TypeScript will widen the inferred union type automatically since the property is only present on some entries:

```typescript
  const allCatalog = useMemo(() => {
    return [
      // ── ACTO I ────────────────────────────────────────────────────────────
      {
        id: "chapter-1", label: "", isChapter: true as const, visible: true, formSection: null,
        node: <SlideChapter actNumber="I" actTitle="QUIÉN SOS" actSubtitle="Identidad, perfil y credenciales del candidato" accentColor="#fbbf24" />,
      },
      { id: "hero",       label: "Hero",              visible: true,                                   formSection: null,                node: <SlideHero ctx={ctx} f2={f2} /> },
      { id: "ficha",      label: "Ficha Técnica",     visible: true,                                   formSection: null,                node: <SlideFichaTecnica ctx={ctx} f2={f2} /> },
      { id: "perfil-5n",  label: "Perfil 5N",         visible: isSlidePerfil5NVisible(f2),             formSection: "perfil",            node: <SlidePerfil5N ctx={ctx} f2={f2} /> },
      { id: "n1",         label: "N1 · Identidad",    visible: isSlideN1Visible(f2),                   formSection: "n1",                node: <SlideN1Identidad f2={f2} /> },
      { id: "n2",         label: "N2 · Trayectoria",  visible: isSlideN2Visible(f2),                   formSection: "n2",                node: <SlideN2Trayectoria f2={f2} /> },
      { id: "n3",         label: "N3 · Riesgo",       visible: isSlideN3Visible(f2),                   formSection: "n3",                node: <SlideN3Riesgo f2={f2} /> },
      { id: "n4",         label: "N4 · Patrimonio",   visible: isSlideN4Visible(f2),                   formSection: "n4",                node: <SlideN4Patrimonio f2={f2} /> },
      { id: "resumen",    label: "Resumen Ejecutivo", visible: isSlideResumenEjecutivoVisible(f2),      formSection: "resumen_ejecutivo", node: <SlideResumenEjecutivo f2={f2} /> },

      // ── ACTO II ───────────────────────────────────────────────────────────
      {
        id: "chapter-2", label: "", isChapter: true as const, visible: true, formSection: null,
        node: <SlideChapter actNumber="II" actTitle="DÓNDE ESTÁS" actSubtitle="Territorio, electorado y posición actual" accentColor="#ef4444" />,
      },
      { id: "contexto",   label: "Contexto",          visible: isSlideContextoTerritorialVisible(ctx), formSection: null,                node: <SlideContextoTerritorial ctx={ctx} f2={f2} /> },
      { id: "terreno",    label: "Terreno ECD",        visible: isSlideTerrenovisible(f2),              formSection: "terreno",           node: <SlideTerreno ctx={ctx} f2={f2} /> },
      { id: "estructura", label: "Estructura E",       visible: isSlideEstructuraVisible(ctx, f2),      formSection: "e1-e5",             node: <SlideEstructura ctx={ctx} f2={f2} /> },
      { id: "conciencia", label: "Conciencia C",       visible: isSlideConcienciaVisible(f2),           formSection: "c1-c5",             node: <SlideConciencia f2={f2} /> },

      // ── ACTO III ──────────────────────────────────────────────────────────
      {
        id: "chapter-3", label: "", isChapter: true as const, visible: true, formSection: null,
        node: <SlideChapter actNumber="III" actTitle="CONTRA QUIÉN" actSubtitle="Competencia, segmentos y campo de batalla" accentColor="#3b82f6" />,
      },
      { id: "decision",   label: "Decisión D",        visible: isSlideDecisionVisible(f2),             formSection: "d1-d5",             node: <SlideDecision f2={f2} /> },
      { id: "pentad",     label: "Penta-D",           visible: isSlidePentaDComparativaVisible(f2),    formSection: "presencia",         node: <SlidePentaDComparativa ctx={ctx} f2={f2} /> },

      // ── ACTO IV ───────────────────────────────────────────────────────────
      {
        id: "chapter-4", label: "", isChapter: true as const, visible: true, formSection: null,
        node: <SlideChapter actNumber="IV" actTitle="CÓMO GANÁS" actSubtitle="Estrategia, núcleo y plan de cierre" accentColor="#22c55e" />,
      },
      { id: "sintesis",      label: "Síntesis ECD",   visible: isSlideSintesisVisible(f2),             formSection: "sintesis",          node: <SlideSintesis f2={f2} /> },
      { id: "nucleo",        label: "Núcleo Goberna", visible: isSlideNucleoGobernaVisible(f2),         formSection: "sintesis",          node: <SlideNucleoGoberna f2={f2} /> },
      { id: "herramientas",  label: "Goberna",        visible: true,                                   formSection: null,                node: <SlideHerramientas /> },
      { id: "cierre",        label: "War Room",       visible: true,                                   formSection: null,                node: <SlideCierre f2={f2} /> },
    ];
  }, [ctx, f2]);
```

**Change 3** — After the existing `const slides = useMemo(...)` line, add:

```typescript
  const contentSlides = useMemo(() => slides.filter((s) => !("isChapter" in s)), [slides]);
```

And change the `total` variable from:

```typescript
  const total = slides.length;
```

To:

```typescript
  const total = slides.length;
  const contentTotal = contentSlides.length;
```

Update the `TOTAL_CATALOG` comment: `/** Total catalogado de slides de contenido (18) — excluye SlideChapter. */`

**Change 4** — Update footer dots rendering. Replace the current `slides.map(...)` in the dots section:

```tsx
            {slides.map((s, i) => {
              const isActive = i === index;
              const isPast = i < index;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => goTo(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    isActive ? "w-10 bg-amber-400" : isPast ? "w-3 bg-amber-400/40" : "w-3 bg-gray-700"
                  }`}
                  aria-label={`Slide ${i + 1}`}
                />
              );
            })}
```

With:

```tsx
            {slides.map((s, i) => {
              if ("isChapter" in s && s.isChapter) {
                return (
                  <div
                    key={s.id}
                    className="w-1 h-1 rounded-full bg-white/20"
                  />
                );
              }
              const isActive = i === index;
              const isPast = i < index;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => goTo(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    isActive ? "w-10 bg-amber-400" : isPast ? "w-3 bg-amber-400/40" : "w-3 bg-gray-700"
                  }`}
                  aria-label={`Slide ${i + 1}`}
                />
              );
            })}
```

**Change 5** — Update the progress counter display. Change:

```tsx
              <span className="text-xs text-gray-400 tabular-nums flex items-center gap-2">
                <span className="text-amber-400 font-semibold">{index + 1}</span> / {total}
                {total < TOTAL_CATALOG ? (
```

To:

```tsx
              <span className="text-xs text-gray-400 tabular-nums flex items-center gap-2">
                <span className="text-amber-400 font-semibold">{index + 1}</span> / {total}
                {contentTotal < TOTAL_CATALOG ? (
```

- [ ] Verification: `cd /Users/milaa/sandbox/maquina-electoral-goberna/apps/web && bunx tsc --noEmit 2>&1 | tail -5` — expected empty output.
- [ ] Commit: `feat(fase2): reorganize deck catalog into 4 acts with chapter slides`

---

## Task 15: Final TypeScript + build verification

- [ ] Run TypeScript check:

```bash
cd /Users/milaa/sandbox/maquina-electoral-goberna/apps/web && bunx tsc --noEmit 2>&1 | tail -20
```

Expected: zero output (no errors).

- [ ] Run full build:

```bash
cd /Users/milaa/sandbox/maquina-electoral-goberna/apps/web && bun run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` or Route table with no build errors.

### Common TypeScript errors to expect and how to fix them

**Error: `Property 'geojson' does not exist on type 'CandidatoContext'`**
The field is defined as `geojson?: unknown | null`. The cast in Task 7 is:
```typescript
const mapGeojson = ctx.geojson as (GeoJSON.Polygon | GeoJSON.MultiPolygon) | null;
```
If TypeScript complains, add `import type * as GeoJSON from "geojson"` — or use `import "geojson"` if the `@types/geojson` package is available. Check with `bunx tsc --noEmit 2>&1 | grep geojson`.

**Error: `Module '"@vis.gl/react-maplibre"' has no exported member 'Source'`**
Verify the correct import shape with:
```bash
cat /Users/milaa/sandbox/maquina-electoral-goberna/apps/web/node_modules/@vis.gl/react-maplibre/dist/index.d.ts | grep -E "export.*Source|export.*Layer"
```
Adjust imports to match the actual v8 export names.

**Error: Dynamic import of named export `SlideMap`**
If `dynamic()` complains about the `.then(mod => ({ default: mod.SlideMap }))` pattern, use a re-export shim:
```typescript
// shared/SlideMapExport.ts
export { SlideMap as default } from "./SlideMap";
```
Then use: `dynamic(() => import("../shared/SlideMapExport"), { ssr: false })`

**Error: `isChapter` not assignable to catalog entry type**
TypeScript infers the array element type from the union of all entries. Using `isChapter: true as const` ensures the field is typed as `true` not `boolean`, which keeps the discriminated union clean. If the error persists, extract an explicit type:
```typescript
type CatalogEntry =
  | { id: string; label: string; isChapter: true; visible: boolean; formSection: null; node: React.ReactNode }
  | { id: string; label: string; visible: boolean; formSection: string | null; node: React.ReactNode };
```
And cast the array: `const allCatalog: CatalogEntry[] = useMemo(() => [...], [ctx, f2]);`

**Error: `GapBar` or `EditorialHeader` — "use client" missing**
Both new components are in `slides/shared/`. Since their parents already have `"use client"`, the shared components don't strictly need their own directive. However, to be safe with Next.js 15's server component boundary detection, add `"use client";` to all files in `slides/shared/`.

---

## Self-Review Checklist

- [x] Spec §4 catalog order vs Task 14's `allCatalog`: 18 content slides + 4 chapters verified — ACTO I (8 slides), ACTO II (4 slides), ACTO III (2 slides), ACTO IV (4 slides) = 18 total content slides. Matches spec exactly.

- [x] All `import { EditorialHeader }` in Tasks 12/13 use path `"./shared/EditorialHeader"` (relative to the slides directory). This is correct since both the parent slides and the `shared/` folder are under the same `slides/` directory.

- [x] `SlideMap` export is `export const SlideMap = memo(SlideMapInner)` (Task 5). Task 7 dynamic import: `import("./shared/SlideMap").then(mod => ({ default: mod.SlideMap }))` — matches the named export. Path `"./shared/SlideMap"` is correct relative to `SlideContextoTerritorial.tsx`.

- [x] Updated visibility predicates match type field paths:
  - `isSlideConcienciaVisible`: `f2.territorio_ecd?.c5_intencion_voto?.pct_nuestro_candidato != null` — field `c5_intencion_voto.pct_nuestro_candidato: number | undefined` is in `TerritoryEcd` type ✓
  - `isSlideDecisionVisible`: `f2.territorio_ecd?.d5_matrix?.length` — field `d5_matrix?: D5MatrixRow[]` ✓
  - `isSlideNucleoGobernaVisible`: `f2.territorio_ecd?.nucleo_goberna?.propuesta_central` — field `nucleo_goberna.propuesta_central?: string` ✓

- [x] `SlideHero` in Task 14 catalog gets `f2={f2}` prop — current file signature is `Props { ctx: CandidatoContext; f2?: ConsultorFormFase2 }`. The existing deck passes `<SlideHero ctx={ctx} />` without `f2`. Task 14 adds `f2={f2}` which is correct since `f2` is `ConsultorFormFase2` (not null, the deck sets `const f2: ConsultorFormFase2 = ctx.consultor_form ?? {}`).

- [x] `SlideContextoTerritorial` in Task 14 catalog gets `f2={f2}` prop — the rebuilt component in Task 7 accepts `f2?: ConsultorFormFase2`. Passing it is correct.

- [x] `"use client"` directive — all new shared components (`EditorialHeader`, `SlideChapter`, `GapBar`, `SlideMap`) must have `"use client";` as first line. Task 2–5 code includes this. Verify during implementation.

- [x] `GeoJSON` types — `SlideMap.tsx` uses `GeoJSON.Polygon | GeoJSON.MultiPolygon` and `GeoJSON.FeatureCollection`. The `geojson` package types should be available since `@vis.gl/react-maplibre` depends on them. If not, add `"@types/geojson"` to `package.json`.

- [x] Task 11 `SlideCierre` color literal — `(["#fbbf24", "#ef4444", "#22c55e"] as const)[i] ?? "#fbbf24"` — the index access on a `readonly` tuple returns `"#fbbf24" | "#ef4444" | "#22c55e" | undefined`, so the `?? "#fbbf24"` fallback is needed. TypeScript will accept this pattern.
