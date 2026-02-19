"use client";

import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GA4City } from "./types";

type Props = {
  cities: GA4City[];
  primaryColor: string;
  /** City name to fly-to and highlight (driven by parent hover) */
  highlightCity?: string | null;
  /** City name for deep zoom on click */
  clickedCity?: string | null;
};

/* ── Peru city geocoding ─────────────────────────────────────────── */
const PERU_CITIES: Record<string, [number, number]> = {
  "Lima": [-77.0428, -12.0464],
  "Trujillo": [-79.0300, -8.1091],
  "Cajamarca": [-78.5142, -7.1638],
  "Chiclayo": [-79.8408, -6.7714],
  "Cusco": [-71.9675, -13.5320],
  "Arequipa": [-71.5375, -16.4090],
  "Piura": [-80.6328, -5.1945],
  "La Esperanza": [-79.0444, -8.0800],
  "El Porvenir": [-79.0147, -8.0892],
  "Chimbote": [-78.5781, -9.0853],
  "Iquitos": [-73.2472, -3.7491],
  "Ica": [-75.7286, -14.0676],
  "Cerro Colorado": [-71.5617, -16.3835],
  "Victor Larco Herrera": [-79.0444, -8.1300],
  "Jaen": [-78.8089, -5.7069],
  "Huaraz": [-77.5278, -9.5265],
  "Tacna": [-70.2476, -18.0066],
  "Lambayeque": [-79.9068, -6.7011],
  "Tarapoto": [-76.3703, -6.4884],
  "Jose Luis Bustamante": [-71.5300, -16.4300],
  "Paucarpata": [-71.5000, -16.4300],
  "Pucallpa": [-74.5505, -8.3791],
  "Sullana": [-80.6853, -4.9036],
  "Huancayo": [-75.2049, -12.0651],
  "Ilo": [-71.3375, -17.6394],
  "Pisco": [-76.2031, -13.7100],
  "Ayacucho": [-74.2236, -13.1587],
  "Cayma": [-71.5528, -16.3900],
  "Chepen": [-79.4300, -7.2256],
  "Miraflores": [-77.0289, -12.1219],
  "Parcona District": [-75.7100, -14.0400],
  "Puerto Maldonado": [-69.1833, -12.6000],
  "Talara": [-81.2714, -4.5769],
  "Barranca": [-77.7531, -10.7544],
  "Huacho": [-77.6050, -11.1067],
  "Jose Leonardo Ortiz": [-79.8400, -6.7600],
  "Juliaca": [-70.1300, -15.5000],
  "La Victoria": [-77.0286, -12.0700],
  "Lurin": [-76.8697, -12.2789],
  "Mariano Melgar": [-71.5200, -16.4200],
  "Puno": [-70.0194, -15.8402],
  "Alto Selva Alegre": [-71.5200, -16.3900],
  "Cerro de Pasco": [-76.2564, -10.6875],
  "Huaral": [-77.2072, -11.4953],
  "Huaura": [-77.5989, -11.0667],
  "Jacobo Hunter": [-71.5600, -16.4400],
  "Mollendo": [-72.0175, -17.0217],
  "Moquegua": [-70.9350, -17.1932],
  "Paita": [-81.1139, -5.0892],
  "Sachaca": [-71.5700, -16.4200],
  "Salaverry": [-79.0100, -8.2200],
  "San Ignacio": [-78.9978, -5.1461],
  "San Martin de Pangoa": [-74.4900, -11.4300],
  "San Pedro de Lloc": [-79.5044, -7.4300],
  "Socabaya": [-71.5353, -16.4661],
  "Yanahuara": [-71.5400, -16.3900],
};

/** Default view: shows all Peru with context */
const DEFAULT_CENTER: [number, number] = [-75.5, -9.5];
const DEFAULT_ZOOM = 4.3;

const INTERNATIONAL_CITIES = new Set([
  "Fort Worth", "Aspen", "Council Bluffs", "Lulea", "Collegno", "Duluth",
  "Frankfurt am Main", "Gwalior", "Miami", "Paris", "Prineville", "Springfield",
  "Turin", "L'Hospitalet de Llobregat", "Siberut Tengah", "Srumbung",
  "North Carolina's 3rd Congressional District 2022 redistricting",
]);

type GeocodedCity = {
  city: string;
  lng: number;
  lat: number;
  activeUsers: number;
  // Enriched fields
  newUsers?: number;
  avgEngagementTime?: number;
  engagementRate?: number;
  events?: number;
};

function geocodeCities(cities: GA4City[]): GeocodedCity[] {
  const result: GeocodedCity[] = [];
  for (const c of cities) {
    if (INTERNATIONAL_CITIES.has(c.city)) continue;
    if (/^\d+$/.test(c.city)) continue;
    const coords = PERU_CITIES[c.city];
    if (coords) {
      result.push({
        city: c.city,
        lng: coords[0],
        lat: coords[1],
        activeUsers: c.activeUsers,
        newUsers: c.newUsers,
        avgEngagementTime: c.avgEngagementTime,
        engagementRate: c.engagementRate,
        events: c.events,
      });
    }
  }
  return result;
}

/* ── Component ───────────────────────────────────────────────────── */

export function CitiesHeatmap({ cities, primaryColor, highlightCity, clickedCity }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const geocoded = geocodeCities(cities);
  const totalUsers = geocoded.reduce((s, c) => s + c.activeUsers, 0);
  const maxUsers = Math.max(...geocoded.map((c) => c.activeUsers), 1);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        name: "Peru Digital",
        sources: {
          "carto-voyager": {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
              "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
            ],
            tileSize: 256,
            attribution: "&copy; CARTO &copy; OSM",
          },
        },
        layers: [
          { id: "carto-voyager", type: "raster", source: "carto-voyager", minzoom: 0, maxzoom: 20 },
        ],
      },
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      minZoom: 3,
      maxZoom: 14,
      // No maxBounds — user can zoom out freely
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });

    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    m.on("load", () => {
      const geojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: geocoded.map((c) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
          properties: { city: c.city, activeUsers: c.activeUsers, weight: c.activeUsers / maxUsers },
        })),
      };

      m.addSource("cities", { type: "geojson", data: geojson });

      /* ── Heatmap ─────────────────────────────────────────────────
         Designed to be immediately recognizable at any zoom:
         - Big radius at low zoom so blobs are obvious
         - High intensity so even small cities register
         - Vivid gradient: blue → primary → orange → red (hot spots)
         ──────────────────────────────────────────────────────────── */
      m.addLayer({
        id: "cities-heat",
        type: "heatmap",
        source: "cities",
        maxzoom: 11,
        paint: {
          "heatmap-weight": [
            "interpolate", ["linear"], ["get", "activeUsers"],
            0, 0,
            10, 0.3,
            100, 0.6,
            500, 0.85,
            maxUsers, 1,
          ],
          "heatmap-intensity": [
            "interpolate", ["linear"], ["zoom"],
            3, 0.8,
            5, 1.5,
            8, 3,
          ],
          "heatmap-radius": [
            "interpolate", ["linear"], ["zoom"],
            3, 20,
            5, 40,
            7, 60,
            10, 80,
          ],
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0,    "rgba(0,0,0,0)",
            0.05, "rgba(65,105,225,0.15)",   // soft blue glow
            0.15, "rgba(59,130,246,0.45)",    // blue
            0.3,  "rgba(99,102,241,0.65)",    // indigo
            0.45, `${primaryColor}bb`,         // primaryColor
            0.6,  "rgba(234,88,12,0.8)",      // orange (heat)
            0.75, "rgba(220,38,38,0.88)",     // red
            0.9,  "rgba(185,28,28,0.95)",     // dark red
            1,    "rgba(153,27,27,1)",         // deep hot core
          ],
          "heatmap-opacity": [
            "interpolate", ["linear"], ["zoom"],
            3, 0.85,
            8, 0.7,
            11, 0.4,
          ],
        },
      });

      /* ── Circles: always-on dots that pulse at any zoom ────────── */
      m.addLayer({
        id: "cities-circles",
        type: "circle",
        source: "cities",
        minzoom: 4,
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            4, ["interpolate", ["linear"], ["get", "activeUsers"], 1, 3, 50, 5, 500, 9, maxUsers, 14],
            7, ["interpolate", ["linear"], ["get", "activeUsers"], 1, 5, 50, 10, 500, 20, maxUsers, 32],
            10, ["interpolate", ["linear"], ["get", "activeUsers"], 1, 7, 50, 14, 500, 28, maxUsers, 44],
          ],
          "circle-color": [
            "interpolate", ["linear"], ["get", "activeUsers"],
            0, "#60a5fa",        // light blue
            50, primaryColor,    // primary
            300, "#f97316",      // orange
            800, "#dc2626",      // red
          ],
          "circle-opacity": [
            "interpolate", ["linear"], ["zoom"],
            4, 0.5,
            7, 0.75,
            10, 0.85,
          ],
          "circle-stroke-width": [
            "interpolate", ["linear"], ["zoom"],
            4, 1,
            7, 2,
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-opacity": 0.9,
        },
      });

      /* ── Labels: city name + count, visible from zoom ~6 ─────── */
      m.addLayer({
        id: "cities-labels",
        type: "symbol",
        source: "cities",
        minzoom: 6.5,
        layout: {
          "text-field": ["concat", ["get", "city"], "\n", ["to-string", ["get", "activeUsers"]]],
          "text-size": [
            "interpolate", ["linear"], ["zoom"],
            6.5, 10,
            9, 13,
          ],
          "text-offset": [0, 1.6],
          "text-anchor": "top",
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Regular"],
          "text-allow-overlap": false,
          "text-optional": true,
        },
        paint: {
          "text-color": "#1e293b",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.8,
        },
      });
    });

    // Popup on hover over circles
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 14,
      className: "heatmap-popup",
    });
    popupRef.current = popup;

    m.on("mouseenter", "cities-circles", (e) => {
      m.getCanvas().style.cursor = "pointer";
      const f = e.features?.[0];
      if (f && f.geometry.type === "Point") {
        const coords = f.geometry.coordinates as [number, number];
        const p = f.properties;
        const pct = totalUsers > 0 ? ((p.activeUsers / totalUsers) * 100).toFixed(1) : "0";
        // Find full city data for enriched popup
        const cityData = geocoded.find((c) => c.city === p.city);
        popup.setLngLat(coords).setHTML(popupHTML(p.city, p.activeUsers, pct, primaryColor, cityData)).addTo(m);
      }
    });

    m.on("mouseleave", "cities-circles", () => {
      m.getCanvas().style.cursor = "";
      popup.remove();
    });

    map.current = m;

    return () => {
      m.remove();
      map.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Fly-to on highlightCity change (hover — gentle zoom) ────── */
  const flyToCity = useCallback((cityName: string | null) => {
    const m = map.current;
    if (!m) return;

    if (!cityName) {
      m.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, duration: 400 });
      popupRef.current?.remove();
      return;
    }

    const c = geocoded.find((g) => g.city === cityName);
    if (!c) return;

    // Gentle zoom — enough to see the city but keep context
    m.flyTo({ center: [c.lng, c.lat], zoom: 7, duration: 500 });

    const pct = totalUsers > 0 ? ((c.activeUsers / totalUsers) * 100).toFixed(1) : "0";
    popupRef.current?.setLngLat([c.lng, c.lat])
      .setHTML(popupHTML(c.city, c.activeUsers, pct, primaryColor, c))
      .addTo(m);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Deep zoom on clickedCity (click — close-up) ───────────── */
  const deepZoomToCity = useCallback((cityName: string | null) => {
    const m = map.current;
    if (!m) return;

    if (!cityName) {
      m.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, duration: 600 });
      popupRef.current?.remove();
      return;
    }

    const c = geocoded.find((g) => g.city === cityName);
    if (!c) return;

    m.flyTo({ center: [c.lng, c.lat], zoom: 11, duration: 800, essential: true });

    const pct = totalUsers > 0 ? ((c.activeUsers / totalUsers) * 100).toFixed(1) : "0";
    popupRef.current?.setLngLat([c.lng, c.lat])
      .setHTML(popupHTML(c.city, c.activeUsers, pct, primaryColor, c))
      .addTo(m);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Click takes priority over hover
  useEffect(() => {
    if (clickedCity) {
      deepZoomToCity(clickedCity);
    } else {
      flyToCity(highlightCity ?? null);
    }
  }, [clickedCity, highlightCity, flyToCity, deepZoomToCity]);

  return (
    <div style={styles.container}>
      <div ref={mapContainer} style={styles.map} />

      {/* Reset zoom */}
      <button
        type="button"
        onClick={() => map.current?.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, duration: 500 })}
        style={styles.resetBtn}
        title="Ver todo Peru"
        aria-label="Ver todo Peru"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      </button>
    </div>
  );
}

/* ── Popup HTML helper ────────────────────────────────────────────── */

function popupHTML(city: string, users: number, pct: string, color: string, data?: GeocodedCity): string {
  const hasEnriched = data && (data.avgEngagementTime !== undefined || data.newUsers !== undefined);
  
  let enrichedHTML = "";
  if (hasEnriched && data) {
    const rows: string[] = [];
    
    if (data.newUsers !== undefined) {
      const newPct = users > 0 ? ((data.newUsers / users) * 100).toFixed(0) : "0";
      rows.push(`<div style="display:flex;justify-content:space-between;gap:16px">
        <span style="color:#94a3b8">Nuevos</span>
        <span style="color:#334155;font-weight:500">${data.newUsers.toLocaleString()} (${newPct}%)</span>
      </div>`);
    }
    
    if (data.avgEngagementTime !== undefined && data.avgEngagementTime > 0) {
      const mins = Math.floor(data.avgEngagementTime / 60);
      const secs = Math.round(data.avgEngagementTime % 60);
      const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      rows.push(`<div style="display:flex;justify-content:space-between;gap:16px">
        <span style="color:#94a3b8">Tiempo prom.</span>
        <span style="color:#334155;font-weight:500">${timeStr}</span>
      </div>`);
    }
    
    if (data.engagementRate !== undefined && data.engagementRate > 0) {
      rows.push(`<div style="display:flex;justify-content:space-between;gap:16px">
        <span style="color:#94a3b8">Engagement</span>
        <span style="color:#334155;font-weight:500">${(data.engagementRate * 100).toFixed(2)}%</span>
      </div>`);
    }
    
    if (data.events !== undefined && data.events > 0) {
      rows.push(`<div style="display:flex;justify-content:space-between;gap:16px">
        <span style="color:#94a3b8">Eventos</span>
        <span style="color:#334155;font-weight:500">${data.events.toLocaleString()}</span>
      </div>`);
    }
    
    if (rows.length > 0) {
      enrichedHTML = `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:11px;display:flex;flex-direction:column;gap:3px">
        ${rows.join("")}
      </div>`;
    }
  }
  
  return `<div style="padding:8px 12px;font-family:system-ui,sans-serif;min-width:140px">
    <div style="font-weight:700;font-size:13px;color:#0f172a">${city}</div>
    <div style="font-size:20px;font-weight:800;color:${color};margin:3px 0">${Number(users).toLocaleString()}</div>
    <div style="font-size:11px;color:#64748b">usuarios activos · ${pct}%</div>
    ${enrichedHTML}
  </div>`;
}

/* ── Styles ───────────────────────────────────────────────────────── */

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "relative" as const,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    border: "1px solid #e2e8f0",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
    overflow: "hidden",
    height: "100%",
  },
  map: {
    width: "100%",
    height: "100%",
  },
  resetBtn: {
    position: "absolute" as const,
    bottom: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.95)",
    backdropFilter: "blur(8px)",
    border: "1px solid #e2e8f0",
    color: "#64748b",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    zIndex: 2,
  },
};
