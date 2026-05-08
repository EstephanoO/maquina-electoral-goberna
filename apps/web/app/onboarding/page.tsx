import { OnboardingFlow } from "@/components/onboarding-wizard/OnboardingFlow";

export const metadata = {
  title: "Crear tu cuenta — Goberna Electoral",
  description: "Configurá tu cuenta de candidato en menos de 2 minutos.",
};

export default function OnboardingPage() {
  return <OnboardingFlow />;
}
