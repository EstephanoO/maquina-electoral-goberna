"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, MapPin, AlertCircle, CheckCircle2, Phone, Mail } from "lucide-react";

import {
  ESTADO_COLOR,
  ESTADO_LABEL,
  getCandidato,
  transicionar,
  type CandidatoDetail,
  type EstadoPipeline,
} from "@/lib/onboarding-fase1-api";

import { PostulacionTab } from "./PostulacionTab";
import { NotasTab } from "./NotasTab";
import { EventosTimeline } from "./EventosTimeline";
import { TransicionPanel } from "./TransicionPanel";

type Tab = "perfil" | "postulacion" | "notas" | "eventos";

export function CandidatoDetailClient({ slug }: { slug: string }) {
  const [data, setData] = useState<CandidatoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("perfil");

  const reload = useCallback(async () => {
    setError(null);
    try {
      const d = await getCandidato(slug);
      setData(d);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }, [slug]);

  useEffect(() => { reload(); }, [reload]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 py-12 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando candidato…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        <div className="font-medium">No pude cargar al candidato</div>
        <div className="mt-1 text-xs">{error ?? "No existe"}</div>
      </div>
    );
  }

  const color = ESTADO_COLOR[data.estado_pipeline];

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 flex items-start justify-between gap-6">
        <div className="flex items-start gap-5">
          {data.foto_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.foto_url} alt="" className="w-20 h-20 rounded-2xl object-cover border border-slate-200" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-slate-100 grid place-items-center text-2xl font-bold text-slate-400">
              {data.nombres[0]}{data.apellidos[0]}
            </div>
          )}
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {data.apellidos}, {data.nombres}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
              {data.dni && <span className="tabular-nums">DNI {data.dni}</span>}
              {data.telefono && <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {data.telefono}</span>}
              {data.email && <span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {data.email}</span>}
            </div>
            {data.postulacion && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-600">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                {data.postulacion.cargo_nombre ?? "(sin cargo)"}
                {data.postulacion.distrito_nombre && ` · ${data.postulacion.distrito_nombre}`}
                {!data.postulacion.distrito_nombre && data.postulacion.provincia_nombre && ` · ${data.postulacion.provincia_nombre}`}
                {!data.postulacion.distrito_nombre && !data.postulacion.provincia_nombre && data.postulacion.departamento_nombre && ` · ${data.postulacion.departamento_nombre}`}
                {data.postulacion.organizacion_nombre && ` · ${data.postulacion.organizacion_nombre}`}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ring-1 ${color.bg} ${color.text} ${color.ring}`}>
            {ESTADO_LABEL[data.estado_pipeline]}
          </span>
          {data.exported_at && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-700">
              <CheckCircle2 className="w-3 h-3" /> exportado
            </span>
          )}
        </div>
      </div>

      {/* Tabs + transición */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-4">
          {/* Tab bar */}
          <div className="border-b border-slate-200 flex gap-1 -mb-px">
            {(["perfil", "postulacion", "notas", "eventos"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                  tab === t
                    ? "border-[#0a1f4a] text-[#0a1f4a]"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {t === "perfil" && "Perfil"}
                {t === "postulacion" && "Postulación"}
                {t === "notas" && `Notas (${data.notas.length})`}
                {t === "eventos" && `Eventos (${data.eventos.length})`}
              </button>
            ))}
          </div>

          {/* Contenido */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            {tab === "perfil" && <PerfilSummary data={data} />}
            {tab === "postulacion" && (
              <PostulacionTab data={data} onChange={reload} />
            )}
            {tab === "notas" && (
              <NotasTab slug={slug} notas={data.notas} onChange={reload} />
            )}
            {tab === "eventos" && <EventosTimeline eventos={data.eventos} />}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="lg:col-span-4 space-y-4">
          <TransicionPanel
            slug={slug}
            estado={data.estado_pipeline}
            onChange={async (nuevo, motivo) => {
              await transicionar(slug, nuevo as EstadoPipeline, motivo);
              await reload();
            }}
          />
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500 space-y-2">
            <div className="font-medium text-slate-700 uppercase tracking-wider text-[10px]">Metadata</div>
            <div>Creado {new Date(data.creado_en).toLocaleString("es-PE")}</div>
            <div>Actualizado {new Date(data.actualizado_en).toLocaleString("es-PE")}</div>
            <div className="text-slate-400">slug · {data.slug}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PerfilSummary({ data }: { data: CandidatoDetail }) {
  const rows: Array<[string, string | null]> = [
    ["Nombres",          data.nombres],
    ["Apellidos",        data.apellidos],
    ["DNI",              data.dni],
    ["Email",            data.email],
    ["Teléfono",         data.telefono],
    ["Fecha de nacimiento", data.fecha_nacimiento ? new Date(data.fecha_nacimiento).toLocaleDateString("es-PE") : null],
    ["Lugar de nacimiento", data.lugar_nacimiento],
    ["Género",           data.genero],
  ];
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
      {rows.map(([label, v]) => (
        <div key={label}>
          <dt className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">{label}</dt>
          <dd className="mt-0.5 text-sm text-slate-800">{v || <span className="text-slate-300">—</span>}</dd>
        </div>
      ))}
      {!data.dni && (
        <div className="sm:col-span-2 mt-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>El DNI es requerido para subir al candidato a estado <strong>Calificado</strong>.</span>
        </div>
      )}
    </dl>
  );
}
