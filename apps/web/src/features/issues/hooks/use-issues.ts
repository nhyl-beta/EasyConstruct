// apps/web/src/features/issues/hooks/use-issues.ts — NEW
import { useCallback, useMemo, useState } from "react";
import { useServerList } from "@/hooks/use-server-list";
import { qk } from "@/lib/query-keys";
import { apiClient } from "@/services/api.client";
import {
  issuesRepository,
  type IssueRecord,
  type UpdateIssueStatusInput,
} from "../repositories/issues.repository";

// General (not scoped to "my own") issues list — used by reviewers
// (Engineer/PM) who need to see and act on every reported issue, backed by
// the same `/issues` table Site Personnel's report form writes to.
interface IssuesExtra {
  statusCounts: { key: string; count: number }[];
  severityCounts: { key: string; count: number }[];
}

export function useIssues(options: { pageSize?: number } = {}) {
  const list = useServerList<IssueRecord, IssuesExtra>({
    key: (params) => qk.issues.list(params),
    initialPageSize: options.pageSize ?? 10,
    fetchPage: async (params, signal) => {
      const qs = new URLSearchParams({ page: String(params.page), limit: String(params.limit), counts: "1" });
      const json = await apiClient.get(`/issues?${qs.toString()}`, { signal });
      return {
        items: (json?.data ?? []) as IssueRecord[],
        total: json?.meta?.total ?? 0,
        pages: json?.meta?.pages,
        extra: {
          statusCounts: json?.meta?.statusCounts ?? [],
          severityCounts: json?.meta?.severityCounts ?? [],
        },
      };
    },
  });
  const issues = list.pageItems;
  const loading = list.loading;
  // `error` is about LOADING the list only. A failed status update used to
  // share it, and the page renders `error` in place of the list — so one
  // rejected update (e.g. empty resolution notes) replaced every issue with an
  // error message. Update failures are kept per issue instead.
  const error = list.error ? list.error.message : null;
  const [updating, setUpdating] = useState<number | null>(null);
  const [updateErrors, setUpdateErrors] = useState<Record<number, string>>({});
  const { reload } = list;
  const refresh = useCallback(async () => {
    await reload();
  }, [reload]);

  // Headline counts over every issue the caller can see (all pages).
  const counts = useMemo(() => {
    const n = (rows: { key: string; count: number }[] | undefined, key: string) =>
      rows?.find((r) => r.key === key)?.count ?? 0;
    return {
      submitted: n(list.extra?.statusCounts, "Submitted"),
      underReview: n(list.extra?.statusCounts, "Under Review"),
      resolved: n(list.extra?.statusCounts, "Resolved"),
      critical: n(list.extra?.severityCounts, "Critical"),
    };
  }, [list.extra]);

  const updateStatus = useCallback(
    async (id: number, input: UpdateIssueStatusInput) => {
      setUpdating(id);
      setUpdateErrors((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      try {
        const res = await issuesRepository.updateStatus(id, input);
        return res.data;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to update issue";
        setUpdateErrors((prev) => ({ ...prev, [id]: message }));
        return null;
      } finally {
        setUpdating(null);
      }
    },
    [],
  );

  const clearUpdateError = useCallback((id: number) => {
    setUpdateErrors((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  return { issues, loading, error, updating, updateErrors, clearUpdateError, updateStatus, refresh, counts, pagination: list };
}
