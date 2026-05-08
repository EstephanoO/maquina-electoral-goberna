import { CampaignType, CampaignStrategy } from '@/types/onboarding/core/constants';
import { OnboardingOption, FormField } from '@/types/onboarding/interfaces/options';

export type OnboardingStep = {
  id: string;
  title: string;
  subtitle?: string;
  type: "info" | "single-select" | "multi-select" | "form" | "recommendation" | "drag-drop";
  required?: boolean;
  options?: OnboardingOption[];
  fields?: FormField[];
  guideText?: string;
  dragDropConfig?: DragDropConfig;
  frontStrategyConfig?: FrontStrategyConfig;
};

export type DragDropConfig = {
  campaignTypes: {
    OFICIAL: {
      movable: (CampaignStrategy | string)[];
      fixed?: (CampaignStrategy | string)[];
    };
    NO_OFICIAL: {
      movable: (CampaignStrategy | string)[];
      fixed?: (CampaignStrategy | string)[];
    };
  };
  rules: {
    allowBothCampaigns: boolean;
    requireAtLeastOne: boolean;
  };
};

export type FrontStrategyConfig = {
  frontAssignments: {
    front: string;
    campaignType: CampaignType;
  }[];
  availableStrategies: CampaignStrategy[];
};

// Legacy interface for compatibility
export type FlowStep = {
  id: string;
  title: string;
  subtitle?: string;
  type: "single" | "multiple" | "form" | "info";
  required?: boolean;
  options?: OnboardingOption[];
  fields?: FormField[];
  guideText?: string;
};