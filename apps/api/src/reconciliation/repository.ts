// apps/api/src/reconciliation/repository.ts (objectives fix 1.3): read-only queries for the cross-checks.
import { sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import type { BatchTotalsRow, BudgetRow, InactiveMemberRow, OrphanRow } from "./checks.js";

const rows = async <T>(query: ReturnType<typeof sql>): Promise<T[]> => (await db.execute(query)).rows as T[];

export const loadBudgetRows = async (): Promise<BudgetRow[]> => {
  const [actuals, expenses, payroll] = await Promise.all([
    rows<{ project: string; actual: string }>(sql`SELECT project, COALESCE(SUM(actual), 0) AS actual FROM budgets GROUP BY project`),
    rows<{ project: string; total: string }>(
      sql`SELECT project, COALESCE(SUM(amount), 0) AS total FROM expenses WHERE status = 'approved' GROUP BY project`,
    ),
    rows<{ project_code: string; total: string }>(
      sql`SELECT project_code, COALESCE(SUM(CASE WHEN employer_cost > 0 THEN employer_cost ELSE gross_payroll END), 0) AS total
          FROM payroll_batches WHERE status = 'approved' AND project_code IS NOT NULL GROUP BY project_code`,
    ),
  ]);
  const projects = new Map<string, BudgetRow>();
  const get = (project: string) => {
    let row = projects.get(project);
    if (!row) {
      row = { project, actual: 0, approvedExpenses: 0, approvedPayroll: 0 };
      projects.set(project, row);
    }
    return row;
  };
  for (const r of actuals) get(r.project).actual = Number(r.actual);
  for (const r of expenses) get(r.project).approvedExpenses = Number(r.total);
  for (const r of payroll) get(r.project_code).approvedPayroll = Number(r.total);
  return [...projects.values()].sort((a, b) => a.project.localeCompare(b.project));
};

export const loadBatchTotals = async (): Promise<BatchTotalsRow[]> => {
  const result = await rows<{
    id: string;
    status: string;
    employees: number;
    gross_payroll: string;
    net_payroll: string;
    line_count: number;
    line_gross: string;
    line_net: string;
  }>(sql`
    SELECT b.id, b.status, b.employees, b.gross_payroll, b.net_payroll,
           COUNT(p.id)::int AS line_count,
           COALESCE(SUM(p.gross), 0) AS line_gross,
           COALESCE(SUM(p.net), 0) AS line_net
    FROM payroll_batches b
    LEFT JOIN payroll p ON p.batch_id = b.id
    GROUP BY b.id
    ORDER BY b.created_at DESC
    LIMIT 500`);
  return result.map((r) => ({
    id: r.id,
    status: r.status,
    headerEmployees: Number(r.employees),
    headerGross: Number(r.gross_payroll),
    headerNet: Number(r.net_payroll),
    lineCount: Number(r.line_count),
    lineGross: Number(r.line_gross),
    lineNet: Number(r.line_net),
  }));
};

/** Approved project batches with their period label and the hours on their lines. */
export const loadApprovedBatchHours = async () =>
  (
    await rows<{ id: string; project_code: string; period: string; line_hours: string }>(sql`
      SELECT b.id, b.project_code, b.period, COALESCE(SUM(p.hours + p.overtime), 0) AS line_hours
      FROM payroll_batches b
      LEFT JOIN payroll p ON p.batch_id = b.id
      WHERE b.status = 'approved' AND b.project_code IS NOT NULL
      GROUP BY b.id
      ORDER BY b.created_at DESC
      LIMIT 200`)
  ).map((r) => ({ id: r.id, projectCode: r.project_code, period: r.period, lineHours: Number(r.line_hours) }));

export const verifiedHours = async (projectCode: string, from: string, to: string): Promise<number> => {
  const [row] = await rows<{ hours: string }>(sql`
    SELECT COALESCE(SUM(hours), 0) AS hours FROM attendance
    WHERE project_code = ${projectCode} AND status = 'Verified' AND log_date >= ${from} AND log_date <= ${to}`);
  return Number(row?.hours ?? 0);
};

const count = async (table: string): Promise<number> => {
  const [row] = await rows<{ n: number }>(sql.raw(`SELECT COUNT(*)::int AS n FROM ${table}`));
  return Number(row?.n ?? 0);
};

export const countTable = count;

/** Rows in `table` whose project column names a project that does not exist. */
export const orphansByProject = async (table: string, idColumn: string, projectColumn: string, link: string): Promise<OrphanRow[]> => {
  const found = await rows<{ id: string | number; ref: string }>(
    sql.raw(`SELECT t.${idColumn} AS id, t.${projectColumn} AS ref FROM ${table} t
             LEFT JOIN projects p ON p.code = t.${projectColumn}
             WHERE t.${projectColumn} IS NOT NULL AND p.id IS NULL
             ORDER BY t.${idColumn} LIMIT 200`),
  );
  return found.map((r) => ({ table, id: r.id, reference: `project ${r.ref}`, link }));
};

export const inactiveMembers = async (): Promise<InactiveMemberRow[]> =>
  (
    await rows<{ id: number; project_code: string; user_name: string }>(sql`
      SELECT m.id, m.project_code, m.user_name
      FROM project_members m
      JOIN projects p ON p.code = m.project_code AND p.status NOT IN ('Completed', 'Archived', 'Cancelled')
      JOIN users u ON u.id = m.user_id
      WHERE u.is_active = false
      ORDER BY m.id LIMIT 200`)
  ).map((r) => ({ id: r.id, projectCode: r.project_code, userName: r.user_name }));

export const activeMemberCount = async (): Promise<number> => count("project_members");

/** Active (non-terminal) projects with their stored progress, for the progress check. */
export const loadActiveProjects = async () =>
  (
    await rows<{ code: string; status: string; progress: number }>(
      sql`SELECT code, status, progress FROM projects WHERE status NOT IN ('Completed', 'Archived', 'Cancelled', 'On Hold') ORDER BY code`,
    )
  ).map((r) => ({ code: r.code, status: r.status, progress: Number(r.progress) }));
