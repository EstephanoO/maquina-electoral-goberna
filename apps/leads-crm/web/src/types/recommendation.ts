export type Recommendation = {
  id: number;
  name: string;
  phone: string;
  country: string | null;
  stage: string;
  tags: string[];
  buyer_tier: string | null;
  total_usd_spent: number;
  n_purchases: number;
  last_course: string | null;
  escuela_client_id: number | null;
  days_since_in: number;
  msgs_in_count: number;
  score: number;
  reasons: string[];
  last_inbound: string | null;
  last_outbound: string | null;
};

export type Facets = {
  countries: Array<{ country: string; n: number }>;
  tags: Array<{ tag: string; n: number }>;
  courses: Array<{ course: string; n: number }>;
  tiers: Array<{ tier: string; n: number }>;
  stages: Array<{ stage: string; n: number }>;
};
