import { useEffect, useState } from "react";
import { RevisionRepository } from "../repositories/revision.repository";
import type { RevisionComparison } from "../types/revision.types";

export function useRevisionCompare(leftId: number | null, rightId: number | null) {
  const [data, setData] = useState<RevisionComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (leftId == null || rightId == null) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    RevisionRepository.compare(leftId, rightId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not compare these versions");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leftId, rightId]);

  return { data, loading, error } as const;
}
