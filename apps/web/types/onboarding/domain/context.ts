import { ActorType, PoliticalLevel, CampaignType, CampaignStrategy } from '@/types/onboarding/core/constants';
import { CampaignAssignment, StrategyAssignment } from '@/types/onboarding/interfaces/options';

export type OnboardingContext = {
  actor?: ActorType;
  level?: PoliticalLevel;
  role?: string;
  challenges?: string[];
  campaignType?: CampaignType;
  campaignStrategy?: CampaignStrategy | CampaignStrategy[];
  strategyCombination?: (CampaignStrategy | string)[];
  campaignAssignments?: CampaignAssignment[];
  strategyAssignments?: StrategyAssignment[];
  selectedFronts?: string[];
  personalContext?: string;

  // ── Datos prácticos del provisioning (Fase 2) ──────────────────────
  waSession?: {
    sessionId: string;
    phone: string;
    pushName?: string;
    avatarUrl?: string;
  };
  datos?: {
    firstName?: string;
    lastName?: string;
    country?: string;
    documentoNumero?: string;
    phone?: string;
    // Legacy alias
    fullName?: string;
    email?: string;
  };
  cargoApi?: {
    cargo: {
      id: number;
      codigo: string;
      nombre: string;
      ambito: "pais" | "departamento" | "provincia" | "distrito";
      nivelCodigo: string;
    };
    departamento?: { id: number; nombre: string };
    provincia?: { id: number; nombre: string };
    distrito?: { id: number; nombre: string };
  };
  organizacionApi?: {
    id: number;
    codigo: string;
    nombre: string;
    siglas: string | null;
  } | null;
  credenciales?: {
    password?: string;
  };
  /** Data URL JPEG (base64) de la foto del candidato. Vacío "" = saltó el step. */
  foto?: string;
  slug?: string;
  // Output del wizard al terminar el provisioning. Lo guarda handleStepData
  // bajo la key del step.id, que es "provisioning".
  provisioning?: {
    dashboard_url?: string;
    campaign_id?: string;
    slug?: string;
  };

  // Legacy aliases for compatibility
  nivel?: PoliticalLevel;
  rol?: string;
  estrategia?: CampaignStrategy | CampaignStrategy[];
};

export type RecommendationRule = {
  id: string;
  when: (context: OnboardingContext) => boolean;
  recommend: string[];
  message: string;
  priority: "info" | "success" | "warning";
};