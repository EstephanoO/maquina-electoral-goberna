import { api } from "./api";

export type CreateRegionalLeaderInput = {
  nombres: string;
  apellidos: string;
  departamento: string;
  provincia: string;
  distrito: string;
  dni: string;
  celular: string;
  direccion_domicilio: string;
};

export type RegionalLeader = CreateRegionalLeaderInput & {
  id: string;
  created_at: string;
};

type CreateRegionalLeaderResponse = {
  ok: boolean;
  regional_leader: RegionalLeader;
};

export async function createRegionalLeader(input: CreateRegionalLeaderInput) {
  return api.post<CreateRegionalLeaderResponse>("/api/regional-leaders", input);
}
