import { CampaignType, CampaignStrategy } from '@/types/onboarding/core/constants';

export type StrategyAssignment = {
  strategy: CampaignStrategy | string;
  campaignType: CampaignType;
  description: string;
  priority: "high" | "medium" | "low";
};