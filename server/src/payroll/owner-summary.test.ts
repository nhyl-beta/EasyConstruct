import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Importing the service pulls in the db module, which only builds a lazy pool
// (no connection until a query runs) but needs the variable to be set.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const {
  buildOwnerSummary,
  sharesOf,
  clampMonths,
  PENDING_ALERT_DAYS,
  OVERTIME_ALERT_RATIO,
  COST_SPIKE_PCT,
} = await import("./owner-summary.service.js");
type Row = import("./owner-summary.repository.js").OwnerBatchRow;

const NOW = new Date("2026-10-08T12:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

let seq = 0;
const batch = (o: Partial<Row> = {}): Row => ({
  id: `PAY-T${++seq}`,
  status: "approved",
  projectCode: "P1",
  projectName: "Project One",
  group: "Crew A",
  period: "Week",
  employees: 10,
  overtimeHours: 0,
  gross: 1000,
  deductions: 100,
  net: 900,
  employerCost: 1200,
  createdAt: ago(1),
  submittedAt: null,
  reviewedAt: null,
  linePeriodEnd: "2026-09-27",
  lineRegularHours: 400,
  sss: 10,
  employerSss: 20,
  philhealth: 11,
  employerPhilhealth: 11,
  pagibig: 2,
  employerPagibig: 2,
  employerEc: 1,
  ...o,
});

describe("aggregation maths", () => {
  const rows = [
    batch({ linePeriodEnd: "2026-09-13", employerCost: 1000, gross: 800, net: 700, deductions: 100, overtimeHours: 4 }),
    batch({ linePeriodEnd: "2026-09-20", employerCost: 1100, gross: 900, net: 790, deductions: 110, overtimeHours: 6 }),
    batch({ linePeriodEnd: "2026-09-27", employerCost: 1320, gross: 1000, net: 880, deductions: 120, overtimeHours: 8 }),
    batch({ linePeriodEnd: "2026-09-27", projectCode: "P2", projectName: "Two", employerCost: 680, gross: 500, net: 450, deductions: 50, overtimeHours: 2 }),
  ];
  const s = buildOwnerSummary(rows, { now: NOW });

  test("totals sum approved batches", () => {
    assert.equal(s.totals.approvedBatches, 4);
    assert.equal(s.totals.approvedEmployeeCount, 40);
    assert.equal(s.totals.gross, 3200);
    assert.equal(s.totals.deductions, 380);
    assert.equal(s.totals.net, 2820);
    assert.equal(s.totals.laborCost, 4100);
    assert.equal(s.totals.overtimeHours, 20);
  });

  test("latest period combines its batches and compares with the previous one", () => {
    assert.equal(s.latest?.periodEnd, "2026-09-27");
    assert.equal(s.latest?.laborCost, 2000);
    assert.equal(s.latest?.gross, 1500);
    assert.equal(s.latest?.employees, 20);
    // 2000 vs 1100
    assert.equal(s.latest?.vsPreviousPct, 81.8);
  });

  test("trend is oldest to newest", () => {
    assert.deepEqual(s.trend.map((t) => t.periodEnd), ["2026-09-13", "2026-09-20", "2026-09-27"]);
    assert.deepEqual(s.trend.map((t) => t.laborCost), [1000, 1100, 2000]);
  });

  test("statutory comes from the stored sums", () => {
    assert.deepEqual(s.statutory.sss, { employee: 40, employer: 80 });
    assert.deepEqual(Object.keys(s.statutory).sort(), ["ec", "pagibig", "philhealth", "sss"]);
    assert.equal(s.statutory.ec, 4);
  });

  test("vsPreviousPct is null with a single period", () => {
    assert.equal(buildOwnerSummary([batch()], { now: NOW }).latest?.vsPreviousPct, null);
  });
});

describe("top-5 + Other", () => {
  const costs = [900, 800, 700, 600, 500, 300, 200];
  const rows = costs.map((c, i) => batch({ projectCode: `P${i}`, projectName: `Proj ${i}`, group: `G${i}`, employerCost: c }));
  const s = buildOwnerSummary(rows, { now: NOW });

  test("keeps five and folds the rest into Other", () => {
    assert.equal(s.byProject.length, 6);
    assert.equal(s.byProject.at(-1)?.projectName, "Other");
    assert.equal(s.byProject.at(-1)?.laborCost, 500);
    assert.equal(s.byGroup.at(-1)?.group, "Other");
  });

  test("shares sum to exactly 100", () => {
    const total = (xs: { share: number }[]) => Math.round(xs.reduce((a, x) => a + x.share, 0) * 10) / 10;
    assert.equal(total(s.byProject), 100);
    assert.equal(total(s.byGroup), 100);
  });

  test("no Other row when five or fewer", () => {
    const small = buildOwnerSummary(rows.slice(0, 3), { now: NOW });
    assert.equal(small.byProject.length, 3);
  });

  test("sharesOf handles awkward thirds and zero", () => {
    assert.equal(Math.round(sharesOf([1, 1, 1]).reduce((a, b) => a + b, 0) * 10) / 10, 100);
    assert.deepEqual(sharesOf([0, 0]), [0, 0]);
  });

  test("a batch without a project is grouped as unassigned", () => {
    const x = buildOwnerSummary([batch({ projectCode: null, projectName: null })], { now: NOW });
    assert.equal(x.byProject[0]?.projectCode, "UNASSIGNED");
  });
});

describe("only approved batches count as cost", () => {
  const rows = [
    batch({ employerCost: 1000 }),
    batch({ status: "draft", employerCost: 5000 }),
    batch({ status: "pending", employerCost: 7000, submittedAt: ago(1) }),
    batch({ status: "revision_required", employerCost: 9000 }),
  ];
  const s = buildOwnerSummary(rows, { now: NOW });

  test("totals and breakdowns ignore pipeline batches", () => {
    assert.equal(s.totals.laborCost, 1000);
    assert.equal(s.latest?.laborCost, 1000);
    assert.equal(s.byProject.reduce((a, p) => a + p.laborCost, 0), 1000);
    assert.equal(s.byGroup.reduce((a, p) => a + p.laborCost, 0), 1000);
  });

  test("pipeline reports them separately", () => {
    assert.deepEqual(s.pipeline.draft, { count: 1, amount: 5000 });
    assert.deepEqual(s.pipeline.pending, { count: 1, amount: 7000, oldestDays: 1 });
    assert.deepEqual(s.pipeline.revisionRequired, { count: 1, amount: 9000 });
  });

  test("approved this month uses the review date", () => {
    const r = buildOwnerSummary(
      [batch({ employerCost: 100, reviewedAt: ago(2) }), batch({ employerCost: 50, reviewedAt: ago(40) })],
      { now: NOW },
    );
    assert.deepEqual(r.pipeline.approvedThisMonth, { count: 1, amount: 100 });
  });
});

describe("empty state", () => {
  test("no batches at all", () => {
    const s = buildOwnerSummary([], { now: NOW });
    assert.equal(s.latest, null);
    assert.equal(s.totals.laborCost, 0);
    assert.equal(s.totals.approvedBatches, 0);
    assert.deepEqual(s.trend, []);
    assert.deepEqual(s.byProject, []);
    assert.deepEqual(s.byGroup, []);
    assert.deepEqual(s.attention, []);
    assert.equal(s.pipeline.pending.oldestDays, 0);
    assert.equal(s.statutory.sss.employee, 0);
  });

  test("only pipeline batches: no cost, no latest", () => {
    const s = buildOwnerSummary([batch({ status: "draft" })], { now: NOW });
    assert.equal(s.latest, null);
    assert.equal(s.pipeline.draft.count, 1);
  });
});

describe("ordering", () => {
  test("by derived period end, never by the period label", () => {
    const rows = [
      // Labels sort the opposite way to their real dates.
      batch({ period: "Aaa late", linePeriodEnd: "2026-09-27", employerCost: 3000 }),
      batch({ period: "Zzz early", linePeriodEnd: "2026-09-06", employerCost: 1000 }),
    ];
    const s = buildOwnerSummary(rows, { now: NOW });
    assert.deepEqual(s.trend.map((t) => t.label), ["Zzz early", "Aaa late"]);
    assert.equal(s.latest?.period, "Aaa late");
    assert.equal(s.latest?.vsPreviousPct, 200);
  });

  test("falls back to createdAt when a batch has no dated lines", () => {
    const s = buildOwnerSummary(
      [batch({ linePeriodEnd: null, createdAt: new Date("2026-10-01T00:00:00Z") }), batch({ linePeriodEnd: "2026-09-27" })],
      { now: NOW },
    );
    assert.deepEqual(s.trend.map((t) => t.periodEnd), ["2026-09-27", "2026-10-01"]);
  });

  test("months clamps and limits the trend window", () => {
    assert.equal(clampMonths(undefined), 6);
    assert.equal(clampMonths("abc"), 6);
    assert.equal(clampMonths(0), 1);
    assert.equal(clampMonths(99), 24);
    const rows = [
      batch({ linePeriodEnd: "2026-01-04" }),
      batch({ linePeriodEnd: "2026-09-27" }),
    ];
    assert.equal(buildOwnerSummary(rows, { now: NOW, months: 6 }).trend.length, 1);
    assert.equal(buildOwnerSummary(rows, { now: NOW, months: 12 }).trend.length, 2);
  });
});

describe("attention rules", () => {
  const kinds = (rows: Row[]) => buildOwnerSummary(rows, { now: NOW }).attention.map((a) => a.kind);

  test("pending_too_long: at the threshold no, just beyond yes", () => {
    const at = batch({ status: "pending", submittedAt: ago(PENDING_ALERT_DAYS) });
    const beyond = batch({ status: "pending", submittedAt: new Date(ago(PENDING_ALERT_DAYS).getTime() - 60_000) });
    assert.deepEqual(kinds([at]), []);
    assert.deepEqual(kinds([beyond]), ["pending_too_long"]);
  });

  test("pending falls back to createdAt when never submitted", () => {
    assert.deepEqual(kinds([batch({ status: "pending", submittedAt: null, createdAt: ago(10) })]), ["pending_too_long"]);
  });

  test("pending_too_long escalates to critical at twice the threshold", () => {
    const [a] = buildOwnerSummary([batch({ status: "pending", submittedAt: ago(PENDING_ALERT_DAYS * 2 + 1) })], { now: NOW }).attention;
    assert.equal(a?.severity, "critical");
  });

  test("revision_required: any such batch", () => {
    assert.deepEqual(kinds([batch({ status: "revision_required" })]), ["revision_required"]);
    assert.deepEqual(kinds([batch({ status: "draft" })]), []);
  });

  test("overtime_high: at the ratio no, just beyond yes", () => {
    const regular = 400;
    assert.deepEqual(kinds([batch({ lineRegularHours: regular, overtimeHours: regular * OVERTIME_ALERT_RATIO })]), []);
    assert.deepEqual(
      kinds([batch({ lineRegularHours: regular, overtimeHours: regular * OVERTIME_ALERT_RATIO + 0.5 })]),
      ["overtime_high"],
    );
  });

  test("overtime_high ignores batches without line hours", () => {
    assert.deepEqual(kinds([batch({ lineRegularHours: 0, overtimeHours: 50 })]), []);
  });

  test("cost_spike: at the threshold no, just beyond yes", () => {
    const prev = batch({ linePeriodEnd: "2026-09-20", employerCost: 1000 });
    const at = batch({ linePeriodEnd: "2026-09-27", employerCost: 1000 * (1 + COST_SPIKE_PCT / 100) });
    const beyond = batch({ linePeriodEnd: "2026-09-27", employerCost: 1000 * (1 + COST_SPIKE_PCT / 100) + 5 });
    assert.deepEqual(kinds([prev, at]), []);
    assert.deepEqual(kinds([prev, beyond]), ["cost_spike"]);
  });

  test("no_project: approved batch without a project code", () => {
    assert.deepEqual(kinds([batch({ projectCode: null, projectName: null })]), ["no_project"]);
    assert.deepEqual(kinds([batch({ projectCode: "", projectName: null })]), ["no_project"]);
    // Only approved batches are flagged.
    assert.deepEqual(kinds([batch({ status: "draft", projectCode: null, projectName: null })]), []);
  });

  test("nothing applies: empty array", () => {
    assert.deepEqual(kinds([batch()]), []);
  });

  test("critical items come first", () => {
    const s = buildOwnerSummary(
      [batch({ status: "revision_required" }), batch({ status: "pending", submittedAt: ago(30) })],
      { now: NOW },
    );
    assert.equal(s.attention[0]?.severity, "critical");
  });
});

describe("no individual employee data", () => {
  test("the serialized response has no employee identifier keys", () => {
    const s = buildOwnerSummary(
      [batch(), batch({ status: "pending", submittedAt: ago(9) }), batch({ status: "revision_required" })],
      { now: NOW },
    );
    const json = JSON.stringify(s);
    assert.doesNotMatch(json, /"(empId|employeeId|name|initials|role)"\s*:/);
  });

  test("the repository never selects an employee identity column", () => {
    const src = fs.readFileSync(new URL("./owner-summary.repository.ts", import.meta.url), "utf8");
    for (const col of ["payroll.empId", "payroll.name", "payroll.initials", "payroll.role"]) {
      assert.ok(!src.includes(col), `${col} must not be selected`);
    }
  });
});

describe("role guards on the payroll router", () => {
  process.env.JWT_SECRET ??= "test";
  type Layer = {
    route?: { path: string; methods: Record<string, boolean>; stack: { handle: (...a: unknown[]) => void }[] };
  };

  const loadRoutes = async () => {
    const mod = await import("./routes.js");
    const stack = (mod.default as unknown as { stack: Layer[] }).stack;
    return stack.filter((l) => l.route).map((l) => l.route!);
  };

  // Runs a route's first handler (its role guard) as `role`; returns the error passed to next().
  const guardResult = (route: { stack: { handle: (...a: unknown[]) => void }[] }, role: string) => {
    let err: unknown = "not-called";
    route.stack[0]!.handle({ authUser: { id: 1, email: "x", name: "x", role } }, {}, (e?: unknown) => {
      err = e;
    });
    return err;
  };

  test("owner-summary is registered before /:id", async () => {
    const routes = await loadRoutes();
    const own = routes.findIndex((r) => r.path === "/owner-summary");
    const byId = routes.findIndex((r) => r.path === "/:id");
    assert.ok(own >= 0 && byId >= 0 && own < byId);
  });

  test("owner, admin and it-designer pass the owner-summary guard", async () => {
    const route = (await loadRoutes()).find((r) => r.path === "/owner-summary")!;
    for (const role of ["owner", "admin", "it-designer"]) assert.equal(guardResult(route, role), undefined, role);
  });

  test("project-manager, engineer, architect, consultant, site-personnel, hr and finance get 403 on owner-summary", async () => {
    const route = (await loadRoutes()).find((r) => r.path === "/owner-summary")!;
    for (const role of ["project-manager", "engineer", "architect", "consultant", "site-personnel", "human-resources", "finance-manager"]) {
      const err = guardResult(route, role) as { statusCode?: number } | undefined;
      assert.ok(err && err.statusCode === 403, `${role} should be forbidden`);
    }
  });

  test("owner gets 403 on every other payroll route", async () => {
    const routes = (await loadRoutes()).filter((r) => r.path !== "/owner-summary");
    assert.ok(routes.length > 5);
    for (const r of routes) {
      const err = guardResult(r, "owner") as { statusCode?: number } | undefined;
      assert.ok(err && err.statusCode === 403, `owner must be forbidden on ${Object.keys(r.methods)} ${r.path}`);
    }
  });

  test("the other roles stay forbidden on every other payroll route", async () => {
    const routes = (await loadRoutes()).filter((r) => r.path !== "/owner-summary");
    for (const role of ["project-manager", "engineer", "architect", "consultant", "site-personnel"]) {
      for (const r of routes) {
        const err = guardResult(r, role) as { statusCode?: number } | undefined;
        assert.ok(err && err.statusCode === 403, `${role} must be forbidden on ${r.path}`);
      }
    }
  });
});
