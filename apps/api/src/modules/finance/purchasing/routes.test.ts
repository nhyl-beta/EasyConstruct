import { describe, test } from "node:test";
import assert from "node:assert/strict";

// Importing the routers pulls in the db module (a lazy pool; no connection is made).
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.JWT_SECRET ??= "test";

const ALL_ROLES = [
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
];

type Route = { path: string; methods: Record<string, boolean>; stack: { handle: (...a: unknown[]) => void }[] };

const routesOf = (router: unknown): Route[] =>
  (router as { stack: { route?: Route }[] }).stack.filter((l) => l.route).map((l) => l.route!);

/** Runs the route's first handler (its role guard) as `role`; true when it lets the role through. */
const allows = (route: Route, role: string): boolean => {
  let err: unknown = "not-called";
  route.stack[0]!.handle({ authUser: { id: 1, email: "x", name: "x", role } }, {}, (e?: unknown) => {
    err = e;
  });
  return err === undefined;
};

const find = (routes: Route[], method: string, path: string) => {
  const r = routes.find((x) => x.path === path && x.methods[method]);
  assert.ok(r, `${method} ${path} is registered`);
  return r!;
};

const rolesAllowed = (route: Route) => ALL_ROLES.filter((r) => allows(route, r)).sort();

const FINANCE = ["admin", "finance-manager"];
const READERS = ["admin", "engineer", "finance-manager", "project-manager", "site-personnel"];

describe("purchase request routes", async () => {
  const { purchaseRequestsRouter } = await import("../purchase-requests/routes.js");
  const routes = routesOf(purchaseRequestsRouter);

  const expected: [string, string, string[]][] = [
    ["get", "/", READERS],
    ["get", "/:id", READERS],
    ["post", "/", ["admin", "engineer", "project-manager"]],
    ["patch", "/:id", ["admin", "engineer", "project-manager"]],
    ["post", "/:id/endorse", ["admin", "project-manager"]],
    ["post", "/:id/approve", FINANCE],
    ["post", "/:id/reject", ["admin", "finance-manager", "project-manager"]],
    ["post", "/:id/cancel", ["admin", "engineer", "finance-manager", "project-manager"]],
  ];
  for (const [method, path, roles] of expected) {
    test(`${method.toUpperCase()} ${path}`, () => {
      assert.deepEqual(rolesAllowed(find(routes, method, path)), [...roles].sort());
    });
  }

  test("no route is open to Owner, IT Designer, Consultant, Architect or HR", () => {
    for (const r of routes) {
      for (const role of ["owner", "it-designer", "consultant", "architect", "human-resources"]) {
        assert.equal(allows(r, role), false, `${role} on ${Object.keys(r.methods)} ${r.path}`);
      }
    }
  });
});

describe("procurement routes", async () => {
  const { procurementRouter } = await import("../procurement/routes.js");
  const routes = routesOf(procurementRouter);

  const expected: [string, string, string[]][] = [
    ["get", "/", READERS],
    ["get", "/:id", READERS],
    ["post", "/", FINANCE],
    ["post", "/:id/ship", FINANCE],
    ["post", "/:id/deliver", ["admin", "engineer", "project-manager", "site-personnel"]],
    ["post", "/:id/pay", FINANCE],
    ["post", "/:id/cancel", FINANCE],
  ];
  for (const [method, path, roles] of expected) {
    test(`${method.toUpperCase()} ${path}`, () => {
      assert.deepEqual(rolesAllowed(find(routes, method, path)), [...roles].sort());
    });
  }

  test("only Finance / Admin can create, ship, pay or cancel an order", () => {
    for (const path of ["/", "/:id/ship", "/:id/pay", "/:id/cancel"]) {
      for (const role of ["project-manager", "engineer", "site-personnel"]) {
        assert.equal(allows(find(routes, "post", path), role), false, `${role} ${path}`);
      }
    }
  });
});

describe("the finance router has no reimbursements mount", async () => {
  const { financeRouter } = await import("../router.js");

  test("nothing under /reimbursements is registered, so requests get the 404 handler", () => {
    const mounts = (financeRouter as unknown as { stack: { regexp?: RegExp; matchers?: ((p: string) => unknown)[] }[] }).stack;
    // Express 5 layers expose matchers; try each one against the retired path.
    const handled = mounts.some((layer) => (layer.matchers ?? []).some((m) => m("/reimbursements/mine")));
    assert.equal(handled, false);
  });

  test("the live purchasing mounts are still there", () => {
    const mounts = (financeRouter as unknown as { stack: { matchers?: ((p: string) => unknown)[] }[] }).stack;
    for (const path of ["/purchase-requests", "/procurement", "/approvals", "/expenses"]) {
      assert.ok(mounts.some((layer) => (layer.matchers ?? []).some((m) => m(path))), path);
    }
  });
});
