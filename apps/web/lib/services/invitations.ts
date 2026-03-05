/**
 * GOBERNA — Invitations Service
 * Create and list invitation codes for a campaign.
 * The generated link is:  https://dashboard.grupogoberna.com/invite/{code}
 */

import { apiRequest } from "./api";

export type Invitation = {
  id: string;
  campaign_id: string;
  code: string;
  role: string;
  max_uses: number;       // backend default: 1
  used_count: number;     // backend field name (not "uses")
  expires_at: string;     // always present — backend always sets it (default 72h)
  created_at: string;
  created_by: string;
};

type CreateInvitationPayload = {
  campaign_id: string;
  role?: string;
  max_uses?: number;         // number 1-1000, default 1 — omit to use backend default
  expires_in_hours?: number; // hours until expiry, default 72 — omit to use backend default
};

const INVITE_BASE_URL = "https://dashboard.grupogoberna.com/invite";

export function buildInviteLink(code: string): string {
  return `${INVITE_BASE_URL}/${code}`;
}

export async function listInvitations(campaignId: string) {
  return apiRequest<{ invitations: Invitation[] }>(
    `/api/invitations/campaign/${campaignId}`,
    { method: "GET", campaignId },
  );
}

export async function createInvitation(payload: CreateInvitationPayload) {
  // Only send fields the backend schema accepts. Omitting optional fields lets
  // the backend apply its Zod defaults (max_uses=1, expires_in_hours=72).
  const body: Record<string, unknown> = {
    campaign_id: payload.campaign_id,
    role: payload.role ?? "agente_campo",
  };
  if (payload.max_uses != null) body.max_uses = payload.max_uses;
  if (payload.expires_in_hours != null) body.expires_in_hours = payload.expires_in_hours;

  return apiRequest<{ invitation: Invitation }>(
    "/api/invitations",
    {
      method: "POST",
      body: JSON.stringify(body),
      campaignId: payload.campaign_id,
    },
  );
}

export async function revokeInvitation(id: string) {
  return apiRequest<void>(`/api/invitations/${id}`, { method: "DELETE" });
}
