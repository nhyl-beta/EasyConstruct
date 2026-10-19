import type {
  CreateEngineeringReportInput,
  EngineeringReport,
  EngineeringReportFilters,
} from "../types/engineering-reports.types";
import { ISSUE_REPORT_TYPES, PROGRESS_REPORT_TYPES } from "../types/engineering-reports.types";
import { EngineeringReportRepository } from "../repositories/engineering-report.repository";

export const EngineeringReportService = {
  async fetchAll(filters: EngineeringReportFilters = {}): Promise<EngineeringReport[]> {
    return EngineeringReportRepository.list(filters);
  },

  async createReport(payload: CreateEngineeringReportInput): Promise<EngineeringReport> {
    return EngineeringReportRepository.create(payload);
  },

  // Splits the shared report pool by the taxonomy in engineering-report.types.ts
  // so the Progress and Issues pages can each show a relevant slice without
  // needing their own backend endpoint.
  onlyProgress(reports: EngineeringReport[]): EngineeringReport[] {
    return reports.filter((r) => PROGRESS_REPORT_TYPES.includes(r.type));
  },

  onlyIssues(reports: EngineeringReport[]): EngineeringReport[] {
    return reports.filter((r) => ISSUE_REPORT_TYPES.includes(r.type));
  },

  countByPriority(reports: EngineeringReport[], priority: EngineeringReport["priority"]): number {
    return reports.filter((r) => r.priority === priority).length;
  },

  countByStatus(reports: EngineeringReport[], status: EngineeringReport["status"]): number {
    return reports.filter((r) => r.status === status).length;
  },
};