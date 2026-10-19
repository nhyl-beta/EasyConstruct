import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { useServerList } from "@/hooks/use-server-list";

import { WorkflowRepository } from "../repositories/workflow.repository";

import { apiClient } from "@/services/api.client";
import type {
  ApprovalQueueItem,
  ApprovalScope,
  ApprovalStats,
  CreateWorkflowInput,
  CreateWorkflowTemplateInput,
  DecideStageInput,
  UpdateWorkflowInput,
  Workflow,
  WorkflowAttachmentInput,
  WorkflowLineItemInput,
  WorkflowTemplate,
} from "../types/workflow.types";

/**
 * =========================================================
 * Workflow Templates
 * =========================================================
 */

export function useWorkflowTemplates() {
  // Templates are configuration: kept for five minutes, shared by every screen.
  const query = useQuery({
    queryKey: qk.workflows.templates,
    queryFn: () => WorkflowRepository.listTemplates(),
    staleTime: STALE.config,
  });
  const templates = query.data ?? [];
  const loading = query.isLoading;
  const [creating, setCreating] = useState(false);
  const [actionError, setError] = useState<Error | null>(null);
  const error = actionError ?? ((query.error as Error | null) ?? null);

  // A write through apiClient already invalidated the workflow queries, so the
  // list refreshes on its own; this is for an explicit "reload".
  const reload = useCallback(async () => {
    setError(null);
    await query.refetch();
  }, [query]);

  const createWorkflow = useCallback(
    async (input: CreateWorkflowInput) => {
      setCreating(true);
      setError(null);

      try {
        const created = await WorkflowRepository.create(input);

        // (Template active counts refresh on their own: the write invalidated them.)

        return created;
      } catch (err) {
        const normalizedError =
          err instanceof Error
            ? err
            : new Error("Failed to create workflow.");

        setError(normalizedError);

        return null;
      } finally {
        setCreating(false);
      }
    },
    [reload],
  );

  const [creatingTemplate, setCreatingTemplate] = useState(false);

  const createTemplate = useCallback(
    async (input: CreateWorkflowTemplateInput) => {
      setCreatingTemplate(true);
      setError(null);

      try {
        const created = await WorkflowRepository.createTemplate(input);
        return created;
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error("Failed to create workflow template."),
        );
        return null;
      } finally {
        setCreatingTemplate(false);
      }
    },
    [reload],
  );

  const [deletingTemplateId, setDeletingTemplateId] = useState<number | null>(null);

  const deleteTemplate = useCallback(
    async (id: number) => {
      setDeletingTemplateId(id);
      setError(null);

      try {
        await WorkflowRepository.deleteTemplate(id);
        return true;
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error("Failed to delete workflow template."),
        );
        return false;
      } finally {
        setDeletingTemplateId(null);
      }
    },
    [reload],
  );

  // Q1: lets the New Workflow dialog start with a clean slate each time it
  // opens, rather than immediately re-showing the previous attempt's error
  // (which otherwise lingers in this hook's state until the next reload()
  // or createWorkflow() call).
  const clearError = useCallback(() => setError(null), []);

  return {
    templates,
    loading,
    creating,
    error,
    reload,
    createWorkflow,
    creatingTemplate,
    createTemplate,
    deletingTemplateId,
    deleteTemplate,
    clearError,
  } as const;
}

/**
 * =========================================================
 * Active Workflows
 * =========================================================
 */

export function useActiveWorkflows(options: { pageSize?: number } = {}) {
  // Active workflows come a page at a time from the server (stages, attachments
  // and line items are loaded for that page only). The previous page stays on
  // screen while the next loads.
  const list = useServerList<Workflow>({
    key: (params) => qk.workflows.list(params),
    fetchPage: (params) => WorkflowRepository.listActivePage(params),
    initialPageSize: options.pageSize ?? 10,
  });

  const [saving, setSaving] = useState(false);

  const update = useCallback(async (id: number, input: UpdateWorkflowInput) => {
    setSaving(true);
    try {
      // The write invalidates the workflow queries; the list refetches itself.
      return await WorkflowRepository.update(id, input);
    } finally {
      setSaving(false);
    }
  }, []);

  const remove = useCallback(async (id: number) => {
    setSaving(true);
    try {
      return await WorkflowRepository.remove(id);
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    workflows: list.pageItems,
    /** Page controls for <DataTablePagination {...pagination} />. */
    pagination: list,
    loading: list.loading,
    error: list.error,
    reload: list.reload,
    saving,
    update,
    remove,
  } as const;
}

/**
 * =========================================================
 * Workflow Approvals
 * =========================================================
 */

// Q4: a small, sidebar-scoped count — every role that has an "Approvals"
// nav entry (PM, Consultant, Engineer, Finance, HR, Architect) shares the
// same resource, so this lives here rather than being finance-specific.
// GET /workflows/approvals/stats needs only authentication (no requireRole),
// and is already scoped server-side to the caller's own role, so this is
// safe to call from the generic Sidebar regardless of which role is signed
// in — a role with no approvable stage just gets 0 back.
export function useApprovalsPendingCount(): number {
  // The header and the sidebar both show this badge: one shared query, one request.
  const query = useQuery({
    queryKey: qk.approvals.stats,
    queryFn: () => WorkflowRepository.getApprovalStats(),
    staleTime: STALE.badge,
    // The badge is a convenience, not a critical read - stay at 0 on failure.
    retry: false,
  });
  return query.data?.pending ?? 0;
}

/** `limit` fetches only the first N queue items (cards that show a few rows). */
export function useApprovals(scope: ApprovalScope, limit?: number) {
  const queue = useQuery({
    queryKey: qk.approvals.queue(scope, limit ? { limit } : undefined),
    queryFn: () => WorkflowRepository.listApprovals(scope, limit),
    staleTime: STALE.list,
  });
  // Same query as the sidebar badge, so it is not fetched twice.
  const statsQuery = useQuery({
    queryKey: qk.approvals.stats,
    queryFn: () => WorkflowRepository.getApprovalStats(),
    staleTime: STALE.badge,
  });

  const [deciding, setDeciding] = useState<number | null>(null);
  const [actionError, setError] = useState<Error | null>(null);
  const error = actionError ?? ((queue.error ?? statsQuery.error) as Error | null) ?? null;

  const reload = useCallback(async () => {
    setError(null);
    await Promise.all([queue.refetch(), statsQuery.refetch()]);
  }, [queue, statsQuery]);

  const decide = useCallback(
    async (workflowId: number, stageId: number, input: DecideStageInput) => {
      setDeciding(stageId);
      setError(null);

      try {
        // The decision invalidates the workflow queries (queue, badge,
        // dashboard); they refetch on their own.
        return await WorkflowRepository.decideStage(workflowId, stageId, input);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to decide workflow stage."));
        return null;
      } finally {
        setDeciding(null);
      }
    },
    [],
  );

  return {
    items: queue.data ?? [],
    stats: (statsQuery.data ?? null) as ApprovalStats | null,
    loading: queue.isLoading || statsQuery.isLoading,
    deciding,
    error,
    reload,
    decide,
  } as const;
}

export interface ApprovalQueueFilters {
  type: string | null;
  requestedBy: string | null;
  dateFrom: string;
  dateTo: string;
}

/**
 * The approvals tab: the queue paged, searched and filtered on the server
 * (GET /workflows/approvals?page&limit&search&type&requestedBy&from&to). The
 * filter choices (types, requesters) come back in `meta`, computed from the
 * whole queue so they do not shrink as filters are applied.
 */
export function useApprovalsPaged(scope: ApprovalScope, filters: ApprovalQueueFilters) {
  const list = useServerList<ApprovalQueueItem, { types: string[]; requesters: string[] }>({
    key: (params) => qk.approvals.queue(scope, params),
    filters: { scope, ...filters },
    fetchPage: async (params, signal) => {
      const qs = new URLSearchParams({ scope, page: String(params.page), limit: String(params.limit) });
      if (params.search) qs.set("search", params.search);
      if (filters.type) qs.set("type", filters.type);
      if (filters.requestedBy) qs.set("requestedBy", filters.requestedBy);
      if (filters.dateFrom) qs.set("from", filters.dateFrom);
      if (filters.dateTo) qs.set("to", filters.dateTo);
      const json = await apiClient.get(`/workflows/approvals?${qs.toString()}`, { signal });
      return {
        items: (json?.data ?? []) as ApprovalQueueItem[],
        total: json?.meta?.total ?? 0,
        pages: json?.meta?.pages,
        extra: { types: json?.meta?.types ?? [], requesters: json?.meta?.requesters ?? [] },
      };
    },
  });
  const statsQuery = useQuery({
    queryKey: qk.approvals.stats,
    queryFn: () => WorkflowRepository.getApprovalStats(),
    staleTime: STALE.badge,
  });

  const [deciding, setDeciding] = useState<number | null>(null);
  const [actionError, setError] = useState<Error | null>(null);
  const error = actionError ?? list.error ?? ((statsQuery.error as Error | null) ?? null);
  const { reload: reloadList } = list;
  const { refetch: refetchStats } = statsQuery;

  const reload = useCallback(async () => {
    setError(null);
    await Promise.all([reloadList(), refetchStats()]);
  }, [reloadList, refetchStats]);

  const decide = useCallback(async (workflowId: number, stageId: number, input: DecideStageInput) => {
    setDeciding(stageId);
    setError(null);
    try {
      return await WorkflowRepository.decideStage(workflowId, stageId, input);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to decide workflow stage."));
      return null;
    } finally {
      setDeciding(null);
    }
  }, []);

  return {
    list,
    items: list.pageItems,
    typeOptions: list.extra?.types ?? [],
    requesterOptions: list.extra?.requesters ?? [],
    stats: (statsQuery.data ?? null) as ApprovalStats | null,
    loading: list.loading || statsQuery.isLoading,
    deciding,
    error,
    reload,
    decide,
  } as const;
}

/**
 * =========================================================
 * Single workflow (detail)
 * =========================================================
 *
 * Every approval screen needs the same thing before a decision: the full
 * record, including what each earlier stage submitted. Fetching it here
 * rather than inline in a dialog keeps that one request in the feature layer
 * where the rest of the module's data access lives.
 */

export function useWorkflowDetail(workflowId: number | null) {
  const query = useQuery({
    queryKey: ["api", "workflows", "one", workflowId] as const,
    queryFn: () => WorkflowRepository.getById(workflowId as number),
    enabled: workflowId !== null,
    staleTime: STALE.live,
  });

  return {
    workflow: workflowId === null ? null : (query.data ?? null),
    loading: query.isLoading,
    error: (query.error as Error | null) ?? null,
    reload: useCallback(async () => {
      await query.refetch();
    }, [query]),
  } as const;
}

/**
 * =========================================================
 * Budget change requests (Finance)
 * =========================================================
 */

export function useBudgetChangeRequests() {
  const query = useQuery({
    queryKey: ["api", "workflows", "budget-change-requests"] as const,
    queryFn: () => WorkflowRepository.listBudgetChangeRequests(),
    staleTime: STALE.list,
  });

  return {
    requests: query.data ?? ([] as Workflow[]),
    loading: query.isLoading,
    error: (query.error as Error | null) ?? null,
    reload: useCallback(async () => {
      await query.refetch();
    }, [query]),
  } as const;
}

/**
 * =========================================================
 * Workflow initiation from a named template
 * =========================================================
 *
 * The role-specific "start this workflow" actions (Architect → Design
 * Proposal Approval / Public works compliance, Engineer → Budget Change
 * Request, HR → Subcontractor onboarding) all do the same three things:
 * resolve a template by name, create a workflow from it, and file whatever
 * the initiator submitted against the first stage.
 *
 * Template is resolved by NAME rather than a hardcoded id because template
 * ids differ between environments (the seeded set starts at different ids
 * depending on what was already in workflow_templates).
 */

export interface InitiateWorkflowInput {
  title: string;
  projectCode: string;
  amount?: number;
  type?: string;
  attachments?: WorkflowAttachmentInput[];
  lineItems?: WorkflowLineItemInput[];
  /** Uploaded after creation — a file needs the workflow id to attach to. */
  file?: File | null;
}

export function useWorkflowInitiation(templateName: string) {
  const [template, setTemplate] = useState<WorkflowTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);

    WorkflowRepository.listTemplates()
      .then((templates) => {
        if (cancelled) return;
        const match = templates.find(
          (t) => t.name.toLowerCase() === templateName.toLowerCase(),
        );
        setTemplate(match ?? null);
        if (!match) {
          setError(
            new Error(
              `No "${templateName}" workflow template is configured. Ask an administrator to add it.`,
            ),
          );
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err
              : new Error("Failed to load workflow templates."),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [templateName]);

  const initiate = useCallback(
    async (input: InitiateWorkflowInput): Promise<Workflow | null> => {
      if (!template) {
        setError(
          new Error(
            `No "${templateName}" workflow template is configured. Ask an administrator to add it.`,
          ),
        );
        return null;
      }

      setSubmitting(true);
      setError(null);

      try {
        const created = await WorkflowRepository.create({
          title: input.title,
          projectCode: input.projectCode,
          templateId: template.id,
          amount: input.amount,
          type: input.type,
          attachments: input.attachments,
          lineItems: input.lineItems,
        });

        // The upload needs an existing workflow id, so it is a second call.
        // A failed upload is surfaced but does not discard the workflow — it
        // already exists, and the file can be re-attached from the detail view.
        if (input.file) {
          try {
            return await WorkflowRepository.uploadAttachment(
              created.id,
              input.file,
              input.file.name,
            );
          } catch (uploadErr) {
            setError(
              new Error(
                `${created.code} was created, but the document could not be attached: ${
                  uploadErr instanceof Error ? uploadErr.message : "upload failed"
                }`,
              ),
            );
            return created;
          }
        }

        return created;
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error("Failed to start the workflow."),
        );
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [template, templateName],
  );

  return { template, loading, submitting, error, initiate } as const;
}
