import { test } from "node:test";
import assert from "node:assert/strict";
import type { Router } from "express";
import router from "./routes.js";
import reviewRouter from "../finance/payroll-review/routes.js";
import {
  generatePayrollSchema,
  updatePayrollLineSchema,
} from "../validators/payroll-validators.js";
import { decidePayrollBatchSchema } from "../finance/validators/payroll-review-validators.js";
import { getRules } from "./engine.js";
import { validateBatchLines } from "./validation.js";

// ── Route permissions ──────────────────────────────────────────────────────
// Runs the real role middleware attached to each real route (the one after
// `authenticate`) with a fake user, so a wiring mistake in routes.ts fails.

type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Function }> } };

const roleGate = (r: Router, method: string, path: string) => {
  const layer = (r as unknown as { stack: Layer[] }).stack.find(
    (l) => l.route?.path === path && l.route.methods[method],
  );
  assert.ok(layer?.route, `route ${method} ${path} exists`);
  return layer.route.stack[0]!.handle as (req: unknown, res: unknown, next: (e?: unknown) => void) => void;
};

const statusFor = (gate: ReturnType<typeof roleGate>, role: string): number | "ok" => {
  let result: number | "ok" = "ok";
  gate({ authUser: { id: 1, email: "x", name: "x", role } }, {}, (err) => {
    if (err) result = (err as { statusCode: number }).statusCode;
  });
  return result;
};

test("Finance Manager is read-only on payroll lines and batches", () => {
  for (const [method, path] of [
    ["post", "/generate"],
    ["patch", "/:id"],
    ["delete", "/:id"],
    ["post", "/batches/:id/lines"],
    ["post", "/batches/:id/submit"],
    ["delete", "/batches/:id"],
  ] as const) {
    assert.equal(statusFor(roleGate(router, method, path), "finance-manager"), 403, `${method} ${path}`);
    assert.equal(statusFor(roleGate(router, method, path), "human-resources"), "ok", `${method} ${path} HR`);
  }
  assert.equal(statusFor(roleGate(router, "get", "/"), "finance-manager"), "ok");
  assert.equal(statusFor(roleGate(router, "get", "/batches/:id"), "finance-manager"), "ok");
});

test("only the review router decides a batch, and it has no create route", () => {
  const stack = (reviewRouter as unknown as { stack: Layer[] }).stack;
  const posts = stack.filter((l) => l.route?.methods.post).map((l) => l.route!.path);
  assert.deepEqual(posts, ["/:id/decide"]);
});

// ── Request validation ─────────────────────────────────────────────────────

test("line update rejects gross, deductions and net", () => {
  for (const field of ["gross", "deductions", "net", "sss", "pagibig"]) {
    assert.equal(updatePayrollLineSchema.safeParse({ [field]: 1 }).success, false, field);
  }
  assert.equal(updatePayrollLineSchema.safeParse({ hours: 8, overtime: 1, adjustments: -5 }).success, true);
});

test("generate rejects typed statutory amounts on an entry", () => {
  const base = { period: "2026-07", entries: [{ employeeId: "E1", hoursWorked: 8 }] };
  assert.equal(generatePayrollSchema.safeParse(base).success, true);
  const withSss = { ...base, entries: [{ employeeId: "E1", hoursWorked: 8, sss: 99 }] };
  assert.equal(generatePayrollSchema.safeParse(withSss).success, false);
});

test("rejecting needs a reason; reason Other needs a comment", () => {
  assert.equal(decidePayrollBatchSchema.safeParse({ decision: "rejected" }).success, false);
  assert.equal(
    decidePayrollBatchSchema.safeParse({ decision: "rejected", reasonCode: "other" }).success,
    false,
  );
  assert.equal(
    decidePayrollBatchSchema.safeParse({ decision: "rejected", reasonCode: "other", comment: "  " }).success,
    false,
  );
  assert.equal(
    decidePayrollBatchSchema.safeParse({ decision: "rejected", reasonCode: "other", comment: "see note" }).success,
    true,
  );
  assert.equal(
    decidePayrollBatchSchema.safeParse({ decision: "rejected", reasonCode: "incorrect_sss" }).success,
    true,
  );
  assert.equal(decidePayrollBatchSchema.safeParse({ decision: "approved" }).success, true);
});

// ── Pre-submission validation ──────────────────────────────────────────────

const okLine = {
  empId: "E1",
  name: "Ana",
  hours: 160,
  overtime: 0,
  net: 1000,
  rateVersions: { sss: "a", philhealth: "b", pagibig: "c" },
};

test("inactive worker, zero pay rate, zero hours and negative net each block submission", () => {
  const rules = getRules("2026-07-31");
  const codes = (line: typeof okLine, emp: { status: string; payRate: number }) =>
    validateBatchLines([line], new Map([["E1", emp]]), rules, [])
      .filter((i) => i.severity === "error")
      .map((i) => i.code);

  assert.deepEqual(codes(okLine, { status: "Active", payRate: 150 }), []);
  assert.deepEqual(codes(okLine, { status: "On Leave", payRate: 150 }), ["employee_not_active"]);
  assert.deepEqual(codes(okLine, { status: "Active", payRate: 0 }), ["pay_rate_missing"]);
  assert.deepEqual(codes({ ...okLine, hours: 0 }, { status: "Active", payRate: 150 }), ["zero_hours"]);
  assert.deepEqual(codes({ ...okLine, net: -1 }, { status: "Active", payRate: 150 }), ["negative_net"]);
  assert.deepEqual(
    codes({ ...okLine, rateVersions: null as never }, { status: "Active", payRate: 150 }),
    ["missing_rate_version"],
  );
  // The three agency versions are enough; a missing one still blocks; an old stored extra key is ignored.
  const extra = { ...okLine, rateVersions: { ...okLine.rateVersions, legacy: "x" } };
  assert.deepEqual(codes(extra, { status: "Active", payRate: 150 }), []);
  const noPagibig = { ...okLine, rateVersions: { sss: "a", philhealth: "b" } };
  assert.deepEqual(codes(noPagibig as never, { status: "Active", payRate: 150 }), ["missing_rate_version"]);
});

test("a duplicate project/period batch is a warning, not an error", () => {
  const issues = validateBatchLines(
    [okLine],
    new Map([["E1", { status: "Active", payRate: 150 }]]),
    getRules("2026-07-31"),
    ["PAY-1"],
  );
  const dup = issues.find((i) => i.code === "duplicate_batch");
  assert.equal(dup?.severity, "warning");
  assert.equal(issues.filter((i) => i.severity === "error").length, 0);
});
