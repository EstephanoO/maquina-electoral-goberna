/**
 * GOBERNA — Campaigns Service
 * API operations for campaigns/candidates.
 */

import type { Campaign, CampaignStats, CandidatePublic, UploadResult } from "../types";
import { api, apiRequest } from "./api";

// ── Types ──────────────────────────────────────────────────────────

export type CreateCampaignInput = {
  name: string;
  slug: string;
  cargo?: string;
  numero?: number;
  partido?: string;
  foto_url?: string;
  jurisdiccion_nivel?: string;
  jurisdiccion_code?: string;
  config?: {
    color_primario?: string;
    color_secundario?: string;
    modules?: string[];
  };
};

export type UpdateCampaignInput = Partial<Omit<CreateCampaignInput, "slug">> & {
  status?: "active" | "paused" | "archived";
};

// ── API Responses ──────────────────────────────────────────────────

type CampaignsListResponse = { campaigns: Campaign[] };
type CandidatesListResponse = { candidates: CandidatePublic[] };
type CampaignResponse = { campaign: Campaign };
type UploadResponse = { upload: UploadResult };

// ── Service Functions ──────────────────────────────────────────────

/**
 * List all campaigns (admin) or user's campaigns.
 */
export async function listCampaigns() {
  return api.get<CampaignsListResponse>("/api/campaigns");
}

/**
 * List public candidates (no auth required).
 */
export async function listCandidates() {
  return api.get<CandidatesListResponse>("/api/candidates");
}

/**
 * Get a single campaign by ID.
 */
export async function getCampaign(id: string) {
  return api.get<CampaignResponse>(`/api/campaigns/${id}`);
}

/**
 * Create a new campaign.
 */
export async function createCampaign(input: CreateCampaignInput) {
  return api.post<CampaignResponse>("/api/campaigns", input);
}

/**
 * Update a campaign.
 */
export async function updateCampaign(id: string, input: UpdateCampaignInput) {
  return api.put<CampaignResponse>(`/api/campaigns/${id}`, input);
}

/**
 * Upload a candidate photo.
 */
export async function uploadCandidatePhoto(file: File, slug: string) {
  return apiRequest<UploadResponse>("/api/uploads", {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "x-upload-slug": slug,
      "x-upload-folder": "candidates",
    },
    body: file,
  });
}

/**
 * Create campaign with photo upload in one operation.
 */
export async function createCampaignWithPhoto(
  input: Omit<CreateCampaignInput, "foto_url">,
  photoFile: File | null,
): Promise<{ ok: boolean; campaign?: Campaign; error?: string }> {
  let fotoUrl: string | undefined;

  // Upload photo first if provided
  if (photoFile) {
    const uploadRes = await uploadCandidatePhoto(photoFile, input.slug);
    if (!uploadRes.ok || !uploadRes.data?.upload?.path) {
      return { ok: false, error: "Error subiendo la foto" };
    }
    fotoUrl = uploadRes.data.upload.path;
  }

  // Create campaign
  const res = await createCampaign({ ...input, foto_url: fotoUrl });
  if (!res.ok) {
    return { ok: false, error: res.error?.message ?? "Error creando candidato" };
  }

  return { ok: true, campaign: res.data?.campaign };
}

/**
 * Get campaign stats for dashboard by slug.
 */
export async function getCampaignStats(slug: string, period: "day" | "week" = "day") {
  return api.get<CampaignStats>(`/api/campaigns/${slug}/stats?period=${period}`);
}
