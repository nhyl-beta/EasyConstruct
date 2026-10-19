// apps/api/src/signals/scan.ts (objectives fix 3.5)
//
// Scheduled evaluation of the decision-support rules for every active project.
// Findings are stored once per occurrence, the owner roles are told in-app once
// per new finding, and a finding is resolved when its condition clears. It only
// records and notifies: it never changes a project, a gate or an approval.
//
// Runs from POST/GET /api/cron/signals (Vercel Cron, see jobs/routes.ts) and,
// for local development only, from an in-process timer (jobs/scheduler.ts).
import { withJobLock } from "../core/jobs/lock.js";
import { FEATURES } from "../core/config/features.js";
import * as projectsRepo from "../projects/repository.js";
import * as lifecycleRepo from "../lifecycle/repository.js";
import * as notificationsService from "../notifications/service.js";
import { isSequencedPhase } from "../lifecycle/phases.js";
import { evaluateSignals } from "./index.js";
import * as repo from "./findings-repository.js";
import { notificationFor, reconcileFindings, toCurrentFindings, type CurrentFinding } from "./findings.js";

const LOCK_KEY = 74_2025_02; // arbitrary, stable; distinct from the RFI/RFA sweeper's
const BATCH = 20;
const TERMINAL = new Set(["Completed", "Archived"]);

export interface ScanSummary {
  projects: number;
  created: number;
  reopened: number;
  resolved: number;
  notified: number;
}

const scan = async (now: Date): Promise<ScanSummary> => {
  const all = await projectsRepo.findAll({});
  const active = all.filter((p) => isSequencedPhase(p.status) && !TERMINAL.has(p.status));
  const summary: ScanSummary = { projects: active.length, created: 0, reopened: 0, resolved: 0, notified: 0 };

  for (let i = 0; i < active.length; i += BATCH) {
    const chunk = active.slice(i, i + BATCH);
    const codes = chunk.map((p) => p.code);
    const snapshots = await lifecycleRepo.loadSnapshots(codes);
    const stored = await repo.findForProjects(codes);

    const current: CurrentFinding[] = [];
    const scanned = new Set<string>();
    for (const project of chunk) {
      const snapshot = snapshots.get(project.code);
      if (!snapshot) continue;
      scanned.add(project.code);
      current.push(...toCurrentFindings(project.code, evaluateSignals(snapshot, now)));
    }

    const changes = reconcileFindings(stored, current, scanned);
    await repo.insertFindings(
      changes.create.map((f) => ({ key: f.key, projectCode: f.projectCode, rule: f.rule, severity: f.severity })),
      now,
    );
    for (const severity of ["warn", "critical"] as const) {
      await repo.reopenFindings(changes.reopen.filter((f) => f.severity === severity).map((f) => f.key), severity, now);
      await repo.touchFindings(changes.touch.filter((f) => f.severity === severity).map((f) => f.key), severity, now);
    }
    await repo.resolveFindings(changes.resolve.map((f) => f.key), now);

    // One in-app notice per new occurrence. A failed notification is logged and
    // skipped: the finding is already stored and shows in the PM queue.
    for (const f of [...changes.create, ...changes.reopen]) {
      try {
        await notificationsService.notifyProject(f.projectCode, f.signal.ownerRoles, notificationFor(f));
        summary.notified += 1;
      } catch (err) {
        console.error(`[signals] could not notify for ${f.key}`, err);
      }
    }
    summary.created += changes.create.length;
    summary.reopened += changes.reopen.length;
    summary.resolved += changes.resolve.length;
  }
  return summary;
};

/** Runs one scan. Returns null when decision support is off or another instance is already scanning. */
export const runSignalScan = async (now: Date = new Date()): Promise<ScanSummary | null> => {
  if (!FEATURES.ai) return null;
  return withJobLock(LOCK_KEY, () => scan(now));
};
