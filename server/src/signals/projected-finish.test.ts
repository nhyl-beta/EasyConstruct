import { test } from "node:test";
import assert from "node:assert/strict";
import { projectFinish, projectedFinishRule } from "./projected-finish.js";
import type { LifecycleSnapshot } from "../lifecycle/repository.js";

const NOW = new Date("2026-10-12T04:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const snap = (tasks: unknown[], milestones: unknown[]) =>
  ({ project: { code: "P-1", status: "Construction" }, tasks, milestones }) as unknown as LifecycleSnapshot;

const done = (daysBack: number) => ({ status: "Completed", completedAt: daysAgo(daysBack), createdAt: daysAgo(60) });
const open = () => ({ status: "Pending", completedAt: null, createdAt: daysAgo(60) });
const pace = () => [...Array.from({ length: 14 }, () => done(3)), ...Array.from({ length: 10 }, open)];

test("projects a finish date from the trailing 28 days of completions", () => {
  // 14 done in 28 days = 0.5 per day; 10 remain -> 20 days
  const p = projectFinish(pace() as never, [{ status: "active", estimatedCompletionDate: "2026-10-20" }], "2026-10-12", NOW);
  assert.equal(p.completedInWindow, 14);
  assert.equal(p.projectedFinish, "2026-11-01");
  assert.equal(p.slipDays, 12);
});

test("completions older than the window do not count", () => {
  const p = projectFinish([done(40), open()] as never, [], "2026-10-12", NOW);
  assert.equal(p.completedInWindow, 0);
  assert.equal(p.projectedFinish, null);
});

test("raises a warning or critical signal when the finish falls well after the last milestone", () => {
  const warn = projectedFinishRule.evaluate(snap(pace(), [{ status: "active", estimatedCompletionDate: "2026-10-20" }]), { now: NOW });
  assert.ok(warn && !Array.isArray(warn));
  assert.equal(warn.severity, "warn"); // 12 days late
  const crit = projectedFinishRule.evaluate(snap(pace(), [{ status: "active", estimatedCompletionDate: "2026-10-01" }]), { now: NOW });
  assert.ok(crit && !Array.isArray(crit));
  assert.equal(crit.severity, "critical"); // 31 days late
});

test("stays quiet when on pace, with nothing left, or with no milestone dates", () => {
  assert.equal(projectedFinishRule.evaluate(snap(pace(), [{ status: "active", estimatedCompletionDate: "2026-12-31" }]), { now: NOW }), null);
  assert.equal(projectedFinishRule.evaluate(snap([done(2)], [{ status: "active", estimatedCompletionDate: "2026-10-13" }]), { now: NOW }), null);
  assert.equal(projectedFinishRule.evaluate(snap(pace(), []), { now: NOW }), null);
});

test("no completions in the window warns, unless the crew has only just started", () => {
  const stale = projectedFinishRule.evaluate(snap([open(), open()], [{ status: "active", estimatedCompletionDate: "2026-12-31" }]), { now: NOW });
  assert.ok(stale && !Array.isArray(stale));
  assert.equal(stale.severity, "warn");
  const fresh = [{ status: "Pending", completedAt: null, createdAt: daysAgo(2) }];
  assert.equal(projectedFinishRule.evaluate(snap(fresh, [{ status: "active", estimatedCompletionDate: "2026-12-31" }]), { now: NOW }), null);
});

test("the rule never gates: it returns a signal with no pass/fail field", () => {
  const s = projectedFinishRule.evaluate(snap(pace(), [{ status: "active", estimatedCompletionDate: "2026-10-01" }]), { now: NOW });
  assert.ok(s && !Array.isArray(s));
  assert.equal("passed" in s, false);
});
