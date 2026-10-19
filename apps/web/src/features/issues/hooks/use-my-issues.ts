// apps/web/src/features/issues/hooks/use-my-issues.ts — NEW
import { useCallback, useEffect, useState } from "react";
import { issuesRepository, type CreateIssueInput, type IssueRecord } from "../repositories/issues.repository";

export function useMyIssues() {
  const [issues, setIssues] = useState<IssueRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await issuesRepository.listMine();
      setIssues(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load issues");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const report = useCallback(
    async (input: CreateIssueInput) => {
      setSubmitting(true);
      setError(null);
      try {
        await issuesRepository.create(input);
        await refresh();
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to submit issue";
        setError(message);
        throw new Error(message);
      } finally {
        setSubmitting(false);
      }
    },
    [refresh],
  );

  const counts = {
    open: issues.filter((i) => i.status === "Submitted").length,
    underReview: issues.filter((i) => i.status === "Under Review").length,
    resolved: issues.filter((i) => i.status === "Resolved").length,
  };

  return { issues, counts, loading, error, submitting, report, refresh };
}