/**
 * GOBERNA — JurisdiccionSelector Component
 * Cascading select: departamento > provincia > distrito
 * Depth is controlled by `maxLevel` prop derived from cargo type.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { SelectInput } from "../../../../lib/ui";
import { getDepartamentos, getProvincias, getDistritos } from "../../../../lib/services/geo";
import type { DepartamentoInfo, ProvinciaInfo, DistritoInfo } from "../../../../lib/services/geo";
import type { JurisdiccionNivel } from "../../../../lib/types";

type JurisdiccionValue = {
  nivel: JurisdiccionNivel | "";
  code: string;
};

type JurisdiccionSelectorProps = {
  maxLevel: "departamento" | "provincia" | "distrito";
  value: JurisdiccionValue;
  onChange: (value: JurisdiccionValue) => void;
  /** Pre-select codes for edit mode (dep code, prov code, dist code) */
  initialDepCode?: string;
  initialProvCode?: string;
};

type SelectOption = { value: string; label: string };

export function JurisdiccionSelector({
  maxLevel,
  value,
  onChange,
  initialDepCode,
  initialProvCode,
}: JurisdiccionSelectorProps) {
  // ── Geo data ──
  const [departamentos, setDepartamentos] = useState<DepartamentoInfo[]>([]);
  const [provincias, setProvincias] = useState<ProvinciaInfo[]>([]);
  const [distritos, setDistritos] = useState<DistritoInfo[]>([]);

  // ── Selected intermediate codes ──
  const [depCode, setDepCode] = useState(initialDepCode ?? "");
  const [provCode, setProvCode] = useState(initialProvCode ?? "");

  // ── Loading states ──
  const [loadingDeps, setLoadingDeps] = useState(true);
  const [loadingProvs, setLoadingProvs] = useState(false);
  const [loadingDists, setLoadingDists] = useState(false);

  // ── Load departamentos on mount ──
  useEffect(() => {
    let cancelled = false;
    setLoadingDeps(true);
    getDepartamentos().then((res) => {
      if (!cancelled && res.ok && res.departamentos) {
        setDepartamentos(res.departamentos);
      }
      if (!cancelled) setLoadingDeps(false);
    });
    return () => { cancelled = true; };
  }, []);

  // ── Load provincias when dep changes ──
  useEffect(() => {
    if (!depCode) {
      setProvincias([]);
      return;
    }
    let cancelled = false;
    setLoadingProvs(true);
    getProvincias(depCode).then((res) => {
      if (!cancelled && res.ok && res.provincias) {
        setProvincias(res.provincias);
      }
      if (!cancelled) setLoadingProvs(false);
    });
    return () => { cancelled = true; };
  }, [depCode]);

  // ── Load distritos when prov changes ──
  useEffect(() => {
    if (!provCode || maxLevel !== "distrito") {
      setDistritos([]);
      return;
    }
    let cancelled = false;
    setLoadingDists(true);
    getDistritos(provCode).then((res) => {
      if (!cancelled && res.ok && res.distritos) {
        setDistritos(res.distritos);
      }
      if (!cancelled) setLoadingDists(false);
    });
    return () => { cancelled = true; };
  }, [provCode, maxLevel]);

  // ── Handlers ──
  const handleDepChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value;
    setDepCode(code);
    setProvCode("");
    setProvincias([]);
    setDistritos([]);
    if (maxLevel === "departamento" && code) {
      onChange({ nivel: "departamento", code });
    } else {
      onChange({ nivel: "", code: "" });
    }
  }, [maxLevel, onChange]);

  const handleProvChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value;
    setProvCode(code);
    setDistritos([]);
    if (maxLevel === "provincia" && code) {
      onChange({ nivel: "provincia", code });
    } else {
      onChange({ nivel: "", code: "" });
    }
  }, [maxLevel, onChange]);

  const handleDistChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value;
    if (code) {
      onChange({ nivel: "distrito", code });
    } else {
      onChange({ nivel: "", code: "" });
    }
  }, [onChange]);

  // ── Options ──
  const depOptions: SelectOption[] = departamentos.map((d) => ({
    value: d.coddep,
    label: d.departamento,
  }));

  const provOptions: SelectOption[] = provincias.map((p) => ({
    value: p.codprov_full,
    label: p.provincia,
  }));

  const distOptions: SelectOption[] = distritos.map((d) => ({
    value: d.ubigeo,
    label: d.distrito,
  }));

  // ── Derive selected values from the final code ──
  const selectedDep = depCode;
  const selectedProv = provCode;
  const selectedDist = value.nivel === "distrito" ? value.code : "";

  return (
    <div>
      <SelectInput
        id="jur-dep"
        label="Departamento"
        value={selectedDep}
        onChange={handleDepChange}
        options={depOptions}
        placeholder={loadingDeps ? "Cargando..." : "Seleccionar departamento..."}
        disabled={loadingDeps}
      />

      {(maxLevel === "provincia" || maxLevel === "distrito") && depCode && (
        <SelectInput
          id="jur-prov"
          label="Provincia"
          value={selectedProv}
          onChange={handleProvChange}
          options={provOptions}
          placeholder={loadingProvs ? "Cargando..." : "Seleccionar provincia..."}
          disabled={loadingProvs}
        />
      )}

      {maxLevel === "distrito" && provCode && (
        <SelectInput
          id="jur-dist"
          label="Distrito"
          value={selectedDist}
          onChange={handleDistChange}
          options={distOptions}
          placeholder={loadingDists ? "Cargando..." : "Seleccionar distrito..."}
          disabled={loadingDists}
        />
      )}
    </div>
  );
}
