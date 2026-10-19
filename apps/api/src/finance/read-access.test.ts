import { describe, test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.JWT_SECRET ??= "test";

const ALL_ROLES = ["admin", "owner", "it-designer", "project-manager", "human-resources", "finance-manager", "architect", "engineer", "site-personnel", "consultant"];

type Route = { path: string; methods: Record<string, boolean>; stack: { handle: (...a: unknown[]) => void }[] };
const routesOf = (router: unknown): Route[] => (router as { stack: { route?: Route }[] }).stack.filter((l) => l.route).map((l) => l.route!);
const allows = (route: Route, role: string): boolean => {
  let err: unknown = "not-called";
  route.stack[0]!.handle({ authUser: { id: 1, email: "x", name: "x", role } }, {}, (e?: unknown) => {
    err = e;
  });
  return err === undefined;
};
const rolesAllowed = (routes: Route[], method: string, path: string) => {
  const r = routes.find((x) => x.path === path && x.methods[method]);
  assert.ok(r, `${method} ${path} is registered`);
  return ALL_ROLES.filter((role) => allows(r!, role)).sort();
};

const COMPANY = ["admin", "finance-manager", "it-designer", "owner"];
const PROJECT = [...COMPANY, "project-manager"].sort();

describe("finance reads: Site Personnel and Consultant get 403, Finance Manager keeps everything", async () => {
  const { budgetsRoutes } = await import("./budget/routes.js");
  const { expensesRouter } = await import("./expenses/routes.js");
  const { cashFlowRouter } = await import("./cash-flow/routes.js");
  const { projectProfitabilityRouter } = await import("./project-profitability/routes.js");
  const { summaryRouter } = await import("./summary/routes.js");

  test("budgets and expenses: finance readers plus the PM (who is filtered to their projects)", () => {
    assert.deepEqual(rolesAllowed(routesOf(budgetsRoutes), "get", "/"), PROJECT);
    assert.deepEqual(rolesAllowed(routesOf(budgetsRoutes), "get", "/:id"), PROJECT);
    assert.deepEqual(rolesAllowed(routesOf(expensesRouter), "get", "/"), PROJECT);
  });
  test("cash flow, profitability and summary: company-wide readers only", () => {
    assert.deepEqual(rolesAllowed(routesOf(cashFlowRouter), "get", "/"), COMPANY);
    assert.deepEqual(rolesAllowed(routesOf(projectProfitabilityRouter), "get", "/"), COMPANY);
    assert.deepEqual(rolesAllowed(routesOf(summaryRouter), "get", "/"), COMPANY);
  });
  test("Site Personnel and Consultant are refused on every one of them", () => {
    const all = [
      [budgetsRoutes, "/"],
      [budgetsRoutes, "/:id"],
      [expensesRouter, "/"],
      [cashFlowRouter, "/"],
      [projectProfitabilityRouter, "/"],
      [summaryRouter, "/"],
    ] as const;
    for (const [router, path] of all) {
      const r = routesOf(router).find((x) => x.path === path && x.methods.get)!;
      for (const role of ["site-personnel", "consultant"]) assert.equal(allows(r, role), false, `${role} ${path}`);
      assert.equal(allows(r, "finance-manager"), true);
    }
  });
});
