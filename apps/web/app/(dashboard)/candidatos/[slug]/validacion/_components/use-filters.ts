import { useMemo, useState } from "react";
import type { ValidationItem } from "@/lib/services/validacion";

export function useFilters(items: ValidationItem[]) {
  const [search, setSearch] = useState("");
  const [filterZona, setFilterZona] = useState("");
  const [filterEnc, setFilterEnc] = useState("");
  const [filterDepto, setFilterDepto] = useState("");

  const zonas = useMemo(() => {
    const s = new Set(items.map((i) => i.zona).filter(Boolean));
    return Array.from(s).sort();
  }, [items]);

  const encuestadores = useMemo(() => {
    const s = new Set(items.map((i) => i.encuestador?.split(" ")[0]).filter(Boolean));
    return Array.from(s).sort();
  }, [items]);

  const departamentos = useMemo(() => {
    const s = new Set(items.map((i) => i.departamento).filter(Boolean) as string[]);
    return Array.from(s).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items.filter((i) => {
      if (q && !i.nombre.toLowerCase().includes(q) && !i.telefono.includes(q) && !i.encuestador.toLowerCase().includes(q)) return false;
      if (filterZona && i.zona !== filterZona) return false;
      if (filterEnc && !i.encuestador.startsWith(filterEnc)) return false;
      if (filterDepto && i.departamento !== filterDepto) return false;
      return true;
    });
  }, [items, search, filterZona, filterEnc, filterDepto]);

  const hasFilters = !!search || !!filterZona || !!filterEnc || !!filterDepto;

  return { search, setSearch, filterZona, setFilterZona, filterEnc, setFilterEnc, filterDepto, setFilterDepto, zonas, encuestadores, departamentos, filtered, hasFilters };
}
