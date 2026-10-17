// server/src/reports/repository.ts (client demo change #10)
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db/connection.js";
import { documents } from "../db/schema/documents.js";
import { projectPhaseHistory } from "../db/schema/project-phase-history.js";
import { projects } from "../db/schema/projects.js";
import { REPORT_PERIODS, type ReportPeriod } from "./periods.js";

/** Start dates of the reports filed for each project, by period. */
export const submittedStarts = async (projectCodes: string[]): Promise<Map<string, Record<ReportPeriod, Set<string>>>> => {
  const out = new Map<string, Record<ReportPeriod, Set<string>>>();
  if (projectCodes.length === 0) return out;
  const rows = await db
    .select({ project: documents.project, period: documents.reportPeriod, date: documents.periodDate })
    .from(documents)
    .where(and(inArray(documents.project, projectCodes), isNotNull(documents.reportPeriod), isNotNull(documents.periodDate)));
  for (const r of rows) {
    if (!r.period || !r.date || !(REPORT_PERIODS as readonly string[]).includes(r.period)) continue;
    const entry = out.get(r.project) ?? { daily: new Set<string>(), weekly: new Set<string>(), monthly: new Set<string>() };
    entry[r.period as ReportPeriod].add(r.date);
    out.set(r.project, entry);
  }
  return out;
};

/** Projects that may owe reports right now (Construction, Design or Closeout). */
export const activeProjects = () =>
  db
    .select({
      id: projects.id,
      code: projects.code,
      name: projects.name,
      status: projects.status,
      deliveryType: projects.deliveryType,
      pmUserId: projects.pmUserId,
      pm: projects.pm,
      plannedStartDate: projects.plannedStartDate,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(inArray(projects.status, ["Construction", "Design", "Closeout"]));

/** When a project entered the phase reports start in (Construction, or Design for a Design project). */
export const enteredAt = async (projectCode: string, phase: string): Promise<Date | null> => {
  const [row] = await db
    .select({ at: projectPhaseHistory.createdAt })
    .from(projectPhaseHistory)
    .where(and(eq(projectPhaseHistory.projectCode, projectCode), eq(projectPhaseHistory.toStatus, phase)))
    .orderBy(desc(projectPhaseHistory.id))
    .limit(1);
  return row?.at ?? null;
};
