import { apiClient } from "@/services/api.client";
import type { Role } from "../types/role.types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function unwrap<T>(promise: Promise<any>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) return json.data as T;
  return json as T;
}

export const RoleRepository = {
  async list(): Promise<Role[]> {
    return unwrap<Role[]>(apiClient.get("/roles"));
  },
};

export interface RoleAccountSummary {
  role: string;
  activeUsers: number;
  users: { id: number; name: string; email: string; isActive: boolean }[];
}

export const RoleAccountRepository = {
  async summary(): Promise<RoleAccountSummary[]> {
    return unwrap<RoleAccountSummary[]>(apiClient.get("/roles/summary"));
  },
};
