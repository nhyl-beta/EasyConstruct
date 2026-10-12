// server/src/tasks/suggest.ts — pure, no I/O (objectives fix 2.1 / 2.2)
//
// Rule-based task allocation. Ranks the people already staffed on a project
// for one task and says why. It is advice only: nothing here writes, blocks or
// assigns; a Project Manager or Engineer makes the call. Weights and windows
// live in ALLOCATION_CONFIG so the numbers can be read and tuned in one place.
//
// The same module assesses a *chosen* assignee (`assessAssignment`, fix 2.2) so
// the warning a PM sees after picking someone by hand uses the same rules as
// the ranking.

export const ALLOCATION_CONFIG = {
  topN: 3,
  /** Open tasks (not Completed) above which an assignee is flagged as loaded. */
  openTaskLimit: 5,
  /** Another task due within this many days of the target date counts as an overlap. */
  dueWindowDays: 3,
  /** Attendance days are counted over this many trailing days. */
  attendanceWindowDays: 14,
  attendanceCapDays: 10,
  weights: {
    base: 100,
    perOpenTask: 8,
    perOverlappingTask: 6,
    perAttendanceDay: 1.5,
    positionMatch: 15,
  },
} as const;

/**
 * Trade keywords: a worker whose position contains a key is a better fit for a
 * task whose title contains one of the listed words. Matching is on lowercase
 * substrings, so it is cheap to read and to extend.
 */
export const TRADE_KEYWORDS: Record<string, readonly string[]> = {
  mason: ["concrete", "masonry", "brick", "block", "plaster", "slab", "pour", "cement", "foundation", "wall"],
  carpenter: ["formwork", "framing", "carpentry", "timber", "door", "window", "roof", "scaffold", "ceiling"],
  steel: ["rebar", "reinforc", "steel", "bar bending"],
  electrician: ["electric", "wiring", "conduit", "panel", "lighting", "cable"],
  plumber: ["plumb", "pipe", "drain", "sanitary", "water line", "fixture"],
  welder: ["weld", "fabricat", "steel frame", "truss"],
  surveyor: ["survey", "layout", "staking", "elevation"],
  "equipment operator": ["excavat", "backfill", "grading", "haul", "crane", "earthwork"],
  foreman: ["supervis", "coordinate", "inspection", "sequencing"],
  safety: ["safety", "hazard", "ppe", "toolbox"],
  laborer: ["clean", "mobiliz", "haul", "material handling", "site prep"],
};

export interface OpenTask {
  id?: number;
  dueDate: string | null;
}

export interface AllocationCandidate {
  userId: number;
  name: string;
  employeeId: string | null;
  /** employees.role, the job position (Mason, Foreman…). */
  position: string | null;
  /** employees.status; only "Active" is eligible. */
  employeeStatus: string;
  openTasks: OpenTask[];
  /** Distinct days with a Present/Late/Half Day record in the trailing window. */
  attendanceDays: number;
  /** An attendance row for today says On Leave. */
  onLeaveToday: boolean;
  /** An attendance row for today says Absent. */
  absentToday: boolean;
}

export interface AllocationQuery {
  title: string;
  dueDate?: string | null;
}

export interface RankedCandidate {
  userId: number;
  name: string;
  employeeId: string | null;
  position: string | null;
  score: number;
  openTasks: number;
  reasons: string[];
}

export interface Exclusion {
  userId: number;
  name: string;
  reason: string;
}

export interface AllocationResult {
  ranked: RankedCandidate[];
  excluded: Exclusion[];
  basis: string;
}

const MS_PER_DAY = 86_400_000;

const toDay = (iso: string): number | null => {
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(t) ? null : Math.floor(t / MS_PER_DAY);
};

/** Open tasks due within `windowDays` of `dueDate` (inclusive). */
export const countOverlapping = (
  openTasks: OpenTask[],
  dueDate: string | null | undefined,
  windowDays: number = ALLOCATION_CONFIG.dueWindowDays,
): number => {
  if (!dueDate) return 0;
  const target = toDay(dueDate);
  if (target == null) return 0;
  return openTasks.filter((t) => {
    if (!t.dueDate) return false;
    const day = toDay(t.dueDate);
    return day != null && Math.abs(day - target) <= windowDays;
  }).length;
};

/** Does the position fit the task title? Returns the matched trade or null. */
export const positionFit = (position: string | null | undefined, title: string): string | null => {
  if (!position) return null;
  const pos = position.toLowerCase();
  const text = title.toLowerCase();
  for (const [trade, words] of Object.entries(TRADE_KEYWORDS)) {
    if (!pos.includes(trade)) continue;
    if (words.some((w) => text.includes(w)) || text.includes(trade)) return trade;
  }
  return null;
};

export const ineligibleReason = (c: AllocationCandidate): string | null => {
  if (c.employeeStatus !== "Active") return `employee status is ${c.employeeStatus}`;
  if (c.onLeaveToday) return "on leave today";
  if (c.absentToday) return "recorded absent today";
  return null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export const scoreCandidate = (c: AllocationCandidate, q: AllocationQuery): RankedCandidate => {
  const w = ALLOCATION_CONFIG.weights;
  const open = c.openTasks.length;
  const overlap = countOverlapping(c.openTasks, q.dueDate);
  const days = Math.min(c.attendanceDays, ALLOCATION_CONFIG.attendanceCapDays);
  const fit = positionFit(c.position, q.title);

  const score = round1(
    w.base - open * w.perOpenTask - overlap * w.perOverlappingTask + days * w.perAttendanceDay + (fit ? w.positionMatch : 0),
  );

  const reasons: string[] = [
    open === 0 ? "No open tasks" : `${open} open task${open === 1 ? "" : "s"}`,
  ];
  if (q.dueDate) {
    reasons.push(
      overlap === 0
        ? `Nothing else due within ${ALLOCATION_CONFIG.dueWindowDays} days of ${q.dueDate}`
        : `${overlap} other task${overlap === 1 ? "" : "s"} due within ${ALLOCATION_CONFIG.dueWindowDays} days of ${q.dueDate}`,
    );
  }
  reasons.push(
    `Present ${c.attendanceDays} of the last ${ALLOCATION_CONFIG.attendanceWindowDays} days`,
  );
  if (fit && c.position) reasons.push(`Position "${c.position}" fits this kind of work`);

  return { userId: c.userId, name: c.name, employeeId: c.employeeId, position: c.position, score, openTasks: open, reasons };
};

const BASIS =
  `Ranked on open tasks, due dates within ${ALLOCATION_CONFIG.dueWindowDays} days, attendance in the last ` +
  `${ALLOCATION_CONFIG.attendanceWindowDays} days and position fit. Active staff only; people on leave or absent today are left out. Advice only.`;

/** Ranks eligible candidates (best first, ties by lowest userId) and lists who was left out and why. */
export const rankAssignees = (
  candidates: AllocationCandidate[],
  q: AllocationQuery,
  topN: number = ALLOCATION_CONFIG.topN,
): AllocationResult => {
  const excluded: Exclusion[] = [];
  const eligible: RankedCandidate[] = [];
  for (const c of candidates) {
    const reason = ineligibleReason(c);
    if (reason) excluded.push({ userId: c.userId, name: c.name, reason });
    else eligible.push(scoreCandidate(c, q));
  }
  eligible.sort((a, b) => b.score - a.score || a.userId - b.userId);
  return { ranked: eligible.slice(0, topN), excluded, basis: BASIS };
};

/**
 * Proposes one assignee per task, adding each proposal to that person's open
 * tasks so a batch does not pile everything on the same worker.
 */
export const allocateTasks = (
  candidates: AllocationCandidate[],
  tasks: { id: number; title: string; dueDate: string | null }[],
): { taskId: number; suggestions: RankedCandidate[] }[] => {
  const working = candidates.map((c) => ({ ...c, openTasks: [...c.openTasks] }));
  return tasks.map((t) => {
    const { ranked } = rankAssignees(working, { title: t.title, dueDate: t.dueDate });
    const best = ranked[0];
    if (best) {
      const owner = working.find((c) => c.userId === best.userId);
      owner?.openTasks.push({ dueDate: t.dueDate });
    }
    return { taskId: t.id, suggestions: ranked };
  });
};

export type AssignmentWarningCode = "over_limit" | "overlap" | "absent_today" | "on_leave_today" | "inactive";

export interface AssignmentWarning {
  code: AssignmentWarningCode;
  message: string;
}

/**
 * Warnings for a chosen assignee (fix 2.2). Never blocks: the caller shows them.
 * `openTasks` should exclude the task being edited.
 */
export const assessAssignment = (
  c: AllocationCandidate,
  dueDate: string | null | undefined,
  openTaskLimit: number = ALLOCATION_CONFIG.openTaskLimit,
): AssignmentWarning[] => {
  const warnings: AssignmentWarning[] = [];
  if (c.employeeStatus !== "Active") {
    warnings.push({ code: "inactive", message: `${c.name}'s employee status is ${c.employeeStatus}` });
  }
  if (c.onLeaveToday) warnings.push({ code: "on_leave_today", message: `${c.name} is on leave today` });
  else if (c.absentToday) warnings.push({ code: "absent_today", message: `${c.name} is recorded absent today` });
  if (c.openTasks.length >= openTaskLimit) {
    warnings.push({
      code: "over_limit",
      message: `${c.name} already has ${c.openTasks.length} open tasks (limit ${openTaskLimit})`,
    });
  }
  const overlap = countOverlapping(c.openTasks, dueDate);
  if (overlap > 0) {
    warnings.push({
      code: "overlap",
      message: `${c.name} has ${overlap} other task${overlap === 1 ? "" : "s"} due within ${ALLOCATION_CONFIG.dueWindowDays} days of ${dueDate}`,
    });
  }
  return warnings;
};
