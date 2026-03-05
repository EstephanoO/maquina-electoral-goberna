# AGENTS.md - Landing Publica

> **Hereda de:** `/AGENTS.md` (root) y `apps/web/AGENTS.md`
> **Estado:** ACTIVA — Landing publica en produccion
> **Ultima actualizacion:** 2026-03-05

---

## Proposito

Landing publica de Grupo Goberna que combina:
- Sitio institucional (marca, nosotros, features)
- Planes de precios (Basic, Pro, Enterprise)
- Geovisor publico interactivo con datos electorales de Peru
- Vitrina del producto para generar leads

---

## Rutas Activas

| Ruta | Descripcion | Auth |
|------|-------------|------|
| `/` | Landing: Hero + Nosotros + Planes + CTA | No |
| `/mapa` | Geovisor publico interactivo | No |
| `/home` | Dashboard redirect por rol | Si |
| `/login` | Login (redirige a `/home`) | No |
| `/register` | Registro (redirige a `/home`) | No |
| `/onboarding` | Onboarding (redirige a `/home`) | Si |

---

## Estructura de Archivos

```
app/(public)/                          <- Route group publico (sin auth)
  layout.tsx                           <- Header Goberna + nav + footer
  page.tsx                             <- Landing: Hero + Nosotros + Planes + CTA
  _components/
    public-header.tsx                  <- Navbar: logo, nav (Nosotros|Planes|Mapa), Login + Registrarse
    public-footer.tsx                  <- Footer minimo "Grupo Goberna"
    hero-section.tsx                   <- Hero con titulo, CTAs, stats (25 deptos, 196 provs, 1874 dists)
    about-section.tsx                  <- Seccion Nosotros con 4 feature cards
    pricing-section.tsx                <- Planes: Basic ($390), Plus ($1,800), Pro ($4,500), Enterprise (contactar)
    cta-section.tsx                    <- CTA final: "Tu operacion territorial empieza hoy"
  mapa/
    layout.tsx                         <- Layout fullscreen (fixed, sin footer)
    page.tsx                           <- Pagina del geovisor, lazy-loads PublicMap
    _components/
      public-map.tsx                   <- Geovisor: MapLibre + Tegola tiles, drill-down dept>prov>dist
      map-layer-panel.tsx              <- Panel lateral de capas (Division Politica + 3 "Proximamente")
```

## Planes de Precios

| Plan | Precio | Agentes | Detalle clave |
|------|--------|---------|---------------|
| Basic | $390/mes | Hasta 15 | Formularios, heatmap, CSV, 1 capacitacion |
| Plus | $1,800/mes | Hasta 50 | Todo Basic + zonas avanzadas, brigadistas, reportes auto, notificaciones RT, 2 capacitaciones |
| Pro | $4,500/mes (antes $6,000) | Hasta 120 | Mensajeria, priorizacion territorial, brigadistas ranking, API WhatsApp, 3 capacitaciones |
| Enterprise | Contactar | Ilimitado | Custom, on-premise opcional, SLA |

## Componentes Clave

### PublicHeader (`public-header.tsx`)
- Logo Goberna (isotipo PNG sin fondo + "GOBERNA" dorado)
- Nav links: Nosotros (`/#nosotros`) | Planes (`/#planes`) | Mapa (`/mapa`)
- Botones: "Iniciar Sesion" (`/login`, ghost) + "Registrarse" (`/onboarding`, dorado)
- Responsive: hamburger en mobile (<768px)
- Fondo: `goberna-blue-950`, scroll-aware (backdrop blur)

### HeroSection (`hero-section.tsx`)
- Fondo gradiente `goberna-blue-950 -> 800`
- Grid decorativo + glow radial
- Badge "Plataforma de Inteligencia Territorial"
- Titulo: "Operacion Territorial Inteligente para Campanas Politicas"
- CTAs: "Explorar Mapa" (dorado) + "Comenzar Ahora" (ghost)
- Stats: 25 Departamentos, 196 Provincias, 1,874 Distritos

### AboutSection (`about-section.tsx`)
- Header: "Inteligencia territorial para quienes construyen el Peru"
- 4 feature cards: Geovisores, Operacion de Campo, Datos Electorales, CRM Territorial
- Grid responsive (auto-fit, min 260px)

### PricingSection (`pricing-section.tsx`)
- 3 cards: Basic, Pro (highlighted, "Mas Popular" badge), Enterprise
- Pro card con fondo oscuro + borde dorado + scale(1.02)
- Pro muestra precio tachado ($6,000 → $4,500)
- Cada card con features con check icon dorado
- CTA diferenciado por plan (dorado/azul/ghost)

### CtaSection (`cta-section.tsx`)
- Fondo gradiente goberna-blue con grid decorativo
- "Tu operacion territorial empieza hoy"
- Dos CTAs: "Comenzar Ahora" (dorado) + "Hablar por WhatsApp" (ghost)

## Estilo Visual
- Paleta institucional Goberna: azul oscuro (`goberna-blue-*`) + dorado (`goberna-gold`)
- Font: Montserrat (misma que el dashboard)
- Inline styles con CSS custom properties (consistente con el dashboard)
- No usa Tailwind utilities (consistente con el resto del proyecto)

## Dependencias
No agrega dependencias nuevas. Usa:
- `@vis.gl/react-maplibre` (ya en el proyecto)
- `maplibre-gl` (ya en el proyecto)
- Tegola tiles via proxy `/api/tiles/` (ya configurado)

## Como Desactivar

Si necesitas volver a ocultar la landing:
```bash
cd apps/web/app
mv "(public)" _public_landing
mv "(dashboard)/home/page.tsx" "(dashboard)/page.tsx"
# Revertir redirects de "/home" a "/" en login, register, onboarding, candidatos, formularios, ops, not-found
```
