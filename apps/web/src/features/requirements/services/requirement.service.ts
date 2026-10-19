import type {
  CreateRequirementInput,
  Requirement,
  RequirementFilters,
  StructureRequirementInput,
  StructuredRequirement,
} from "../types/requirements.types";
import { RequirementRepository } from "../repositories/requirement.repository";

export const RequirementService = {
  async fetchAll(filters: RequirementFilters = {}): Promise<Requirement[]> {
    return RequirementRepository.list(filters);
  },

  async createRequirement(payload: CreateRequirementInput): Promise<Requirement> {
    return RequirementRepository.create(payload);
  },

  async structure(input: StructureRequirementInput): Promise<StructuredRequirement> {
    return RequirementRepository.structure(input);
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