// Role-by-route matrix (pure: no database, no HTTP). It reads each router's requireRole() guards, runs them
// against a fake signed-in user, and checks who gets through. Controllers and body validators never run.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Router } from "express";
import { authenticate } from "../core/auth/middleware.js";
import employeeRoutes from "./workforce/employees/routes.js";
import hrRoutes from "./workforce/hr/routes.js";
import payrollRoutes from "./workforce/payroll/routes.js";
import attendanceRoutes from "./workforce/attendance/routes.js";
import userRoutes from "./iam/users/routes.js";
import roleRoutes from "./iam/roles/routes.js";

const ROLES = [
  "admin",
  "owner",
  "it-designer",
  "project-manager",
  "human-resources",
  "finance-manager",
  "architect",
  "engineer",
  "site-personnel",
  "consultant",
] as const;
type Role = (typeof ROLES)[number];
const ANYONE: readonly Role[] = ROLES;

type Method = "get" | "post" | "patch" | "delete";
type Layer = {
  handle: ((...a: unknown[]) => unknown) & { requiredRoles?: string[] };
  matchers: ((p: string) => unknown)[];
  route?: { methods: Record<string, boolean>; stack: { handle: Layer["handle"] }[] };
};
const layersOf = (router: Router) => (router as unknown as { stack: Layer[] }).stack;

/** The status a caller with `role` (undefined = not signed in) gets from the guards on this route: 200, 401 or 403. */
function statusFor(router: Router, method: Method, path: string, role: Role | undefined): number {
  const req = { authUser: role ? { id: 1, role, name: "t", email: "t@example.com" } : undefined };
  let status = 200;
  let matched = false;
  const run = (guard: Layer["handle"]) => {
    if (status !== 200 || !guard.requiredRoles) return;
    guard(req, {}, (err?: { statusCode?: number }) => {
      if (err) status = err.statusCode ?? 500;
    });
  };
  for (const layer of layersOf(router)) {
    if (!layer.route) {
      run(layer.handle); // router-level guards (router.use(requireRole(...)))
      continue;
    }
    if (!layer.route.methods[method] || !layer.matchers.some((m) => m(path))) continue;
    matched = true;
    for (const h of layer.route.stack) run(h.handle);
    break;
  }
  assert.ok(matched, `no ${method.toUpperCase()} ${path} route`);
  return status;
}

interface Case {
  name: string;
  router: Router;
  method: Method;
  path: string;
  /** Roles that get through the guards; every other signed-in role must get 403. */
  allowed: readonly Role[];
}

const HR: Role[] = ["human-resources"];
const HR_IT: Role[] = ["human-resources", "it-designer"];
const READ_EMPLOYEES: Role[] = ["human-resources", "finance-manager", "admin", "it-designer"];

const employees = (method: Method, path: string, allowed: readonly Role[]): Case => ({ name: `/api/employees`, router: employeeRoutes, method, path, allowed });
const hr = (method: Method, path: string, allowed: readonly Role[]): Case => ({ name: `/api/hr`, router: hrRoutes, method, path, allowed });
const payroll = (method: Method, path: string, allowed: readonly Role[]): Case => ({ name: `/api/payroll`, router: payrollRoutes, method, path, allowed });
const attendance = (method: Method, path: string, allowed: readonly Role[]): Case => ({ name: `/api/attendance`, router: attendanceRoutes, method, path, allowed });
const users = (method: Method, path: string, allowed: readonly Role[]): Case => ({ name: `/api/users`, router: userRoutes, method, path, allowed });

const WRITES: Case[] = [
  // employees: HR only (these were open to every signed-in role)
  employees("post", "/", HR),
  employees("patch", "/5", HR),
  employees("patch", "/5/deactivate", HR),
  employees("delete", "/5", HR),
  // accounts: IT Designer only
  users("post", "/", ["it-designer"]),
  users("post", "/5/link-employee", ["it-designer"]),
  users("post", "/5/create-employee", ["it-designer"]),
  users("patch", "/5", ["it-designer"]),
  users("patch", "/5/status", ["it-designer"]),
  users("patch", "/5/password", ["it-designer"]),
  users("delete", "/5", ["it-designer"]),
  // HR router writes
  hr("post", "/employees", HR_IT),
  hr("patch", "/employees/5", HR_IT),
  hr("delete", "/employees/5", HR_IT),
  hr("post", "/attendance", HR_IT),
  hr("patch", "/attendance/5", HR_IT),
  hr("delete", "/attendance/5", HR_IT),
  // payroll writes
  payroll("post", "/generate", HR_IT),
  payroll("post", "/batches/5/lines", HR_IT),
  payroll("post", "/batches/5/submit", HR_IT),
  payroll("delete", "/batches/5", HR_IT),
  payroll("patch", "/5", HR_IT),
  payroll("delete", "/5", HR_IT),
  // attendance writes
  attendance("post", "/bulk-verify", HR),
  attendance("post", "/mark-absent", HR),
  attendance("post", "/", ["site-personnel", "it-designer"]),
  attendance("patch", "/5", ["site-personnel", "project-manager", "human-resources", "it-designer"]),
  attendance("delete", "/5", HR_IT),
  attendance("post", "/import/preview", ["site-personnel"]),
  attendance("post", "/import/commit", ["site-personnel"]),
];

const READS: Case[] = [
  employees("get", "/", READ_EMPLOYEES),
  employees("get", "/5", READ_EMPLOYEES),
  employees("get", "/me", ANYONE),
  users("get", "/", ANYONE),
  users("get", "/linkable-employees", ["it-designer"]),
  { name: "/api/roles", router: roleRoutes, method: "get", path: "/", allowed: ["admin", "owner", "it-designer"] },
  { name: "/api/roles", router: roleRoutes, method: "get", path: "/summary", allowed: ["admin", "owner", "it-designer"] },
  hr("get", "/employees", ["human-resources", "admin", "it-designer"]),
  hr("get", "/attendance", ["human-resources", "admin", "it-designer"]),
  hr("get", "/payroll", ["human-resources", "admin", "it-designer"]),
  payroll("get", "/", ["human-resources", "finance-manager", "admin", "it-designer"]),
  payroll("get", "/batches/all", ["human-resources", "finance-manager", "admin", "it-designer"]),
  payroll("get", "/attendance-summary", ["human-resources", "admin", "it-designer"]),
  payroll("get", "/batches/5/validation", ["human-resources", "admin", "it-designer"]),
  attendance("get", "/", ANYONE),
  attendance("get", "/exceptions", ["human-resources", "admin"]),
  attendance("get", "/import/template", ["site-personnel", "admin"]),
];

const label = (c: Case) => `${c.method.toUpperCase()} ${c.name}${c.path === "/" ? "" : c.path}`;

for (const c of [...WRITES, ...READS]) {
  test(`${label(c)}: only ${c.allowed.length === ANYONE.length ? "any signed-in role" : c.allowed.join(", ")} get through`, () => {
    for (const role of ROLES) {
      const expected = c.allowed.includes(role) ? 200 : 403;
      assert.equal(statusFor(c.router, c.method, c.path, role), expected, `${role} on ${label(c)}`);
    }
    // A route open to "any signed-in role" has no requireRole guard; authenticate() (checked below) turns anonymous away.
    if (c.allowed !== ANYONE) assert.equal(statusFor(c.router, c.method, c.path, undefined), 401, `anonymous on ${label(c)}`);
  });
}

test("Admin gets 403 on every write route in the matrix, and 200-class on the read views it keeps", () => {
  for (const c of WRITES) assert.equal(statusFor(c.router, c.method, c.path, "admin"), 403, label(c));
  for (const [router, method, path] of [
    [employeeRoutes, "get", "/"],
    [employeeRoutes, "get", "/5"],
    [hrRoutes, "get", "/employees"],
    [hrRoutes, "get", "/payroll"],
    [payrollRoutes, "get", "/"],
    [payrollRoutes, "get", "/batches/5/validation"],
    [attendanceRoutes, "get", "/"],
    [attendanceRoutes, "get", "/exceptions"],
    [roleRoutes, "get", "/"],
    [userRoutes, "get", "/"],
  ] as [Router, Method, string][]) {
    assert.equal(statusFor(router, method, path, "admin"), 200, `admin ${method} ${path}`);
  }
});

test("unauthenticated callers get 401 (not 200 or 403) on /api/employees writes", () => {
  for (const [method, path] of [["post", "/"], ["patch", "/5"], ["patch", "/5/deactivate"], ["delete", "/5"]] as [Method, string][]) {
    assert.equal(statusFor(employeeRoutes, method, path, undefined), 401, `${method} ${path}`);
  }
});

test("every router above authenticates first", () => {
  for (const router of [employeeRoutes, hrRoutes, payrollRoutes, attendanceRoutes, userRoutes, roleRoutes]) {
    assert.ok(layersOf(router).some((l) => !l.route && l.handle === authenticate));
  }
});
