/**
 * GOBERNA — Access Requests Service
 * API operations for user access requests.
 */

import type { AccessRequest } from "../types";
import { api } from "./api";

// ── Types ──────────────────────────────────────────────────────────

export type ResolveAccessRequestInput = {
  status: "approved" | "rejected";
  note?: string;
  perm_tierra?: boolean;
  perm_digital?: boolean;
};

// ── API Responses ──────────────────────────────────────────────────

type AccessRequestsListResponse = { access_requests: AccessRequest[] };
type AccessRequestResponse = { access_request: AccessRequest };

// ── Service Functions ──────────────────────────────────────────────

/**
 * List access requests with optional status filter.
 */
export async function listAccessRequests(status?: "pending" | "approved" | "rejected") {
  const query = status ? `?status=${status}` : "";
  return api.get<AccessRequestsListResponse>(`/api/access-requests${query}`);
}

/**
 * Get pending access requests count.
 */
export async function getPendingCount(): Promise<number> {
  const res = await listAccessRequests("pending");
  return res.ok && res.data ? res.data.access_requests.length : 0;
}

/**
 * Resolve (approve/reject) an access request.
 */
export async function resolveAccessRequest(id: string, input: ResolveAccessRequestInput) {
  return api.put<AccessRequestResponse>(`/api/access-requests/${id}`, input);
}
