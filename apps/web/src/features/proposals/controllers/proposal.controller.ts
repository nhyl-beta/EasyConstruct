import {
  useMemo,
  useState,
} from "react";

import { useServerList } from "@/hooks/use-server-list";
import { qk } from "@/lib/query-keys";
import { apiClient } from "@/services/api.client";

import type {
  Proposal,
  ProposalReviewer,
} from "../types/proposal.types";
import type { Workflow } from "@/features/workflows/types/workflow.types";

export interface CreateProposalInput {
  proposalId: string;

  title: string;

  projectCode: string;

  submittedBy: string;

  amount?: string;

  content?: string;

  assignedReviewer?: ProposalReviewer;
}

export interface ReviewProposalInput {
  status:
    | "Approved"
    | "Revision Requested"
    | "Rejected";

  reviewerName?: string;

  reviewComment?: string;
}

export interface UpdateProposalInput {
  title?: string;

  projectCode?: string;

  amount?: string;

  content?: string;

  status?: string;
}

// Unwraps the backend's { success, message, data } envelope.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap<T>(json: any): T {
  if (json && typeof json === "object" && "data" in json) return json.data as T;
  return json as T;
}

export interface ProposalsListOptions {
  /** "consultant": only the Pending proposals awaiting the consultant (or nobody yet). */
  queue?: "consultant";
  /** Leave Archived proposals out of the list (the KPI counts still include them). */
  hideArchived?: boolean;
  pageSize?: number;
}

interface ProposalsExtra {
  statusCounts: { status: string; count: number }[];
}

export const useProposalsController = (options: ProposalsListOptions = {}) => {
  const { queue, hideArchived = false, pageSize = 10 } = options;
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("all");
  const [mutationError, setMutationError] = useState<string | null>(null);

  const list = useServerList<Proposal, ProposalsExtra>({
    key: (params) => qk.proposals.list({ ...params, queue }),
    filters: { status, queue: queue ?? "", hideArchived },
    initialPageSize: pageSize,
    fetchPage: async (params, signal) => {
      const qs = new URLSearchParams({ page: String(params.page), limit: String(params.limit), counts: "1" });
      if (params.search) qs.set("search", params.search);
      if (status !== "all") qs.set("status", status);
      if (queue) qs.set("queue", queue);
      if (hideArchived) qs.set("excludeStatus", "Archived");
      const json = await apiClient.get(`/proposals?${qs.toString()}`, { signal });
      return {
        items: (json?.data ?? []) as Proposal[],
        total: json?.meta?.total ?? 0,
        pages: json?.meta?.pages,
        extra: { statusCounts: json?.meta?.statusCounts ?? [] },
      };
    },
  });

  const proposals = list.pageItems;
  const query = list.searchInput;
  const setQuery = list.setSearchInput;
  const loading = list.loading;
  const error = mutationError ?? (list.error ? list.error.message : null);
  const setError = setMutationError;
  const loadProposals = list.reload;

  /*
   * CREATE
   */
  const createProposal =
    async (
      input: CreateProposalInput,
    ): Promise<Proposal | null> => {
      setSaving(true);

      setError(null);

      try {
        const json = await apiClient.post("/proposals", {
          ...input,
          status: "Pending",
        });

        const created = unwrap<Proposal>(json);

        await loadProposals();

        return created;
      } catch (err) {
        console.error(err);

        setError(
          err instanceof Error
            ? err.message
            : "Failed to create proposal.",
        );

        return null;
      } finally {
        setSaving(false);
      }
    };

  /*
   * SUBMIT — creates the proposal and opens its Design Proposal Approval
   * workflow in one server call (apps/api/src/proposals/service.ts submit()),
   * linking proposal.workflowId instead of the old two-round-trip client
   * composition (create, then separately initiate a workflow) that never
   * recorded the link at all.
   */
  const submitProposal = async (
    input: CreateProposalInput,
  ): Promise<{ proposal: Proposal; workflow: Workflow } | null> => {
    setSaving(true);
    setError(null);

    try {
      const json = await apiClient.post("/proposals/submit", {
        ...input,
        status: "Pending",
      });

      const created = unwrap<{ proposal: Proposal; workflow: Workflow }>(json);
      await loadProposals();
      return created;
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to submit proposal.");
      return null;
    } finally {
      setSaving(false);
    }
  };

  /*
   * UPDATE
   */
  const updateProposal =
    async (
      id: number,
      input: UpdateProposalInput,
    ): Promise<Proposal | null> => {
      setSaving(true);

      setError(null);

      try {
        const json = await apiClient.patch(`/proposals/${id}`, input);

        const updated = unwrap<Proposal>(json);

        await loadProposals();

        return updated;
      } catch (err) {
        console.error(err);

        setError(
          err instanceof Error
            ? err.message
            : "Failed to update proposal.",
        );

        return null;
      } finally {
        setSaving(false);
      }
    };

  /*
   * ARCHIVE
   */
  const archiveProposal =
    async (id: number): Promise<Proposal | null> => updateProposal(id, { status: "Archived" });

  /*
   * REVIEW
   */
  const reviewProposal =
    async (
      proposalId: number,
      input: ReviewProposalInput,
    ): Promise<Proposal | null> => {
      setSaving(true);

      setError(null);

      try {
        const json = await apiClient.patch(`/proposals/${proposalId}/review`, input);

        const updated = unwrap<Proposal>(json);

        await loadProposals();

        return updated;
      } catch (err) {
        console.error(err);

        setError(
          err instanceof Error
            ? err.message
            : "Failed to review proposal.",
        );

        return null;
      } finally {
        setSaving(false);
      }
    };

  const kpis = useMemo(() => {
    const counts = list.extra?.statusCounts ?? [];
    const n = (...names: string[]) =>
      counts.filter((c) => names.includes(c.status)).reduce((sum, c) => sum + c.count, 0);
    return {
      total: counts.reduce((sum, c) => sum + c.count, 0),
      pending: n("Pending", "In Review"),
      approved: n("Approved"),
      revisionRequested: n("Revision Requested"),
    };
  }, [list.extra]);

  /**
   * J: asks the server to compute (and store) the rule-based validation
   * summary for a proposal that has none. Idempotent; never changes status.
   */
  const validateProposal = async (id: number): Promise<Proposal> =>
    unwrap<Proposal>(await apiClient.post(`/proposals/${id}/validate`, {}));

  return {
    proposals,

    validateProposal,

    loading,

    saving,

    error,

    query,
    setQuery,

    status,
    setStatus,

    kpis,

    refresh: loadProposals,

    pagination: list,

    createProposal,

    submitProposal,

    updateProposal,

    archiveProposal,

    reviewProposal,
  };
};
