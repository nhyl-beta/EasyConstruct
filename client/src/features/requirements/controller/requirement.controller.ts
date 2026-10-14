import type {
  CreateRequirementInput,
  Requirement,
  RequirementAttachment,
  RequirementFilters,
  StructureRequirementInput,
  GenerateDraftInput,
} from "../types/requirements.types";
import { useMemo } from "react";
import { useServerList } from "@/hooks/use-server-list";
import { qk } from "@/lib/query-keys";
import { RequirementRepository } from "../repositories/requirement.repository";

export const RequirementService = {
  async fetchAll(filters: RequirementFilters = {}): Promise<Requirement[]> {
    return RequirementRepository.list(filters);
  },

  async createRequirement(payload: CreateRequirementInput): Promise<Requirement> {
    return RequirementRepository.create(payload);
  },

  countByStatus(requirements: Requirement[], status: Requirement["status"]): number {
    return requirements.filter((r) => r.status === status).length;
  },

  groupByCategory(requirements: Requirement[]): { name: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const r of requirements) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  },
};

export function useRequirementsController(options: { pageSize?: number } = {}) {
  const list = useServerList<Requirement, { statusCounts: { key: string; count: number }[] }>({
    key: (params) => qk.requirements.list(params),
    initialPageSize: options.pageSize ?? 10,
    fetchPage: async (params, signal) => {
      const page = await RequirementRepository.listPage(params.page, params.limit, signal);
      return { items: page.items, total: page.total, pages: page.pages, extra: { statusCounts: page.statusCounts } };
    },
  });

  // The writes below go through apiClient, which refreshes the cached lists
  // ("requirements" is in the invalidation map), so the page needs no manual
  // state patching.
  const createRequirement = async (payload: CreateRequirementInput) => {
    await RequirementService.createRequirement(payload);
  };

  /** Draft → Under Review, i.e. into the Project Manager's approval queue. */
  const submitRequirement = async (dbId: number) => {
    await RequirementRepository.submit(dbId);
  };

  const addAttachments = async (requirement: Requirement, added: RequirementAttachment[]) => {
    await RequirementRepository.setAttachments(requirement.dbId, [...requirement.attachments, ...added]);
  };

  /** Rule-based structuring of a rough note; saves nothing. */
  const structureRequirement = (input: StructureRequirementInput) => RequirementRepository.structure(input);

  /** Rule-based draft from the template packs; saves nothing. */
  const generateDraft = (input: GenerateDraftInput) => RequirementRepository.generateDraft(input);

  // Headline counts over every requirement the caller can see (all pages).
  const counts = useMemo(() => {
    const rows = list.extra?.statusCounts ?? [];
    const n = (key: string) => rows.find((r) => r.key === key)?.count ?? 0;
    return { total: rows.reduce((sum, r) => sum + r.count, 0), approved: n("Approved"), underReview: n("Under Review"), drafts: n("Draft") };
  }, [list.extra]);

  return {
    requirements: list.pageItems,
    loading: list.loading,
    counts,
    pagination: list,
    createRequirement,
    submitRequirement,
    addAttachments,
    structureRequirement,
    generateDraft,
    reload: list.reload,
  };
}
