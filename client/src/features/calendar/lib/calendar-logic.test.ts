import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "../types/calendar.types";
import {
  NO_FILTERS,
  applyFilters,
  applyScopeFilters,
  countByType,
  eventHref,
  fetchRange,
  fromIso,
  groupByDate,
  groupByType,
  hasActiveFilters,
  moveDay,
  parseState,
  projectOptions,
  shiftAnchor,
  writeState,
} from "./calendar-logic";

const ev = (id: number, over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: `e${id}`,
  type: "milestone",
  date: "2026-10-12",
  title: `Event ${id}`,
  projectCode: "P-1",
  projectName: "Alpha",
  sourceId: id,
  involves: [],
  mine: false,
  ...over,
});

describe("fetchRange", () => {
  it("covers the whole month grid, Sunday to Saturday", () => {
    // October 2026 starts on a Thursday and ends on a Saturday.
    expect(fetchRange(fromIso("2026-10-15"))).toEqual({ from: "2026-09-27", to: "2026-10-31" });
  });
  it("is the same for any day in the month, so view changes never refetch", () => {
    expect(fetchRange(fromIso("2026-10-01"))).toEqual(fetchRange(fromIso("2026-10-31")));
  });
  it("a week of the anchor day always lies inside the range", () => {
    const { from, to } = fetchRange(fromIso("2026-11-01"));
    expect(from <= "2026-11-01" && "2026-11-07" <= to).toBe(true);
  });
});

describe("navigation", () => {
  it("shifts by a month in Month and Agenda, by a week in Week", () => {
    expect(shiftAnchor("month", fromIso("2026-10-31"), 1).getMonth()).toBe(10);
    expect(shiftAnchor("agenda", fromIso("2026-10-15"), -1).getMonth()).toBe(8);
    expect(shiftAnchor("week", fromIso("2026-10-15"), 1).getDate()).toBe(22);
  });
  it("arrow keys move by a day or a week", () => {
    const d = fromIso("2026-10-15");
    expect(moveDay(d, "ArrowLeft").getDate()).toBe(14);
    expect(moveDay(d, "ArrowRight").getDate()).toBe(16);
    expect(moveDay(d, "ArrowUp").getDate()).toBe(8);
    expect(moveDay(d, "ArrowDown").getDate()).toBe(22);
  });
});

describe("filters", () => {
  const events = [
    ev(1, { type: "milestone", projectCode: "P-1", mine: true }),
    ev(2, { type: "submission", projectCode: "P-1" }),
    ev(3, { type: "progress", projectCode: "P-2", mine: true }),
    ev(4, { type: "task", projectCode: "P-2", mine: true }),
  ];
  it("no filters keeps everything", () => {
    expect(applyFilters(events, NO_FILTERS)).toHaveLength(4);
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
  });
  it("hides toggled-off types", () => {
    const r = applyFilters(events, { ...NO_FILTERS, hiddenTypes: ["submission", "task"] });
    expect(r.map((e) => e.type)).toEqual(["milestone", "progress"]);
  });
  it("filters by project and by mine, and they combine", () => {
    expect(applyFilters(events, { ...NO_FILTERS, project: "P-2" })).toHaveLength(2);
    expect(applyFilters(events, { ...NO_FILTERS, mineOnly: true })).toHaveLength(3);
    expect(applyFilters(events, { ...NO_FILTERS, project: "P-1", mineOnly: true }).map((e) => e.id)).toEqual(["e1"]);
  });
  it("legend counts are taken before the type toggles so a hidden type still shows its count", () => {
    const f = { ...NO_FILTERS, hiddenTypes: ["milestone" as const], project: "P-1" };
    expect(countByType(applyScopeFilters(events, f))).toEqual({ milestone: 1, submission: 1, progress: 0, task: 0 });
    expect(hasActiveFilters(f)).toBe(true);
  });
  it("the hidden count is total minus shown", () => {
    const f = { ...NO_FILTERS, hiddenTypes: ["task" as const] };
    expect(events.length - applyFilters(events, f).length).toBe(1);
  });
});

describe("grouping", () => {
  it("groups by date and puts events needing attention first", () => {
    const g = groupByDate([ev(1, { title: "B" }), ev(2, { title: "A", attention: "overdue" }), ev(3, { date: "2026-10-13" })]);
    expect(g.get("2026-10-12")!.map((e) => e.id)).toEqual(["e2", "e1"]);
    expect(g.get("2026-10-13")).toHaveLength(1);
  });
  it("groups a day by type in a fixed order and drops empty groups", () => {
    const g = groupByType([ev(1, { type: "task" }), ev(2, { type: "milestone" })]);
    expect(g.map((x) => x.type)).toEqual(["milestone", "task"]);
  });
  it("lists projects once, sorted by name, and keeps a selected project that has no events", () => {
    const opts = projectOptions([ev(1, { projectCode: "P-2", projectName: "Zed" }), ev(2, { projectCode: "P-1", projectName: "Alpha" }), ev(3, { projectCode: "P-1", projectName: "Alpha" })], "P-9");
    expect(opts.map((o) => o.code)).toEqual(["P-1", "P-9", "P-2"]);
  });
});

describe("Open links", () => {
  it("a PM opens a submission in the workflows page", () => {
    expect(eventHref(ev(7, { type: "submission" }), "project_manager")).toBe("/workflows?open=7");
  });
  it("admin goes to the admin workflows list", () => {
    expect(eventHref(ev(7, { type: "submission" }), "admin")).toBe("/admin/workflows");
  });
  it("a role without a workflows page lands on the project", () => {
    expect(eventHref(ev(7, { type: "submission", projectCode: "P 1" }), "site_personnel")).toBe("/projects/P%201");
  });
  it("milestones and progress open the project; tasks open Tasks where the role has it", () => {
    expect(eventHref(ev(1), "owner")).toBe("/projects/P-1");
    expect(eventHref(ev(2, { type: "progress" }), "project_manager")).toBe("/projects/P-1");
    expect(eventHref(ev(3, { type: "task" }), "site_personnel")).toBe("/tasks");
  });
});

describe("URL state", () => {
  const defaults = { view: "month" as const, project: "", today: "2026-10-12" };
  it("round-trips date, view, filters and the open day", () => {
    const state = { anchor: "2026-11-03", view: "week" as const, filters: { hiddenTypes: ["task" as const], project: "P-1", mineOnly: true }, day: "2026-11-04" };
    const params = writeState(new URLSearchParams("keep=1"), state, { today: defaults.today });
    expect(params.get("keep")).toBe("1");
    expect(parseState(params, defaults)).toEqual(state);
  });
  it("omits the default date and ignores garbage", () => {
    const p = writeState(new URLSearchParams(), { anchor: "2026-10-12", view: "month", filters: NO_FILTERS, day: null }, { today: defaults.today });
    expect(p.has("cdate")).toBe(false);
    const parsed = parseState(new URLSearchParams("cdate=nope&cview=year&chide=x,task&cday=2026-13-99"), defaults);
    expect(parsed.anchor).toBe("2026-10-12");
    expect(parsed.view).toBe("month");
    expect(parsed.filters.hiddenTypes).toEqual(["task"]);
    expect(parsed.day).toBeNull();
  });
  it("a remembered project applies only when the URL does not say otherwise", () => {
    expect(parseState(new URLSearchParams(), { ...defaults, project: "P-3" }).filters.project).toBe("P-3");
    expect(parseState(new URLSearchParams("cproject="), { ...defaults, project: "P-3" }).filters.project).toBe("");
  });
});
