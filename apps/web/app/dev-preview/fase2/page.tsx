import { notFound } from "next/navigation";

import { Fase2F1Deck } from "@/app/onboarding/[slug]/fase-2/_components/Fase2F1Deck";
import { MOCK } from "./mocks";

/**
 * Preview dev-only del deck Fase 2 con datos mockeados.
 *
 * Fase 2 NO tiene modos: es UN solo deck adaptativo. Las slides aparecen
 * o no según los datos que el form de Fase 1 (o el form extendido) tenga
 * llenos. El mock acá es del form llenado al máximo para ver TODAS las
 * slides catalogadas (14).
 *
 * URL: /dev-preview/fase2 — gateada por NODE_ENV (en producción → 404).
 */
export default function DevPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <Fase2F1Deck slug={MOCK.slug} ctx={MOCK.ctx} deck={MOCK.deck} />;
}
