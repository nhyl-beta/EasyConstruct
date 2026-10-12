// Pure calendar rules: which dates to fetch, how events are filtered, grouped and
// moved between, and how the page state round-trips through the URL. No React.
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { ROLE_RESOURCE_ACCESS } from "@/config/role-resources";
import type { CalendarEvent, CalendarEventType, CalendarView } from "../types/calendar.types";

export const EVENT_TYPES: CalendarEventType[] = ["milestone", "submission", "progress", "task"];
export const VIEWS: CalendarView[] = ["month", "week", "agenda"];

export const iso = (d: Date) => format(d, "yyyy-MM-dd");
export const fromIso = (s: string) => parseISO(s);

/**
 * The window to fetch for a cursor date: the whole month grid (Sunday of the first
 * week to Saturday of the last). Month, Week and Agenda all fit inside it, so
 * switching view never refetches, and each month is cached under its own range.
 */
export function fetchRange(anchor: Date): { from: string; to: string } {
  return { from: iso(startOfWeek(startOfMonth(anchor))), to: iso(endOfWeek(endOfMonth(anchor))) };
}

/** Move the cursor by one period of the current view. */
export function shiftAnchor(view: CalendarView, anchor: Date, direction: 1 | -1): Date {
  return view === "week" ? addWeeks(anchor, direction) : addMonths(anchor, direction);
}

export type ArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";
export function moveDay(anchor: Date, key: ArrowKey): Date {
  switch (key) {
    case "ArrowLeft":
      return addDays(anchor, -1);
    case "ArrowRight":
      return addDays(anchor, 1);
    case "ArrowUp":
      return addDays(anchor, -7);
    case "ArrowDown":
      return addDays(anchor, 7);
  }
}

export interface CalendarFilters {
  /** Event types switched off in the legend. */
  hiddenTypes: CalendarEventType[];
  /** Project code, or "" for all. */
  project: string;
  mineOnly: boolean;
}

export const NO_FILTERS: CalendarFilters = { hiddenTypes: [], project: "", mineOnly: false };

export const hasActiveFilters = (f: CalendarFilters) => f.hiddenTypes.length > 0 || f.project !== "" || f.mineOnly;

/** Project and Mine filters, without the type toggles (the legend counts are taken on this set). */
export function applyScopeFilters(events: CalendarEvent[], f: CalendarFilters): CalendarEvent[] {
  return events.filter((e) => (!f.project || e.projectCode === f.project) && (!f.mineOnly || e.mine));
}

export function applyFilters(events: CalendarEvent[], f: CalendarFilters): CalendarEvent[] {
  const hidden = new Set(f.hiddenTypes);
  return applyScopeFilters(events, f).filter((e) => !hidden.has(e.type));
}

export function countByType(events: CalendarEvent[]): Record<CalendarEventType, number> {
  const out: Record<CalendarEventType, number> = { milestone: 0, submission: 0, progress: 0, task: 0 };
  for (const e of events) out[e.type] += 1;
  return out;
}

/** Sort inside a day: needs-attention first, then by type order, then title. */
export function sortDay(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort(
    (a, b) =>
      Number(!!b.attention) - Number(!!a.attention) ||
      EVENT_TYPES.indexOf(a.type) - EVENT_TYPES.indexOf(b.type) ||
      a.title.localeCompare(b.title),
  );
}

export function groupByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const list = map.get(e.date) ?? [];
    list.push(e);
    map.set(e.date, list);
  }
  for (const [k, v] of map) map.set(k, sortDay(v));
  return map;
}

export function groupByType(events: CalendarEvent[]): { type: CalendarEventType; events: CalendarEvent[] }[] {
  return EVENT_TYPES.map((type) => ({ type, events: sortDay(events.filter((e) => e.type === type)) })).filter((g) => g.events.length > 0);
}

/** Projects present in the loaded events, for the Project filter (the server only sends visible ones). */
export function projectOptions(events: CalendarEvent[], selected: string): { code: string; name: string }[] {
  const map = new Map<string, string>();
  for (const e of events) map.set(e.projectCode, e.projectName);
  if (selected && !map.has(selected)) map.set(selected, selected);
  return [...map].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** "Waiting for action" / "Overdue" text, so the cue never relies on colour. */
export const attentionLabel = (e: CalendarEvent): string | null =>
  e.attention === "overdue" ? "Overdue" : e.attention === "waiting" ? "Waiting for action" : null;

/** Where "Open" goes. Submissions open the workflow where the role can see workflows; otherwise the project. */
export function eventHref(e: CalendarEvent, role: string): string {
  const resources = ROLE_RESOURCE_ACCESS[role] ?? [];
  const project = `/projects/${encodeURIComponent(e.projectCode)}`;
  if (e.type === "submission") {
    if (resources.includes("workflows")) return `/workflows?open=${e.sourceId}`;
    if (resources.includes("admin-workflows")) return "/admin/workflows";
    return project;
  }
  if (e.type === "task" && resources.includes("tasks")) return "/tasks";
  return project;
}

// ── URL state ────────────────────────────────────────────────────────────────

export interface CalendarState {
  anchor: string; // YYYY-MM-DD cursor date
  view: CalendarView;
  filters: CalendarFilters;
  /** Date whose day panel is open, if any. */
  day: string | null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validIso = (s: string | null): s is string => !!s && ISO.test(s) && !Number.isNaN(Date.parse(s));

export function parseState(params: URLSearchParams, defaults: { view: CalendarView; project: string; today: string }): CalendarState {
  const v = params.get("cview");
  const date = params.get("cdate");
  const hiddenRaw = params.get("chide");
  const hidden = (hiddenRaw ? hiddenRaw.split(",") : []).filter((t): t is CalendarEventType => (EVENT_TYPES as string[]).includes(t));
  const day = params.get("cday");
  return {
    anchor: validIso(date) ? date : defaults.today,
    view: (VIEWS as string[]).includes(v ?? "") ? (v as CalendarView) : defaults.view,
    filters: {
      hiddenTypes: hidden,
      project: params.has("cproject") ? (params.get("cproject") ?? "") : defaults.project,
      mineOnly: params.get("cmine") === "1",
    },
    day: validIso(day) ? day : null,
  };
}

/** Writes the calendar's keys into a copy of `params`, leaving every other key alone. Defaults are omitted. */
export function writeState(params: URLSearchParams, s: CalendarState, defaults: { today: string; project?: string }): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const k of ["cdate", "cview", "chide", "cproject", "cmine", "cday"]) next.delete(k);
  if (s.anchor !== defaults.today) next.set("cdate", s.anchor);
  next.set("cview", s.view);
  if (s.filters.hiddenTypes.length) next.set("chide", s.filters.hiddenTypes.join(","));
  // An empty value means "all projects" and overrides a remembered project.
  if (s.filters.project || defaults.project) next.set("cproject", s.filters.project);
  if (s.filters.mineOnly) next.set("cmine", "1");
  if (s.day) next.set("cday", s.day);
  return next;
}
