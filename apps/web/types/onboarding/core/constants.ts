/* ======================================================
   CORE CONSTANTS – ONBOARDING POLÍTICO
   ====================================================== */

export const ACTOR_TYPES = ['candidate', 'strategist'] as const;
export const CAMPAIGN_TYPES = ['OFICIAL', 'NO_OFICIAL'] as const;
export const CAMPAIGN_STRATEGIES = ['RACIONAL', 'EMOTIVA', 'INSTINTIVA', 'TRES_FRENTES', 'MIXTO'] as const;
export const POLITICAL_LEVELS = ['GOBIERNO_LOCAL', 'PARLAMENTARIO', 'PRESIDENCIAL'] as const;
export const LEGACY_POLITICAL_LEVELS = ['LOCAL', 'PARLAMENTARIO', 'PRESIDENCIAL'] as const;
export const PRIORITIES = ['high', 'medium', 'low'] as const;
export const STRATEGY_MODES = ['SIMPLE', 'MIXTO'] as const;
export const STEP_TYPES = ['info', 'single-select', 'multi-select', 'form', 'recommendation', 'drag-drop'] as const;
export const FRONT_TYPES = ['aire', 'mar', 'tierra', 'gestion'] as const;
export const OPTION_TYPES = ['single', 'multiple'] as const;

// Derived types from constants
export type ActorType = typeof ACTOR_TYPES[number];
export type CampaignType = typeof CAMPAIGN_TYPES[number];
export type CampaignStrategy = typeof CAMPAIGN_STRATEGIES[number];
export type PoliticalLevel = typeof POLITICAL_LEVELS[number];
export type LegacyPoliticalLevel = typeof LEGACY_POLITICAL_LEVELS[number];
export type Priority = typeof PRIORITIES[number];
export type StrategyMode = typeof STRATEGY_MODES[number];
export type StepType = typeof STEP_TYPES[number];
export type FrontType = typeof FRONT_TYPES[number];
export type OptionType = typeof OPTION_TYPES[number];