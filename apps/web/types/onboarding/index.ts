/* ======================================================
   ONBOARDING – MÁQUINA ELECTORAL / GOBIERNO
   Producto: Goberna – Máquina Política Digital
   ====================================================== */

// Core exports - constants and base types
export type {
  ActorType,
  CampaignType,
  CampaignStrategy,
  PoliticalLevel,
  LegacyPoliticalLevel,
  Priority,
  StrategyMode,
  StepType,
  FrontType,
  OptionType,
} from './core/base';

export type Canal = any;
export type Mensaje = any;
export type CombinacionCanal = any;
export type AccionEstrategica = any;
export type ResultadoEstrategia = any;

export {
  ACTOR_TYPES,
  CAMPAIGN_TYPES,
  CAMPAIGN_STRATEGIES,
  POLITICAL_LEVELS,
  LEGACY_POLITICAL_LEVELS,
  PRIORITIES,
  STRATEGY_MODES,
  STEP_TYPES,
  FRONT_TYPES,
  OPTION_TYPES,
} from './core/constants';

// Zod schemas and validation
export {
  ActorTypeSchema,
  CampaignTypeSchema,
  CampaignStrategySchema,
  PoliticalLevelSchema,
  LegacyPoliticalLevelSchema,
  PrioritySchema,
  StrategyModeSchema,
  CampaignStrategyConfigSchema,
  CampaignPlanSchema,
  OnboardingStepDataSchema,
  OnboardingTransformSchema,
  validateCampaignStrategy,
  validatePoliticalLevel,
  validateActorType,
  validateCampaignPlan,
  isStrategyMixto,
  normalizeStrategyInput,
} from './core/schemas';

export type {
  CampaignStrategyConfig,
  CampaignPlan,
  OnboardingStepData,
  OnboardingTransform,
} from './core/schemas';

// Domain types
export type {
  OnboardingContext,
  RecommendationRule,
} from './domain/context';

export type {
  OnboardingStep,
  FlowStep,
} from './domain/steps';

export type {
  StrategyAssignment,
} from './domain/assignments';

// Configuration
export {
  POLITICAL_LEVEL_CONFIG,
  CAMPAIGN_STRATEGY_CONFIG,
  CAMPAIGN_TYPE_CONFIG,
} from './config/steps-config';

export { onboardingSteps } from './config/onboarding-steps';

export type {
  StepConfig,
} from './config/steps-config';

export {
  isValidCampaignStrategy,
  isValidPoliticalLevel,
  isValidCampaignType,
  transformLegacyPoliticalLevel,
  parseStrategyCombination,
  generateStrategyCombination,
  isStrategyArray,
  isStrategyOrArray,
  comparePriority,
  getStrategySubOptions,
  getFrontOptionsByStrategy,
  getRoleOptionsByLevel,
  getDragDropConfigByStrategies,
  getStrategyDragDropConfig,
  normalizeStrategies,
} from './config/utils';

// Interface types
export type {
  OnboardingOption,
  FormFieldOption,
  FormField,
  FrontStrategyConfig,
  CampaignAssignment,
  FrontStrategyAssignment,
  StrategyConfig,
  StepOptions,
  StepData,
  FormDataRecord,
  AssignmentData,
} from './interfaces/options';

export type {
  DragDropConfig,
  FrontStrategyConfig as FrontStrategyConfigUI,
} from './interfaces/ui';

// Legacy exports for backward compatibility
export type {
  FlowOption,
} from './interfaces/legacy';

// Re-export all legacy types to maintain compatibility
export type {
  StrategyAssignment as LegacyStrategyAssignment,
  CampaignAssignment as LegacyCampaignAssignment,
  FrontStrategyAssignment as LegacyFrontStrategyAssignment,
  StrategyConfig as LegacyStrategyConfig,
  OnboardingOption as LegacyOnboardingOption,
  FormFieldOption as LegacyFormFieldOption,
  FormField as LegacyFormField,
  FrontStrategyConfig as LegacyFrontStrategyConfig,
  StepOptions as LegacyStepOptions,
  StepData as LegacyStepData,
  FormDataRecord as LegacyFormDataRecord,
  AssignmentData as LegacyAssignmentData,
  DragDropConfig as LegacyDragDropConfig,
  OnboardingStep as LegacyOnboardingStep,
  FlowStep as LegacyFlowStep,
} from './interfaces/legacy';