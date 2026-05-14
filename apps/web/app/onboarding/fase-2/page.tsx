import { redirect } from "next/navigation";

// El deck Goberna clásico se consolidó al flujo por candidato.
// Acceso directo a /onboarding/fase-2 ya no es el flujo activo.
export default function Fase2Page() {
  redirect("/home");
}
