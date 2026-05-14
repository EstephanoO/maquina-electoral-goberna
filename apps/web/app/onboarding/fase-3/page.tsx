import { redirect } from "next/navigation";

// Fase 3 se consolidó al flujo por candidato vía /onboarding/[slug]/perfil.
export default function Fase3Page() {
  redirect("/home");
}
