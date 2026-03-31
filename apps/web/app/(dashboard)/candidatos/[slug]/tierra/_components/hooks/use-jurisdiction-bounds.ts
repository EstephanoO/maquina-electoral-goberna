/**
 * useJurisdictionBounds — resolve campaign jurisdiction to map bounds.
 * Returns bounds [[minLng,minLat],[maxLng,maxLat]] or null if not set / loading.
 */

import { useState, useEffect } from "react";
import {
  getDepartamentos,
  getProvincias,
  getDistritos,
} from "@/lib/services/geo";
import type { GeoBounds } from "@/lib/services/geo";
import type { JurisdiccionNivel } from "@/lib/types";

export function useJurisdictionBounds(
  nivel: JurisdiccionNivel | null | undefined,
  code: string | null | undefined,
): GeoBounds | null {
  const [bounds, setBounds] = useState<GeoBounds | null>(null);

  useEffect(() => {
    if (!nivel || !code) {
      setBounds(null);
      return;
    }

    let cancelled = false;

    async function resolve() {
      try {
        if (nivel === "departamento") {
          const res = await getDepartamentos();
          if (cancelled) return;
          const dep = res.departamentos?.find((d) => d.coddep === code);
          if (dep) setBounds(dep.bounds);
        } else if (nivel === "provincia") {
          // code is CODDEP+CODPROV (4 chars), depCode is first 2
          const depCode = code!.substring(0, 2);
          const res = await getProvincias(depCode);
          if (cancelled) return;
          const prov = res.provincias?.find((p) => p.codprov_full === code);
          if (prov) setBounds(prov.bounds);
        } else if (nivel === "distrito") {
          // code is UBIGEO (6 chars), provCode is first 4
          const provCode = code!.substring(0, 4);
          const res = await getDistritos(provCode);
          if (cancelled) return;
          const dist = res.distritos?.find((d) => d.ubigeo === code);
          if (dist) setBounds(dist.bounds);
        }
      } catch {
        // Silently fail — map falls back to Peru view
      }
    }

    resolve();
    return () => { cancelled = true; };
  }, [nivel, code]);

  return bounds;
}
