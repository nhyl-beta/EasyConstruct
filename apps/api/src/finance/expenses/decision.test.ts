import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ConflictError } from "../../utils/errors.js";
import { NO_BUDGET_WARNING, assertDecidable, budgetOutcome } from "./decision.js";

describe("expense decision guards", () => {
  test("a pending expense can be decided", () => {
    assert.doesNotThrow(() => assertDecidable("EXP-1", "pending"));
  });
  test("an approved, rejected or unknown-status expense is a 409 and says why", () => {
    for (const s of ["approved", "rejected", "paid"]) {
      assert.throws(() => assertDecidable("EXP-1", s), (e: unknown) => e instanceof ConflictError && e.message.includes(`already ${s}`));
    }
  });
  test("the budget outcome carries the warning only when no line matched", () => {
    assert.deepEqual(budgetOutcome(true), { budgetMatched: true, warning: null });
    assert.deepEqual(budgetOutcome(false), { budgetMatched: false, warning: NO_BUDGET_WARNING });
  });
});
