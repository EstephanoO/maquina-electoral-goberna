/**
 * GOBERNA — Access Codes Service
 * Campaign access codes: codigos de 4 caracteres para registro rapido en mobile.
 * Un codigo por campana, sin limite de usos, sin vencimiento corto.
 */

import { apiRequest } from "./api";

type AccessCodeResponse = {
  access_code: string;
  campaign_id: string;
};

/**
 * GET /api/access-codes/campaign/:campaignId
 * Obtiene el codigo de acceso de la campana. Si no existe, lo crea.
 * Requiere auth (candidato+).
 */
export async function getCampaignAccessCode(campaignId: string) {
  return apiRequest<AccessCodeResponse>(
    `/api/access-codes/campaign/${campaignId}`,
    { method: "GET", campaignId },
  );
}

/**
 * POST /api/access-codes/campaign/:campaignId/regenerate
 * Genera un nuevo codigo de acceso, invalidando el anterior.
 * Requiere auth (candidato+).
 */
export async function regenerateCampaignAccessCode(campaignId: string) {
  return apiRequest<AccessCodeResponse>(
    `/api/access-codes/campaign/${campaignId}/regenerate`,
    { method: "POST", campaignId },
  );
}
