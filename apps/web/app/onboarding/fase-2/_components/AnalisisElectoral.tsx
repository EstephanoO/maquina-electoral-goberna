"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Map as MapLibre, Source, Layer, type MapRef } from "@vis.gl/react-maplibre";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import { motion } from "motion/react";
import { Loader2, MapPin, Construction } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";

import { catalogosApi, type JurisdiccionCatalog } from "@/lib/catalogos-api";
import {
  getGanadorPorJurisdiccionMock,
  PARTIDOS_PALETTE,
} from "@/lib/mocks/electoral-mock";
import type { CandidatoContext } from "@/lib/onboarding-api";

const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

interface AnalisisElectoralProps {
  jurisdiccion: CandidatoContext["jurisdiccion"];
  ambito: "pais" | "departamento" | "provincia" | "distrito";
}

export function AnalisisElectoral({ jurisdiccion, ambito }: AnalisisElectoralProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [items, setItems] = useState<JurisdiccionCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Decidir qué nivel cargar en el mapa
  const cargaConfig = useMemo(() => {
    if (ambito === "pais") {
      return { nivel: "departamento" as const, parentId: undefined };
    }
    if (ambito === "departamento" && jurisdiccion.departamento) {
      return { nivel: "provincia" as const, parentId: jurisdiccion.departamento.id };
    }
    if (ambito === "provincia" && jurisdiccion.provincia) {
      return { nivel: "distrito" as const, parentId: jurisdiccion.provincia.id };
    }
    if (ambito === "distrito" && jurisdiccion.distrito) {
      // Para distrito mostramos el polígono propio
      return { nivel: "distrito" as const, parentId: jurisdiccion.provincia?.id, soloEste: jurisdiccion.distrito.id };
    }
    return null;
  }, [ambito, jurisdiccion]);

  useEffect(() => {
    if (!cargaConfig) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await catalogosApi.listJurisdicciones({
          ambito: cargaConfig.nivel,
          parent_id: cargaConfig.parentId,
          with_geom: true,
        });
        if (cancelled) return;
        let result = res.jurisdicciones;
        if ("soloEste" in cargaConfig && cargaConfig.soloEste) {
          result = result.filter((j) => j.id === cargaConfig.soloEste);
        }
        setItems(result);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cargaConfig]);

  // Construir GeoJSON con propiedad `color` por partido ganador (mock)
  const geojson: FeatureCollection = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: items
        .filter((it) => it.geom)
        .map((it) => {
          const ganador = getGanadorPorJurisdiccionMock(it.id);
          return {
            type: "Feature" as const,
            properties: {
              id: it.id,
              nombre: it.nombre,
              color: ganador.color,
              partido: ganador.partido,
              siglas: ganador.siglas,
            },
            geometry: it.geom as Geometry,
          };
        }) as Feature[],
    };
  }, [items]);

  const bounds = useMemo(() => calcBounds(geojson), [geojson]);

  useEffect(() => {
    if (bounds && mapRef.current) {
      mapRef.current.fitBounds(bounds, { padding: 24, duration: 500, maxZoom: 11 });
    }
  }, [bounds]);

  // Agregación: cuántas jurisdicciones ganó cada partido
  const ranking = useMemo(() => {
    const counts: Record<string, { partido: string; siglas: string; color: string; n: number }> = {};
    for (const it of items) {
      const g = getGanadorPorJurisdiccionMock(it.id);
      const key = g.siglas;
      if (!counts[key]) {
        counts[key] = { partido: g.partido, siglas: g.siglas, color: g.color, n: 0 };
      }
      counts[key].n++;
    }
    return Object.values(counts).sort((a, b) => b.n - a.n);
  }, [items]);

  const nivelLabel =
    cargaConfig?.nivel === "departamento"
      ? "departamento"
      : cargaConfig?.nivel === "provincia"
        ? "provincia"
        : "distrito";

  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-400/80">
        <Construction className="size-2.5" />
        Datos en construcción · Mock
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* MAPA — 2/3 */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="lg:col-span-2 relative rounded-2xl overflow-hidden border-2 border-gray-700/50 bg-black/40 h-[320px] sm:h-[420px]"
        >
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm text-amber-400">
              <Loader2 className="size-8 animate-spin" />
            </div>
          )}

          {error && !loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <p className="text-red-400 text-sm px-4 text-center">{error}</p>
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-gray-500 gap-2 px-6 text-center">
              <MapPin className="size-8 opacity-50" />
              <p className="text-sm">Sin geometría disponible para este nivel todavía.</p>
            </div>
          )}

          <MapLibre
            ref={mapRef}
            initialViewState={{ longitude: -75.0, latitude: -10.0, zoom: 4.5 }}
            mapStyle={DARK_STYLE}
            interactiveLayerIds={["analisis-fill"]}
            onMouseMove={(e) => {
              const map = e.target;
              if (!map) return;
              const f = e.features?.[0];
              map.getCanvas().style.cursor = f ? "pointer" : "";
            }}
            style={{ width: "100%", height: "100%" }}
          >
            <Source id="analisis-src" type="geojson" data={geojson}>
              <Layer
                id="analisis-fill"
                type="fill"
                paint={{
                  "fill-color": ["get", "color"],
                  "fill-opacity": 0.55,
                }}
              />
              <Layer
                id="analisis-line"
                type="line"
                paint={{
                  "line-color": "#000",
                  "line-width": 0.4,
                  "line-opacity": 0.6,
                }}
              />
            </Source>
          </MapLibre>

          <div className="absolute bottom-2 left-2 rounded-md bg-black/70 backdrop-blur-sm px-2.5 py-1 text-[10px] uppercase tracking-wider text-amber-400/80 border border-amber-500/20 pointer-events-none">
            Ganador por {nivelLabel} (último proceso)
          </div>
        </motion.div>

        {/* RANKING TABLA — 1/3 */}
        <motion.div
          initial={{ opacity: 0, x: 10 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="rounded-2xl border-2 border-gray-700/50 bg-gradient-to-br from-gray-900/80 to-black/40 backdrop-blur-sm p-4"
        >
          <h3 className="text-sm uppercase tracking-widest text-amber-400/80 mb-3">
            {nivelLabel}s ganados por partido
          </h3>

          {ranking.length === 0 && !loading && (
            <p className="text-xs text-gray-500">Sin datos.</p>
          )}

          <div className="space-y-2.5">
            {ranking.map((r) => {
              const totalN = ranking.reduce((acc, x) => acc + x.n, 0);
              const pct = totalN > 0 ? Math.round((r.n / totalN) * 100) : 0;
              return (
                <div key={r.siglas} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="size-3 rounded-full shrink-0"
                        style={{ backgroundColor: r.color }}
                      />
                      <span className="text-sm text-white truncate">{r.partido}</span>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">
                      <span className="text-white font-medium">{r.n}</span> ({pct}%)
                    </span>
                  </div>
                  <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${pct}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: r.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Leyenda paleta */}
          <div className="mt-5 pt-4 border-t border-gray-800">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Paleta partidos</p>
            <div className="flex flex-wrap gap-1.5">
              {PARTIDOS_PALETTE.map((p) => (
                <div
                  key={p.siglas}
                  className="flex items-center gap-1 rounded-full border border-gray-700/50 bg-black/40 px-2 py-0.5 text-[10px] text-gray-400"
                  title={p.partido}
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.siglas}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function calcBounds(fc: FeatureCollection): [number, number, number, number] | null {
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  let any = false;
  const visit = (coords: unknown): void => {
    if (!coords) return;
    if (
      typeof (coords as Position)[0] === "number" &&
      typeof (coords as Position)[1] === "number"
    ) {
      const [lng, lat] = coords as Position;
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
        any = true;
      }
      return;
    }
    if (Array.isArray(coords)) {
      for (const c of coords) visit(c);
    }
  };
  for (const f of fc.features) {
    if (!f.geometry) continue;
    if ("coordinates" in f.geometry) visit((f.geometry as { coordinates: unknown }).coordinates);
  }
  if (!any) return null;
  return [minLng, minLat, maxLng, maxLat];
}
