// apps/api/src/reconciliation/checks.ts: pure, no I/O (objectives fix 1.3)
//
// Cross-checks that the numbers the system stores agree with the records they
// come from. Each check takes plain rows and returns pass or fail with the
// mismatching records, the first of which carries a link. Read-only: nothing
// here repairs anything, because a mismatch needs a person to decide which side
// is right.

export interface Mismatch {
  /** What the record is, in words (a project code, a batch id). */
  subject: string;
  detail: string;
  link: string;
}

export interface CheckResult {
  key: string;
  title: string;
  /** What is compared with what. */
  basis: string;
  status: "pass" | "fail";
  /** How many records were compared. */
  checked: number;
  /** Total mismatches (the list below is capped). */
  mismatchCount: number;
  mismatches: Mismatch[];
  /** Link to the first mismatching record, if any. */
  firstLink: string | null;
}

export const MAX_LISTED = 20;
const php = (n: number) => `₱${n.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;

const result = (key: string, title: string, basis: string, checked: number, mismatches: Mismatch[]): CheckResult => ({
  key,
  title,
  basis,
  status: mismatches.length === 0 ? "pass" : "fail",
  checked,
  mismatchCount: mismatches.length,
  mismatches: mismatches.slice(0, MAX_LISTED),
  firstLink: mismatches[0]?.link ?? null,
});

const projectLink = (code: string) => `/projects/${encodeURIComponent(code)}`;

// 1. Stored project progress against what the lifecycle rules compute.
export interface ProgressRow {
  code: string;
  status: string;
  stored: number;
  expected: number;
}

export const checkProgress = (rows: ProgressRow[]): CheckResult =>
  result(
    "project-progress",
    "Project progress matches tasks and milestones",
    "The progress stored on each active project against the figure the lifecycle rules work out from its tasks, milestones and gate checks.",
    rows.length,
    rows
      .filter((r) => r.stored !== r.expected)
      .map((r) => ({
        subject: r.code,
        detail: `Stored progress is ${r.stored}% but its tasks and milestones give ${r.expected}% (${r.status}).`,
        link: projectLink(r.code),
      })),
  );

// 2. Budget actuals against approved expenses plus approved payroll.
export interface BudgetRow {
  project: string;
  actual: number;
  approvedExpenses: number;
  approvedPayroll: number;
}

const MONEY_TOLERANCE = 1;

export const checkBudgetActual = (rows: BudgetRow[]): CheckResult =>
  result(
    "budget-actual",
    "Budget actuals match expenses and payroll",
    "Per project: the actual spend on its budget lines against approved expenses plus approved payroll (employer cost). Tolerance ₱1.",
    rows.length,
    rows
      .map((r) => ({ r, expected: r.approvedExpenses + r.approvedPayroll }))
      .filter(({ r, expected }) => Math.abs(r.actual - expected) > MONEY_TOLERANCE)
      .map(({ r, expected }) => ({
        subject: r.project,
        detail: `Budget actual is ${php(r.actual)} but approved expenses (${php(r.approvedExpenses)}) plus approved payroll (${php(r.approvedPayroll)}) make ${php(expected)}; difference ${php(r.actual - expected)}.`,
        link: "/budget",
      })),
  );

// 3. A payroll batch's header against its own lines.
export interface BatchTotalsRow {
  id: string;
  status: string;
  headerEmployees: number;
  headerGross: number;
  headerNet: number;
  lineCount: number;
  lineGross: number;
  lineNet: number;
}

export const checkBatchTotals = (rows: BatchTotalsRow[]): CheckResult =>
  result(
    "payroll-batch-totals",
    "Payroll batch totals match their lines",
    "Each batch's employee count, gross and net against the sum of its lines. Tolerance ₱0.01.",
    rows.length,
    rows.flatMap((r) => {
      const problems: string[] = [];
      if (r.headerEmployees !== r.lineCount) problems.push(`${r.headerEmployees} employees on the batch but ${r.lineCount} lines`);
      if (Math.abs(r.headerGross - r.lineGross) > 0.01) problems.push(`gross ${php(r.headerGross)} vs lines ${php(r.lineGross)}`);
      if (Math.abs(r.headerNet - r.lineNet) > 0.01) problems.push(`net ${php(r.headerNet)} vs lines ${php(r.lineNet)}`);
      return problems.length ? [{ subject: r.id, detail: `${r.status} batch: ${problems.join("; ")}.`, link: "/payroll" }] : [];
    }),
  );

// 4. Payroll hours against verified attendance for the period.
export interface BatchHoursRow {
  id: string;
  projectCode: string;
  period: string;
  lineHours: number;
  verifiedHours: number;
}

const HOURS_TOLERANCE = 1;

export const checkBatchHours = (rows: BatchHoursRow[]): CheckResult =>
  result(
    "payroll-vs-attendance",
    "Payroll hours match verified attendance",
    "For approved batches: regular plus overtime hours on the lines against verified attendance hours on that project in the period. Tolerance 1 hour. HR may adjust hours, so a difference is a prompt to check.",
    rows.length,
    rows
      .filter((r) => Math.abs(r.lineHours - r.verifiedHours) > HOURS_TOLERANCE)
      .map((r) => ({
        subject: r.id,
        detail: `${r.projectCode}, ${r.period}: the lines pay ${r.lineHours} hours; verified attendance supports ${r.verifiedHours}.`,
        link: "/payroll",
      })),
  );

// 5. Records that point at something that is not there.
export interface OrphanRow {
  table: string;
  id: string | number;
  /** The missing thing, for the message (a project code, a user id). */
  reference: string;
  link: string;
}

export const checkOrphans = (key: string, title: string, basis: string, checked: number, rows: OrphanRow[]): CheckResult =>
  result(
    key,
    title,
    basis,
    checked,
    rows.map((r) => ({
      subject: `${r.table} #${r.id}`,
      detail: `Refers to ${r.reference}, which does not exist.`,
      link: r.link,
    })),
  );

/** Staffed people whose account has been deactivated. They still count as staff on the project. */
export interface InactiveMemberRow {
  id: number;
  projectCode: string;
  userName: string;
}

export const checkInactiveMembers = (checked: number, rows: InactiveMemberRow[]): CheckResult =>
  result(
    "members-without-active-user",
    "Project members have active accounts",
    "Every person staffed on a project against the user account they point to; a deactivated account can no longer sign in.",
    checked,
    rows.map((r) => ({
      subject: `${r.projectCode}: ${r.userName}`,
      detail: "This person is staffed on the project but their account is deactivated.",
      link: projectLink(r.projectCode),
    })),
  );

export const summarize = (checks: CheckResult[]) => ({
  passed: checks.every((c) => c.status === "pass"),
  failing: checks.filter((c) => c.status === "fail").length,
  total: checks.length,
});
