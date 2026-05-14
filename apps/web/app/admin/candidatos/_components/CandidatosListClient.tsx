"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import {
  ESTADO_COLOR,
  ESTADO_LABEL,
  ESTADOS_ORDEN,
  listCandidatos,
  type Candidato,
  type EstadoPipeline,
} from "@/lib/onboarding-fase1-api";

export function CandidatosListClient() {
  const [items, setItems] = useState<Candidato[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<EstadoPipeline | "todos">("todos");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listCandidatos({
      estado: filter === "todos" ? undefined : filter,
      q: debounced || undefined,
      limit: 100,
    })
      .then((r) => {
        if (cancelled) return;
        setItems(r.items);
        setTotal(r.total);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError((e as Error).message);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [filter, debounced]);

  const counts = useMemo(() => {
    const c: Record<EstadoPipeline | "todos", number> = {
      todos: total, lead: 0, calificado: 0, en_pitch: 0,
      aprobado: 0, rechazado: 0, pausado: 0,
    };
    items.forEach((i) => { c[i.estado_pipeline] += 1; });
    return c;
  }, [items, total]);

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilter("todos")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium ring-1 transition ${
            filter === "todos"
              ? "bg-[#0a1f4a] text-white ring-[#0a1f4a]"
              : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-400"
          }`}
        >
          Todos {filter === "todos" ? `(${total})` : ""}
        </button>
        {ESTADOS_ORDEN.map((e) => {
          const c = ESTADO_COLOR[e];
          const active = filter === e;
          return (
            <button
              key={e}
              onClick={() => setFilter(e)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium ring-1 transition ${
                active
                  ? `${c.bg} ${c.text} ${c.ring}`
                  : "bg-white text-slate-500 ring-slate-200 hover:ring-slate-400"
              }`}
            >
              {ESTADO_LABEL[e]} {active ? `(${items.length})` : ""}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o DNI…"
          className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1f4a]/20 focus:border-[#0a1f4a]"
        />
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-400">
          Cargando…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
          <div className="font-medium">No pude cargar la lista</div>
          <div className="mt-1 text-xs">{error}</div>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-sm text-slate-500">
            {debounced || filter !== "todos"
              ? "Sin candidatos con estos filtros."
              : "Todavía no hay candidatos en el pipeline."}
          </p>
          {!debounced && filter === "todos" && (
            <Link
              href="/admin/candidatos/nuevo"
              className="inline-block mt-4 text-sm font-medium text-[#0a1f4a] hover:underline"
            >
              Crear el primero →
            </Link>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-200">
                <th className="px-5 py-3">Candidato</th>
                <th className="px-5 py-3">DNI</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3">Contacto</th>
                <th className="px-5 py-3">Creado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                const color = ESTADO_COLOR[c.estado_pipeline];
                return (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/candidatos/${c.slug}`}
                        className="font-medium text-slate-900 hover:text-[#0a1f4a]"
                      >
                        {c.apellidos}, {c.nombres}
                      </Link>
                      <div className="text-xs text-slate-400 mt-0.5">{c.slug}</div>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-600 tabular-nums">{c.dni ?? "—"}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ${color.bg} ${color.text} ${color.ring}`}
                      >
                        {ESTADO_LABEL[c.estado_pipeline]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {c.email ?? "—"}
                      {c.telefono ? <div className="text-slate-400">{c.telefono}</div> : null}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {new Date(c.creado_en).toLocaleDateString("es-PE", { year: "numeric", month: "short", day: "numeric" })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
