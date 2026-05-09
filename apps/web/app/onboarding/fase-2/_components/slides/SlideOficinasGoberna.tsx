"use client";

import { motion } from "motion/react";
import { MapPin } from "lucide-react";
import { SlideShell } from "./SlideShell";

// Oficinas Goberna en Perú — coordenadas aproximadas para placement
// sobre el mapa de fondo. Lat/lon → x%/y% del bounding box Perú.
// Bounding aproximado: lon -81.5 a -68.5, lat -18.5 a 0
const OFICINAS = [
  { ciudad: "Lima", lon: -77.04, lat: -12.05, principal: true },
  { ciudad: "Trujillo", lon: -79.03, lat: -8.11, principal: false },
  { ciudad: "Arequipa", lon: -71.54, lat: -16.4, principal: false },
  { ciudad: "Cusco", lon: -71.97, lat: -13.52, principal: false },
];

const LON_MIN = -81.5;
const LON_MAX = -68.5;
const LAT_MIN = -18.5;
const LAT_MAX = 0;

function toPct(lon: number, lat: number) {
  const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * 100;
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * 100;
  return { x: `${x}%`, y: `${y}%` };
}

export function SlideOficinasGoberna() {
  return (
    <SlideShell kicker="Presencia nacional" title="OFICINAS GOBERNA EN PERÚ">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 px-2 sm:px-4 items-start">
        {/* Mapa SVG con marker por oficina */}
        <div className="lg:col-span-3">
          <div className="relative aspect-[3/4] bg-white/[0.03] border border-amber-400/20 rounded-md overflow-hidden">
            {/* Outline del Perú simplificado, gold */}
            <svg
              viewBox="0 0 300 400"
              className="absolute inset-0 w-full h-full"
              fill="none"
              stroke="rgba(251,191,36,0.35)"
              strokeWidth="1.5"
            >
              {/* Silhouette aproximada de Perú */}
              <path
                d="M 90 20 L 130 30 L 165 50 L 195 75 L 220 110 L 240 155 L 248 195 L 260 240 L 252 285 L 230 325 L 195 360 L 150 380 L 110 380 L 75 355 L 50 305 L 38 250 L 35 195 L 45 145 L 60 95 L 75 50 Z"
                fill="rgba(10,30,74,0.4)"
              />
            </svg>

            {/* Markers */}
            {OFICINAS.map((o, i) => {
              const p = toPct(o.lon, o.lat);
              return (
                <motion.div
                  key={o.ciudad}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.3 + i * 0.12, type: "spring", stiffness: 220 }}
                  className="absolute"
                  style={{ left: p.x, top: p.y, transform: "translate(-50%,-100%)" }}
                >
                  <div className="flex flex-col items-center">
                    <div
                      className={
                        o.principal
                          ? "size-7 rounded-full bg-amber-400 ring-4 ring-amber-400/30 shadow-lg flex items-center justify-center"
                          : "size-5 rounded-full bg-white ring-3 ring-white/40 shadow-md flex items-center justify-center"
                      }
                    >
                      <MapPin
                        className={o.principal ? "size-4 text-[#0a1e4a]" : "size-3 text-[#0a1e4a]"}
                        strokeWidth={3}
                      />
                    </div>
                    <span
                      className={
                        o.principal
                          ? "mt-1 text-xs font-black uppercase tracking-wider text-amber-400"
                          : "mt-1 text-[10px] font-bold uppercase tracking-wider text-white/85"
                      }
                    >
                      {o.ciudad}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Listado lateral con detalle */}
        <div className="lg:col-span-2 space-y-3">
          {OFICINAS.map((o, i) => (
            <motion.div
              key={o.ciudad}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.1 }}
              className={
                o.principal
                  ? "border-l-4 border-amber-400 bg-amber-400/10 px-4 py-3"
                  : "border-l-4 border-white/30 bg-white/[0.04] px-4 py-3"
              }
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] uppercase tracking-[0.3em] text-amber-400/80 font-bold">
                  {o.principal ? "Sede principal" : "Oficina regional"}
                </span>
              </div>
              <h3 className="text-2xl font-black uppercase text-white tracking-tight">
                {o.ciudad}
              </h3>
            </motion.div>
          ))}

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="mt-6 text-center sm:text-left"
          >
            <p className="text-xs uppercase tracking-[0.25em] text-amber-400 font-bold">
              Cobertura nacional
            </p>
            <p className="text-3xl sm:text-4xl font-black text-white mt-1">
              {OFICINAS.length}{" "}
              <span className="text-amber-400">oficinas</span>
            </p>
          </motion.div>
        </div>
      </div>
    </SlideShell>
  );
}
