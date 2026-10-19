import { useCallback, useMemo, useState } from "react";
import { useServerList } from "@/hooks/use-server-list";
import { qk } from "@/lib/query-keys";
import { apiClient } from "@/services/api.client";
import {
  ISSUE_REPORT_TYPES,
  PROGRESS_REPORT_TYPES,
  type CreateEngineeringReportInput,
  type EngineeringReport,
} from "../types/engineering-reports.types";
import { EngineeringReportService } from "../services/engineering-report.service";
import {
  EngineeringReportRepository,
  normalizeReport,
  type BackendEngineeringReport,
} from "../repositories/engineering-report.repository";

type Scope = "progress" | "issues" | "all";

export interface ReportsListOptions {
  /** Comma-separated statuses the list is limited to ("Submitted,Under Review"). */
  status?: string;
  pageSize?: number;
}

interface ReportsExtra {
  typeStatusCounts: { type: string; status: string; count: number }[];
}

const SCOPE_TYPES: Record<Scope, string | undefined> = {
  progress: PROGRESS_REPORT_TYPES.join(","),
  issues: ISSUE_REPORT_TYPES.join(","),
  all: undefined,
};

export function useEngineeringReportsController(scope: Scope = "all", options: ReportsListOptions = {}) {
  const { status, pageSize = 10 } = options;
  const types = SCOPE_TYPES[scope];

  const list = useServerList<EngineeringReport, ReportsExtra>({
    key: (params) => qk.reports.list(params),
    filters: { scope, status: status ?? "" },
    initialPageSize: pageSize,
    fetchPage: async (params, signal) => {
      const qs = new URLSearchParams({ page: String(params.page), limit: String(params.limit), counts: "1" });
      if (params.search) qs.set("search", params.search);
      if (types) qs.set("type", types);
      if (status) qs.set("status", status);
      const json = await apiClient.get(`/engineering-reports?${qs.toString()}`, { signal });
      return {
        items: ((json?.data ?? []) as BackendEngineeringReport[]).map(normalizeReport),
        total: json?.meta?.total ?? 0,
        pages: json?.meta?.pages,
        extra: { typeStatusCounts: json?.meta?.typeStatusCounts ?? [] },
      };
    },
  });

  const [actionError, setActionError] = useState<Error | null>(null);
  const [deciding, setDeciding] = useState<number | null>(null);

  // Headline counts over the whole scope (every page), for the KPI cards.
  const counts = useMemo(() => {
    const rows = list.extra?.typeStatusCounts ?? [];
    const sum = (pred: (r: { type: string; status: string }) => boolean) =>
      rows.filter(pred).reduce((n, r) => n + r.count, 0);
    return {
      total: sum(() => true),
      byStatus: (s: string) => sum((r) => r.status === s),
      byType: (t: string) => sum((r) => r.type === t),
      byTypeAndNotStatus: (t: string, s: string) => sum((r) => r.type === t && r.status !== s),
    };
  }, [list.extra]);

  const createReport = useCallback(async (payload: CreateEngineeringReportInput) => {
    await EngineeringReportService.createReport(payload);
  }, []);

  // Q5: PM/Admin approving (or rejecting/requesting revision on) a
  // submitted report — apps/api/src/engineering-reports/service.ts's
  // assertCanSetStatus enforces who may actually do this; a 403 here
  // surfaces through `error` the same as any other failed load.
  const decide = useCallback(async (dbId: number, next: EngineeringReport["status"]) => {
    setDeciding(dbId);
    setActionError(null);
    try {
      await EngineeringReportRepository.updateStatus(dbId, next);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setActionError(err);
    } finally {
      setDeciding(null);
    }
  }, []);

  return {
    reports: list.pageItems,
    loading: list.loading,
    error: actionError ?? list.error,
    search: list.searchInput,
    setSearch: list.setSearchInput,
    counts,
    pagination: list,
    createReport,
    decide,
    deciding,
    reload: list.reload,
  } as const;
}
