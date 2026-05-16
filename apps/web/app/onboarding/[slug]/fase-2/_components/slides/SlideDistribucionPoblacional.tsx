"use client";

/**
 * SlideDistribucionPoblacional — distribución geográfica provincial.
 *
 * Estilo CRÍTICO: bg #020a1e · panel #0a1e4a · gold amber-400.
 *
 * - Mapa coropleta maplibre de todos los distritos de la provincia
 *   con fondo oscuro y stroke amber/20 sobre el distrito target.
 * - Panel de zonas fuertes/débiles (de fase1_rapida o simulado).
 * - Barra inferior con densidad hab/km².
 * - Top 3 distritos por población.
 *
 * Visible cuando hay provincia + distrito en la jurisdicción.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { motion } from "motion/react";

import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";
import {
  fetchProvinciaDistritos,
  fetchDistritoDetail,
  formatNumero,
  type ProvinciaDistritos,
  type DistritoDetail,
} from "@/lib/onboarding-fase1-api";

// ── Simulador ─────────────────────────────────────────────────────────────────

function simTerritorio(seed: string) {
  const h = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0);
  return {
    poblacion: ((h % 500) + 50) * 1000,
    areakm2: (h % 800) + 50,
  };
}

// ── Mapa oscuro basemap ───────────────────────────────────────────────────────

const DARK_BASEMAP_STYLE = {
  version: 8 as const,
  sources: {
    "carto-dark": {
      type: "raster" as const,
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [
    {
      id: "carto-dark-tiles",
      type: "raster" as const,
      source: "carto-dark",
      paint: { "raster-opacity": 0.7 },
    },
  ],
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  ctx: CandidatoContext;
  f2?: ConsultorFormFase2;
}

// ── Slide ─────────────────────────────────────────────────────────────────────

export function SlideDistribucionPoblacional({ ctx, f2 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [fc, setFc] = useState<ProvinciaDistritos | null>(null);
  const [detail, setDetail] = useState<DistritoDetail | null>(null);

  const idProvincia = ctx.jurisdiccion.provincia?.id ?? null;
  const idDistritoTarget = ctx.jurisdiccion.distrito?.id ?? null;

  useEffect(() => {
    if (!idProvincia) return;
    let cancelled = false;
    fetchProvinciaDistritos(idProvincia, { simplify: 0.002 })
      .then((d) => { if (!cancelled) setFc(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [idProvincia]);

  useEffect(() => {
    if (!idDistritoTarget) return;
    let cancelled = false;
    fetchDistritoDetail(idDistritoTarget, { simplify: 0.01 })
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [idDistritoTarget]);

  // Color breaks por densidad
  const breaks = useMemo(() => {
    if (!fc) return null;
    const densidades = fc.features
      .map((f) => f.properties.densidad_hab_km2 ?? 0)
      .filter((d) => d > 0)
      .sort((a, b) => a - b);
    if (densidades.length === 0) return null;
    const q = (p: number) => densidades[Math.floor(densidades.length * p)] ?? 0;
    return [q(0.2), q(0.4), q(0.6), q(0.8)];
  }, [fc]);

  // Montar mapa oscuro
  useEffect(() => {
    if (!containerRef.current || !fc || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_BASEMAP_STYLE as maplibregl.StyleSpecification,
      center: [-77, -10],
      zoom: 7,
      attributionControl: false,
      interactive: false,
    });

    map.on("load", () => {
      map.addSource("distritos", { type: "geojson", data: fc });

      // Coropleta amber sobre fondo oscuro
      map.addLayer({
        id: "distritos-fill",
        type: "fill",
        source: "distritos",
        paint: {
          "fill-color": breaks
            ? [
                "interpolate",
                ["linear"],
                ["coalesce", ["get", "densidad_hab_km2"], 0],
                0, "#0a1e4a",
                breaks[0]!, "#1a3066",
                breaks[1]!, "#a16207",
                breaks[2]!, "#ca8a04",
                breaks[3]!, "#fbbf24",
              ]
            : "#1a3066",
          "fill-opacity": 0.75,
        },
      });

      // Borde amber/20 para todos los distritos
      map.addLayer({
        id: "distritos-outline",
        type: "line",
        source: "distritos",
        paint: {
          "line-color": "rgba(251,191,36,0.2)",
          "line-width": 0.8,
          "line-opacity": 1,
        },
      });

      // Target highlight en amber fuerte
      if (idDistritoTarget) {
        map.addLayer({
          id: "distrito-target-fill",
          type: "fill",
          source: "distritos",
          filter: ["==", ["get", "id"], idDistritoTarget],
          paint: { "fill-color": "#ffc800", "fill-opacity": 0.25 },
        });
        map.addLayer({
          id: "distrito-target-line",
          type: "line",
          source: "distritos",
          filter: ["==", ["get", "id"], idDistritoTarget],
          paint: { "line-color": "#ffc800", "line-width": 2.5, "line-opacity": 1 },
        });
      }

      // Fit bounds
      const xs = fc.features.flatMap((f) => extractCoords(f.geometry).map((c) => c[0]));
      const ys = fc.features.flatMap((f) => extractCoords(f.geometry).map((c) => c[1]));
      if (xs.length > 0) {
        map.fitBounds(
          [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]],
          { padding: 40, duration: 0 },
        );
      }
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [fc, breaks, idDistritoTarget]);

  if (!idProvincia) return null;

  // ── Datos para el panel derecho ───────────────────────────────────

  const seed = ctx.user.full_name || ctx.jurisdiccion.distrito?.nombre || "dist";
  const sim = simTerritorio(seed);

  const fase1ctx = f2?.fase1_rapida?.contexto_territorio;
  const zonasF = fase1ctx?.zonas_fuertes ?? [];
  const zonasD = fase1ctx?.zonas_debiles ?? [];

  const distritoNombre = ctx.jurisdiccion.distrito?.nombre ?? "Tu distrito";

  const zonasSimF =
    zonasF.length > 0
      ? zonasF
      : [`${distritoNombre} centro`, "Zona norte"].slice(0, 2);
  const zonasSimD =
    zonasD.length > 0
      ? zonasD
      : ["Zona rural periférica", "Zona sur (acceso limitado)"].slice(0, 2);
  const zonasSim = zonasF.length === 0 && zonasD.length === 0;

  const poblacionTarget =
    detail?.poblacion_total_2025 ??
    fase1ctx?.poblacion_aproximada ??
    sim.poblacion;
  const areaTarget = detail?.area_km2 ?? sim.areakm2;
  const densidadTarget = Math.round(poblacionTarget / areaTarget);

  const top3 = fc
    ? [...fc.features]
        .sort((a, b) => b.properties.poblacion_total_2025 - a.properties.poblacion_total_2025)
        .slice(0, 3)
    : [];

  return (
    <div
      className="relative flex-1 flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/10 min-h-[70vh]"
      style={{ background: "#020a1e" }}
    >
      {/* Header */}
      <header className="relative px-8 sm:px-12 py-7 text-white">
        <motion.p
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-[11px] uppercase tracking-[0.2em] text-amber-400/60 font-semibold text-center mb-2"
        >
          Distribución Geográfica
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tight text-center leading-tight text-white"
        >
          Distribución Poblacional
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mt-2 text-xs sm:text-sm text-white/50 text-center font-medium"
        >
          Provincia {ctx.jurisdiccion.provincia?.nombre ?? ""} · {fc?.features.length ?? "…"} distritos
        </motion.p>
        <div className="absolute left-0 right-0 bottom-0 h-[2px] bg-amber-400/60" />
      </header>

      {/* Body */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-6 px-8 sm:px-12 py-8">
        {/* Mapa oscuro */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="lg:col-span-3 rounded-2xl overflow-hidden border border-amber-400/10 min-h-[380px] relative"
          style={{ background: "#0a1e4a" }}
        >
          <div ref={containerRef} className="absolute inset-0" />
          {!fc && (
            <div className="absolute inset-0 flex items-center justify-center text-white/30 text-sm animate-pulse">
              Cargando coropleta…
            </div>
          )}
          {/* Leyenda oscura */}
          {breaks && (
            <div
              className="absolute bottom-3 left-3 rounded-xl px-3 py-2 text-xs border border-white/10"
              style={{ background: "rgba(2,10,30,0.85)" }}
            >
              <div className="font-semibold text-amber-400/70 mb-1.5 text-[10px] uppercase tracking-widest">
                Hab/km²
              </div>
              <div className="flex items-center gap-2">
                <div className="flex flex-col gap-0.5">
                  {["#0a1e4a", "#1a3066", "#a16207", "#ca8a04", "#fbbf24"].map((c) => (
                    <div key={c} className="w-4 h-2.5 rounded-sm" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <div className="flex flex-col gap-0 text-[9px] text-white/40 justify-between">
                  <span>0</span>
                  <span>{formatNumero(breaks[0]!)}</span>
                  <span>{formatNumero(breaks[1]!)}</span>
                  <span>{formatNumero(breaks[2]!)}</span>
                  <span>{formatNumero(breaks[3]!)}+</span>
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Panel derecho */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Top 3 poblacion */}
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-amber-400/60 font-semibold mb-3">
              Top 3 por población
            </p>
            <div className="space-y-2">
              {top3.length > 0 ? (
                top3.map((f, i) => {
                  const isTarget = f.properties.id === idDistritoTarget;
                  return (
                    <motion.div
                      key={f.properties.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + i * 0.08 }}
                      className={`rounded-xl px-4 py-3 border ${
                        isTarget
                          ? "border-amber-400/50 bg-amber-400/10"
                          : "border-white/10 bg-[#0a1e4a]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className={`text-xs font-semibold ${isTarget ? "text-amber-400" : "text-white/70"}`}>
                          {f.properties.distrito}
                        </span>
                        <span className="text-[10px] text-white/30">#{i + 1}</span>
                      </div>
                      <span className={`text-lg font-black ${isTarget ? "text-amber-400" : "text-white"}`}>
                        {formatNumero(f.properties.poblacion_total_2025)}
                      </span>
                      <span className="text-[10px] text-white/40 ml-1">hab</span>
                    </motion.div>
                  );
                })
              ) : (
                <div className="rounded-xl border border-white/10 bg-[#0a1e4a] px-4 py-3 text-white/30 text-xs">
                  Cargando datos…
                </div>
              )}
            </div>
          </div>

          {/* Zonas fuertes / débiles */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.4 }}
            className="bg-[#0a1e4a] border border-white/10 rounded-2xl p-4 flex-1"
          >
            <p className="text-[11px] uppercase tracking-[0.2em] text-amber-400/60 font-semibold mb-3">
              Zonas estratégicas
              {zonasSim && (
                <span className="ml-2 text-[10px] italic text-amber-400/25 normal-case tracking-normal">
                  (sim)
                </span>
              )}
            </p>
            <div className="space-y-2 mb-3">
              <p className="text-[10px] uppercase tracking-widest text-emerald-400/60 font-semibold">
                Fuertes
              </p>
              <div className="flex flex-wrap gap-1.5">
                {zonasSimF.map((z, i) => (
                  <span
                    key={i}
                    className="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  >
                    {z}
                  </span>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-red-400/60 font-semibold">
                Débiles
              </p>
              <div className="flex flex-wrap gap-1.5">
                {zonasSimD.map((z, i) => (
                  <span
                    key={i}
                    className="text-xs px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20"
                  >
                    {z}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Densidad bottom bar */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.55 }}
            className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 flex items-center justify-between"
          >
            <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold">
              Densidad poblacional
            </p>
            <p className="text-sm font-black text-amber-400">
              {formatNumero(densidadTarget)} hab/km²
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function extractCoords(geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): number[][] {
  if (geom.type === "Polygon") return geom.coordinates.flat();
  return geom.coordinates.flat(2);
}

export function isSlideDistribucionPoblacionalVisible(ctx: CandidatoContext): boolean {
  return Boolean(ctx.jurisdiccion.provincia?.id && ctx.jurisdiccion.distrito?.id);
}
