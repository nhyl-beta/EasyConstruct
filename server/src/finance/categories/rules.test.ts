import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  assertNameFree,
  assertRenamable,
  assertRetirable,
  describeUsage,
  emptyUsage,
  findActive,
  nameKey,
  normalizeName,
  totalUsage,
  type CategoryLike,
} from "./rules.js";

const cat = (id: number, name: string, over: Partial<CategoryLike> = {}): CategoryLike => ({
  id,
  name,
  isActive: true,
  isSystem: false,
  ...over,
});
const LIST = [cat(1, "Materials", { isSystem: true }), cat(2, "Permits"), cat(3, "Old stuff", { isActive: false })];

describe("normalizeName", () => {
  test("trims and collapses spaces", () => assert.equal(normalizeName("  Concrete   works "), "Concrete works"));
  test("keeps the casing the user typed", () => assert.equal(normalizeName("PPE kits"), "PPE kits"));
  test("rejects too short", () => assert.throws(() => normalizeName(" a "), /at least 2/));
  test("rejects empty", () => assert.throws(() => normalizeName("   "), /at least 2/));
  test("rejects too long", () => assert.throws(() => normalizeName("x".repeat(65)), /at most 64/));
  test("accepts exactly 2 and 64", () => {
    assert.equal(normalizeName("ab"), "ab");
    assert.equal(normalizeName("x".repeat(64)).length, 64);
  });
});

describe("assertNameFree", () => {
  test("a new name passes", () => assert.doesNotThrow(() => assertNameFree(LIST, "Concrete works")));
  test("rejects a name that differs only by case", () => assert.throws(() => assertNameFree(LIST, "MATERIALS"), /"Materials" already exists/));
  test("rejects a clash with a retired category too", () => assert.throws(() => assertNameFree(LIST, "old  stuff"), /already exists/));
  test("a category may be renamed to its own other casing", () => assert.doesNotThrow(() => assertNameFree(LIST, "permits", 2)));
});

describe("findActive", () => {
  test("returns the stored casing for any input casing", () => {
    assert.equal(findActive(LIST, "materials"), "Materials");
    assert.equal(findActive(LIST, "  PERMITS "), "Permits");
  });
  test("a retired category is not found", () => assert.equal(findActive(LIST, "Old stuff"), null));
  test("an unknown or empty name is not found", () => {
    assert.equal(findActive(LIST, "Nope"), null);
    assert.equal(findActive(LIST, ""), null);
  });
});

describe("assertRenamable", () => {
  test("an unused custom category can be renamed", () => assert.doesNotThrow(() => assertRenamable(LIST[1]!, emptyUsage())));
  test("a system category cannot", () => assert.throws(() => assertRenamable(LIST[0]!, emptyUsage()), /system category/));
  test("a used category cannot, and the message says where", () => {
    const usage = { ...emptyUsage(), expenses: 3, budgets: 1 };
    assert.throws(
      () => assertRenamable(LIST[1]!, usage),
      (e: Error & { statusCode?: number; extra?: { usage?: unknown } }) =>
        e.statusCode === 409 && /1 budget line, 3 expenses/.test(e.message) && e.extra?.usage === usage,
    );
  });
});

describe("assertRetirable", () => {
  test("a custom category can be retired, used or not", () => assert.doesNotThrow(() => assertRetirable(LIST[1]!)));
  test("a system category cannot", () => assert.throws(() => assertRetirable(LIST[0]!), /system category/));
});

describe("usage helpers", () => {
  test("total and description ignore zeros", () => {
    const u = { ...emptyUsage(), purchaseRequests: 2 };
    assert.equal(totalUsage(u), 2);
    assert.equal(describeUsage(u), "2 purchase requests");
    assert.equal(describeUsage(emptyUsage()), "");
  });
  test("nameKey is case and space insensitive", () => assert.equal(nameKey(" Concrete   WORKS"), "concrete works"));
});
