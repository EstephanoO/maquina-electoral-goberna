export type SegmentPreset = {
  id: number;
  slug: string;
  name: string;
  description: string;
  filter: Record<string, unknown>;
  icon: string;
};

export type Campaign = {
  id: number;
  name: string;
  description: string | null;
  segment_filter: Record<string, unknown>;
  template_id: number | null;
  custom_body: string | null;
  custom_image_url: string | null;
  custom_document_url: string | null;
  bot_instance_id: number | null;
  throttle_per_min: number;
  window_start_hr: number;
  window_end_hr: number;
  status: "draft" | "scheduled" | "running" | "paused" | "completed" | "cancelled";
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  replied_count: number;
  converted_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type CampaignProgress = Campaign & {
  pct_sent: string | number;
  reply_rate_pct: string | number;
  conversion_rate_pct: string | number;
};

export type SegmentPreview = {
  total: number;
  sample: Array<{
    id: number; name: string; phone: string;
    country: string | null; buyer_tier: string | null;
    total_usd_spent: number | string;
    last_course: string | null;
  }>;
};
