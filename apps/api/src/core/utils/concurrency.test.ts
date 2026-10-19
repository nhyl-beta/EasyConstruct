import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mapWithConcurrency } from "./concurrency.js";

describe("mapWithConcurrency", () => {
  test("keeps the input order and never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5 * (8 - n)));
      inFlight -= 1;
      return n * 10;
    });
    assert.deepEqual(out, [10, 20, 30, 40, 50, 60, 70]);
    assert.ok(peak <= 3 && peak > 1, `peak ${peak}`);
  });
  test("an empty list and a limit larger than the list are fine", async () => {
    assert.deepEqual(await mapWithConcurrency([], 5, async (x) => x), []);
    assert.deepEqual(await mapWithConcurrency([1, 2], 10, async (x) => x + 1), [2, 3]);
  });
  test("a rejection rejects the run", async () => {
    await assert.rejects(mapWithConcurrency([1, 2, 3], 2, async (n) => { if (n === 2) throw new Error("x"); return n; }), /x/);
  });
});
