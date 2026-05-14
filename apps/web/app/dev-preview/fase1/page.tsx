import { notFound } from "next/navigation";

import { Fase1RapidaClient } from "@/app/onboarding/[slug]/fase-1/_components/Fase1RapidaClient";
import { MOCK } from "../fase2/mocks";

/**
 * Preview dev-only del form Fase 1 con datos mockeados.
 *
 * Permite ver el live-preview del slide a la derecha sin necesidad de
 * estar autenticado como consultor + tener un candidato real.
 *
 * URL: /dev-preview/fase1 — gateada por NODE_ENV (en producción → 404).
 */
export default function DevPreviewFase1() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return (
    <Fase1RapidaClient
      slug={MOCK.slug}
      mockCtx={MOCK.ctx}
      mockForm={MOCK.ctx.consultor_form?.fase1_rapida ?? {}}
    />
  );
}
