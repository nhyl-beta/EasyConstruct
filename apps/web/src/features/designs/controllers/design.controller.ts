import { useMemo, useState } from "react";
import { useServerList } from "@/hooks/use-server-list";
import { qk } from "@/lib/query-keys";
import { apiClient } from "@/services/api.client";
import type { Design } from "../types/design.types";

interface DesignsExtra {
  statusCounts: { status: string; count: number }[];
}

export const useDesignsController = () => {
  const [status, setStatus] = useState("all");

  const list = useServerList<Design, DesignsExtra>({
    key: (params) => qk.designs.list(params),
    filters: { status },
    fetchPage: async (params, signal) => {
      const qs = new URLSearchParams({ page: String(params.page), limit: String(params.limit), counts: "1" });
      if (params.search) qs.set("search", params.search);
      if (status !== "all") qs.set("status", status);
      const json = await apiClient.get(`/designs?${qs.toString()}`, { signal });
      return {
        items: (json?.data ?? []) as Design[],
        total: json?.meta?.total ?? 0,
        pages: json?.meta?.pages,
        extra: { statusCounts: json?.meta?.statusCounts ?? [] },
      };
    },
  });

  // The cards count what the filters select, across every page.
  const kpis = useMemo(() => {
    const counts = list.extra?.statusCounts ?? [];
    const n = (name: string) => counts.find((c) => c.status === name)?.count ?? 0;
    return {
      total: counts.reduce((sum, c) => sum + c.count, 0),
      inReview: n("In Review"),
      approved: n("Approved"),
      revisionNeeded: n("Revision Needed"),
    };
  }, [list.extra]);

  return {
    designs: list.pageItems,
    loading: list.loading,
    query: list.searchInput,
    setQuery: list.setSearchInput,
    status,
    setStatus,
    kpis,
    pagination: list,
  };
};
