/**
 * useJurisdictionBounds — resolve campaign jurisdiction to map bounds + drill state.
 *
 * Returns both:
 * - `bounds` — for lockedBounds (camera lock)
 * - `drillState` — for mask/dim layers (visual focus on the jurisdiction only)
 *
 * This replicates the LEGUA_DRILL + LEGUA_BOUNDS pattern but dynamically
 * from the campaign's jurisdiccion_nivel + jurisdiccion_code.
 */

import { useState, useEffect } from "react";
import {
  getDepartamentos,
  getProvincias,
  getDistritos,
} from "@/lib/services/geo";
import type { GeoBounds } from "@/lib/services/geo";
import type { JurisdiccionNivel } from "@/lib/types";
import type { DrillState } from "../types";

export type JurisdictionResult = {
  bounds: GeoBounds;
  drill: DrillState;
} | null;

export function useJurisdictionBounds(
  nivel: JurisdiccionNivel | null | undefined,
  code: string | null | undefined,
): JurisdictionResult {
  const [result, setResult] = useState<JurisdictionResult>(null);

  useEffect(() => {
    if (!nivel || !code) {
      setResult(null);
      return;
    }

    let cancelled = false;

    async function resolve() {
      try {
        if (nivel === "departamento") {
          const res = await getDepartamentos();
          if (cancelled) return;
          const dep = res.departamentos?.find((d) => d.coddep === code);
          if (dep) {
            setResult({
              bounds: dep.bounds,
              drill: {
                level: 1,
                depCode: dep.coddep,
                depName: dep.departamento,
                provCode: null, provName: null,
                distCode: null, distName: null,
                sector: null, sectorName: null,
              },
            });
          }
        } else if (nivel === "provincia") {
          const depCode = code!.substring(0, 2);
          // Fetch both departamentos (for name) and provincias in parallel
          const [depRes, provRes] = await Promise.all([
            getDepartamentos(),
            getProvincias(depCode),
          ]);
          if (cancelled) return;
          const dep = depRes.departamentos?.find((d) => d.coddep === depCode);
          const prov = provRes.provincias?.find((p) => p.codprov_full === code);
          if (prov) {
            setResult({
              bounds: prov.bounds,
              drill: {
                level: 2,
                depCode: depCode,
                depName: dep?.departamento ?? depCode,
                provCode: prov.codprov_full,
                provName: prov.provincia,
                distCode: null, distName: null,
                sector: null, sectorName: null,
              },
            });
          }
        } else if (nivel === "distrito") {
          const depCode = code!.substring(0, 2);
          const provCode = code!.substring(0, 4);
          const [depRes, provRes, distRes] = await Promise.all([
            getDepartamentos(),
            getProvincias(depCode),
            getDistritos(provCode),
          ]);
          if (cancelled) return;
          const dep = depRes.departamentos?.find((d) => d.coddep === depCode);
          const prov = provRes.provincias?.find((p) => p.codprov_full === provCode);
          const dist = distRes.distritos?.find((d) => d.ubigeo === code);
          if (dist) {
            setResult({
              bounds: dist.bounds,
              drill: {
                level: 3,
                depCode: depCode,
                depName: dep?.departamento ?? depCode,
                provCode: provCode,
                provName: prov?.provincia ?? provCode,
                distCode: dist.ubigeo,
                distName: dist.distrito,
                sector: null, sectorName: null,
              },
            });
          }
        }
      } catch {
        // Silently fail — map falls back to Peru view
      }
    }

    resolve();
    return () => { cancelled = true; };
  }, [nivel, code]);

  return result;
}
