/* ========== GA4 Data Types ========== */

export type GA4Overview = {
  activeUsers: number;
  newUsers: number;
  avgEngagementTime: number; // segundos
  totalEvents: number;
  dateRange: {
    start: string;
    end: string;
  };
};

export type GA4Page = {
  title: string;
  views: number;
  activeUsers: number;
  events: number;
  bounceRate: number;
};

/** Detailed page with URL path + engagement metrics (from Paginas y pantallas CSV) */
export type GA4PageDetailed = {
  path: string;
  views: number;
  activeUsers: number;
  viewsPerUser: number;
  avgEngagementTime: number; // seconds
  events: number;
  keyEvents: number;
  revenue: number;
};

export type GA4Source = {
  source: string;
  medium: string;
  users: number;
};

export type GA4SessionSource = {
  source: string;
  medium: string;
  sessions: number;
};

/** Event type data from Eventos CSV */
export type GA4Event = {
  name: string;
  count: number;
  users: number;
  countPerUser: number;
  revenue: number;
};

export type GA4City = {
  city: string;
  activeUsers: number;
  // Enriched fields from Detalles Demográficos CSV
  newUsers?: number;
  engagedSessions?: number;
  engagementRate?: number; // 0-1 decimal
  sessionsPerUser?: number;
  avgEngagementTime?: number; // seconds
  events?: number;
  keyEvents?: number;
  keyEventRate?: number; // 0-1 decimal
  revenue?: number;
};

/** Region-level data from Detalles Demográficos por Región CSV */
export type GA4Region = {
  region: string;
  activeUsers: number;
  newUsers?: number;
  engagedSessions?: number;
  engagementRate?: number; // 0-1 decimal
  sessionsPerUser?: number;
  avgEngagementTime?: number; // seconds
  events?: number;
  keyEvents?: number;
  keyEventRate?: number; // 0-1 decimal
  revenue?: number;
};

export type GA4DailyUsers = {
  day: number;
  newUsers: number;
  returningUsers: number;
};

export type GA4Data = {
  overview: GA4Overview;
  pages: GA4Page[];
  pagesDetailed: GA4PageDetailed[];
  sources: GA4Source[];
  sessionSources: GA4SessionSource[];
  events: GA4Event[];
  cities: GA4City[];
  regions: GA4Region[];
  dailyUsers: GA4DailyUsers[];
};
