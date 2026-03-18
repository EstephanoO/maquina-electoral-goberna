/** UBIGEO departamento codes → name mapping (Peru). */
export const DEPARTAMENTO_BY_CODE: Record<string, string> = {
  "01": "AMAZONAS",
  "02": "ANCASH",
  "03": "APURIMAC",
  "04": "AREQUIPA",
  "05": "AYACUCHO",
  "06": "CAJAMARCA",
  "07": "CALLAO",
  "08": "CUSCO",
  "09": "HUANCAVELICA",
  "10": "HUANUCO",
  "11": "ICA",
  "12": "JUNIN",
  "13": "LA LIBERTAD",
  "14": "LAMBAYEQUE",
  "15": "LIMA",
  "16": "LORETO",
  "17": "MADRE DE DIOS",
  "18": "MOQUEGUA",
  "19": "PASCO",
  "20": "PIURA",
  "21": "PUNO",
  "22": "SAN MARTIN",
  "23": "TACNA",
  "24": "TUMBES",
  "25": "UCAYALI",
};

/** Resolve a zona string (ubigeo or text) to a departamento name. */
export function resolveDepartamento(zona: string): string {
  const raw = (zona || "").trim();
  if (!raw) return "Sin region";
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 2) {
    const dep = DEPARTAMENTO_BY_CODE[digits.slice(0, 2)];
    if (dep) return dep;
  }
  const first = raw.split(/[\-|/>,]/).map((p) => p.trim()).filter(Boolean)[0] || raw;
  return first.replace(/\d+/g, "").trim().toUpperCase() || "Sin region";
}
