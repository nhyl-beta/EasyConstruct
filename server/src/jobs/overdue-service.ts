// server/src/jobs/overdue-service.ts (client demo change #8)
//
// The daily overdue job. Runs from Vercel Cron through /api/cron/overdue (jobs/routes.ts) and from the local-only
// timer in jobs/scheduler.ts. It does three things for everything that is overdue:
//   (a) RFI/RFA requests: the existing in-app sweep, then an email to the assignee (the sender for a client
//       request) and to every Admin.
//   (b) Workflow approval stages that have been waiting 48 hours or more (WORKFLOW_STAGE_OVERDUE_HOURS): an
//       in-app alert, once, and the same emails.
//   (c) Missing PM reports (client demo change #10, jobs/reports-check.ts).
// An email goes to a person at most once per item per day (overdue_reminders), never to someone who switched
// "Email me overdue reminders" off, and never when mail is not configured (the run reports that instead).
import { env } from "../config/env.js";
import * as notifications from "../notifications/service.js";
import * as projectsRepo from "../projects/repository.js";
import * as requestsRepo from "../design-requests/repository.js";
import { sweepOverdue } from "../design-requests/service.js";
import { sendMail } from "../mail/mailer.js";
import { AppError } from "../utils/errors.js";
import { buildOverdueEmail, manilaDay, planEmails, stageAgeHours, stageOverdueHours, uniquePeople, type OverdueItem, type Person } from "./overdue.js";
import * as repo from "./overdue-repository.js";

export interface OverdueRunResult {
  day: string;
  requests: { overdue: number; inApp: number; emailed: number };
  stages: { overdue: number; inApp: number; emailed: number };
  emails: { sent: number; failed: number; skippedOptOut: number; skippedNoEmail: number; skippedAlreadySent: number; mailConfigured: boolean };
}

const shortDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "no date");

/** Sends the planned emails, recording each success. Stops at the first "mail is not configured". */
const deliver = async (candidates: { item: OverdueItem; recipients: Person[] }[], day: string, totals: OverdueRunResult["emails"]): Promise<number> => {
  const plan = planEmails(candidates, await repo.emailKeysSentOn(day), day);
  totals.skippedOptOut += plan.skippedOptOut;
  totals.skippedNoEmail += plan.skippedNoEmail;
  totals.skippedAlreadySent += plan.skippedAlreadySent;
  let sent = 0;
  for (const { item, to } of plan.send) {
    if (!totals.mailConfigured) break;
    try {
      const mail = buildOverdueEmail(item, env.APP_URL);
      await sendMail({ to: to.email!, ...mail });
      // Recorded only after the mail really went out, so a failure is retried on the next run.
      await repo.recordSent({ type: item.type, itemId: item.id, userId: to.id, channel: "email", day });
      sent++;
      totals.sent++;
    } catch (err) {
      totals.failed++;
      if (err instanceof AppError && err.code === "MAIL_NOT_CONFIGURED") totals.mailConfigured = false;
      else console.warn(`[overdue] email to ${to.email} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return sent;
};

const adminsOf = () => repo.findPeopleByRole("admin");

/** (a) RFI/RFA: in-app sweep as before, then the emails. */
const runRequests = async (now: Date, day: string, totals: OverdueRunResult["emails"]): Promise<OverdueRunResult["requests"]> => {
  const swept = await sweepOverdue(now);
  const overdue = await requestsRepo.findOverdue(now);
  const admins = await adminsOf();
  const candidates: { item: OverdueItem; recipients: Person[] }[] = [];
  for (const r of overdue) {
    const ids = [r.assignedToUserId, r.assignedToUserId == null ? r.requestedByUserId : null].filter((x): x is number => x != null);
    const owners = await repo.findPeopleByIds(ids);
    candidates.push({
      item: {
        type: "rfi",
        id: r.id,
        subject: `${r.number}: ${r.subject}`,
        detail: `${r.number} (${r.subject}) was due ${shortDate(r.dueDate)} and has no response yet. ${r.assignedToName ? `Assigned to ${r.assignedToName}.` : "It was sent to the client."}`,
        path: `/requests?open=${r.id}`,
      },
      recipients: uniquePeople([...owners, ...admins]),
    });
  }
  const emailed = await deliver(candidates, day, totals);
  return { overdue: overdue.length, inApp: swept.notified, emailed };
};

/** Who a stalled stage is waiting on: the named assignee, else the project's PM or the holders of the stage role. */
const stageOwners = async (stage: { assignedTo: string | null; role: string; projectCode: string }): Promise<Person[]> => {
  if (stage.assignedTo) {
    const named = await repo.findPersonByName(stage.assignedTo);
    if (named) return [named];
  }
  if (stage.role === "project-manager") {
    const project = await projectsRepo.findByCode(stage.projectCode);
    return project?.pmUserId != null ? repo.findPeopleByIds([project.pmUserId]) : repo.findPeopleByRole("project-manager");
  }
  return repo.findPeopleByRole(stage.role);
};

/** (b) Workflow stages waiting too long: one in-app alert each, then the emails. */
const runStages = async (now: Date, day: string, totals: OverdueRunResult["emails"]): Promise<OverdueRunResult["stages"]> => {
  const hours = stageOverdueHours();
  const stalled = await requestsRepo.findStalledStages(new Date(now.getTime() - hours * 3_600_000));
  const admins = await adminsOf();
  const candidates: { item: OverdueItem; recipients: Person[] }[] = [];
  let inApp = 0;
  for (const s of stalled) {
    if (!s.updatedAt) continue;
    const owners = await stageOwners(s);
    const age = stageAgeHours(s.updatedAt, now);
    const detail = `The "${s.roleLabel}" stage of "${s.title}" (${s.workflowCode}, project ${s.projectCode}) has been waiting for a decision for ${age} hours (the limit is ${hours}).`;
    candidates.push({ item: { type: "stage", id: s.stageId, subject: `${s.workflowCode}: ${s.roleLabel} approval waiting ${age} h`, detail, path: "/approvals" }, recipients: uniquePeople([...owners, ...admins]) });

    // The in-app alert goes once per stage to the people it is waiting on and to every Admin.
    const title = `Overdue approval: ${s.workflowCode}`;
    for (const person of owners) {
      if (await repo.inAppEverSent("stage", s.stageId, person.id)) continue;
      if (!(await repo.recordSent({ type: "stage", itemId: s.stageId, userId: person.id, channel: "inapp", day }))) continue;
      await notifications.create({ recipientUserId: person.id, projectCode: s.projectCode, title, body: detail, link: "/approvals" });
      inApp++;
    }
    if (!(await repo.inAppEverSent("stage", s.stageId, 0)) && (await repo.recordSent({ type: "stage", itemId: s.stageId, userId: 0, channel: "inapp", day }))) {
      await notifications.create({ recipientRole: "admin", projectCode: s.projectCode, title: `Overdue approval ${s.workflowCode}`, body: detail, link: "/approvals" });
      inApp++;
    }
  }
  const emailed = await deliver(candidates, day, totals);
  return { overdue: stalled.length, inApp, emailed };
};

export const runOverdueJob = async (now: Date = new Date()): Promise<OverdueRunResult> => {
  const day = manilaDay(now);
  const totals: OverdueRunResult["emails"] = { sent: 0, failed: 0, skippedOptOut: 0, skippedNoEmail: 0, skippedAlreadySent: 0, mailConfigured: true };
  const requests = await runRequests(now, day, totals);
  const stages = await runStages(now, day, totals);
  return { day, requests, stages, emails: totals };
};
