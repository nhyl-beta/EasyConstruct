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

describe("reimbursement routes", async () => {
  const { reimbursementsRouter } = await import("../reimbursements/routes.js");
  const routes = routesOf(reimbursementsRouter);
  const CLAIMANTS = ["engineer", "site-personnel"];

  const expected: [string, string, string[]][] = [
    ["get", "/mine", CLAIMANTS],
    ["get", "/", ["admin", "finance-manager", "project-manager"]],
    ["get", "/:id", ["admin", "engineer", "finance-manager", "project-manager", "site-personnel"]],
    ["post", "/", CLAIMANTS],
    ["post", "/:id/endorse", ["admin", "project-manager"]],
    ["post", "/:id/approve", FINANCE],
    ["post", "/:id/reject", ["admin", "finance-manager", "project-manager"]],
    ["post", "/:id/pay", FINANCE],
    ["post", "/:id/cancel", CLAIMANTS],
  ];
  for (const [method, path, roles] of expected) {
    test(`${method.toUpperCase()} ${path}`, () => {
      assert.deepEqual(rolesAllowed(find(routes, method, path)), [...roles].sort());
    });
  }

  test("/mine is registered before /:id", () => {
    const mine = routes.findIndex((r) => r.path === "/mine");
    const byId = routes.findIndex((r) => r.path === "/:id");
    assert.ok(mine >= 0 && byId >= 0 && mine < byId);
  });

  test("Owner, IT Designer, Consultant and Admin cannot raise a claim; Finance cannot raise one it would decide", () => {
    const post = find(routes, "post", "/");
    for (const role of ["owner", "it-designer", "consultant", "admin", "finance-manager"]) {
      assert.equal(allows(post, role), false, role);
    }
  });
});
