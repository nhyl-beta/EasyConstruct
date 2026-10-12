import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findingKey, notificationFor, reconcileFindings, toCurrentFindings, type StoredFinding } from "./findings.js";
import { runSignals } from "./index.js";
import { overdueTasksRule } from "./overdue-tasks.js";
import { milestoneSlipRule } from "./milestone-slip.js";
import { PLAYBOOK, actionFor } from "./playbook.js";
import type { Signal } from "./types.js";
import type { LifecycleSnapshot } from "../lifecycle/repository.js";

const NOW = new Date("2026-10-12T04:00:00Z"); // 12:00 in Manila
const sig = (key: string, severity: Signal["severity"] = "warn", rule = "overdue-tasks"): Signal => ({
  key,
  rule,
  label: `label ${key}`,
  ownerRoles: ["project-manager"],
  severity,
  detail: "detail",
});

describe("reconcileFindings", () => {
  test("a new condition is created once, and a second scan only touches it (no repeat notification)", () => {
    const current = toCurrentFindings("P-1", [sig("overdue-tasks:P-1")]);
    const first = reconcileFindings([], current, new Set(["P-1"]));
    assert.equal(first.create.length, 1);
    assert.equal(first.touch.length, 0);

    const stored: StoredFinding[] = [{ key: current[0]!.key, projectCode: "P-1", severity: "warn", resolvedAt: null }];
    const second = reconcileFindings(stored, current, new Set(["P-1"]));
    assert.equal(second.create.length, 0);
    assert.equal(second.reopen.length, 0);
    assert.equal(second.touch.length, 1);
  });

  test("a finding is resolved when its condition clears", () => {
    const stored: StoredFinding[] = [{ key: "P-1|overdue-tasks:P-1", projectCode: "P-1", severity: "warn", resolvedAt: null }];
    const out = reconcileFindings(stored, [], new Set(["P-1"]));
    assert.deepEqual(out.resolve.map((r) => r.key), ["P-1|overdue-tasks:P-1"]);
  });

  test("a project that was not scanned keeps its findings", () => {
    const stored: StoredFinding[] = [{ key: "P-2|x", projectCode: "P-2", severity: "warn", resolvedAt: null }];
    assert.deepEqual(reconcileFindings(stored, [], new Set(["P-1"])).resolve, []);
  });

  test("a resolved finding that comes back is a new occurrence", () => {
    const current = toCurrentFindings("P-1", [sig("overdue-tasks:P-1")]);
    const stored: StoredFinding[] = [{ key: current[0]!.key, projectCode: "P-1", severity: "warn", resolvedAt: new Date() }];
    const out = reconcileFindings(stored, current, new Set(["P-1"]));
    assert.equal(out.reopen.length, 1);
    assert.equal(out.create.length, 0);
  });

  test("an already-resolved finding that stays clear is left alone", () => {
    const stored: StoredFinding[] = [{ key: "P-1|x", projectCode: "P-1", severity: "warn", resolvedAt: new Date() }];
    const out = reconcileFindings(stored, [], new Set(["P-1"]));
    assert.deepEqual(out.resolve, []);
  });
});

describe("toCurrentFindings", () => {
  test("records warn and critical, drops info, and namespaces keys by project", () => {
    const out = toCurrentFindings("P-1", [sig("a", "info"), sig("b", "warn"), sig("c", "critical")]);
    assert.deepEqual(out.map((f) => f.key), [findingKey("P-1", "b"), findingKey("P-1", "c")]);
  });

  test("the same signal key on two projects is two findings", () => {
    const a = toCurrentFindings("P-1", [sig("issue-recurrence:Material")]);
    const b = toCurrentFindings("P-2", [sig("issue-recurrence:Material")]);
    assert.notEqual(a[0]!.key, b[0]!.key);
  });

  test("duplicate keys within one scan collapse", () => {
    assert.equal(toCurrentFindings("P-1", [sig("a"), sig("a")]).length, 1);
  });
});

describe("notificationFor", () => {
  test("carries the label, the suggested action and the link", () => {
    const [f] = toCurrentFindings("P-1", [{ ...sig("a", "critical"), link: "/tasks", suggestedResolution: { action: "Do this." } }]);
    const n = notificationFor(f!);
    assert.equal(n.title, "Critical issue detected");
    assert.match(n.body, /label a\. Do this\./);
    assert.equal(n.link, "/tasks");
  });
});

const snap = (over: Record<string, unknown>) =>
  ({ project: { code: "P-1", status: "Construction" }, tasks: [], milestones: [], milestoneLinks: [], issues: [], issuePrecedents: [], budgets: [], workflows: [], workflowStages: [], validationResults: [], ...over }) as unknown as LifecycleSnapshot;

describe("overdue-tasks", () => {
  const late = (n: number, due = "2026-10-01") =>
    Array.from({ length: n }, (_, i) => ({ id: i + 1, title: `T${i + 1}`, status: "Pending", dueDate: due }));

  test("quiet below the threshold, warn at three, critical at eight", () => {
    assert.equal(overdueTasksRule.evaluate(snap({ tasks: late(2) }), { now: NOW }), null);
    const warn = overdueTasksRule.evaluate(snap({ tasks: late(3) }), { now: NOW }) as Signal;
    assert.equal(warn.severity, "warn");
    const crit = overdueTasksRule.evaluate(snap({ tasks: late(8) }), { now: NOW }) as Signal;
    assert.equal(crit.severity, "critical");
  });

  test("completed tasks and tasks due today or later are not overdue", () => {
    const tasks = [...late(3).map((t) => ({ ...t, status: "Completed" })), ...late(3, "2026-10-12"), ...late(3, "2026-12-01")];
    assert.equal(overdueTasksRule.evaluate(snap({ tasks }), { now: NOW }), null);
  });
});

describe("milestone-slip", () => {
  const ms = (over: Record<string, unknown>) => ({ id: 7, title: "Shell", status: "active", estimatedCompletionDate: "2026-10-05", ...over });

  test("an active milestone past its date is raised, with how many linked tasks are open", () => {
    const out = milestoneSlipRule.evaluate(
      snap({
        milestones: [ms({})],
        milestoneLinks: [
          { milestoneId: 7, linkType: "task", linkId: 1 },
          { milestoneId: 7, linkType: "task", linkId: 2 },
        ],
        tasks: [{ id: 1, status: "Completed" }, { id: 2, status: "Pending" }],
      }),
      { now: NOW },
    ) as Signal[];
    assert.equal(out.length, 1);
    assert.equal(out[0]!.key, "milestone-slip:7");
    assert.equal(out[0]!.severity, "warn");
    assert.match(out[0]!.detail, /1 of 2 linked task/);
  });

  test("draft, completed, undated and future milestones are ignored; two weeks late is critical", () => {
    const ignored = [ms({ status: "draft" }), ms({ id: 8, status: "completed" }), ms({ id: 9, estimatedCompletionDate: null }), ms({ id: 10, estimatedCompletionDate: "2026-12-01" })];
    assert.deepEqual(milestoneSlipRule.evaluate(snap({ milestones: ignored }), { now: NOW }), []);
    const crit = milestoneSlipRule.evaluate(snap({ milestones: [ms({ estimatedCompletionDate: "2026-09-20" })] }), { now: NOW }) as Signal[];
    assert.equal(crit[0]!.severity, "critical");
  });
});

describe("suggested resolutions", () => {
  test("every rule has a playbook action, and runSignals attaches it to each signal", () => {
    for (const rule of ["cost-variance", "cumulative-change-impact", "burn-vs-progress", "issue-recurrence", "stalled-stage", "projected-finish", "overdue-tasks", "milestone-slip"]) {
      assert.ok(PLAYBOOK[rule] && PLAYBOOK[rule]!.length > 20, `${rule} has no playbook action`);
    }
    const tasks = Array.from({ length: 3 }, (_, i) => ({ id: i, title: `T${i}`, status: "Pending", dueDate: "2026-10-01" }));
    const [signal] = runSignals(snap({ tasks }), { now: NOW });
    assert.equal(signal!.suggestedResolution?.action, PLAYBOOK["overdue-tasks"]);
  });

  test("an unknown rule falls back to a generic prompt", () => {
    assert.match(actionFor("something-new"), /Review the details/);
  });

  test("an issue-recurrence signal carries similar resolved issues when they clear the similarity floor", () => {
    const issues = Array.from({ length: 3 }, (_, i) => ({
      id: i + 1,
      category: "Material",
      status: "Submitted",
      title: "Rebar delivery short of the ordered tonnage",
      description: "Delivered rebar tonnage is below the purchase order",
      createdAt: new Date(NOW.getTime() - 86_400_000),
    }));
    const issuePrecedents = [
      {
        id: 90,
        issueCode: "ISS-90",
        projectCode: "P-9",
        category: "Material",
        title: "Rebar delivery short of the ordered tonnage",
        description: "Delivered rebar tonnage is below the purchase order",
        resolutionNotes: "Supplier re-delivered the balance within two days.",
        updatedAt: new Date("2026-09-01"),
      },
    ];
    const signals = runSignals(snap({ issues, issuePrecedents }), { now: NOW });
    const rec = signals.find((s) => s.rule === "issue-recurrence")!;
    assert.equal(rec.suggestedResolution?.precedents?.[0]?.issueCode, "ISS-90");
  });
});

describe("never gates", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const sources = readdirSync(here).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

  test("no signals module imports the lifecycle gates or the services that change a project", () => {
    for (const file of sources) {
      const text = readFileSync(join(here, file), "utf8");
      assert.doesNotMatch(text, /from\s+["']\.\.\/lifecycle\/(gates|service)\.js["']/, `${file} must not import lifecycle gates or service`);
      assert.doesNotMatch(text, /refreshProjectProgress|assertProjectWritable|advanceProject/, `${file} must not move a project`);
    }
  });

  test("the scan only records findings and notifies: it writes no project, task or approval", () => {
    const text = readFileSync(join(here, "scan.ts"), "utf8");
    assert.doesNotMatch(text, /projectsRepo\.(update|create)|tasksService|workflowsService|decideStage/);
  });

  test("a signal has no pass or fail field a gate could read", () => {
    const [s] = toCurrentFindings("P-1", [sig("a")]);
    assert.equal("passed" in s!.signal, false);
  });
});
