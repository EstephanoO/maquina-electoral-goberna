import { notFound } from "next/navigation";

import { Fase2F1Deck } from "@/app/onboarding/[slug]/fase-2/_components/Fase2F1Deck";
import { MOCK_FULL, MOCK_MIN } from "../mocks";

/**
 * Preview dev-only del deck Fase 2 con mocks. Permite capturas Playwright
 * sin levantar backend ni DB.
 *
 *   /dev-preview/fase2/full  → mock con todos los campos del form llenos
 *   /dev-preview/fase2/min   → mock con consultor_form vacío
 *
 * Gateado por NODE_ENV: en producción devuelve 404.
 */
export default async function DevPreviewPage({
  params,
}: {
  params: Promise<{ mode: string }>;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const { mode } = await params;
  const mock = mode === "full" ? MOCK_FULL : mode === "min" ? MOCK_MIN : null;
  if (!mock) notFound();

  return (
    <Fase2F1Deck slug={mock!.slug} ctx={mock!.ctx} deck={mock!.deck} />
  );
}
