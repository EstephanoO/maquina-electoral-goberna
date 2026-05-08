"use client";

/**
 * /candidatos/[slug]/datos/formularios
 * Reusa el formularios builder global (admin-only). El componente filtra
 * automáticamente por la primera campaña — TODO refinement: pinear al slug.
 */

import FormulariosPage from "@/app/(dashboard)/formularios/page";

export default function DatosFormulariosTab() {
  return <FormulariosPage />;
}
