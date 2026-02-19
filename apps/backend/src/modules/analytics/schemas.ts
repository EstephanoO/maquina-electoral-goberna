/**
 * GOBERNA — Analytics Module Schemas
 * Zod validation for GA4 analytics data.
 */

import { z } from "zod";

// ── GA4 Data Schema ─────────────────────────────────────────────────

export const ga4OverviewSchema = z.object({
  activeUsers: z.number().int().min(0),
  newUsers: z.number().int().min(0),
  avgEngagementTime: z.number().min(0),
  totalEvents: z.number().int().min(0),
  dateRange: z.object({
    start: z.string(),
    end: z.string(),
  }),
});

export const ga4PageSchema = z.object({
  title: z.string(),
  views: z.number().int().min(0),
  activeUsers: z.number().int().min(0),
  events: z.number().int().min(0),
  bounceRate: z.number().min(0).max(100),
});

export const ga4SourceSchema = z.object({
  source: z.string(),
  medium: z.string(),
  users: z.number().int().min(0),
});

export const ga4CitySchema = z.object({
  city: z.string(),
  activeUsers: z.number().int().min(0),
  // Enriched fields from Detalles Demográficos CSV (all optional for backward compat)
  newUsers: z.number().int().min(0).optional(),
  engagedSessions: z.number().int().min(0).optional(),
  engagementRate: z.number().min(0).max(1).optional(),
  sessionsPerUser: z.number().min(0).optional(),
  avgEngagementTime: z.number().min(0).optional(), // seconds
  events: z.number().int().min(0).optional(),
  keyEvents: z.number().int().min(0).optional(),
  keyEventRate: z.number().min(0).max(1).optional(),
  revenue: z.number().min(0).optional(),
});

export const ga4DailySchema = z.object({
  day: z.number().int().min(0),
  newUsers: z.number().int().min(0),
  returningUsers: z.number().int().min(0),
});

export const ga4DataSchema = z.object({
  overview: ga4OverviewSchema,
  pages: z.array(ga4PageSchema),
  sources: z.array(ga4SourceSchema),
  cities: z.array(ga4CitySchema),
  dailyUsers: z.array(ga4DailySchema),
});

export const saveAnalyticsSchema = z.object({
  data: ga4DataSchema,
});

export type GA4Data = z.infer<typeof ga4DataSchema>;
export type SaveAnalyticsInput = z.infer<typeof saveAnalyticsSchema>;
