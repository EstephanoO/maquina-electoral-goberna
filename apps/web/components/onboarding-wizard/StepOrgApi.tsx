"use client";

import { motion } from "motion/react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { catalogosApi, type OrganizacionPoliticaCatalog } from "@/lib/catalogos-api";

interface StepOrgApiProps {
  title: string;
  subtitle?: string;
  guideText?: string;
  onNext: (organizacion: { id: number; codigo: string; nombre: string; siglas: string | null } | null) => void;
}

export function StepOrgApi({ title, subtitle, guideText, onNext }: StepOrgApiProps) {
  const [orgs, setOrgs] = useState<OrganizacionPoliticaCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await catalogosApi.listOrganizacionesPoliticas({ pais: "PE" });
      setOrgs(r.organizaciones);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return orgs;
    const f = filter.trim().toLowerCase();
    return orgs.filter(
      (o) => o.nombre.toLowerCase().includes(f) || (o.siglas ?? "").toLowerCase().includes(f),
    );
  }, [orgs, filter]);

  const handleSelect = (o: OrganizacionPoliticaCatalog) => {
    setSelected(o.id);
    setTimeout(() => {
      onNext({ id: o.id, codigo: o.codigo, nombre: o.nombre, siglas: o.siglas });
    }, 350);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-4xl"
    >
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-2xl sm:text-3xl md:text-4xl mb-2 sm:mb-3 text-white leading-tight"
      >
        {title}
      </motion.h2>

      {subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-base sm:text-lg text-gray-400 mb-3 sm:mb-4"
        >
          {subtitle}
        </motion.p>
      )}

      {guideText && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mb-6 sm:mb-8 p-3 sm:p-4 bg-gradient-to-r from-amber-500/10 to-blue-500/10 border border-amber-500/20 rounded-xl"
        >
          <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">{guideText}</p>
        </motion.div>
      )}

      {error && !loading && (
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
            onClick={load}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-amber-300 transition hover:bg-amber-500/20"
          >
            <RefreshCw className="size-3.5" />
            Reintentar
          </button>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="relative mb-5"
      >
        <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Buscar partido o movimiento..."
          className="w-full rounded-xl border border-gray-700/50 bg-black/40 px-11 py-3 text-sm text-white placeholder:text-gray-500 backdrop-blur-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30"
        />
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-amber-400">
          <Loader2 className="size-8 animate-spin" />
        </div>
      ) : !error && orgs.length === 0 ? (
        <div className="rounded-xl border border-gray-700/50 bg-black/30 p-6 text-center text-sm text-gray-400">
          No hay partidos disponibles todavía. Podés continuar como independiente abajo.
        </div>
      ) : !error && filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-700/50 bg-black/30 p-6 text-center text-sm text-gray-400">
          Ningún partido coincide con &quot;{filter}&quot;. Probá con otra búsqueda o continuá como independiente abajo.
        </div>
      ) : (
        <div className="grid max-h-[400px] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((o, i) => {
            const isSelected = selected === o.id;
            return (
              <motion.button
                key={o.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 + i * 0.03 }}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleSelect(o)}
                className={`flex items-center justify-between rounded-2xl border-2 p-4 text-left transition-all ${
                  isSelected
                    ? "border-amber-500 bg-gradient-to-br from-amber-500/20 to-amber-600/10 shadow-xl shadow-amber-500/20"
                    : "border-gray-700/50 bg-black/40 backdrop-blur-sm hover:border-amber-500/50 hover:bg-black/60"
                }`}
              >
                <div className="flex flex-1 items-center gap-3 pr-2">
                  <OrgLogo codigo={o.codigo} siglas={o.siglas} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold leading-tight ${isSelected ? "text-amber-400" : "text-white"}`}>
                      {o.nombre}
                    </p>
                    {o.siglas && <p className="text-xs text-gray-500">{o.siglas}</p>}
                  </div>
                </div>
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-amber-600"
                  >
                    <CheckCircle2 className="size-3.5 text-black" />
                  </motion.div>
                )}
              </motion.button>
            );
          })}
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-6"
      >
        <button
          type="button"
          onClick={() => onNext(null)}
          className="w-full rounded-xl border border-gray-700/50 bg-black/30 px-4 py-3 text-sm font-medium text-gray-400 backdrop-blur-sm transition hover:border-amber-500/40 hover:text-amber-400"
        >
          Postulo sin partido / movimiento independiente
        </button>
      </motion.div>
    </motion.div>
  );
}

/**
 * Logo del partido. Intenta cargar /orgs/<codigo>.png; si falla, muestra
 * un círculo con las iniciales como fallback.
 */
function OrgLogo({ codigo, siglas }: { codigo: string; siglas: string | null }) {
  const [failed, setFailed] = useState(false);
  const initials = (siglas || codigo).slice(0, 3).toUpperCase();

  if (failed) {
    return (
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-500/20 to-amber-700/20 border border-amber-500/30 text-[10px] font-bold text-amber-300">
        {initials}
      </div>
    );
  }

  return (
    <img
      src={`/onboarding/orgs/${codigo}.png`}
      alt=""
      onError={() => setFailed(true)}
      className="size-10 shrink-0 rounded-full bg-white object-contain p-1"
    />
  );
}
