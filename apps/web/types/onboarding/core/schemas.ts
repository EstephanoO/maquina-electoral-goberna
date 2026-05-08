import { z } from 'zod';
import { 
  ACTOR_TYPES, 
  CAMPAIGN_TYPES, 
  CAMPAIGN_STRATEGIES, 
  POLITICAL_LEVELS, 
  LEGACY_POLITICAL_LEVELS,
  PRIORITIES,
  STRATEGY_MODES 
} from './constants';

// ========================================
// ESQUEMAS PRINCIPALES DEL ONBOARDING
// ========================================

export const ActorTypeSchema = z.enum(ACTOR_TYPES);
export type ActorType = z.infer<typeof ActorTypeSchema>;

export const CampaignTypeSchema = z.enum(CAMPAIGN_TYPES);
export type CampaignType = z.infer<typeof CampaignTypeSchema>;

// FIXED: Added MIXTO value to CampaignStrategySchema
export const CampaignStrategySchema = z.enum(CAMPAIGN_STRATEGIES);
export type CampaignStrategy = z.infer<typeof CampaignStrategySchema>;

export const PoliticalLevelSchema = z.enum(POLITICAL_LEVELS);
export type PoliticalLevel = z.infer<typeof PoliticalLevelSchema>;

export const LegacyPoliticalLevelSchema = z.enum(LEGACY_POLITICAL_LEVELS);
export type LegacyPoliticalLevel = z.infer<typeof LegacyPoliticalLevelSchema>;

export const PrioritySchema = z.enum(PRIORITIES);
export type Priority = z.infer<typeof PrioritySchema>;

export const StrategyModeSchema = z.enum(STRATEGY_MODES);
export type StrategyMode = z.infer<typeof StrategyModeSchema>;

// ========================================
// ESQUEMA DE ESTRATEGIA DE CAMPAÑA
// ========================================

export const CampaignStrategyConfigSchema = z.object({
  id: CampaignStrategySchema,
  campaignType: CampaignTypeSchema,
  priority: PrioritySchema.default('medium'),
});

export type CampaignStrategyConfig = z.infer<typeof CampaignStrategyConfigSchema>;

// ========================================
// ESQUEMA PRINCIPAL DE CAMPAÑA
// ========================================

export const CampaignPlanSchema = z.object({
  actor: ActorTypeSchema,
  level: z.union([PoliticalLevelSchema, LegacyPoliticalLevelSchema]).transform((val) => {
    // Transform legacy values to current schema
    switch (val) {
      case 'LOCAL':
        return 'GOBIERNO_LOCAL';
      case 'GOBIERNO_LOCAL':
      case 'PARLAMENTARIO':
      case 'PRESIDENCIAL':
        return val;
      default:
        return 'PRESIDENCIAL';
    }
  }),
  role: z.string().min(1, 'El rol es obligatorio'),
  
  strategies: z.array(CampaignStrategyConfigSchema)
    .min(1, 'Debe haber al menos una estrategia')
    .max(6, 'No puede haber más de 6 estrategias'),
    
  meta: z.object({
    strategyMode: StrategyModeSchema,
    combination: z.string().optional(),
    createdAt: z.string().default(() => new Date().toISOString()),
  }),
});

export type CampaignPlan = z.infer<typeof CampaignPlanSchema>;

// ========================================
// ESQUEMAS INTERMEDIOS (COMPATIBILIDAD)
// ========================================

export const OnboardingStepDataSchema = z.object({
  actor: ActorTypeSchema.optional(),
  level: z.union([PoliticalLevelSchema, LegacyPoliticalLevelSchema]).optional(), 
  role: z.string().optional(),
  campaignStrategy: z.union([
    CampaignStrategySchema,
    z.array(CampaignStrategySchema),
  ]).optional(),
  strategyCombination: z.preprocess((val) => {
    if (typeof val === 'string' && val.includes('+')) {
      return val.split('+').map(s => s.trim());
    }
    return val;
  }, z.array(z.string()).optional()),
  strategyAssignments: z.array(z.object({
    strategy: z.union([CampaignStrategySchema, z.string()]),
    campaignType: CampaignTypeSchema,
    description: z.string(),
    priority: PrioritySchema,
  })).optional(),
});

export type OnboardingStepData = z.infer<typeof OnboardingStepDataSchema>;

// ========================================
// ESQUEMA DE TRANSFORMACIÓN
// ========================================

export const OnboardingTransformSchema = z.object({
  from: z.object({
    campaignStrategy: z.union([CampaignStrategySchema, z.array(CampaignStrategySchema)]).optional(),
    strategyCombination: z.preprocess((val) => {
      if (typeof val === 'string' && val.includes('+')) {
        return val.split('+').map(s => s.trim());
      }
      return val;
    }, z.array(z.string()).optional()),
  }),
  to: CampaignPlanSchema,
});

export type OnboardingTransform = z.infer<typeof OnboardingTransformSchema>;

// ========================================
// VALIDACIONES PERSONALIZADAS CON TRANSFORMACIÓN
// ========================================

export const validateCampaignStrategy = (strategy: unknown): CampaignStrategy | null => {
  const result = CampaignStrategySchema.safeParse(strategy);
  return result.success ? result.data : null;
};

export const validatePoliticalLevel = (level: unknown): PoliticalLevel | null => {
  // Try current schema first
  const currentResult = PoliticalLevelSchema.safeParse(level);
  if (currentResult.success) return currentResult.data;
  
  // Try legacy schema and transform
  const legacyResult = LegacyPoliticalLevelSchema.safeParse(level);
  if (legacyResult.success) {
    // Transform legacy values to current schema
    const legacyValue = legacyResult.data;
    switch (legacyValue) {
      case 'LOCAL':
        return 'GOBIERNO_LOCAL';
      case 'PARLAMENTARIO':
        return 'PARLAMENTARIO';
      case 'PRESIDENCIAL':
        return 'PRESIDENCIAL';
    }
  }
  
  return null;
};

export const validateActorType = (actor: unknown): ActorType | null => {
  const result = ActorTypeSchema.safeParse(actor);
  return result.success ? result.data : null;
};

export const validateCampaignPlan = (plan: unknown): CampaignPlan | null => {
  const result = CampaignPlanSchema.safeParse(plan);
  if (!result.success) {
    console.error('❌ Error de validación del plan de campaña:', result.error);
    return null;
  }
  return result.data;
};

// ========================================
// UTILIDADES DE VALIDACIÓN
// ========================================

export const isStrategyMixto = (strategy: string | string[] | undefined): boolean => {
  if (!strategy) return false;
  if (Array.isArray(strategy)) {
    return strategy.length > 1;
  }
  return strategy === 'MIXTO' || strategy.includes('+');
};

export const normalizeStrategyInput = (input: any): CampaignStrategy[] => {
  if (!input) return [];
  
  // Handle array input directly
  if (Array.isArray(input)) {
    const results: CampaignStrategy[] = [];
    input.forEach(item => {
      if (typeof item === 'string') {
        const strategy = validateCampaignStrategy(item);
        if (strategy) {
          results.push(strategy);
        } else if (item === 'MIXTO') {
          results.push('RACIONAL', 'EMOTIVA', 'INSTINTIVA');
        }
      }
    });
    return results;
  }
  
  // Handle string input
  if (typeof input === 'string') {
    const strategy = validateCampaignStrategy(input);
    if (strategy) {
      return [strategy];
    }
    if (input === 'MIXTO') {
      return ['RACIONAL', 'EMOTIVA', 'INSTINTIVA'];
    }
    if (input.includes('+')) {
      const parts = input.split('+').map(s => s.trim());
      const results: CampaignStrategy[] = [];
      parts.forEach(part => {
        const strategy = validateCampaignStrategy(part);
        if (strategy) results.push(strategy);
      });
      return results.length > 0 ? results : [];
    }
  }
  
  return [];
};