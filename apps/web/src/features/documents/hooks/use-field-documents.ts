import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  documentsRepository,
  type DocumentRecord,
  type UploadDocumentInput,
} from "../repositories/documents.repository";

export function useFieldDocuments() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await documentsRepository.listByProject();
      setDocuments(response.data);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to load documents",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upload = useCallback(
    async (input: UploadDocumentInput) => {
      setUploading(true);
      setError(null);

      try {
        await documentsRepository.upload(input);
        await refresh();
        toast.success("Document uploaded");
      } catch (e) {
        const message =
          e instanceof Error
            ? e.message
            : "Failed to upload document";

        setError(message);
        toast.error(message);
        throw new Error(message);
      } finally {
        setUploading(false);
      }
    },
    [refresh],
  );

  return {
    documents,
    loading,
    error,
    uploading,
    upload,
    refresh,
  };
}