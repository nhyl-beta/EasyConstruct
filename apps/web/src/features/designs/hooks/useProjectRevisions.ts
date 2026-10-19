// Design revisions of one project (+ summary), with an explicit demo-generation action.
// Same stale-response guard as useProjectDesigns.
import { useCallback, useEffect, useState } from "react";
import { DesignRevisionRepository } from "../repositories/design-revision.repository";
import type { ProjectRevision, ProjectRevisionSummary } from "../types/design-revision.types";

export function useProjectRevisions(projectCode: string) {
  const [revisions, setRevisions] = useState<ProjectRevision[]>([]);
  const [summary, setSummary] = useState<ProjectRevisionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!projectCode) {
      setRevisions([]);
      setSummary(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    DesignRevisionRepository.listByProject(projectCode)
      .then((res) => {
        if (!active) return;
        setRevisions(res.revisions);
        setSummary(res.summary);
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
  }, [projectCode, tick]);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  const generateDemo = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await DesignRevisionRepository.generateDemo(projectCode);
      setTick((n) => n + 1);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate demo revisions.");
      return null;
    } finally {
      setGenerating(false);
    }
  }, [projectCode]);

  return { revisions, summary, loading, error, refetch, generateDemo, generating };
}
