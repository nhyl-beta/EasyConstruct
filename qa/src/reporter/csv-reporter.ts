// Playwright reporter: writes qa/results/<run-timestamp>/ with one CSV per spec file, in the columns of the
// "IT Designer Module" sheet, plus summary.csv and manual-queue.csv.
//
// Mapping from tests to spec rows is by title:
//   CK-OWN-0001 ...            -> file 03 row with that Check ID
//   LC-100 step 3 ...          -> file 02 row (case LC-100, step 3)   (a test.step title, or a test title)
// Tags in the title: "@known:Bug-006" (stays Failed, does not fail the run) and "@pending-feature"
// (skipped => Not Executed, "feature not on this branch").
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult, TestStep } from "@playwright/test/reporter";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { loadChecks, loadSteps, type Check, type Step } from "../spec.js";

const QA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const RESULTS_ROOT = join(QA_DIR, "results");

export const COLUMNS = [
  "Test Case ID", "Objective", "Precondition", "Test Data", "Steps", "Test Procedure", "Expected Results",
  "Actual Results", "Status", "Remarks", "Executed by", "Executed Date", "Automation", "Role",
] as const;
type Col = (typeof COLUMNS)[number];
type Row = Record<Col, string>;
type Status = "Passed" | "Failed" | "Not Executed";

interface Outcome { status: Status; actual: string; remarks: string; known?: string; pending?: boolean }

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export const toCsv = (rows: Row[]) => [COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c] ?? "")).join(","))].join("\r\n") + "\r\n";
const mdy = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
const stamp = (d: Date) => d.toISOString().replace(/[:.]/g, "-").slice(0, 19);
const firstLine = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "").split("\n").filter((l) => l.trim()).slice(0, 2).join(" ").slice(0, 300);

export function tagsOf(title: string): { known?: string; pending: boolean } {
  const k = title.match(/@known(?::([\w-]+))?/i);
  return { known: k ? (k[1] ?? "known") : undefined, pending: /@pending-feature/i.test(title) };
}

class CsvReporter implements Reporter {
  private outcomes = new Map<string, Outcome>(); // key: CK-id or "LC-100#3"
  private started = new Date();
  private dir = "";
  private hardFailures = 0;
  private knownFailures = 0;

  onBegin(_c: FullConfig, _s: Suite) {
    this.started = new Date();
    this.dir = join(RESULTS_ROOT, stamp(this.started));
  }

  private evidence(r: TestResult): string {
    const files = r.attachments.filter((a) => a.path && /screenshot|trace/i.test(a.name + a.path)).map((a) => relative(QA_DIR, a.path!));
    return files.join("; ");
  }

  private record(key: string, t: TestCase, status: Status, actual: string, r: TestResult) {
    const title = t.titlePath().join(" ");
    const { known, pending } = tagsOf(title);
    const prev = this.outcomes.get(key);
    if (prev?.status === "Failed" && status === "Passed") return; // a failure is never overwritten by a later pass
    let remarks = status === "Failed" ? this.evidence(r) : "";
    if (known) remarks = [known, remarks].filter(Boolean).join("; ");
    if (pending && status === "Not Executed") { actual = "Feature not on this branch"; remarks = "feature not on this branch"; }
    this.outcomes.set(key, { status, actual: status === "Passed" ? "As expected" : actual, remarks, known, pending });
  }

  private walkSteps(steps: TestStep[], t: TestCase, r: TestResult) {
    for (const s of steps) {
      const m = s.title.match(/^(LC-\d+) step (\d+)/);
      if (m) this.record(`${m[1]}#${m[2]}`, t, s.error ? "Failed" : "Passed", s.error ? firstLine(s.error.message ?? "") : "", r);
      this.walkSteps(s.steps, t, r);
    }
  }

  onTestEnd(t: TestCase, r: TestResult) {
    const title = t.titlePath().join(" ");
    const ck = title.match(/\bCK-[A-Z]{2,4}-\d{4}\b/);
    const status: Status = r.status === "passed" ? "Passed" : r.status === "skipped" ? "Not Executed" : "Failed";
    const err = r.error ? firstLine(r.error.message ?? "") : r.status === "skipped" ? (t.annotations.find((a) => a.type === "skip")?.description ?? "skipped") : "";
    if (ck) this.record(ck[0], t, status, err, r);
    this.walkSteps(r.steps, t, r);
    // A failing lifecycle test whose failure happened outside a titled step: mark every step of that case that has no outcome yet.
    const lc = title.match(/\b(LC-\d+)\b/);
    if (lc && status === "Failed") {
      for (const s of loadSteps().filter((x) => x.id === lc[1])) {
        const key = `${s.id}#${s.step}`;
        if (!this.outcomes.has(key) && s.automation === "Auto") this.record(key, t, "Failed", err || "test failed before this step", r);
      }
    }
    if (status === "Failed") {
      if (tagsOf(title).known) this.knownFailures++; else this.hardFailures++;
    }
  }

  private baseRow(over: Partial<Row>): Row {
    const row = Object.fromEntries(COLUMNS.map((c) => [c, ""])) as Row;
    row["Status"] = "Not Executed";
    return Object.assign(row, over);
  }

  private apply(row: Row, o: Outcome | undefined, auto: string) {
    if (!o) return row;
    row["Status"] = o.status;
    row["Actual Results"] = o.actual;
    row["Remarks"] = o.remarks;
    if (o.status !== "Not Executed") { row["Executed by"] = "Automated (Playwright)"; row["Executed Date"] = mdy(this.started); }
    return row;
  }

  async onEnd(_r: FullResult) {
    mkdirSync(this.dir, { recursive: true });
    const checks = loadChecks();
    const steps = loadSteps();

    const rows03: Row[] = checks.map((c: Check) =>
      this.apply(this.baseRow({
        "Test Case ID": c.id, Objective: `${c.page} — ${c.type}`, "Test Procedure": c.procedure, "Expected Results": c.expected,
        Automation: c.automation, Role: c.role,
      }), this.outcomes.get(c.id), c.automation));

    const manual: Row[] = [];
    const rows02: Row[] = steps.map((s: Step) => {
      const row = this.baseRow({
        "Test Case ID": s.id, Objective: s.objective, Precondition: s.precondition, "Test Data": s.testData, Steps: String(s.step),
        "Test Procedure": s.procedure, "Expected Results": s.expected, Automation: s.automation, Role: s.actor,
      });
      this.apply(row, this.outcomes.get(`${s.id}#${s.step}`), s.automation);
      if (s.automation !== "Auto" && row["Status"] === "Not Executed") {
        row["Remarks"] = `${s.automation}: human must check — ${s.expected}`;
        manual.push({ ...row });
      }
      return row;
    });

    writeFileSync(join(this.dir, "03_role_page_checks.csv"), toCsv(rows03));
    writeFileSync(join(this.dir, "02_lifecycle_test_cases.csv"), toCsv(rows02));
    writeFileSync(join(this.dir, "manual-queue.csv"), toCsv(manual));
    writeFileSync(join(this.dir, "summary.csv"), this.summary(rows03, rows02, steps));
    // Keep a stable pointer to the latest run for qa:findings.
    mkdirSync(RESULTS_ROOT, { recursive: true });
    writeFileSync(join(RESULTS_ROOT, "latest.txt"), this.dir + "\n");
    console.log(`\nQA results: ${relative(process.cwd(), this.dir) || this.dir}  (hard failures: ${this.hardFailures}, known: ${this.knownFailures})`);

    // Tests tagged @known stay Failed in the CSV but must not break the exit code.
    if (this.hardFailures === 0 && this.knownFailures > 0) return { status: "passed" as const };
    return undefined;
  }

  private summary(rows03: Row[], rows02: Row[], steps: Step[]): string {
    type Tally = { Passed: number; Failed: number; "Not Executed": number; Known: number; "Pending-feature": number };
    const mk = (): Tally => ({ Passed: 0, Failed: 0, "Not Executed": 0, Known: 0, "Pending-feature": 0 });
    const groups = new Map<string, Tally>();
    const add = (g: string, row: Row) => {
      const t = groups.get(g) ?? mk(); groups.set(g, t);
      const remarks = row["Remarks"].toLowerCase();
      if (row["Status"] === "Failed" && /(^|; )(bug-?\d+|known)/i.test(row["Remarks"])) t.Known++;
      else if (row["Status"] === "Not Executed" && remarks.includes("feature not on this branch")) t["Pending-feature"]++;
      else t[row["Status"] as Status]++;
    };
    const stageOf = new Map(steps.map((s) => [s.id, s.stage]));
    for (const r of rows02) { add(`stage: ${stageOf.get(r["Test Case ID"]) ?? "?"}`, r); add(`role: ${r["Role"]}`, r); }
    for (const r of rows03) { add("stage: Role-page checks (file 03)", r); add(`role: ${r["Role"]}`, r); }
    const lines = ["Group,Passed,Failed,Not Executed,Known,Pending-feature"];
    for (const [g, t] of [...groups].sort()) lines.push([csvCell(g), t.Passed, t.Failed, t["Not Executed"], t.Known, t["Pending-feature"]].join(","));
    return lines.join("\r\n") + "\r\n";
  }
}

export default CsvReporter;
