import { CampaignType, CampaignStrategy } from '@/types/onboarding/core/constants';

export type OnboardingOption = {
  value: string;
  label: string;
  description?: string;
  icon?: string;
  detailedDescription?: string;
  benefits?: string[];
};

export type FormFieldOption = {
  value: string;
  label: string;
};

export type FormField = {
  id: string;
  label: string;
  type: "text" | "email" | "number" | "select" | "textarea" | "password";
  placeholder?: string;
  required?: boolean;
  options?: FormFieldOption[];
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  helper?: string;
  autoComplete?: string;
};

export type FrontStrategyConfig = {
  frontAssignments: {
    front: string;
    campaignType: CampaignType;
  }[];
  availableStrategies: CampaignStrategy[];
};

export type StrategyAssignment = {
  strategy: CampaignStrategy | string;
  campaignType: CampaignType;
  description: string;
  priority: "high" | "medium" | "low";
};

export type CampaignAssignment = {
  strategy: CampaignStrategy;
  front: string;
  campaignType: CampaignType;
  isMovable: boolean;
  order?: number;
};

export type FrontStrategyAssignment = {
  front: string;
  campaignType: CampaignType;
  strategy: CampaignStrategy;
  subOptions?: string[];
};

export type StrategyConfig = {
  RACIONAL: {
    label: string;
    description: string;
    icon: string;
  };
  EMOTIVA: {
    label: string;
    description: string;
    icon: string;
  };
  INSTINTIVA: {
    label: string;
    description: string;
    icon: string;
  };
  MIXTO: {
    label: string;
    description: string;
    icon: string;
    subOptions: string[];
  };
  TRES_FRENTES: {
    label: string;
    description: string;
    icon: string;
  };
};

// Function declaration for strategy sub-options
export declare function getStrategySubOptions(strategy: CampaignStrategy): string[];

// Utility types to replace 'any'
export type StepOptions = OnboardingOption[];
export type StepData = unknown;
export type FormDataRecord = Record<string, unknown>;
export type AssignmentData = CampaignAssignment[];