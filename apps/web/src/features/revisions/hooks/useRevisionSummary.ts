import { useEffect, useState } from "react";
import { RevisionRepository } from "../repositories/revision.repository";
import type { RevisionSummary } from "../types/revision.types";

/** Counts of current revisions by status, scoped by the server to the caller's projects. */
export function useRevisionSummary() {
  const [summary, setSummary] = useState<RevisionSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    RevisionRepository.summary()
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return summary;
}
