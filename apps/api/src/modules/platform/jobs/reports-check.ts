// apps/api/src/jobs/reports-check.ts (client demo change #10)
//
// Part of the daily overdue job: remind each project's PM of a missing report for the period that just ended
// (yesterday's daily, last week's weekly, last month's monthly). The in-app reminder goes once per period; the
// email goes once per period too, and only if the PM's "Email me overdue reminders" setting is on.
import * as notifications from "../notifications/service.js";
import { REPORT_TYPE_BY_PERIOD, periodEnd, remindersDue, type ReportPeriod } from "../../projects/index.js";
import { reportsRepo } from "../../projects/index.js";
import { activeFromFor, workingDays } from "../../projects/index.js";
import type { OverdueItem, Person } from "./overdue.js";
import * as repo from "./overdue-repository.js";

const KIND_INDEX: Record<ReportPeriod, number> = { daily: 0, weekly: 1, monthly: 2 };
const WHEN: Record<ReportPeriod, string> = { daily: "yesterday", weekly: "last week", monthly: "last month" };

/** One id per project and period kind: the unique key in overdue_reminders also holds the period's start date. */
export const reportItemId = (projectId: number, period: ReportPeriod): number => projectId * 4 + KIND_INDEX[period];

export interface MissingReport {
  item: OverdueItem;
  start: string;
  period: ReportPeriod;
  projectCode: string;
  pm: Person | null;
}

/** Every missing report the PMs should hear about today. */
export const collectMissingReports = async (today: string): Promise<MissingReport[]> => {
  const projects = await reportsRepo.activeProjects();
  const submitted = await reportsRepo.submittedStarts(projects.map((p) => p.code));
  const out: MissingReport[] = [];
  for (const p of projects) {
    const filed = submitted.get(p.code) ?? { daily: new Set<string>(), weekly: new Set<string>(), monthly: new Set<string>() };
    const due = remindersDue({ deliveryType: p.deliveryType, status: p.status, activeFrom: await activeFromFor(p), today, workingDays: workingDays(), submitted: filed });
    if (due.length === 0) continue;
    const pm = p.pmUserId != null ? ((await repo.findPeopleByIds([p.pmUserId]))[0] ?? null) : await repo.findPersonByName(p.pm);
    for (const d of due) {
      const covers = d.period === "daily" ? d.start : `${d.start} to ${periodEnd(d.period, d.start)}`;
      out.push({
        item: {
          type: "report",
          id: reportItemId(p.id, d.period),
          subject: `${p.code}: ${REPORT_TYPE_BY_PERIOD[d.period]} missing`,
          projectCode: p.code,
          late: `missing for ${covers}`,
          detail: `No ${REPORT_TYPE_BY_PERIOD[d.period]} has been filed for ${p.name} (${p.code}) for ${WHEN[d.period]} (${covers}). Upload it from the project's Reports tab.`,
          path: `/projects/${p.id}?tab=reports`,
        },
        start: d.start,
        period: d.period,
        projectCode: p.code,
        pm,
      });
    }
  }
  return out;
};

/** In-app reminder to the PM, once per period (the period's start date is stored as the day). */
export const sendInAppReminders = async (missing: MissingReport[]): Promise<number> => {
  let sent = 0;
  for (const m of missing) {
    if (!m.pm) continue;
    if (!(await repo.recordSent({ type: "report", itemId: m.item.id, userId: m.pm.id, channel: "inapp", day: m.start }))) continue;
    await notifications.create({ recipientUserId: m.pm.id, projectCode: m.projectCode, title: m.item.subject, body: m.item.detail, link: m.item.path });
    sent++;
  }
  return sent;
};
