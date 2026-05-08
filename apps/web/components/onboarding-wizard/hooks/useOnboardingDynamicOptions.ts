import { useCallback } from "react";
import { 
  getRoleOptionsByLevel, 
  getFrontOptionsByStrategy, 
  getDragDropConfigByStrategies, 
  CampaignStrategy, 
  OnboardingContext,
  OnboardingOption,
  CampaignAssignment
} from "@/types/onboarding";

export function useOnboardingDynamicOptions(onboardingData: OnboardingContext) {
  // Obtener opciones dinámicas según el paso
  const getDynamicOptions = useCallback((stepId: string, stepOptions: OnboardingOption[] | undefined) => {
    // Dinámica para roles según nivel
    if (stepId === "role" && onboardingData.level) {
      return getRoleOptionsByLevel(onboardingData.level);
    }
    
    // Dinámica para frentes según estrategia y tipo de campaña
    if (stepId === "fronts" && onboardingData.campaignStrategy) {
      const strategies = Array.isArray(onboardingData.campaignStrategy) 
        ? onboardingData.campaignStrategy[0] // Tomar primera estrategia por ahora
        : onboardingData.campaignStrategy;
      
      return getFrontOptionsByStrategy(
        strategies as CampaignStrategy,
        onboardingData.campaignType as any // Type assertion
      );
    }
    
    return stepOptions;
  }, [onboardingData.level, onboardingData.campaignStrategy, onboardingData.campaignType]);

  return { getDynamicOptions };
}