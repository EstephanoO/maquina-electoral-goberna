import type { OnboardingOption, FormField } from '@/types/onboarding/interfaces/options';
import type { DragDropConfig, FrontStrategyConfig } from '@/types/onboarding/interfaces/ui';

export type OnboardingStep = {
  id: string;
  title: string;
  subtitle?: string;
  type:
    | "info"
    | "single-select"
    | "multi-select"
    | "form"
    | "recommendation"
    | "drag-drop"
    // ── Steps prácticos del provisioning (Fase 2) ───────────────────
    | "wa-qr"
    | "api-cargo"
    | "api-organizacion"
    | "slug-input"
    | "review"
    | "foto-upload"
    | "provisioning"
    | "done-final";
  required?: boolean;
  options?: OnboardingOption[];
  fields?: FormField[];
  guideText?: string;
  ctaText?: string;
  dragDropConfig?: DragDropConfig;
  frontStrategyConfig?: FrontStrategyConfig;
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