/**
 * demo-legua-data.ts — Static data for the DemoLeguaBanner presentation.
 *
 * District data is public (ONPE / INEI 2024).
 */

/* ─── Datos reales del distrito (ONPE / INEI 2024) ─── */

export const LEGUA = {
  distrito: "Carmen de la Legua Reynoso",
  provincia: "Callao",
  ubigeo: "070103",
  padron: 39_412,          // Electores hábiles ONPE 2022
  poblacion: 43_500,       // Proyección INEI 2024
  localesVotacion: 18,     // Centros de votación aprox.
  aaMm: 12,                // AA.HH. y asentamientos
  zonasUrb: 8,             // Zonas urbanas diferenciadas
  metaDatos: 8_000,        // Meta datos tierra (20% padrón — objetivo realista)
  metaVotos: 14_000,       // Meta votos (36% para ganar con 4 candidatos)
  competidores: 4,         // Candidatos en carrera típica
  brigadistas: 24,         // Equipo de campo objetivo
} as const;

/* ─── Ventajas de Goberna para presentar ─── */

export type VentajaItem = {
  readonly icon: (props: { color?: string }) => React.ReactElement;
  readonly title: string;
  readonly desc: string;
  readonly color: string;
};

// Note: icons are injected when building the array in demo-legua-banner.tsx
// because this file is a .ts (not .tsx) and doesn't contain JSX.
