import { useCallback, useEffect, useMemo, useState } from "react";
import { useStaffedProjectCodes } from "@/features/project-members/hooks/use-staffed-project-codes";
import { MilestoneRepository, type Milestone } from "../repositories/milestone.repository";

/**
 * Milestones on the projects the engineer is staffed on, plus the one write
 * an engineer may make: marking an active/at-risk milestone completed.
 */
export function useEngineerMilestones() {
  const { codes, loading: codesLoading } = useStaffedProjectCodes("engineer");
  const [all, setAll] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAll(await MilestoneRepository.listAll());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load milestones.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const mine = useMemo(() => all.filter((m) => codes.includes(m.projectCode)), [all, codes]);
  const open = useMemo(
    () =>
      mine
        .filter((m) => m.status === "active" || m.status === "at-risk")
        .sort((a, b) => (a.estimatedCompletionDate ?? "9999").localeCompare(b.estimatedCompletionDate ?? "9999")),
    [mine],
  );
  const completed = useMemo(() => mine.filter((m) => m.status === "completed"), [mine]);

  const complete = useCallback(async (id: number) => {
    setCompletingId(id);
    setCompleteError(null);
    try {
      const updated = await MilestoneRepository.update(id, { status: "completed" });
      setAll((prev) => prev.map((m) => (m.id === id ? { ...m, ...updated } : m)));
      return { ok: true as const };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to complete milestone.";
      setCompleteError(message);
      // The server's reason (for example "Finish the linked tasks first: ...") is returned so the
      // caller can toast it, not only keep it in state.
      return { ok: false as const, message };
    } finally {
      setCompletingId(null);
    }
  }, []);

  return {
    open,
    completed,
    loading: loading || codesLoading,
    error,
    completingId,
    completeError,
    clearCompleteError: () => setCompleteError(null),
    complete,
    reload,
  } as const;
}
