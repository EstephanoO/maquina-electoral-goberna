"use client";

/**
 * /candidatos/[slug]/digital/validacion
 * Reusa el kanban de validación (ya usa useParams().slug).
 */

import ValidacionPage from "@/app/(dashboard)/candidatos/[slug]/validacion/page";

export default function DigitalValidacionTab() {
  return <ValidacionPage />;
}
