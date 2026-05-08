import { OnboardingOption } from './options';

// Legacy interface for compatibility
export type FlowOption = OnboardingOption;

// Backward compatibility exports for existing code
export type {
  StrategyAssignment,
  CampaignAssignment,
  FrontStrategyAssignment,
  StrategyConfig,
  OnboardingOption,
  FormFieldOption,
  FormField,
  FrontStrategyConfig,
  StepOptions,
  StepData,
  FormDataRecord,
  AssignmentData,
} from './options';

export type {
  DragDropConfig,
  OnboardingStep,
  FlowStep,
} from './ui';