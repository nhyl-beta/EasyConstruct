import { describe, test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.JWT_SECRET ??= "test";

import { ownsNotification } from "./ownership.js";

describe("ownsNotification", () => {
  const me = { userId: 5, role: "project-manager" };
  test("addressed to me by name", () => {
    assert.equal(ownsNotification({ recipientUserId: 5, role: null }, me), true);
  });
  test("another user's notification is not mine, even if it carries my role", () => {
    assert.equal(ownsNotification({ recipientUserId: 6, role: "project-manager" }, me), false);
  });
  test("a role broadcast is mine only for that role", () => {
    assert.equal(ownsNotification({ recipientUserId: null, role: "project-manager" }, me), true);
    assert.equal(ownsNotification({ recipientUserId: null, role: "finance-manager" }, me), false);
    assert.equal(ownsNotification({ recipientUserId: null, role: null }, me), false);
  });
});

describe("notification routes", async () => {
  const { default: router } = await import("./route.js");
  const routes = (router as unknown as { stack: { route?: { path: string; methods: Record<string, boolean> } }[] }).stack
    .filter((l) => l.route)
    .map((l) => l.route!);

  test("there is no public POST: notifications are created by server code only", () => {
    assert.equal(routes.some((r) => r.methods.post), false);
  });
  test("reading, streaming and marking read are still there", () => {
    assert.ok(routes.some((r) => r.path === "/" && r.methods.get));
    assert.ok(routes.some((r) => r.path === "/stream" && r.methods.get));
    assert.ok(routes.some((r) => r.path === "/:id/read" && r.methods.patch));
  });
});
