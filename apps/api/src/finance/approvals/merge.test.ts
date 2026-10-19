import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LIMIT, MAX_LIMIT, clampLimit, mergePending, waitingHours, type PendingItem } from "./merge.js";

const now = new Date("2026-10-07T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
const item = (id: string, kind: PendingItem["kind"], h: number, amount = 100): PendingItem => ({
  id, kind, reference: id, requestedBy: "x", amount, waitingSince: hoursAgo(h), href: "/x",
});

describe("mergePending", () => {
  const exp = [item("exp-1", "Expense", 5), item("exp-2", "Expense", 50)];
  const pay = [item("pay-1", "Payroll", 30)];
  const bud = [item("bud-1", "Budget", 100)];

  test("oldest waiting first, across sources", () => {
    const { items } = mergePending([exp, pay, bud], now, 20);
    assert.deepEqual(items.map((i) => i.id), ["bud-1", "exp-2", "pay-1", "exp-1"]);
  });
  test("limit truncates the list but total counts everything", () => {
    const r = mergePending([exp, pay, bud], now, 2);
    assert.equal(r.items.length, 2);
    assert.equal(r.total, 4);
  });
  test("rows carry whole waiting hours and a pending status, and drop the raw timestamp", () => {
    const [first] = mergePending([bud], now, 5).items;
    assert.equal(first!.waitingHours, 100);
    assert.equal(first!.status, "pending");
    assert.ok(!("waitingSince" in first!));
  });
  test("empty sources give an empty list and a zero total", () => {
    assert.deepEqual(mergePending([[], [], []], now, 20), { items: [], total: 0 });
  });
  test("equal waiting times order by id so the list is stable", () => {
    const { items } = mergePending([[item("pay-2", "Payroll", 10), item("exp-9", "Expense", 10)]], now, 5);
    assert.deepEqual(items.map((i) => i.id), ["exp-9", "pay-2"]);
  });
});

describe("purchase requests", () => {
  test("they join the same oldest-first list under their own kinds", () => {
    const pr = [item("pr-PR-0001", "Purchase request", 40, 5000)];
    const { items, total } = mergePending([[item("exp-1", "Expense", 5)], pr], now, 20);
    assert.deepEqual(items.map((i) => i.id), ["pr-PR-0001", "exp-1"]);
    assert.deepEqual(items.map((i) => i.kind), ["Purchase request", "Expense"]);
    assert.equal(total, 2);
  });
});

describe("helpers", () => {
  test("waiting hours are whole and never negative", () => {
    assert.equal(waitingHours(new Date(now.getTime() - 90 * 60_000), now), 1);
    assert.equal(waitingHours(new Date(now.getTime() + 3_600_000), now), 0);
  });
  test("limit defaults, clamps and rejects junk", () => {
    assert.equal(clampLimit(undefined), DEFAULT_LIMIT);
    assert.equal(clampLimit("abc"), DEFAULT_LIMIT);
    assert.equal(clampLimit("0"), DEFAULT_LIMIT);
    assert.equal(clampLimit("500"), MAX_LIMIT);
    assert.equal(clampLimit("7.9"), 7);
  });
});
