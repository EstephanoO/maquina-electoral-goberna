# Fase 2 Deck — Rediseño "CRÍTICO" · Estilo Roberto Sánchez

**Fecha:** 2026-05-15  
**Branch:** `feat/GBELC-14-cuaderno-campo-fase1`  
**Ruta base:** `apps/web/app/onboarding/[slug]/fase-2/_components/`

---

## Objetivo

Rediseñar los 17 slides del deck Fase 2 al estilo del PDF de referencia "Roberto Sánchez - Segunda Vuelta":
- Azul marino profundo + dorado + sellos CRÍTICO en rojo
- Paneles izquierdo/derecho (evidencia visual + análisis textual)
- Datos reales de Fase 1 form + datos de DB (padrón, PIM, geojson)
- **Datos simulados deterministamente** donde el form no tiene info (seed = `ctx.user.full_name`)

---

## Sistema de Diseño — Design Tokens

```
Fondos:
  slide bg:     #020a1e
  panel/card:   #0a1e4a  (bg-[#0a1e4a])
  panel alt:    rgba(255,255,255,0.03) con border rgba(255,255,255,0.08)

Colores:
  gold:         #ffc800  (amber-400)
  crítico:      #dc2626  (red-600)
  atención:     #d97706  (amber-600)
  ok:           #059669  (emerald-600)
  text-primary: #ffffff
  text-sec:     rgba(255,255,255,0.6)
  text-muted:   rgba(255,255,255,0.35)

Tipografía:
  labels:       11px uppercase tracking-[0.2em] text-amber-400/60 font-semibold
  valores:      15-16px text-white font-semibold
  títulos:      24-32px font-black uppercase
  CRÍTICO:      text-white font-black tracking-widest uppercase
```

## Componente CriticoSello

```tsx
// Crear en slides/_ui/critico.tsx
type SelloType = "critico" | "atencion" | "ok" | "riesgo" | "meta";

export function CriticoSello({ tipo = "critico", label }: { tipo?: SelloType; label?: string }) {
  const map = {
    critico:  { bg: "bg-red-600",     text: label ?? "CRÍTICO" },
    atencion: { bg: "bg-amber-600",   text: label ?? "ATENCIÓN" },
    riesgo:   { bg: "bg-orange-700",  text: label ?? "RIESGO" },
    ok:       { bg: "bg-emerald-600", text: label ?? "OK" },
    meta:     { bg: "bg-blue-700",    text: label ?? "META" },
  };
  const { bg, text } = map[tipo];
  return (
    <span className={`inline-block ${bg} text-white text-[11px] font-black px-3 py-1 rounded tracking-[0.15em] rotate-[-8deg] select-none`}>
      RIESGO: {text}
    </span>
  );
}
```

## Layout Split Panel (patrón reusable)

```tsx
// Panel izquierdo: evidencia/screenshot simulado (dark navy)
<div className="rounded-2xl overflow-hidden bg-[#0a1e4a] border border-white/10 p-0">
  {/* imagen / datos / screenshot simulado */}
</div>

// Panel derecho: análisis + sello CRÍTICO
<div className="flex flex-col justify-between gap-4">
  <div>
    <h2 className="text-2xl font-black uppercase text-white">
      El candidato no tiene control de su narrativa
    </h2>
    <p className="mt-3 text-sm text-white/60 leading-relaxed">...</p>
  </div>
  <div className="flex justify-end">
    <CriticoSello tipo="critico" />
  </div>
</div>
```

---

## Función de Datos Simulados

```typescript
// En cada slide que lo necesite — inline, no util externo
function simularDigital(fullName: string) {
  const h = [...fullName].reduce((a, c) => a + c.charCodeAt(0), 0);
  return {
    fb_seguidores:    ((h % 195) + 5) * 1000,   // 5k-200k
    fb_verificado:    h % 7 === 0,
    ig_seguidores:    ((h % 80) + 2) * 1000,    // 2k-82k
    ig_posts:         (h % 180) + 20,
    google_posicion:  (h % 5) + 2,              // 2-6 (nunca 1er resultado)
    tiktok_seguidores: ((h % 30) + 1) * 1000,
  };
}
```

---

## Catálogo de Slides — Plan de Rediseño

### Bloque 1: Identidad (slides 1-3)
| Slide | Archivo | Cambio |
|-------|---------|--------|
| Hero cinematográfico | SlideHero.tsx | Foto full-bleed con overlay navy+gold, nombre gigante, partido, slogan en amber |
| Ficha técnica | SlideFichaTecnica.tsx | Dark table navy, rows con border gold, labels amber, badge cargo |
| ¿Quién es? | SlideQuienEs.tsx | Split: foto izq + bio derecha con valores en pills amber |

### Bloque 2: Diagnóstico Digital CRÍTICO (slides 4-6)
| Slide | Archivo | Cambio |
|-------|---------|--------|
| Presencia Web (Google) | SlidePresenciaDigital.tsx | Slide 1 de 3: Google panel simulado izq + análisis crítico derecho |
| Facebook | SlidePresenciaDigital.tsx | Slide 2: mock FB profile + seguidores + sello CRÍTICO/ATENCIÓN |
| Instagram/TikTok | SlidePresenciaDigital.tsx | Slide 3: tabs IG/TK + análisis + sello |

> **Nota**: SlidePresenciaDigital se divide en 3 sub-vistas (tabbed) en lugar de 3 slides separados. O se crean 3 slides nuevos — ver agent decision.

### Bloque 3: Inteligencia Territorial (slides 7-10)
| Slide | Archivo | Cambio |
|-------|---------|--------|
| Contexto territorial | SlideContextoTerritorial.tsx | Mapa izq (ya existe) + stats navy cards derecha |
| Distribución poblacional | SlideDistribucionPoblacional.tsx | Mapa distritos + bars population |
| Votos para ganar | SlideVotosNecesarios.tsx | Pipeline visual izq→der, data DB padrón |

### Bloque 4: Análisis Competitivo (slides 11-13)
| Slide | Archivo | Cambio |
|-------|---------|--------|
| Competidores | SlideCompetidores.tsx | Cards navy por competidor, nivel-amenaza con color-coded bar + sello |
| Debilidades CRÍTICO | SlideDebilidades.tsx | Split: tabla fuentes izq + risk list derecha con sellos |
| FODA | SlideFoda.tsx | 4-cuadrante navy/gold, F y O en verde, D y A en rojo |

### Bloque 5: Propuesta de Campaña (slides 14-17)
| Slide | Archivo | Cambio |
|-------|---------|--------|
| Propuestas | SlidePropuestas.tsx | Cards icon+título en grid navy, eje temático en amber pill |
| Segmentos | SlideSegmentos.tsx | Donut/bars per segment, valores en pills |
| Reorganizar/Estrategia | SlideReorganizar.tsx | Timeline navy con hitos gold |

### Bloque 6: Goberna (slides 18-21)
| Slide | Archivo | Cambio |
|-------|---------|--------|
| Arquitectura | SlideArquitectura.tsx | Diagrama Tierra/Mar/Aire con navy cards |
| Herramientas | SlideHerramientas.tsx | Tool grid con iconos, feature pills |
| Cierre | SlideCierre.tsx | Full-bleed gold gradient, CTA "Agendá tu sesión" |

---

## Reglas para Datos Simulados

1. **Siempre mostrar** — nunca empty states en presencia digital. Si no hay data real → simular.
2. **CRÍTICO por defecto** en presencia digital — la ausencia de info es en sí CRÍTICA.
3. **Flag vs real**: añadir `text-[10px] italic text-amber-400/30` debajo del dato simulado con "· dato estimado".
4. **Seed determinístico** — usar `ctx.user.full_name` para hash. El mismo candidato siempre ve los mismos números simulados.
5. **Ranges realistas** para Perú/LATAM: FB 5k-200k, IG 2k-80k, web sin primer resultado.

---

## Props Contract (no cambiar)

Todos los slides mantienen sus props actuales:
```typescript
// Patrón 1 (solo form)
({ f2 }: { f2: ConsultorFormFase2 })

// Patrón 2 (contexto + form)
({ ctx, f2 }: { ctx: CandidatoContext; f2?: ConsultorFormFase2 })
```

Los predicados `isVisible` existentes se mantienen — o se vuelven `() => true` para slides de diagnóstico digital.

---

## Animaciones (mantener patrón existente)

```tsx
import { motion } from "motion/react";

<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
>
```
