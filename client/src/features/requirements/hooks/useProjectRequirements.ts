// F1: the PM's requirements panel on the project detail page — filtered by
// project, with a decide() action. Separate from useRequirements() (the
// Engineer's unfiltered "all my drafts" hook) since the two screens need
// different data shapes and this one needs decide/reload, not create.
import { useCallback, useEffect, useState } from "react";
import { RequirementRepository } from "../repositories/requirement.repository";
import type { Requirement } from "../types/requirements.types";

export function useProjectRequirements(projectCode: string) {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<number | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRequirements(await RequirementRepository.list({ project: projectCode }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load requirements.");
    } finally {
      setLoading(false);
    }
  }, [projectCode]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const decide = async (dbId: number, status: "Approved" | "Rejected", overrideReason?: string) => {
    setDecidingId(dbId);
    setError(null);
    try {
      const updated = await RequirementRepository.setStatus(dbId, status, overrideReason);
      setRequirements((prev) => prev.map((r) => (r.dbId === dbId ? updated : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update requirement.");
    } finally {
      setDecidingId(null);
    }
  };

  return { requirements, loading, error, decidingId, decide, reload } as const;
}
