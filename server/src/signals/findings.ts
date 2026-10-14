// server/src/signals/findings.ts: pure, no I/O (objectives fix 3.5)
//
// Reconciles what the scan sees now with what is stored, so a finding is raised
// and notified once per occurrence however many times the scan runs. Nothing
// here gates anything: it only decides what to record and whom to tell.
import type { Signal } from "./types.js";

export interface StoredFinding {
  key: string;
  projectCode: string;
  severity: string;
  resolvedAt: Date | null;
}

export interface CurrentFinding {
  key: string;
  projectCode: string;
  rule: string;
  severity: "warn" | "critical";
  signal: Signal;
}

export interface FindingChanges {
  /** Never seen before: insert and notify. */
  create: CurrentFinding[];
  /** Was resolved and the condition is back: start a new occurrence, notify again. */
  reopen: CurrentFinding[];
  /** Still true: refresh last_seen (and severity). No notification. */
  touch: CurrentFinding[];
  /** Stored as open but no longer reported: set resolved_at. */
  resolve: StoredFinding[];
}

/** Stored key for a signal: the signal key alone can repeat across projects (for example issue-recurrence:<category>). */
export const findingKey = (projectCode: string, signalKey: string): string => `${projectCode}|${signalKey}`;

/** Only warn and critical are recorded; info signals stay on the project page. */
export const toCurrentFindings = (projectCode: string, signals: Signal[]): CurrentFinding[] => {
  const seen = new Set<string>();
  const out: CurrentFinding[] = [];
  for (const signal of signals) {
    if (signal.severity === "info") continue;
    const key = findingKey(projectCode, signal.key);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, projectCode, rule: signal.rule, severity: signal.severity, signal });
  }
  return out;
};

/**
 * `scannedProjects` are the projects this run evaluated: a stored finding is
 * only resolved when its project was scanned (a project that was not scanned,
 * for example one just put On Hold, keeps its findings untouched).
 */
export const reconcileFindings = (
  stored: StoredFinding[],
  current: CurrentFinding[],
  scannedProjects: ReadonlySet<string>,
): FindingChanges => {
  const storedByKey = new Map(stored.map((s) => [s.key, s]));
  const currentKeys = new Set(current.map((c) => c.key));

  const changes: FindingChanges = { create: [], reopen: [], touch: [], resolve: [] };
  for (const c of current) {
    const existing = storedByKey.get(c.key);
    if (!existing) changes.create.push(c);
    else if (existing.resolvedAt) changes.reopen.push(c);
    else changes.touch.push(c);
  }
  for (const s of stored) {
    if (s.resolvedAt || currentKeys.has(s.key)) continue;
    if (scannedProjects.has(s.projectCode)) changes.resolve.push(s);
  }
  return changes;
};

/** The in-app notification for a new finding. */
export const notificationFor = (f: CurrentFinding): { title: string; body: string; link: string } => ({
  title: f.severity === "critical" ? "Critical issue detected" : "Issue detected",
  body: `${f.signal.label}. ${f.signal.suggestedResolution?.action ?? ""}`.trim(),
  link: f.signal.link || `/projects/${encodeURIComponent(f.projectCode)}`,
});
