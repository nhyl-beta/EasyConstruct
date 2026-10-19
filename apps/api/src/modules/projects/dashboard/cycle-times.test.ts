import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { formatDuration, hoursBetween, summarizeCycles, type CycleSample } from "./cycle-times.js";

const at = (iso: string) => new Date(iso);
const sample = (kind: CycleSample["kind"], group: string, start: string, end: string): CycleSample => ({
  kind,
  group,
  start: at(start),
  end: at(end),
});

describe("summarizeCycles", () => {
  test("averages and medians per kind and group, in hours", () => {
    const out = summarizeCycles([
      sample("workflow-approval", "Budget Change Request", "2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z"), // 24h
      sample("workflow-approval", "Budget Change Request", "2026-09-05T00:00:00Z", "2026-09-08T00:00:00Z"), // 72h
      sample("workflow-approval", "Budget Change Request", "2026-09-10T00:00:00Z", "2026-09-10T06:00:00Z"), // 6h
      sample("workflow-approval", "Design Proposal Approval", "2026-09-01T00:00:00Z", "2026-09-01T10:00:00Z"),
    ]);
    const bcr = out.find((s) => s.group === "Budget Change Request")!;
    assert.equal(bcr.count, 3);
    assert.equal(bcr.averageHours, 34);
    assert.equal(bcr.medianHours, 24);
    assert.equal(out.find((s) => s.group === "Design Proposal Approval")!.averageHours, 10);
  });

  test("monthly series groups by the month the work ended, in order", () => {
    const out = summarizeCycles([
      sample("issue-resolution", "All", "2026-08-30T00:00:00Z", "2026-09-02T00:00:00Z"), // ends September, 72h
      sample("issue-resolution", "All", "2026-09-10T00:00:00Z", "2026-09-11T00:00:00Z"), // 24h
      sample("issue-resolution", "All", "2026-10-01T00:00:00Z", "2026-10-01T12:00:00Z"), // 12h
    ])[0]!;
    assert.deepEqual(out.monthly, [
      { month: "2026-09", count: 2, averageHours: 48 },
      { month: "2026-10", count: 1, averageHours: 12 },
    ]);
  });

  test("a sample that ends before it starts is dropped", () => {
    const out = summarizeCycles([
      sample("payroll-approval", "All", "2026-09-02T00:00:00Z", "2026-09-01T00:00:00Z"),
      sample("payroll-approval", "All", "2026-09-01T00:00:00Z", "2026-09-01T08:00:00Z"),
    ]);
    assert.equal(out[0]!.count, 1);
    assert.equal(out[0]!.averageHours, 8);
  });

  test("no samples gives no series", () => {
    assert.deepEqual(summarizeCycles([]), []);
  });

  test("kinds stay apart", () => {
    const out = summarizeCycles([
      sample("request-response", "RFI", "2026-09-01T00:00:00Z", "2026-09-01T10:00:00Z"),
      sample("request-response", "RFA", "2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z"),
    ]);
    assert.equal(out.length, 2);
  });
});

test("duration helpers", () => {
  assert.equal(hoursBetween(at("2026-09-01T00:00:00Z"), at("2026-09-01T03:30:00Z")), 3.5);
  assert.equal(formatDuration(5), "5 hours");
  assert.equal(formatDuration(72), "3 days");
  assert.equal(formatDuration(47.9), "47.9 hours");
});
