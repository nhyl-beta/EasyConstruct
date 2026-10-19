// apps/web/src/features/designs/hooks/useProjectDesigns.ts — NEW
//
// Designs linked to one project (designs.projectCode) — the repository
// already supports `GET /designs?projectCode=...` (see repository.ts), it
// was just never called from the project detail page, so a linked design
// was invisible from the project side even though the design side always
// showed which project it belonged to.
import { useEffect, useState } from "react";
import { apiClient } from "@/services/api.client";
import type { Design } from "../types/design.types";

export function useProjectDesigns(projectCode: string) {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectCode) {
      setDesigns([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    apiClient
      .get(`/designs?projectCode=${encodeURIComponent(projectCode)}`)
      .then((json) => {
        if (active) setDesigns(json?.data ?? []);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load designs.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectCode]);

  return { designs, loading, error };
}
