import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { planEmployeeLinks, type PlanEmployee, type PlanUser } from "./employee-link-plan.js";

const emp = (id: number, email: string | null, userId: number | null = null): PlanEmployee => ({
  id,
  employeeId: `EMP-${id}`,
  name: `Person ${id}`,
  email,
  userId,
});
const user = (id: number, email: string, role = "engineer"): PlanUser => ({ id, name: `User ${id}`, email, role });

describe("planEmployeeLinks", () => {
  test("links by email, case-insensitively, when exactly one employee and one account match", () => {
    const plan = planEmployeeLinks([emp(1, "Pat@Example.com")], [user(10, "pat@example.com")]);
    assert.deepEqual(plan.links.map((l) => [l.employeeId, l.userId]), [["EMP-1", 10]]);
    assert.equal(plan.accountsWithoutEmployee.length, 0);
  });

  test("an employee with no matching account is left alone and is not reported as a problem", () => {
    const plan = planEmployeeLinks([emp(1, "roster@example.com")], []);
    assert.equal(plan.links.length, 0);
    assert.equal(plan.ambiguous.length, 0);
  });

  test("two employees sharing one email are ambiguous: nothing is linked", () => {
    const plan = planEmployeeLinks([emp(1, "x@example.com"), emp(2, "X@example.com")], [user(10, "x@example.com")]);
    assert.equal(plan.links.length, 0);
    assert.equal(plan.ambiguous.length, 1);
    assert.equal(plan.accountsWithoutEmployee.length, 1);
  });

  test("two accounts differing only in case are ambiguous", () => {
    const plan = planEmployeeLinks([emp(1, "x@example.com")], [user(10, "x@example.com"), user(11, "X@example.com")]);
    assert.equal(plan.links.length, 0);
    assert.equal(plan.ambiguous.length, 1);
  });

  test("an account that already belongs to another employee is not linked a second time", () => {
    const plan = planEmployeeLinks([emp(1, "a@example.com", 10), emp(2, "a@example.com")], [user(10, "a@example.com")]);
    assert.equal(plan.links.length, 0);
    assert.equal(plan.alreadyLinked.length, 1);
  });

  test("accounts left without an employee are listed", () => {
    const plan = planEmployeeLinks([emp(1, "a@example.com")], [user(10, "a@example.com"), user(11, "owner@example.com", "owner")]);
    assert.deepEqual(plan.accountsWithoutEmployee.map((u) => u.id), [11]);
  });

  test("running it again after the links exist plans nothing (idempotent)", () => {
    const plan = planEmployeeLinks([emp(1, "a@example.com", 10)], [user(10, "a@example.com")]);
    assert.equal(plan.links.length, 0);
    assert.equal(plan.accountsWithoutEmployee.length, 0);
  });
});
