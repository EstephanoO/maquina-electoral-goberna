"use client";

import { motion } from "motion/react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  catalogosApi,
  type CargoCatalog,
  type JurisdiccionCatalog,
} from "@/lib/catalogos-api";
import { JurisdiccionMap, type MapItem } from "./JurisdiccionMap";

interface StepCargoApiProps {
  title: string;
  subtitle?: string;
  guideText?: string;
  // Códigos del backend: PRESIDENCIAL / PARLAMENTARIO / GOBIERNO_LOCAL
  nivelFilter?: string;
  onNext: (data: {
    cargo: {
      id: number;
      codigo: string;
      nombre: string;
      ambito: "pais" | "departamento" | "provincia" | "distrito";
      nivelCodigo: string;
    };
    departamento?: { id: number; nombre: string };
    provincia?: { id: number; nombre: string };
    distrito?: { id: number; nombre: string };
  }) => void;
}

type Phase =
  | "loading-cargos"
  | "select-cargo"
  | "loading-cascade"
  | "select-departamento"
  | "select-provincia"
  | "select-distrito";

export function StepCargoApi({
  title,
  subtitle,
  guideText,
  nivelFilter,
  onNext,
}: StepCargoApiProps) {
  const [phase, setPhase] = useState<Phase>("loading-cargos");
  const [error, setError] = useState<string | null>(null);

  const [cargos, setCargos] = useState<CargoCatalog[]>([]);
  const [selectedCargo, setSelectedCargo] = useState<CargoCatalog | null>(null);

  const [departamentos, setDepartamentos] = useState<JurisdiccionCatalog[]>([]);
  const [selectedDept, setSelectedDept] = useState<JurisdiccionCatalog | null>(null);

  const [provincias, setProvincias] = useState<JurisdiccionCatalog[]>([]);
  const [selectedProv, setSelectedProv] = useState<JurisdiccionCatalog | null>(null);

  const [distritos, setDistritos] = useState<JurisdiccionCatalog[]>([]);
  const [hoverId, setHoverId] = useState<number | null>(null);

  const finish = useCallback(
    (
      cargo: CargoCatalog,
      dept?: JurisdiccionCatalog,
      prov?: JurisdiccionCatalog,
      dist?: JurisdiccionCatalog,
    ) => {
      onNext({
        cargo: {
          id: cargo.id,
          codigo: cargo.codigo,
          nombre: cargo.nombre,
          ambito: cargo.ambito_geografico,
          nivelCodigo: cargo.nivel_codigo,
        },
        ...(dept && { departamento: { id: dept.id, nombre: dept.nombre } }),
        ...(prov && { provincia: { id: prov.id, nombre: prov.nombre } }),
        ...(dist && { distrito: { id: dist.id, nombre: dist.nombre } }),
      });
    },
    [onNext],
  );

  // Carga inicial de cargos. Si solo hay 1 → auto-select.
  const loadCargos = useCallback(async () => {
    setError(null);
    setPhase("loading-cargos");
    try {
      const r = await catalogosApi.listCargos({
        pais: "PE",
        ...(nivelFilter && { nivel: nivelFilter }),
      });
      setCargos(r.cargos);
      if (r.cargos.length === 1) {
        await handleCargoSelect(r.cargos[0]!);
      } else {
        setPhase("select-cargo");
      }
    } catch (e) {
      setError((e as Error).message);
      setPhase("select-cargo");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivelFilter]);

  useEffect(() => {
    loadCargos();
  }, [loadCargos]);

  const handleCargoSelect = async (c: CargoCatalog) => {
    setSelectedCargo(c);
    if (c.ambito_geografico === "pais") {
      finish(c);
      return;
    }
    setPhase("loading-cascade");
    try {
      const r = await catalogosApi.listJurisdicciones({ ambito: "departamento", with_geom: true });
      setDepartamentos(r.jurisdicciones);
      setPhase("select-departamento");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleDeptSelect = async (d: JurisdiccionCatalog) => {
    setSelectedDept(d);
    const c = selectedCargo!;
    if (c.ambito_geografico === "departamento") {
      finish(c, d);
      return;
    }
    setPhase("loading-cascade");
    try {
      const r = await catalogosApi.listJurisdicciones({ ambito: "provincia", parent_id: d.id, with_geom: true });
      setProvincias(r.jurisdicciones);
      setPhase("select-provincia");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleProvSelect = async (p: JurisdiccionCatalog) => {
    setSelectedProv(p);
    const c = selectedCargo!;
    if (c.ambito_geografico === "provincia") {
      finish(c, selectedDept!, p);
      return;
    }
    setPhase("loading-cascade");
    try {
      const r = await catalogosApi.listJurisdicciones({ ambito: "distrito", parent_id: p.id, with_geom: true });
      setDistritos(r.jurisdicciones);
      setPhase("select-distrito");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleDistSelect = (d: JurisdiccionCatalog) => {
    finish(selectedCargo!, selectedDept!, selectedProv!, d);
  };

  // Header dinámico según fase
  const phaseTitle = useMemo(() => {
    switch (phase) {
      case "select-departamento":
        return "¿En qué departamento?";
      case "select-provincia":
        return "¿En qué provincia?";
      case "select-distrito":
        return "¿En qué distrito?";
      default:
        return title;
    }
  }, [phase, title]);

  const phaseSubtitle = useMemo(() => {
    if (!selectedCargo) return subtitle;
    if (phase === "select-departamento") return `${selectedCargo.nombre} · Perú`;
    if (phase === "select-provincia")
      return `${selectedCargo.nombre} · ${selectedDept?.nombre ?? ""}`;
    if (phase === "select-distrito")
      return `${selectedCargo.nombre} · ${selectedDept?.nombre ?? ""} / ${selectedProv?.nombre ?? ""}`;
    return subtitle;
  }, [phase, selectedCargo, selectedDept, selectedProv, subtitle]);

  const goBack = () => {
    setError(null);
    if (phase === "select-distrito") {
      setDistritos([]);
      setSelectedProv(null);
      setPhase("select-provincia");
    } else if (phase === "select-provincia") {
      setProvincias([]);
      setSelectedDept(null);
      setPhase("select-departamento");
    } else if (phase === "select-departamento") {
      setDepartamentos([]);
      setSelectedCargo(null);
      // si hay un solo cargo (presidencia), no tiene sentido volver
      if (cargos.length === 1) {
        loadCargos();
      } else {
        setPhase("select-cargo");
      }
    }
  };

  const showLoader = phase === "loading-cargos" || phase === "loading-cascade";
  const isCascadePhase =
    phase === "select-departamento" ||
    phase === "select-provincia" ||
    phase === "select-distrito";

  const items: { id: number; label: string; sublabel?: string }[] = (() => {
    if (phase === "select-cargo")
      return cargos.map((c) => ({ id: c.id, label: c.nombre, sublabel: capitalize(c.ambito_geografico) }));
    if (phase === "select-departamento")
      return departamentos.map((d) => ({ id: d.id, label: titleCase(d.nombre) }));
    if (phase === "select-provincia")
      return provincias.map((p) => ({ id: p.id, label: titleCase(p.nombre) }));
    if (phase === "select-distrito")
      return distritos.map((d) => ({ id: d.id, label: titleCase(d.nombre) }));
    return [];
  })();

  // Items con geometría para el mapa (solo en cascade phases)
  const mapItems: MapItem[] = (() => {
    if (phase === "select-departamento") {
      return departamentos
        .filter((d) => d.geom)
        .map((d) => ({ id: d.id, nombre: titleCase(d.nombre), geom: d.geom }));
    }
    if (phase === "select-provincia") {
      return provincias
        .filter((p) => p.geom)
        .map((p) => ({ id: p.id, nombre: titleCase(p.nombre), geom: p.geom }));
    }
    if (phase === "select-distrito") {
      return distritos
        .filter((d) => d.geom)
        .map((d) => ({ id: d.id, nombre: titleCase(d.nombre), geom: d.geom }));
    }
    return [];
  })();

  const handleItemClick = (id: number) => {
    if (phase === "select-cargo") {
      const c = cargos.find((x) => x.id === id);
      if (c) handleCargoSelect(c);
    } else if (phase === "select-departamento") {
      const d = departamentos.find((x) => x.id === id);
      if (d) handleDeptSelect(d);
    } else if (phase === "select-provincia") {
      const p = provincias.find((x) => x.id === id);
      if (p) handleProvSelect(p);
    } else if (phase === "select-distrito") {
      const d = distritos.find((x) => x.id === id);
      if (d) handleDistSelect(d);
    }
  };

  const canGoBack =
    phase === "select-distrito" ||
    phase === "select-provincia" ||
    phase === "select-departamento";

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-4xl"
    >
      {canGoBack && (
        <button
          onClick={goBack}
          className="mb-3 inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-amber-300 hover:text-amber-200"
        >
          <ChevronLeft className="size-4" />
          Atrás
        </button>
      )}

      <motion.h2
        key={phaseTitle}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="text-4xl sm:text-5xl md:text-6xl mb-3 sm:mb-4 text-white leading-[0.95] font-black tracking-tight"
      >
        {phaseTitle}
      </motion.h2>

      {phaseSubtitle && (
        <motion.p
          key={phaseSubtitle}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-base sm:text-lg text-gray-300 mb-6 sm:mb-8"
        >
          {phaseSubtitle}
        </motion.p>
      )}

      {phase === "select-cargo" && guideText && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-6 sm:mb-8 p-3 sm:p-4 bg-gradient-to-r from-amber-500/10 to-blue-500/10 border border-amber-500/20 rounded-xl"
        >
          <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">{guideText}</p>
        </motion.div>
      )}

      {showLoader && (
        <div className="flex items-center justify-center py-16 text-amber-400">
          <Loader2 className="size-8 animate-spin" />
        </div>
      )}

      {error && !showLoader && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 flex flex-col gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => loadCargos()}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-amber-300 transition hover:bg-amber-500/20"
          >
            <RefreshCw className="size-3.5" />
            Reintentar
          </button>
        </motion.div>
      )}

      {!showLoader && !error && items.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-gray-700/50 bg-black/30 p-6 text-center text-sm text-gray-400"
        >
          No hay opciones disponibles. Probá volver atrás.
        </motion.div>
      )}

      {!showLoader && !error && items.length > 0 && (
        isCascadePhase ? (
          // Layout cascada: mapa + lista
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3 order-2 lg:order-1">
              <JurisdiccionMap
                items={mapItems}
                {...(hoverId !== null && { hoverId })}
                onClick={(id) => handleItemClick(id)}
              />
            </div>
            <div className="lg:col-span-2 order-1 lg:order-2 max-h-[420px] overflow-y-auto pr-1 space-y-1.5">
              {items.map((it, i) => {
                const isHover = hoverId === it.id;
                return (
                  <motion.button
                    key={it.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 + Math.min(i, 30) * 0.01 }}
                    onMouseEnter={() => setHoverId(it.id)}
                    onMouseLeave={() => setHoverId(null)}
                    onClick={() => handleItemClick(it.id)}
                    className={`w-full text-left rounded-lg border-2 px-3 py-2.5 transition-all touch-manipulation ${
                      isHover
                        ? "border-amber-500 bg-amber-500/10 translate-x-1"
                        : "border-gray-700/40 bg-black/30 hover:border-amber-500/40 hover:bg-black/50"
                    }`}
                  >
                    <h3
                      className={`text-sm leading-tight ${
                        isHover ? "text-amber-300" : "text-white"
                      }`}
                    >
                      {it.label}
                    </h3>
                  </motion.button>
                );
              })}
            </div>
          </div>
        ) : (
          // Layout simple para select-cargo (sin mapa)
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
            {items.map((it, i) => (
              <motion.button
                key={it.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 + Math.min(i, 20) * 0.015 }}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleItemClick(it.id)}
                className="relative overflow-hidden rounded-xl border-2 border-gray-700/50 bg-black/40 backdrop-blur-sm p-4 sm:p-5 text-left transition-all hover:border-amber-500/50 hover:bg-black/60 touch-manipulation group"
              >
                <h3 className="text-base sm:text-lg text-white leading-tight font-medium group-hover:text-amber-300 transition-colors">{it.label}</h3>
                {it.sublabel && (
                  <p className="mt-1.5 text-[10px] sm:text-xs uppercase tracking-wide text-gray-500">
                    {it.sublabel}
                  </p>
                )}
              </motion.button>
            ))}
          </div>
        )
      )}
    </motion.div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}
