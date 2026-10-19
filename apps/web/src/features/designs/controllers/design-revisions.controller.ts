import { useEffect, useState } from "react";
import { DesignRevisionRepository } from "../repositories/design-revision.repository";
import type { ProjectRevision } from "../types/design-revision.types";

// Was a raw fetch("/api/design-revisions"): no Authorization header and no
// VITE_API_BASE, so it 401'd. Now goes through apiClient via the repository.
export const useDesignRevisionsController = () => {
  const [revisions, setRevisions] = useState<ProjectRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    DesignRevisionRepository.list()
      .then((rows) => {
        if (active) setRevisions(rows);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load revisions.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { revisions, loading, error };
};
