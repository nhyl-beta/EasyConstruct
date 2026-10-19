// Shared clients and vendors (objectives fix 1.2).
import { apiClient } from "@/services/api.client";

export type ReferenceKind = "clients" | "vendors";

export interface ReferenceItem {
  id: number;
  name: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function unwrap<T>(promise: Promise<any>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) return json.data as T;
  return json as T;
}

export const referenceRepository = {
  list: (kind: ReferenceKind) => unwrap<ReferenceItem[]>(apiClient.get(`/reference/${kind}`, { staleTime: 30_000 })),
  create: (kind: ReferenceKind, name: string, confirmSimilar = false) =>
    unwrap<ReferenceItem>(apiClient.post(`/reference/${kind}`, { name, confirmSimilar })),
};
