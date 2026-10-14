// server/src/workforce-reports/fairness.ts: pure, no I/O (objectives fix 2.6)
//
// A read-only look at how work and pay are spread across people: hours,
// overtime and task counts per worker per project, and each pay rate against the
// median of the same position. It flags outliers so HR can look; it decides
// nothing and changes no record. Every flag states what it was compared with.
import { median } from "../payroll/validation.js";

export const FAIRNESS_CONFIG = {
  /** Fewest workers on a project needed before comparing hours or tasks between them. */
  minWorkersPerProject: 3,
  /** Hours (or tasks) above this multiple of the project mean are flagged high. */
  highFactor: 1.5,
  /** ...and below this multiple, low (only for people who worked at all). */
  lowFactor: 0.5,
  /** Overtime above this share of a person's hours is flagged. */
  overtimeShare: 0.35,
  /** Pay rate this far from the position median (percent) is an outlier. */
  rateTolerancePct: 25,
  /** Fewest people in a position before its median means anything. */
  minPeers: 3,
} as const;

export type FairnessConfig = {
  minWorkersPerProject: number;
  highFactor: number;
  lowFactor: number;
  overtimeShare: number;
  rateTolerancePct: number;
  minPeers: number;
};

export interface WorkerProjectRow {
  employeeId: string;
  name: string;
  position: string;
  projectCode: string;
  days: number;
  hours: number;
  overtimeHours: number;
  tasksAssigned: number;
  tasksCompleted: number;
  tasksOpen: number;
}

export interface WorkerRate {
  employeeId: string;
  name: string;
  position: string;
  rateType: string;
  payRate: number;
}

export type FlagKind = "hours_high" | "hours_low" | "overtime_high" | "tasks_high" | "rate_outlier";

export interface FairnessFlag {
  kind: FlagKind;
  employeeId: string;
  name: string;
  projectCode: string | null;
  message: string;
}

export interface PositionRates {
  position: string;
  rateType: string;
  people: number;
  median: number;
  min: number;
  max: number;
  outliers: { employeeId: string; name: string; payRate: number; diffPct: number }[];
}

const php = (n: number) => `₱${n.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
const round1 = (n: number) => Math.round(n * 10) / 10;

export const compareRates = (rates: WorkerRate[], cfg: FairnessConfig = FAIRNESS_CONFIG): PositionRates[] => {
  const groups = new Map<string, WorkerRate[]>();
  for (const r of rates) {
    if (!(r.payRate > 0)) continue;
    const key = `${r.position}|${r.rateType}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const out: PositionRates[] = [];
  for (const people of groups.values()) {
    if (people.length < cfg.minPeers) continue;
    const mid = median(people.map((p) => p.payRate));
    const outliers = people
      .map((p) => ({ employeeId: p.employeeId, name: p.name, payRate: p.payRate, diffPct: round1(((p.payRate - mid) / mid) * 100) }))
      .filter((p) => Math.abs(p.diffPct) > cfg.rateTolerancePct);
    out.push({
      position: people[0]!.position,
      rateType: people[0]!.rateType,
      people: people.length,
      median: mid,
      min: Math.min(...people.map((p) => p.payRate)),
      max: Math.max(...people.map((p) => p.payRate)),
      outliers,
    });
  }
  return out.sort((a, b) => a.position.localeCompare(b.position));
};

export const fairnessFlags = (
  rows: WorkerProjectRow[],
  rates: PositionRates[],
  cfg: FairnessConfig = FAIRNESS_CONFIG,
): FairnessFlag[] => {
  const flags: FairnessFlag[] = [];

  const byProject = new Map<string, WorkerProjectRow[]>();
  for (const r of rows) byProject.set(r.projectCode, [...(byProject.get(r.projectCode) ?? []), r]);

  for (const [projectCode, people] of byProject) {
    if (people.length >= cfg.minWorkersPerProject) {
      const meanHours = people.reduce((s, p) => s + p.hours, 0) / people.length;
      const meanTasks = people.reduce((s, p) => s + p.tasksAssigned, 0) / people.length;
      for (const p of people) {
        if (meanHours > 0 && p.hours > meanHours * cfg.highFactor) {
          flags.push({
            kind: "hours_high",
            employeeId: p.employeeId,
            name: p.name,
            projectCode,
            message: `${p.name} worked ${round1(p.hours)} hours on ${projectCode}, more than ${cfg.highFactor} times the project average of ${round1(meanHours)} (${people.length} workers).`,
          });
        } else if (meanHours > 0 && p.hours > 0 && p.hours < meanHours * cfg.lowFactor) {
          flags.push({
            kind: "hours_low",
            employeeId: p.employeeId,
            name: p.name,
            projectCode,
            message: `${p.name} worked ${round1(p.hours)} hours on ${projectCode}, less than half the project average of ${round1(meanHours)} (${people.length} workers).`,
          });
        }
        if (meanTasks > 0 && p.tasksAssigned > meanTasks * cfg.highFactor) {
          flags.push({
            kind: "tasks_high",
            employeeId: p.employeeId,
            name: p.name,
            projectCode,
            message: `${p.name} has ${p.tasksAssigned} tasks on ${projectCode}, more than ${cfg.highFactor} times the project average of ${round1(meanTasks)}.`,
          });
        }
      }
    }
    for (const p of people) {
      if (p.hours > 0 && p.overtimeHours / p.hours > cfg.overtimeShare) {
        flags.push({
          kind: "overtime_high",
          employeeId: p.employeeId,
          name: p.name,
          projectCode,
          message: `${p.name} has ${round1(p.overtimeHours)} overtime hours out of ${round1(p.hours)} on ${projectCode} (${Math.round((p.overtimeHours / p.hours) * 100)}%, limit ${Math.round(cfg.overtimeShare * 100)}%).`,
        });
      }
    }
  }

  for (const pos of rates) {
    for (const o of pos.outliers) {
      flags.push({
        kind: "rate_outlier",
        employeeId: o.employeeId,
        name: o.name,
        projectCode: null,
        message: `${o.name} is paid ${php(o.payRate)}, ${Math.abs(o.diffPct)}% ${o.diffPct > 0 ? "above" : "below"} the median ${php(pos.median)} for ${pos.people} ${pos.position}s (${pos.rateType.toLowerCase()} rate).`,
      });
    }
  }
  return flags;
};

export const summarizeFairness = (rows: WorkerProjectRow[], rates: WorkerRate[], cfg: FairnessConfig = FAIRNESS_CONFIG) => {
  const positions = compareRates(rates, cfg);
  return { positions, flags: fairnessFlags(rows, positions, cfg) };
};
