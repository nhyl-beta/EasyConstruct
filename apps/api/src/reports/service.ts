// apps/api/src/reports/service.ts (client demo change #10)
import { manilaDay } from "../jobs/overdue.js";
import * as projectsRepo from "../projects/repository.js";
import { assertProjectVisible } from "../projects/service.js";
import { NotFoundError } from "../utils/errors.js";
import * as repo from "./repository.js";
import { REPORT_PERIODS, REPORT_TYPE_BY_PERIOD, applicablePeriods, parseWorkingDays, reportGrid, type GridCell, type ReportPeriod } from "./periods.js";

export const workingDays = () => parseWorkingDays(process.env.REPORT_WORKING_DAYS);

/** The first day reports are expected: when the project entered Construction (or Design), else its planned start, else its creation. */
export const activeFromFor = async (project: { code: string; deliveryType: string | null; plannedStartDate: string | null; createdAt: Date | null }): Promise<string> => {
  const phase = project.deliveryType === "Design" ? "Design" : "Construction";
  const at = await repo.enteredAt(project.code, phase);
  if (at) return manilaDay(at);
  if (project.plannedStartDate && /^\d{4}-\d{2}-\d{2}$/.test(project.plannedStartDate)) return project.plannedStartDate;
  return manilaDay(project.createdAt ?? new Date());
};

export interface ReportStatus {
  projectCode: string;
  today: string;
  activeFrom: string;
  /** Which reports this project owes right now; empty when it is not under construction or design. */
  applicable: ReportPeriod[];
  documentTypes: Record<ReportPeriod, string>;
  grids: Record<ReportPeriod, GridCell[]>;
}

export const getStatus = async (projectCode: string, auth: { id: number; name: string; role: string }, now: Date = new Date()): Promise<ReportStatus> => {
  await assertProjectVisible(auth, projectCode, "reports");
  const project = await projectsRepo.findByCode(projectCode);
  if (!project) throw new NotFoundError("Project", projectCode);
  const today = manilaDay(now);
  const activeFrom = await activeFromFor(project);
  const submitted = (await repo.submittedStarts([projectCode])).get(projectCode) ?? { daily: new Set<string>(), weekly: new Set<string>(), monthly: new Set<string>() };
  const applicable = applicablePeriods(project.deliveryType, project.status);
  const grids = Object.fromEntries(
    REPORT_PERIODS.map((p) => [p, applicable.includes(p) ? reportGrid({ period: p, activeFrom, today, submitted: submitted[p], workingDays: workingDays() }) : []]),
  ) as Record<ReportPeriod, GridCell[]>;
  return { projectCode, today, activeFrom, applicable, documentTypes: REPORT_TYPE_BY_PERIOD, grids };
};
