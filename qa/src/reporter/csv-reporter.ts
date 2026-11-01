// Playwright reporter: writes qa/results/<run-timestamp>/ with one CSV per spec file, in the columns of the
// "IT Designer Module" test sheet, plus summary.csv and manual-queue.csv.
//
// Tests are tied to spec rows by title tokens:
//   CK-OWN-0001          -> file 03 row (Check ID)               MX-OWN-03 -> file 01 cell (page x role)
//   LC-100 step 3        -> file 02 row (a test.step title)
//   [api] / [ui]         -> which part of a check this test covers. A check is Passed only when every part it
//                           needs has run and passed (DENIED / READ-ONLY need api + ui; NAVIGATE / CONTENT need ui;
//                           ACTION-* need api). A failed part always makes the check Failed.
//   @known:Bug-006       -> stays Failed in the CSV, does not fail the run
//   @pending-feature     -> skipped => Not Executed, "feature not on this branch"
// A test can add `{ type: "remark", description }` annotations; they land in Remarks.
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult, TestStep } from "@playwright/test/reporter";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { levelOf, loadChecks, loadMatrix, loadSteps, type Check, type Step } from "../spec.js";
import { mxId, ROLES } from "../roles.js";

const QA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const RESULTS_ROOT = join(QA_DIR, "results");

export const COLUMNS = [
  "Test Case ID", "Objective", "Precondition", "Test Data", "Steps", "Test Procedure", "Expected Results",
  "Actual Results", "Status", "Remarks", "Executed by", "Executed Date", "Automation", "Role",
] as const;
type Col = (typeof COLUMNS)[number];
type Row = Record<Col, string>;
type Status = "Passed" | "Failed" | "Not Executed";
type PartStatus = "Passed" | "Failed" | "Skipped";

interface Part { status: PartStatus; actual: string }
interface Outcome { parts: Map<string, Part>; remarks: Set<string>; known?: string; pending: boolean }

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export const toCsv = (rows: Row[]) => [COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c] ?? "")).join(","))].join("\r\n") + "\r\n";
const mdy = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
const stamp = (d: Date) => d.toISOString().replace(/[:.]/g, "-").slice(0, 19);
const clean = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
const firstLine = (s: string) => clean(s).split("\n").filter((l) => l.trim()).slice(0, 2).join(" ").slice(0, 300);

export function tagsOf(title: string): { known?: string; pending: boolean } {
  const k = title.match(/@known(?::([\w-]+))?/i);
  return { known: k ? (k[1] ?? "known") : undefined, pending: /@pending-feature/i.test(title) };
}

/** Parts a check needs before it can be called Passed. */
export function requiredParts(type: string): string[] {
  if (type === "DENIED" || type === "READ-ONLY") return ["api", "ui"];
  if (type.startsWith("ACTION")) return ["api"];
  return ["ui"];
}

/** Steps the team already tracks as defects (shown in Remarks; the step itself is judged normally). */
const KNOWN_STEPS: Record<string, string> = { "LC-204#2": "Bug 007 (document preview/download routing)", "LC-202#2": "Bug 006 (workflow dashboard not updating live)", "LC-202#1": "Bug 006 (workflow dashboard not updating live)" };

class CsvReporter implements Reporter {
  private outcomes = new Map<string, Outcome>(); // CK-id | MX-id | "LC-100#3"
  private started = new Date();
  private dir = "";
  private hardFailures = 0;
  private knownFailures = 0;

  onBegin(_c: FullConfig, _s: Suite) {
    this.started = new Date();
    this.dir = join(RESULTS_ROOT, stamp(this.started));
  }

  private evidence(r: TestResult): string {
    return r.attachments.filter((a) => a.path && /screenshot|trace/i.test(a.name + a.path)).map((a) => relative(QA_DIR, a.path!)).join("; ");
  }

  private record(key: string, part: string, t: TestCase, status: PartStatus, actual: string, r: TestResult) {
    const title = t.titlePath().join(" ");
    const { known, pending } = tagsOf(title);
    const o: Outcome = this.outcomes.get(key) ?? { parts: new Map(), remarks: new Set<string>(), pending };
    this.outcomes.set(key, o);
    if (known) o.known = known;
    if (pending) o.pending = true;
    const prev = o.parts.get(part);
    if (prev?.status === "Failed") return;
    o.parts.set(part, { status, actual });
    if (status === "Failed") { const ev = this.evidence(r); if (ev) o.remarks.add(ev); }
    for (const a of t.annotations) if (a.type === "remark" && a.description) o.remarks.add(a.description);
    if (status === "Skipped" && actual) o.remarks.add(actual);
  }

  private walkSteps(steps: TestStep[], t: TestCase, r: TestResult) {
    for (const s of steps) {
      const m = s.title.match(/^(LC-\d+) step (\d+)/);
      if (m) this.record(`${m[1]}#${m[2]}`, "main", t, s.error ? "Failed" : "Passed", s.error ? firstLine(s.error.message ?? "") : "", r);
      this.walkSteps(s.steps, t, r);
    }
  }

  onTestEnd(t: TestCase, r: TestResult) {
    const title = t.titlePath().join(" ");
    const part = title.match(/\[(api|ui)\]/)?.[1] ?? "main";
    const status: PartStatus = r.status === "passed" ? "Passed" : r.status === "skipped" ? "Skipped" : "Failed";
    const err = r.error ? firstLine(r.error.message ?? "") : r.status === "skipped" ? (t.annotations.find((a) => a.type === "skip")?.description ?? "skipped") : "";
    const ids = [...title.matchAll(/\b(?:CK-[A-Z]{2,4}-\d{4}|MX-[A-Z]{2,4}-\d{2,3})\b/g)].map((m) => m[0]);
    for (const id of ids) this.record(id, part, t, status, err, r);
    this.walkSteps(r.steps, t, r);
    for (const a of t.annotations) if (a.type === "finding" && a.description) { try { this.rawFindings.push(JSON.parse(a.description)); } catch { /* not JSON */ } }
    const lc = title.match(/\b(LC-\d+)\b/);
    if (lc && status === "Skipped") {
      if (tagsOf(title).pending) this.pendingCases.add(lc[1]!);
      const stepNo = title.match(/\bLC-\d+ step (\d+)/)?.[1];
      this.skipReasons.set(stepNo ? `${lc[1]}#${stepNo}` : lc[1]!, tagsOf(title).pending ? "feature not on this branch" : err);
    }
    // A test that fails outside any titled step (setup crash) fails every Auto step of its case. A test that ran its steps
    // keeps per-step results, and steps it never ran stay "not written yet".
    if (lc && status === "Failed") {
      const steps = loadSteps().filter((x) => x.id === lc[1]);
      const ranSome = steps.some((x) => this.outcomes.has(`${x.id}#${x.step}`));
      if (!ranSome) for (const s of steps) if (s.automation === "Auto") this.record(`${s.id}#${s.step}`, "main", t, "Failed", err || "test failed before any step ran", r);
    }
    if (status === "Failed") { if (tagsOf(title).known) this.knownFailures++; else this.hardFailures++; }
    this.flush();
  }

  private baseRow(over: Partial<Row>): Row {
    const row = Object.fromEntries(COLUMNS.map((c) => [c, ""])) as Row;
    row["Status"] = "Not Executed";
    return Object.assign(row, over);
  }

  private apply(row: Row, o: Outcome | undefined, need: string[]) {
    if (!o) return row;
    const parts = [...o.parts.entries()];
    const failed = parts.filter(([, p]) => p.status === "Failed");
    const okSet = new Set(parts.filter(([, p]) => p.status === "Passed").map(([k]) => k));
    const satisfied = okSet.has("main") || need.every((n) => okSet.has(n));
    const remarks = [...(o.known ? [o.known] : []), ...o.remarks];
    if (failed.length) {
      row["Status"] = "Failed";
      row["Actual Results"] = failed.map(([k, p]) => (need.length > 1 || k !== "main" ? `[${k}] ` : "") + p.actual).join(" | ");
    } else if (satisfied) {
      row["Status"] = "Passed";
      row["Actual Results"] = "As expected";
    } else if (parts.some(([, p]) => p.status === "Passed")) {
      row["Status"] = "Not Executed";
      row["Actual Results"] = "";
      remarks.push(`partly run: ${[...okSet].join("+")} passed; still needs ${need.filter((n) => !okSet.has(n)).join("+")}`);
    } else {
      row["Status"] = "Not Executed"; // every part skipped
    }
    if (o.pending && row["Status"] === "Not Executed") { row["Actual Results"] = "Feature not on this branch"; remarks.length = 0; remarks.push("feature not on this branch"); }
    row["Remarks"] = remarks.join("; ");
    if (row["Status"] !== "Not Executed") { row["Executed by"] = "Automated (Playwright)"; row["Executed Date"] = mdy(this.started); }
    return row;
  }

  private rawFindings: unknown[] = [];
  private pendingCases = new Set<string>();
  private skipReasons = new Map<string, string>();
  private lastFlush = 0;
  /** Results are written as the run goes, so an interrupted or very long run keeps what it has. */
  private flush(final = false) {
    if (!final && Date.now() - this.lastFlush < 20_000) return;
    this.lastFlush = Date.now();
    this.write();
  }

  private write() {
    mkdirSync(this.dir, { recursive: true });
    const checks = loadChecks();
    const steps = loadSteps();
    const matrix = loadMatrix();

    const rows03: Row[] = checks.map((c: Check) => {
      const row = this.apply(this.baseRow({
        "Test Case ID": c.id, Objective: `${c.page} — ${c.type}`, "Test Procedure": c.procedure, "Expected Results": c.expected,
        Automation: c.automation, Role: c.role,
      }), this.outcomes.get(c.id), requiredParts(c.type));
      // A check written for the draft matrix can contradict the owner's decisions of 2026-11-01: say so instead of leaving it blank.
      const lvl = levelOf(c.role, c.page);
      const superseded = (c.type === "DENIED" && lvl !== "Deny") || (c.type === "READ-ONLY" && ["Deny", "Full", "Allowed"].includes(lvl)) || ((c.type === "NAVIGATE" || c.type === "CONTENT") && lvl === "Deny");
      if (superseded && row["Status"] === "Not Executed") row["Remarks"] = [row["Remarks"], `superseded by owner decision 2026-11-01: the matrix now says '${lvl}' for this role and page`].filter(Boolean).join("; ");
      return row;
    });

    const rows01: Row[] = [];
    matrix.forEach((m, i) => {
      for (const r of ROLES) {
        const level = m.byRole[r.label];
        if (!level) continue;
        rows01.push(this.apply(this.baseRow({
          "Test Case ID": mxId(r.code, i + 1), Objective: m.page, "Test Data": m.notes,
          "Test Procedure": m.isAction ? `Call the action's API as ${r.label}` : `Call the page's API as ${r.label} (read, write probe, and with no token)`,
          "Expected Results": `${level}${m.isAction ? "" : level === "Full" ? ": read 2xx, write allowed" : level === "View only" ? ": read 2xx, write 403" : ": 403; no token 401"}`,
          Automation: m.automation, Role: r.label,
        }), this.outcomes.get(mxId(r.code, i + 1)), ["api"]));
      }
    });

    const manual: Row[] = [];
    const rows02: Row[] = steps.map((s: Step) => {
      const row = this.baseRow({
        "Test Case ID": s.id, Objective: s.objective, Precondition: s.precondition, "Test Data": s.testData, Steps: String(s.step),
        "Test Procedure": s.procedure, "Expected Results": s.expected, Automation: s.automation, Role: s.actor,
      });
      this.apply(row, this.outcomes.get(`${s.id}#${s.step}`), []);
      const bug = KNOWN_STEPS[`${s.id}#${s.step}`];
      if (bug) row["Remarks"] = [row["Remarks"], `known defect ${bug}`].filter(Boolean).join("; ");
      if (s.automation === "Auto" && !this.outcomes.has(`${s.id}#${s.step}`) && row["Status"] === "Not Executed") {
        const why = this.skipReasons.get(`${s.id}#${s.step}`) ?? this.skipReasons.get(s.id);
        row["Remarks"] = why ?? "automation not written yet";
        if (this.pendingCases.has(s.id) && why === "feature not on this branch") row["Actual Results"] = "Feature not on this branch";
      }
      if (s.automation !== "Auto" && row["Status"] === "Not Executed") {
        row["Remarks"] = `${s.automation}: human must check — ${s.expected}`;
        manual.push({ ...row });
      }
      return row;
    });

    writeFileSync(join(this.dir, "01_access_matrix.csv"), toCsv(rows01));
    writeFileSync(join(this.dir, "02_lifecycle_test_cases.csv"), toCsv(rows02));
    writeFileSync(join(this.dir, "03_role_page_checks.csv"), toCsv(rows03));
    writeFileSync(join(this.dir, "manual-queue.csv"), toCsv(manual));
    if (this.rawFindings.length) writeFileSync(join(this.dir, "crawl-findings.json"), JSON.stringify(this.rawFindings, null, 1));
    writeFileSync(join(this.dir, "summary.csv"), this.summary(rows01, rows02, rows03, steps));
    mkdirSync(RESULTS_ROOT, { recursive: true });
    writeFileSync(join(RESULTS_ROOT, "latest.txt"), this.dir + "\n");
  }

  async onEnd(_r: FullResult) {
    this.flush(true);
    console.log(`\nQA results: ${this.dir}  (hard failures: ${this.hardFailures}, known: ${this.knownFailures})`);
    if (this.hardFailures === 0 && this.knownFailures > 0) return { status: "passed" as const };
    return undefined;
  }

  async onExit() { this.flush(true); }

  private summary(rows01: Row[], rows02: Row[], rows03: Row[], steps: Step[]): string {
    type Tally = { Passed: number; Failed: number; "Not Executed": number; Known: number; "Pending-feature": number };
    const mk = (): Tally => ({ Passed: 0, Failed: 0, "Not Executed": 0, Known: 0, "Pending-feature": 0 });
    const groups = new Map<string, Tally>();
    const add = (g: string, row: Row) => {
      const t = groups.get(g) ?? mk(); groups.set(g, t);
      if (row["Status"] === "Failed" && /(^|; )(bug-?\d+|known)/i.test(row["Remarks"])) t.Known++;
      else if (row["Status"] === "Not Executed" && row["Remarks"].toLowerCase().includes("feature not on this branch")) t["Pending-feature"]++;
      else t[row["Status"] as Status]++;
    };
    const stageOf = new Map(steps.map((s) => [s.id, s.stage]));
    for (const r of rows02) { add(`stage: ${stageOf.get(r["Test Case ID"]) ?? "?"}`, r); add(`role: ${r["Role"]}`, r); }
    for (const r of rows03) { add("stage: Role-page checks (file 03)", r); add(`role: ${r["Role"]}`, r); }
    for (const r of rows01) { add("stage: Access matrix (file 01)", r); add(`role: ${r["Role"]}`, r); }
    const lines = ["Group,Passed,Failed,Not Executed,Known,Pending-feature"];
    for (const [g, t] of [...groups].sort()) lines.push([csvCell(g), t.Passed, t.Failed, t["Not Executed"], t.Known, t["Pending-feature"]].join(","));
    return lines.join("\r\n") + "\r\n";
  }
}

export default CsvReporter;
