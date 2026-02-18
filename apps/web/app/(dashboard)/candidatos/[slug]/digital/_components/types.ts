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

export type GA4City = {
  city: string;
  activeUsers: number;
};

export type GA4DailyUsers = {
  day: number;
  newUsers: number;
  returningUsers: number;
};

export type GA4Data = {
  overview: GA4Overview;
  pages: GA4Page[];
  sources: GA4Source[];
  sessionSources: GA4SessionSource[];
  cities: GA4City[];
  dailyUsers: GA4DailyUsers[];
};
