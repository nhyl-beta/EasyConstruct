import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { hitLimiter, throttleMessage, throttleState } from "./throttle.js";

const NOW = new Date("2026-10-12T04:00:00Z");
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

describe("throttleState", () => {
  test("fewer than five recent failures is not blocked", () => {
    assert.deepEqual(throttleState([ago(1), ago(2), ago(3), ago(4)], NOW), { blocked: false, retryAfterSeconds: 0 });
    assert.deepEqual(throttleState([], NOW), { blocked: false, retryAfterSeconds: 0 });
  });

  test("five failures inside the window block, until the fifth most recent ages out", () => {
    const failures = [ago(1), ago(3), ago(5), ago(8), ago(10)];
    const s = throttleState(failures, NOW);
    assert.equal(s.blocked, true);
    // the oldest of the five (10 minutes ago) leaves the 15-minute window in 5 minutes
    assert.equal(s.retryAfterSeconds, 300);
  });

  test("failures older than the window do not count", () => {
    assert.equal(throttleState([ago(1), ago(2), ago(3), ago(4), ago(16)], NOW).blocked, false);
  });

  test("with more than the limit, only the Nth most recent matters", () => {
    const failures = [ago(0.5), ago(1), ago(2), ago(3), ago(4), ago(12)];
    const s = throttleState(failures, NOW);
    assert.equal(s.blocked, true);
    // fifth most recent is 4 minutes ago -> leaves in 11 minutes
    assert.equal(s.retryAfterSeconds, 660);
  });

  test("order of the input does not matter", () => {
    const a = throttleState([ago(10), ago(1), ago(8), ago(3), ago(5)], NOW);
    const b = throttleState([ago(1), ago(3), ago(5), ago(8), ago(10)], NOW);
    assert.deepEqual(a, b);
  });

  test("the message rounds the wait up to whole minutes", () => {
    assert.match(throttleMessage({ blocked: true, retryAfterSeconds: 61 }), /Try again in 2 minutes/);
    assert.match(throttleMessage({ blocked: true, retryAfterSeconds: 30 }), /Try again in 1 minute,/);
  });
});

describe("hitLimiter", () => {
  test("allows up to the limit inside the window, then refuses, then recovers", () => {
    const hits = new Map<string, number[]>();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) assert.equal(hitLimiter(hits, "1.2.3.4", t0 + i, 3, 60_000), true);
    assert.equal(hitLimiter(hits, "1.2.3.4", t0 + 10, 3, 60_000), false);
    assert.equal(hitLimiter(hits, "1.2.3.4", t0 + 61_000, 3, 60_000), true);
  });

  test("addresses are counted separately", () => {
    const hits = new Map<string, number[]>();
    assert.equal(hitLimiter(hits, "a", 0, 1, 1000), true);
    assert.equal(hitLimiter(hits, "a", 1, 1, 1000), false);
    assert.equal(hitLimiter(hits, "b", 1, 1, 1000), true);
  });
});
