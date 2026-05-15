import { OnboardingFlow } from "@/components/onboarding-wizard/OnboardingFlow";

export const metadata = {
  title: "Propuesta técnica - Goberna",
  description: "Armamos tu perfil electoral en menos de 2 minutos.",
};

export default function OnboardingPage() {
  return <OnboardingFlow />;
}
