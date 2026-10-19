import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildHeatmap, lastDays, type HeatmapRow } from "./heatmap.js";

const today = new Date(2026, 9, 14); // 14 Oct 2026
const row = (site: string, logDate: string, attendanceStatus = "Present", hours: number | null = 8): HeatmapRow => ({
  site,
  logDate,
  attendanceStatus,
  clockOut: hours ? "17:00" : null,
  hours,
});

describe("buildHeatmap", () => {
  test("covers exactly the last N days, oldest first, ending today", () => {
    const days = lastDays(14, today);
    assert.equal(days.length, 14);
    assert.equal(days[13], "2026-10-14");
    assert.equal(days[0], "2026-10-01");
  });

  test("counts clock-ins per site per day and ignores rows outside the window", () => {
    const h = buildHeatmap(
      [row("A", "2026-10-14"), row("A", "2026-10-14"), row("A", "2026-10-13"), row("B", "2026-10-14"), row("A", "2026-09-01")],
      14,
      6,
      today,
    );
    const a = h.sites.find((s) => s.site === "A")!;
    assert.equal(a.total, 3);
    assert.equal(a.max, 2);
    assert.equal(a.cells[13]!.count, 2);
    assert.equal(a.cells[12]!.count, 1);
    assert.equal(h.sites[0]!.site, "A"); // busiest first
  });

  test("on-time rate, late arrivals per day and average shift come from the rows", () => {
    const h = buildHeatmap(
      [
        row("A", "2026-10-14", "Present", 8),
        row("A", "2026-10-14", "Late", 10),
        row("A", "2026-10-13", "Present", 9),
        row("A", "2026-10-13", "Absent", null),
      ],
      14,
      6,
      today,
    );
    assert.equal(Math.round(h.onTimeRate!), 67); // 2 of 3 who worked were on time
    assert.equal(h.lateArrivalsPerDay, 0.5); // 1 late over 2 days with records
    assert.equal(h.avgShiftHours, 9);
  });

  test("no data gives nulls, not zeros or NaN", () => {
    const h = buildHeatmap([], 14, 6, today);
    assert.deepEqual([h.sites.length, h.onTimeRate, h.lateArrivalsPerDay, h.avgShiftHours], [0, null, null, null]);
  });

  test("keeps only the busiest sites", () => {
    const rows = ["A", "B", "C"].flatMap((s, i) => Array.from({ length: i + 1 }, () => row(s, "2026-10-14")));
    assert.deepEqual(buildHeatmap(rows, 14, 2, today).sites.map((s) => s.site), ["C", "B"]);
  });
});
