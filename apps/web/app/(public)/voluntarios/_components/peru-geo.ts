/**
 * Departamentos del Perú (25).
 * Provincias y distritos: input libre (too many to enumerate).
 */

export const DEPARTAMENTOS_PERU = [
  "Amazonas",
  "Áncash",
  "Apurímac",
  "Arequipa",
  "Ayacucho",
  "Cajamarca",
  "Callao",
  "Cusco",
  "Huancavelica",
  "Huánuco",
  "Ica",
  "Junín",
  "La Libertad",
  "Lambayeque",
  "Lima",
  "Loreto",
  "Madre de Dios",
  "Moquegua",
  "Pasco",
  "Piura",
  "Puno",
  "San Martín",
  "Tacna",
  "Tumbes",
  "Ucayali",
] as const;

export type DepartamentoPeru = (typeof DEPARTAMENTOS_PERU)[number];

export const DEPARTAMENTO_OPTIONS = DEPARTAMENTOS_PERU.map((d) => ({ value: d, label: d }));
