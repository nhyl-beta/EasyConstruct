import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/services/api.client";
import type { Design } from "../types/design.types";

export const useDesignDetailController = (id: string) => {
  const [design, setDesign] = useState<Design | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Kept apart from `error`: a refused delete must not replace the page with "Design not found".
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Was raw `fetch('/api/designs/${id}')` — unlike apiClient, that sends no
  // Authorization header and skips VITE_API_BASE, so every request 401'd
  // (or 404'd against the wrong origin) and the row click looked like it did
  // nothing.
  const fetchDesign = useCallback(() => {
    setLoading(true);
    setError(null);
    apiClient
      .get(`/designs/${id}`)
      .then((json) => setDesign(json?.data ?? null))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load design"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchDesign();
  }, [fetchDesign]);

  const remove = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiClient.del(`/designs/${id}`);
      return true;
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete design");
      return false;
    } finally {
      setDeleting(false);
    }
  };

  return { design, loading, error, deleting, deleteError, remove, refetch: fetchDesign };
};