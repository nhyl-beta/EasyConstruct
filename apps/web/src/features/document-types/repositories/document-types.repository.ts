// Editable document types (client demo change #1). Admin and IT Designer manage them; every upload
// dialog reads the active ones.
import { apiClient } from "@/services/api.client";

export interface DocumentTypeItem {
  id: number;
  name: string;
  category: string;
  isSystem: boolean;
  active: boolean;
}

export interface DocumentTypeInput {
  name?: string;
  category?: string;
  active?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function unwrap<T>(promise: Promise<any>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) return json.data as T;
  return json as T;
}

export const documentTypesRepository = {
  /** The active types, or (writers only) all of them. The list is short, so it is not paged here. */
  list: (opts: { all?: boolean } = {}) =>
    unwrap<DocumentTypeItem[]>(apiClient.get(`/reference/document-types${opts.all ? "?all=1" : ""}`, { staleTime: 30_000 })),
  create: (input: { name: string; category?: string }) => unwrap<DocumentTypeItem>(apiClient.post("/reference/document-types", input)),
  update: (id: number, input: DocumentTypeInput) => unwrap<DocumentTypeItem>(apiClient.patch(`/reference/document-types/${id}`, input)),
};
