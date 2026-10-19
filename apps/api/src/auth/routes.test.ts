import { describe, test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.JWT_SECRET ??= "test";

describe("POST /api/auth/logout", async () => {
  const { authRoutes } = await import("../validators/routes.js");
  const { authenticate } = await import("../core/auth/middleware.js");
  const layer = (authRoutes as unknown as { stack: { route?: { path: string; methods: Record<string, boolean>; stack: { handle: unknown }[] } }[] }).stack
    .map((l) => l.route)
    .find((r) => r && r.path === "/logout" && r.methods.post);

  test("exists", () => assert.ok(layer));
  test("requires a signed-in caller (authenticate runs first)", () => {
    assert.equal(layer!.stack[0]!.handle, authenticate);
  });
});
