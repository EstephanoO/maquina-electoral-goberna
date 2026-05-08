import { PoliticalLevel, CampaignType, CampaignStrategy } from '@/types/onboarding/core/constants';
import { OnboardingOption } from '@/types/onboarding/interfaces/options';

// Configuration for political levels
export const POLITICAL_LEVEL_CONFIG = {
  PRESIDENCIAL: {
    label: 'Elección Presidencial',
    description: 'Campaña para la presidencia del país',
    icon: '🏛️',
  },
  PARLAMENTARIO: {
    label: 'Elección Parlamentaria',
    description: 'Campaña para congreso o senado',
    icon: '🏛️',
  },
  GOBIERNO_LOCAL: {
    label: 'Elección de Gobierno Local',
    description: 'Campaña para alcaldía o gobierno regional',
    icon: '🏛️',
  },
} as const;

// Configuration for campaign strategies
export const CAMPAIGN_STRATEGY_CONFIG = {
  RACIONAL: {
    label: 'Estrategia Racional',
    description: 'Basada en datos, hechos y lógica',
    icon: '📊',
  },
  EMOTIVA: {
    label: 'Estrategia Emotiva',
    description: 'Conecta con valores y emociones',
    icon: '❤️',
  },
  INSTINTIVA: {
    label: 'Estrategia Instintiva',
    description: 'Apela al instinto y supervivencia',
    icon: '⚡',
  },
  MIXTO: {
    label: 'Estrategia Mixta',
    description: 'Combinación de múltiples estrategias',
    icon: '🔄',
  },
} as const;

// Configuration for campaign types
export const CAMPAIGN_TYPE_CONFIG = {
  OFICIAL: {
    label: 'Campaña Oficial',
    description: 'Campaña principal del candidato',
    icon: '🎯',
  },
  NO_OFICIAL: {
    label: 'Campaña No Oficial',
    description: 'Campaña de apoyo o paralela',
    icon: '🌟',
  },
} as const;

// Step configurations for onboarding flow
export type StepConfig = {
  id: string;
  title: string;
  subtitle?: string;
  type: 'info' | 'single-select' | 'multi-select' | 'form' | 'recommendation' | 'drag-drop';
  required?: boolean;
  options?: OnboardingOption[];
  nextStep?: string;
  conditionalNext?: {
    condition: (data: any) => boolean;
    nextStep: string;
  };
};