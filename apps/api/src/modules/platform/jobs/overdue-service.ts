// apps/api/src/jobs/overdue-service.ts (client demo change #8, daily summary email)
//
// The daily overdue job. Runs from Vercel Cron through /api/cron/overdue (jobs/routes.ts) and from the local-only
// timer in jobs/scheduler.ts. It looks at three things:
//   (a) RFI/RFA requests: the existing in-app sweep, then the person it is waiting on (the sender for a client
//       request) and every Admin are candidates for the email.
//   (b) Workflow approval stages that have been waiting 48 hours or more (WORKFLOW_STAGE_OVERDUE_HOURS): an
//       in-app alert, once, and the same email candidates.
//   (c) Missing PM reports (client demo change #10, jobs/reports-check.ts).
// The in-app alerts are unchanged. Email is ONE summary per person per day listing everything overdue for them
// (planDigests / buildDigestEmail in overdue.ts), never to someone who switched "Email me overdue reminders" off,
// never to a demo/test address, and never when mail is not configured (the run reports that instead). A summary is
// recorded only after the mail really went out, so a failed one is retried whole on the next run.
// Admins get their own items in full plus a per-project overview of everything else (not recorded per item).
import { env } from "../../../core/config/env.js";
import * as notifications from "../notifications/service.js";
import { projectsRepo } from "../../projects/index.js";
import { requestsRepo } from "../../design/index.js";
import { sweepOverdue } from "../../design/index.js";
import { sendMail } from "../../../core/mail/mailer.js";
import { AppError } from "../../../core/utils/errors.js";
import { MAX_OVERVIEW_PROJECTS, buildDigestEmail, manilaDay, planDigests, stageAgeHours, stageOverdueHours, uniquePeople, type DigestCandidate, type OverdueItem, type OverdueItemType, type Person } from "./overdue.js";
import * as repo from "./overdue-repository.js";
import { collectMissingReports, sendInAppReminders } from "./reports-check.js";

export interface OverdueRunResult {
  day: string;
  /** `emailed` is the number of the section's items included in summaries that were sent. */
  requests: { overdue: number; inApp: number; emailed: number };
  stages: { overdue: number; inApp: number; emailed: number };
  reports: { missing: number; inApp: number; emailed: number };
  emails: {
    digestsSent: number;
    digestsFailed: number;
    itemsIncluded: number;
    skippedOptOut: number;
    skippedNoEmail: number;
    skippedUndeliverable: number;
    skippedAlreadySent: number;
    /** Project lines rendered in the Admin overviews of the summaries that were sent. */
    adminOverviewProjects: number;
    mailConfigured: boolean;
  };
}

const shortDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "no date");

/**
 * Plans one summary per person from everything overdue, sends each, and records it only when it went out.
 * Returns how many items of each kind were in a summary that was sent.
 */
const deliverDigests = async (candidates: DigestCandidate[], today: string, totals: OverdueRunResult["emails"]): Promise<Record<OverdueItemType, number>> => {
  const included: Record<OverdueItemType, number> = { rfi: 0, stage: 0, report: 0 };
  const sent = await repo.emailKeysSentOn([...new Set([today, ...candidates.map((c) => c.day)])]);
  const plan = planDigests(candidates, sent, today);
  totals.skippedOptOut += plan.skippedOptOut;
  totals.skippedNoEmail += plan.skippedNoEmail;
  totals.skippedUndeliverable += plan.skippedUndeliverable;
  totals.skippedAlreadySent += plan.skippedAlreadySent;
  for (const digest of plan.digests) {
    if (!totals.mailConfigured) break;
    try {
      await sendMail({ to: digest.person.email!, ...buildDigestEmail(digest, env.APP_URL, today) });
    } catch (err) {
      totals.digestsFailed++;
      if (err instanceof AppError && err.code === "MAIL_NOT_CONFIGURED") totals.mailConfigured = false;
      else console.warn(`[overdue] summary to ${digest.person.email} failed:`, err instanceof Error ? err.message : err);
      continue; // nothing is recorded, so every item in it is tried again next run
    }
    await repo.recordDigestSent(digest.person.id, digest.items.map((i) => ({ type: i.item.type, id: i.item.id, day: i.day })), today);
    totals.digestsSent++;
    totals.itemsIncluded += digest.items.length;
    totals.adminOverviewProjects += Math.min(digest.overview?.length ?? 0, MAX_OVERVIEW_PROJECTS);
    for (const i of digest.items) included[i.item.type]++;
  }
  return included;
};

const adminsOf = () => repo.findPeopleByRole("admin");

const daysLate = (due: Date | null, now: Date) => (due ? Math.max(1, Math.floor((now.getTime() - due.getTime()) / 86_400_000)) : 0);

/** (a) RFI/RFA: in-app sweep as before; returns the email candidates. */
const collectRequests = async (now: Date, day: string): Promise<{ candidates: DigestCandidate[]; overdue: number; inApp: number }> => {
  const swept = await sweepOverdue(now);
  const overdue = await requestsRepo.findOverdue(now);
  const admins = await adminsOf();
  const candidates: DigestCandidate[] = [];
  for (const r of overdue) {
    const ids = [r.assignedToUserId, r.assignedToUserId == null ? r.requestedByUserId : null].filter((x): x is number => x != null);
    const owners = await repo.findPeopleByIds(ids);
    const days = daysLate(r.dueDate, now);
    const item: OverdueItem = {
      type: "rfi",
      id: r.id,
      subject: `${r.number}: ${r.subject}`,
      projectCode: r.projectCode,
      late: `${days} day${days === 1 ? "" : "s"} overdue`,
      detail: `${r.number} (${r.subject}) was due ${shortDate(r.dueDate)} and has no response yet. ${r.assignedToName ? `Assigned to ${r.assignedToName}.` : "It was sent to the client."}`,
      path: `/requests?open=${r.id}`,
    };
    candidates.push({ item, recipients: owners, admins, day });
  }
  return { candidates, overdue: overdue.length, inApp: swept.notified };
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

/** (b) Workflow stages waiting too long: one in-app alert each; returns the email candidates. */
const collectStages = async (now: Date, day: string): Promise<{ candidates: DigestCandidate[]; overdue: number; inApp: number }> => {
  const hours = stageOverdueHours();
  const stalled = await requestsRepo.findStalledStages(new Date(now.getTime() - hours * 3_600_000));
  const admins = await adminsOf();
  const candidates: DigestCandidate[] = [];
  let inApp = 0;
  for (const s of stalled) {
    if (!s.updatedAt) continue;
    const owners = await stageOwners(s);
    const age = stageAgeHours(s.updatedAt, now);
    const detail = `The "${s.roleLabel}" stage of "${s.title}" (${s.workflowCode}, project ${s.projectCode}) has been waiting for a decision for ${age} hours (the limit is ${hours}).`;
    candidates.push({
      item: { type: "stage", id: s.stageId, subject: `${s.workflowCode}: ${s.roleLabel} approval`, projectCode: s.projectCode, late: `waiting ${age} h`, detail, path: "/approvals" },
      recipients: owners,
      admins,
      day,
    });

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
  return { candidates, overdue: stalled.length, inApp };
};

/** (c) Missing PM reports (client demo change #10): once per missing period, to the project's PM only. */
const collectReports = async (day: string): Promise<{ candidates: DigestCandidate[]; missing: number; inApp: number }> => {
  const admins = await adminsOf();
  const missing = await collectMissingReports(day);
  const inApp = await sendInAppReminders(missing);
  // The email is once per period, so the period's start date is the day its "already sent" record is kept under.
  // Admins only count a missing report in their overview; the PM (the real owner) is emailed once per period.
  const candidates: DigestCandidate[] = missing.map((m) => ({ item: m.item, recipients: m.pm ? [m.pm] : [], admins, day: m.start }));
  return { candidates, missing: missing.length, inApp };
};

export const runOverdueJob = async (now: Date = new Date()): Promise<OverdueRunResult> => {
  const day = manilaDay(now);
  const totals: OverdueRunResult["emails"] = { digestsSent: 0, digestsFailed: 0, itemsIncluded: 0, skippedOptOut: 0, skippedNoEmail: 0, skippedUndeliverable: 0, skippedAlreadySent: 0, adminOverviewProjects: 0, mailConfigured: true };
  const requests = await collectRequests(now, day);
  const stages = await collectStages(now, day);
  const reports = await collectReports(day);
  const included = await deliverDigests([...requests.candidates, ...stages.candidates, ...reports.candidates], day, totals);
  return {
    day,
    requests: { overdue: requests.overdue, inApp: requests.inApp, emailed: included.rfi },
    stages: { overdue: stages.overdue, inApp: stages.inApp, emailed: included.stage },
    reports: { missing: reports.missing, inApp: reports.inApp, emailed: included.report },
    emails: totals,
  };
};
