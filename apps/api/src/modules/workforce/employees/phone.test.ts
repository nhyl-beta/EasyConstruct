import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmployeeSchema } from "./validators.js";

const base = { employeeId: "E1", name: "A", role: "r", department: "d", site: "s", hiredOn: "2026-01-01" };
const ok = (phone?: string) => createEmployeeSchema.safeParse({ ...base, phone }).success;

test("phone is digits only (7 to 15), or empty", () => {
  assert.ok(ok("09171234567") && ok("") && ok(undefined));
  assert.ok(!ok("0917-123-4567") && !ok("+639171234567") && !ok("abc12345") && !ok("123"));
});
