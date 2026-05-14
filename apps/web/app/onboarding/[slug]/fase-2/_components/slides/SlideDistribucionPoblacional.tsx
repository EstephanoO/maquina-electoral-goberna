"use client";

/**
 * SlideDistribucionPoblacional — coropleta provincial con maplibre.
 *
 * Muestra todos los distritos de la provincia del candidato coloreados
 * por densidad poblacional, con el distrito target highlighted en amber.
 *
 * Datos:
 * - /api/geo/provincia/:id/distritos → FeatureCollection con poblacion + área
 * - Color scale por densidad (hab/km²)
 *
 * Visible cuando hay provincia + distrito en la jurisdicción.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { motion } from "motion/react";
import { Map as MapIcon } from "lucide-react";

import type { CandidatoContext } from "@/lib/onboarding-api";
import {
  fetchProvinciaDistritos,
  formatNumero,
  type ProvinciaDistritos,
} from "@/lib/onboarding-fase1-api";

import { SlideChromeData } from "../chrome/SlideChromeData";

const BASEMAP_STYLE = {
  version: 8 as const,
  sources: {
    "carto-basemap": {
      type: "raster" as const,
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [
    {
      id: "carto-tiles", type: "raster" as const, source: "carto-basemap",
      paint: { "raster-saturation": -0.3, "raster-contrast": 0.05 },
    },
  ],
};

interface Props {
  ctx: CandidatoContext;
}

export function SlideDistribucionPoblacional({ ctx }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [fc, setFc] = useState<ProvinciaDistritos | null>(null);

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

  // Color scale precomputado de la densidad
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

  useEffect(() => {
    if (!containerRef.current || !fc || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE as maplibregl.StyleSpecification,
      center: [-77, -10],
      zoom: 7,
      attributionControl: false,
      interactive: false,
    });

    map.on("load", () => {
      map.addSource("distritos", { type: "geojson", data: fc });

      // Coropleta por densidad
      map.addLayer({
        id: "distritos-fill",
        type: "fill",
        source: "distritos",
        paint: {
          "fill-color": breaks
            ? [
                "interpolate", ["linear"], ["coalesce", ["get", "densidad_hab_km2"], 0],
                0,           "#fef3c7",
                breaks[0]!,  "#fde68a",
                breaks[1]!,  "#fbbf24",
                breaks[2]!,  "#d97706",
                breaks[3]!,  "#92400e",
              ]
            : "#fbbf24",
          "fill-opacity": 0.65,
        },
      });

      map.addLayer({
        id: "distritos-outline",
        type: "line",
        source: "distritos",
        paint: { "line-color": "#0a1f4a", "line-width": 0.5, "line-opacity": 0.4 },
      });

      // Target highlight
      if (idDistritoTarget) {
        map.addLayer({
          id: "distrito-target",
          type: "line",
          source: "distritos",
          filter: ["==", ["get", "id"], idDistritoTarget],
          paint: { "line-color": "#dc2626", "line-width": 3, "line-opacity": 1 },
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

  const top3 = fc
    ? [...fc.features]
        .sort((a, b) => b.properties.poblacion_total_2025 - a.properties.poblacion_total_2025)
        .slice(0, 3)
    : [];

  return (
    <SlideChromeData
      title="Distribución poblacional"
      subtitle={`Provincia ${ctx.jurisdiccion.provincia?.nombre ?? ""} · ${fc?.features.length ?? "…"} distritos`}
      chapter={2}
      chapterHint="contexto provincial"
    >
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 p-6 sm:p-10">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="lg:col-span-3 rounded-2xl overflow-hidden border border-slate-200 min-h-[460px] relative"
        >
          <div ref={containerRef} className="absolute inset-0" />
          {!fc && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-slate-400">
              Cargando coropleta…
            </div>
          )}
          {/* Leyenda */}
          {breaks && (
            <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur rounded-xl px-3 py-2 shadow text-xs">
              <div className="font-medium text-slate-700 mb-1">Hab/km²</div>
              <div className="flex items-center gap-2">
                <div className="flex flex-col gap-0.5">
                  {["#fef3c7", "#fde68a", "#fbbf24", "#d97706", "#92400e"].map((c) => (
                    <div key={c} className="w-4 h-2.5" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <div className="flex flex-col gap-0 text-[10px] text-slate-500 justify-between">
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

        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center gap-2 text-slate-700 mb-2">
            <MapIcon className="w-4 h-4" />
            <span className="text-sm font-medium">Top 3 por población</span>
          </div>
          {top3.map((f, i) => {
            const isTarget = f.properties.id === idDistritoTarget;
            return (
              <motion.div
                key={f.properties.id}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.1 }}
                className={`rounded-xl border px-4 py-3 ${
                  isTarget ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className={`text-sm font-medium ${isTarget ? "text-amber-900" : "text-slate-800"}`}>
                    {f.properties.distrito}
                  </span>
                  <span className="text-xs text-slate-400">#{i + 1}</span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className={`text-xl font-bold ${isTarget ? "text-amber-700" : "text-slate-900"}`}>
                    {formatNumero(f.properties.poblacion_total_2025)}
                  </span>
                  <span className="text-xs text-slate-500">hab</span>
                </div>
              </motion.div>
            );
          })}

          {idDistritoTarget && !top3.some((f) => f.properties.id === idDistritoTarget) && fc && (() => {
            const target = fc.features.find((f) => f.properties.id === idDistritoTarget);
            if (!target) return null;
            const pos = [...fc.features]
              .sort((a, b) => b.properties.poblacion_total_2025 - a.properties.poblacion_total_2025)
              .findIndex((f) => f.properties.id === idDistritoTarget) + 1;
            return (
              <div className="rounded-xl border border-amber-400 bg-amber-50 px-4 py-3 mt-3">
                <div className="text-xs text-amber-700 font-medium">Tu distrito</div>
                <div className="flex items-baseline justify-between gap-2 mt-1">
                  <span className="text-sm font-medium text-amber-900">{target.properties.distrito}</span>
                  <span className="text-xs text-amber-600">#{pos} de {fc.features.length}</span>
                </div>
                <div className="mt-1 text-xl font-bold text-amber-700">
                  {formatNumero(target.properties.poblacion_total_2025)} <span className="text-xs font-normal text-amber-600">hab</span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </SlideChromeData>
  );
}

function extractCoords(geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): number[][] {
  if (geom.type === "Polygon") return geom.coordinates.flat();
  return geom.coordinates.flat(2);
}

export function isSlideDistribucionPoblacionalVisible(ctx: CandidatoContext): boolean {
  return Boolean(ctx.jurisdiccion.provincia?.id && ctx.jurisdiccion.distrito?.id);
}
