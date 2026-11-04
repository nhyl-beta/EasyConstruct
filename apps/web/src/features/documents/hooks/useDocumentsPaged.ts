import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useServerList } from "@/hooks/use-server-list";
import { qk } from "@/lib/query-keys";
import { apiClient } from "@/services/api.client";
import {
  documentsRepository,
  type DocumentRecord,
  type UploadDocumentInput,
} from "../repositories/documents.repository";

export interface DocumentTypeCount {
  type: string;
  count: number;
}

/**
 * The document repository table: server-side search, type filter and
 * pagination. The folder cards come from `meta.typeCounts` (counts per type
 * for the user's scope, ignoring the search and type on screen).
 */
export function useDocumentsPaged(type: string | null) {
  const list = useServerList<DocumentRecord, { typeCounts: DocumentTypeCount[]; total: number }>({
    key: (params) => qk.documents.list(params),
    filters: { type: type ?? "" },
    fetchPage: async (params, signal) => {
      const qs = new URLSearchParams({ page: String(params.page), limit: String(params.limit), counts: "1" });
      if (params.search) qs.set("search", params.search);
      if (type) qs.set("type", type);
      const json = await apiClient.get(`/documents?${qs.toString()}`, { signal });
      return {
        items: (json?.data ?? []) as DocumentRecord[],
        total: json?.meta?.total ?? 0,
        pages: json?.meta?.pages,
        extra: { typeCounts: (json?.meta?.typeCounts ?? []) as DocumentTypeCount[], total: json?.meta?.total ?? 0 },
      };
    },
  });

  const [uploading, setUploading] = useState(false);
  const upload = useCallback(async (input: UploadDocumentInput) => {
    setUploading(true);
    try {
      await documentsRepository.upload(input);
      toast.success("Document uploaded");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to upload document";
      toast.error(message);
      throw new Error(message);
    } finally {
      setUploading(false);
    }
  }, []);

  // Admin only (the API refuses anyone else).
  const [changing, setChanging] = useState(false);
  const edit = useCallback(async (id: number, patch: { title?: string; type?: string; version?: string }) => {
    setChanging(true);
    try {
      await documentsRepository.update(id, patch);
      toast.success("Document updated");
      await list.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update document");
      throw e;
    } finally {
      setChanging(false);
    }
  }, [list]);
  const remove = useCallback(async (id: number) => {
    setChanging(true);
    try {
      await documentsRepository.remove(id);
      toast.success("Document deleted");
      await list.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete document");
      throw e;
    } finally {
      setChanging(false);
    }
  }, [list]);

  return { list, typeCounts: list.extra?.typeCounts ?? [], uploading, upload, edit, remove, changing };
}
