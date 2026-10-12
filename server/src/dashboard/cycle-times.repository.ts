// server/src/dashboard/cycle-times.repository.ts (objectives fix 1.4): start and end timestamps that already exist, nothing new.
import { sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import type { CycleSample } from "./cycle-times.js";

const rows = async <T>(query: ReturnType<typeof sql>): Promise<T[]> => (await db.execute(query)).rows as T[];

/** Finished work whose end falls in the last `months` months. */
export const loadCycleSamples = async (months = 12): Promise<CycleSample[]> => {
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - months);

  const [workflows, requests, batches, issues] = await Promise.all([
    rows<{ template: string | null; started: Date; ended: Date }>(sql`
      SELECT t.name AS template, w.created_at AS started, w.updated_at AS ended
      FROM workflows w LEFT JOIN workflow_templates t ON t.id = w.template_id
      WHERE w.status = 'completed' AND w.created_at IS NOT NULL AND w.updated_at >= ${since}`),
    rows<{ kind: string; started: Date; ended: Date }>(sql`
      SELECT kind, sent_at AS started, responded_at AS ended
      FROM design_requests
      WHERE sent_at IS NOT NULL AND responded_at IS NOT NULL AND responded_at >= ${since}`),
    rows<{ started: Date; ended: Date }>(sql`
      SELECT submitted_at AS started, reviewed_at AS ended
      FROM payroll_batches
      WHERE status = 'approved' AND submitted_at IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_at >= ${since}`),
    rows<{ started: Date; ended: Date }>(sql`
      SELECT created_at AS started, updated_at AS ended
      FROM issues
      WHERE status = 'Resolved' AND created_at IS NOT NULL AND updated_at >= ${since}`),
  ]);

  const d = (v: Date | string) => (v instanceof Date ? v : new Date(v));
  return [
    ...workflows.map((r) => ({ kind: "workflow-approval" as const, group: r.template ?? "Other", start: d(r.started), end: d(r.ended) })),
    ...requests.map((r) => ({ kind: "request-response" as const, group: r.kind, start: d(r.started), end: d(r.ended) })),
    ...batches.map((r) => ({ kind: "payroll-approval" as const, group: "All", start: d(r.started), end: d(r.ended) })),
    ...issues.map((r) => ({ kind: "issue-resolution" as const, group: "All", start: d(r.started), end: d(r.ended) })),
  ];
};
