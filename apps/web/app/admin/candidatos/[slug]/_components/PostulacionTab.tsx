"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";

import {
  listCargos, listDepartamentos, listDistritos, listPartidos,
  listProcesos, listProvincias, upsertPostulacion,
  type CandidatoDetail, type Cargo, type Departamento, type DistritoCat,
  type OrganizacionPolitica, type ProcesoElectoral, type Provincia,
} from "@/lib/onboarding-fase1-api";

interface Props {
  data: CandidatoDetail;
  onChange: () => Promise<void>;
}

export function PostulacionTab({ data, onChange }: Props) {
  const current = data.postulacion;

  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [partidos, setPartidos] = useState<OrganizacionPolitica[]>([]);
  const [procesos, setProcesos] = useState<ProcesoElectoral[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [provincias, setProvincias] = useState<Provincia[]>([]);
  const [distritos, setDistritos] = useState<DistritoCat[]>([]);

  const [idCargo, setIdCargo] = useState<number | null>(current?.id_cargo_gobierno ?? null);
  const [idPartido, setIdPartido] = useState<number | null>(current?.id_organizacion_politica ?? null);
  const [idProceso, setIdProceso] = useState<number | null>(current?.id_proceso_electoral ?? null);
  const [idDep, setIdDep] = useState<number | null>(current?.id_departamento ?? null);
  const [idProv, setIdProv] = useState<number | null>(current?.id_provincia ?? null);
  const [idDist, setIdDist] = useState<number | null>(current?.id_distrito ?? null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar catálogos básicos
  useEffect(() => {
    Promise.all([listCargos(), listPartidos(), listProcesos(), listDepartamentos()])
      .then(([c, p, pr, d]) => { setCargos(c); setPartidos(p); setProcesos(pr); setDepartamentos(d); })
      .catch((e) => setError((e as Error).message));
  }, []);

  // Provincias dependientes de departamento
  useEffect(() => {
    if (!idDep) { setProvincias([]); setIdProv(null); setIdDist(null); return; }
    listProvincias(idDep).then(setProvincias).catch(() => {});
  }, [idDep]);

  // Distritos dependientes de provincia
  useEffect(() => {
    if (!idProv) { setDistritos([]); setIdDist(null); return; }
    listDistritos(idProv).then(setDistritos).catch(() => {});
  }, [idProv]);

  // Si cargo cambia, resetear jurisdicción incompatible
  const cargoSelected = cargos.find((c) => c.id === idCargo);
  const ambito = cargoSelected?.ambito ?? null;

  useEffect(() => {
    if (!ambito) return;
    // Mantener solo lo que corresponda al ámbito
    if (ambito === "nacion") { setIdDep(null); setIdProv(null); setIdDist(null); }
    else if (ambito === "departamento") { setIdProv(null); setIdDist(null); }
    else if (ambito === "provincia") { setIdDist(null); }
    // 'distrito' → todo se mantiene
  }, [ambito]);

  async function onSave() {
    if (!idCargo || !idProceso) {
      setError("Cargo y proceso electoral son obligatorios.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await upsertPostulacion(data.slug, {
        id_cargo_gobierno: idCargo,
        id_organizacion_politica: idPartido ?? undefined,
        id_proceso_electoral: idProceso,
        id_departamento: ambito === "departamento" ? (idDep ?? undefined) : undefined,
        id_provincia: ambito === "provincia" ? (idProv ?? undefined) : undefined,
        id_distrito: ambito === "distrito" ? (idDist ?? undefined) : undefined,
      });
      await onChange();
    } catch (e) {
      setError((e as Error).message);
    }
    setSaving(false);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Cargo *">
          <select className={inputCls} value={idCargo ?? ""} onChange={(e) => setIdCargo(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Seleccionar…</option>
            {cargos.map((c) => (
              <option key={c.id} value={c.id}>{c.cargo} ({c.nivel})</option>
            ))}
          </select>
          {ambito && <p className="mt-1 text-[10px] text-slate-400">Ámbito: {ambito}</p>}
        </Field>

        <Field label="Proceso electoral *">
          <select className={inputCls} value={idProceso ?? ""} onChange={(e) => setIdProceso(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Seleccionar…</option>
            {procesos.map((p) => (
              <option key={p.id} value={p.id}>{p.codigo} · {p.descripcion}</option>
            ))}
          </select>
        </Field>

        <Field label="Partido / Organización">
          <select className={inputCls} value={idPartido ?? ""} onChange={(e) => setIdPartido(e.target.value ? Number(e.target.value) : null)}>
            <option value="">— Sin partido —</option>
            {partidos.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </Field>

        {(ambito === "departamento" || ambito === "provincia" || ambito === "distrito") && (
          <Field label="Departamento *">
            <select className={inputCls} value={idDep ?? ""} onChange={(e) => setIdDep(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Seleccionar…</option>
              {departamentos.map((d) => (
                <option key={d.id} value={d.id}>{d.departamento}</option>
              ))}
            </select>
          </Field>
        )}

        {(ambito === "provincia" || ambito === "distrito") && (
          <Field label="Provincia *">
            <select className={inputCls} value={idProv ?? ""} onChange={(e) => setIdProv(e.target.value ? Number(e.target.value) : null)} disabled={!idDep}>
              <option value="">Seleccionar…</option>
              {provincias.map((p) => (
                <option key={p.id} value={p.id}>{p.provincia}</option>
              ))}
            </select>
          </Field>
        )}

        {ambito === "distrito" && (
          <Field label="Distrito *">
            <select className={inputCls} value={idDist ?? ""} onChange={(e) => setIdDist(e.target.value ? Number(e.target.value) : null)} disabled={!idProv}>
              <option value="">Seleccionar…</option>
              {distritos.map((d) => (
                <option key={d.id} value={d.id}>{d.distrito} ({d.poblacion_total_2025.toLocaleString("es-PE")} hab)</option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}

      <div className="flex justify-end pt-2 border-t border-slate-100">
        <button
          onClick={onSave}
          disabled={saving || !idCargo || !idProceso}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0a1f4a] text-white px-4 py-2 text-sm font-medium hover:bg-[#06122e] disabled:opacity-50 transition"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar postulación
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1f4a]/20 focus:border-[#0a1f4a] transition disabled:opacity-50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
      {children}
    </div>
  );
}
