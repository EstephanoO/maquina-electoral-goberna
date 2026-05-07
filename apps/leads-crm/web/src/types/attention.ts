export type AttentionItem = {
  id: number;
  name: string;
  phone: string;
  country: string | null;
  stage: string;
  tags: string[];
  attention_reason: string;
  attention_at: string;
  waiting_seconds: number;
  last_inbound_msg: string | null;
};

export function formatWaiting(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
