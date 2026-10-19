// apps/api/src/jobs/scheduler.ts (objectives fixes 2.3 and 3.5)
//
// Local-development timers for the scheduled jobs. NOT used in production on
// Vercel, where the same jobs run from Vercel Cron through /api/cron/* (see
// jobs/routes.ts and server/vercel.json). Started only from src/index.ts, never
// from apps/api/index.ts, and never when VERCEL or DISABLE_SCHEDULER is set.
import { withJobLock } from "./lock.js";

const HOUR_MS = 60 * 60 * 1000;
let started = false;

const every = (name: string, ms: number, run: () => Promise<unknown>) => {
  const tick = () =>
    run()
      .then((r) => {
        if (r) console.log(`[jobs] ${name}:`, JSON.stringify(r));
      })
      .catch((err) => console.error(`[jobs] ${name} failed`, err));
  setTimeout(tick, 60_000).unref();
  setInterval(tick, ms).unref();
};

export interface ScheduledJobRunners {
  runSignalScan: () => Promise<unknown>;
  runAttendanceCheck: () => Promise<unknown>;
  runOverdueJob: () => Promise<unknown>;
}

export function startScheduledJobs(runners: ScheduledJobRunners): void {
  if (started || process.env.VERCEL || process.env.DISABLE_SCHEDULER === "true") return;
  started = true;
  every("signals", 6 * HOUR_MS, runners.runSignalScan);
  every("attendance-exceptions", 6 * HOUR_MS, runners.runAttendanceCheck);
  // Emails go out at most once per item per day however often this ticks (overdue_reminders).
  every("overdue", 6 * HOUR_MS, () =>
    withJobLock(74_2026_08, runners.runOverdueJob),
  );
}
