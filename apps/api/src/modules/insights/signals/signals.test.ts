// apps/api/src/signals/signals.test.ts — NEW (ai-signals D9)
//
// Follows the emptySnapshot() pattern from lifecycle/gates.test.ts — a
// hand-built LifecycleSnapshot, no database. Functional tests call
// runSignals directly (flag-independent); only the dedicated "flag" test
// below calls evaluateSignals, which is gated by FEATURES.ai.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { runSignals } from "./index.js";
import type { LifecycleSnapshot } from "../../projects/index.js";
import type { SignalRule } from "./types.js";

function emptySnapshot(status = "Construction"): LifecycleSnapshot {
  return {
    project: {
      id: 1,
      code: "TEST-000",
      name: "Test Project",
      pm: "Test PM",
      status,
      statusTone: "neutral",
      progress: 50,
      budget: 0,
      contractValue: null,
      due: "2026-12-31",
      risk: "Low",
      location: null,
      client: null,
      currency: "PHP",
      workforce: 0,
      description: null,
      siteLatitude: null,
      siteLongitude: null,
      geofenceRadiusM: 300,
      previousStatus: null,
      holdReason: null,
      completedAt: null,
      archivedAt: null,
      pmUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    members: [],
    proposals: [],
    proposalWorkflows: [],
    documents: [],
    designs: [],
    designReviews: [],
    blueprints: [],
    requirements: [],
    budgets: [],
    milestones: [],
    milestoneLinks: [],
    tasks: [],
    issues: [],
    engineeringReports: [],
    payrollBatches: [],
    workflows: [],
    workflowStages: [],
    phaseHistory: [],
    staffedEmployees: [],
    closeoutTemplateId: null,
    validationResults: [],
    issuePrecedents: [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function withOverrides(overrides: Partial<LifecycleSnapshot>, status?: string): LifecycleSnapshot {
  return { ...emptySnapshot(status), ...overrides };
}

const NOW = new Date("2026-09-25T00:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000);

describe("cost-variance", () => {
  const workflow = { id: 1, code: "WF-1001", title: "Budget Change", status: "active", updatedAt: NOW };

  test("fires warn at the 15% threshold", () => {
    const snapshot = withOverrides({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      workflows: [workflow] as any,
      validationResults: [
        { id: 1, workflowId: 1, verdict: "above-typical", variancePct: "0.20", lineDescription: "Rebar", basisSummary: "citation with numbers 20%", sources: null },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
    const signals = runSignals(snapshot, { now: NOW });
    const found = signals.find((s) => s.rule === "cost-variance");
    assert.ok(found);
    assert.equal(found!.severity, "warn");
  });

  test("fires critical beyond 30%", () => {
    const snapshot = withOverrides({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      workflows: [workflow] as any,
      validationResults: [
        { id: 1, workflowId: 1, verdict: "above-typical", variancePct: "0.35", lineDescription: "Rebar", basisSummary: "citation 35%", sources: null },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
    const signals = runSignals(snapshot, { now: NOW });
    assert.equal(signals.find((s) => s.rule === "cost-variance")!.severity, "critical");
  });

  test("silent below the 15% floor and for within-range/no-match verdicts", () => {
    const snapshot = withOverrides({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      workflows: [workflow] as any,
      validationResults: [
        { id: 1, workflowId: 1, verdict: "above-typical", variancePct: "0.05", lineDescription: "A", basisSummary: "x", sources: null },
        { id: 2, workflowId: 1, verdict: "within-range", variancePct: "0.50", lineDescription: "B", basisSummary: "x", sources: null },
        { id: 3, workflowId: 1, verdict: "no-match", variancePct: null, lineDescription: "C", basisSummary: "x", sources: null },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
    const signals = runSignals(snapshot, { now: NOW });
    assert.equal(signals.filter((s) => s.rule === "cost-variance").length, 0);
  });
});

describe("cumulative-change-impact", () => {
  test("Field Guide numbers: ₱5.32M planned vs ₱4.50M contract -> +18.2% warn", () => {
    const snapshot = withOverrides({
      project: { ...emptySnapshot().project, contractValue: "4500000" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      budgets: [{ planned: "5320000", actual: "0" }] as any,
    });
    const signals = runSignals(snapshot, { now: NOW });
    const found = signals.find((s) => s.rule === "cumulative-change-impact");
    assert.ok(found);
    assert.equal(found!.severity, "warn");
    assert.match(found!.label, /\+18\.2%/);
  });

  test("critical at 20% or more over contract value", () => {
    const snapshot = withOverrides({
      project: { ...emptySnapshot().project, contractValue: "4000000" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      budgets: [{ planned: "4900000", actual: "0" }] as any,
    });
    const signals = runSignals(snapshot, { now: NOW });
    assert.equal(signals.find((s) => s.rule === "cumulative-change-impact")!.severity, "critical");
  });

  test("silent with no contract value", () => {
    const snapshot = withOverrides({
      project: { ...emptySnapshot().project, contractValue: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      budgets: [{ planned: "5320000", actual: "0" }] as any,
    });
    const signals = runSignals(snapshot, { now: NOW });
    assert.equal(signals.filter((s) => s.rule === "cumulative-change-impact").length, 0);
  });

  test("silent when planned is at or below contract value", () => {
    const snapshot = withOverrides({
      project: { ...emptySnapshot().project, contractValue: "5000000" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      budgets: [{ planned: "4000000", actual: "0" }] as any,
    });
    const signals = runSignals(snapshot, { now: NOW });
    assert.equal(signals.filter((s) => s.rule === "cumulative-change-impact").length, 0);
  });

  test("fires in Closeout too, not just Construction", () => {
    const snapshot = withOverrides(
      {
        project: { ...emptySnapshot().project, contractValue: "4500000" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        budgets: [{ planned: "5320000", actual: "0" }] as any,
      },
      "Closeout",
    );
    const signals = runSignals(snapshot, { now: NOW });
    assert.ok(signals.find((s) => s.rule === "cumulative-change-impact"));
  });
});

describe("burn-vs-progress", () => {
  test("Field Guide numbers: 68% burn at 40% completion -> 28-point divergence, warn", () => {
    const snapshot = withOverrides({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      budgets: [{ planned: "100000", actual: "68000" }] as any,
      tasks: [
        { status: "Completed" },
        { status: "Completed" },
        { status: "Pending" },
        { status: "Pending" },
        { status: "Pending" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
    const signals = runSignals(snapshot, { now: NOW });
    const found = signals.find((s) => s.rule === "burn-vs-progress");
    assert.ok(found);
    assert.equal(found!.severity, "warn");
    assert.match(found!.label, /68%/);
    assert.match(found!.label, /40%/);
  });

  test("critical at 35+ point divergence", () => {
    const snapshot = withOverrides({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      budgets: [{ planned: "100000", actual: "90000" }] as any,
      tasks: [{ status: "Completed" }, { status: "Pending" }, { status: "Pending" }, { status: "Pending" }] as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    });
    const signals = runSignals(snapshot, { now: NOW });
    assert.equal(signals.find((s) => s.rule === "burn-vs-progress")!.severity, "critical");
  });

  test("silent with zero planned budget", () => {
    const snapshot = withOverrides({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      budgets: [{ planned: "0", actual: "0" }] as any,
      tasks: [{ status: "Pending" }] as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    });
    const signals = runSignals(snapshot, { now: NOW });
    assert.equal(signals.filter((s) => s.rule === "burn-vs-progress").length, 0);
  });

  test("silent with no tasks", () => {
    const snapshot = withOverrides({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      budgets: [{ planned: "100000", actual: "90000" }] as any,
      tasks: [],
    });
    const signals = runSignals(snapshot, { now: NOW });
    assert.equal(signals.filter((s) => s.rule === "burn-vs-progress").length, 0);
  });

  test("a Proposal-phase project yields no burn signal even with the same data", () => {
    const snapshot = withOverrides(
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        budgets: [{ planned: "100000", actual: "90000" }] as any,
        tasks: [{ status: "Completed" }, { status: "Pending" }, { status: "Pending" }, { status: "Pending" }] as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      },
      "Proposal",
    );
    const signals = runSignals(snapshot, { now: NOW });
    assert.equal(signals.filter((s) => s.rule === "burn-vs-progress").length, 0);
  });
});

describe("issue-recurrence", () => {
  test("warns at 3 recent issues in the same open category", () => {
    const snapshot = withOverrides({
      issues: [
        { category: "Material", status: "Submitted", createdAt: daysAgo(1) },
        { category: "Material", status: "Resolved", createdAt: daysAgo(5) },
        { category: "Material", status: "Resolved", createdAt: daysAgo(10) },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
    const signals = runSignals(snapshot, { now: NOW });
    const found = signals.find((s) => s.rule === "issue-recurrence" && s.key.startsWith("issue-recurrence:"));
    assert.ok(found);
    assert.equal(found!.severity, "warn");
    assert.match(found!.label, /3rd Material/);
  });

  test("critical at 5 recent issues", () => {
    const snapshot = withOverrides({
      issues: Array.from({ length: 5 }, (_, i) => ({
        category: "Material",
        status: i === 0 ? "Submitted" : "Resolved",
        createdAt: daysAgo(i + 1),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as any,
    });
    const signals = runSignals(snapshot, { now: NOW });
    const found = signals.find((s) => s.rule === "issue-recurrence" && s.key.startsWith("issue-recurrence:"));
    assert.equal(found!.severity, "critical");
  });

  test("below the recurrence floor but with a precedent raises an info signal", () => {
    const snapshot = withOverrides({
      issues: [{ category: "Material", status: "Submitted", createdAt: daysAgo(1) }] as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      issuePrecedents: [
        { issueCode: "ISS-1", title: "Cracked tile batch", category: "Material", resolutionNotes: "Replaced with a different supplier's batch.", updatedAt: daysAgo(90) },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
    const signals = runSignals(snapshot, { now: NOW });
    const found = signals.find((s) => s.rule === "issue-recurrence");
    assert.ok(found);
    assert.equal(found!.severity, "info");
    assert.match(found!.label, /resolved before/);
  });

  test("silent with no open issues at all", () => {
    const snapshot = withOverrides({ issues: [] });
    const signals = runSignals(snapshot, { now: NOW });
    assert.equal(signals.filter((s) => s.rule === "issue-recurrence").length, 0);
  });
});

describe("stalled-stage", () => {
  const workflow = { id: 1, code: "WF-1004", title: "Budget Change", status: "active" };

  test("warns at the 48-hour threshold", () => {
    const snapshot = withOverrides({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      workflows: [workflow] as any,
      workflowStages: [
        { id: 10, workflowId: 1, sequence: 1, role: "finance-manager", roleLabel: "Finance Review", status: "current", updatedAt: hoursAgo(50) },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
    const signals = runSignals(snapshot, { now: NOW });
    const found = signals.find((s) => s.rule === "stalled-stage");
    assert.ok(found);
    assert.equal(found!.severity, "warn");
    assert.deepEqual(found!.ownerRoles, ["finance-manager"]);
  });

  test("critical at 120 hours", () => {
    const snapshot = withOverrides({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      workflows: [workflow] as any,
      workflowStages: [
        { id: 10, workflowId: 1, sequence: 1, role: "finance-manager", roleLabel: "Finance Review", status: "current", updatedAt: hoursAgo(130) },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
    const signals = runSignals(snapshot, { now: NOW });
    assert.equal(signals.find((s) => s.rule === "stalled-stage")!.severity, "critical");
  });

  test("silent below 48 hours", () => {
    const snapshot = withOverrides({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      workflows: [workflow] as any,
      workflowStages: [
        { id: 10, workflowId: 1, sequence: 1, role: "finance-manager", roleLabel: "Finance Review", status: "current", updatedAt: hoursAgo(10) },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
    const signals = runSignals(snapshot, { now: NOW });
    assert.equal(signals.filter((s) => s.rule === "stalled-stage").length, 0);
  });

  test("a revision-required stage is owned by the initiator's stage-1 role, not the reviewer", () => {
    const snapshot = withOverrides({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      workflows: [workflow] as any,
      workflowStages: [
        { id: 10, workflowId: 1, sequence: 1, role: "engineer", roleLabel: "Engineer Justification", status: "revision-required", updatedAt: hoursAgo(60) },
        { id: 11, workflowId: 1, sequence: 2, role: "finance-manager", roleLabel: "Finance Review", status: "upcoming", updatedAt: hoursAgo(60) },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
    const signals = runSignals(snapshot, { now: NOW });
    const found = signals.find((s) => s.rule === "stalled-stage");
    assert.deepEqual(found!.ownerRoles, ["engineer"]);
  });

  test("silent for a completed workflow's stages", () => {
    const snapshot = withOverrides({
      workflows: [{ ...workflow, status: "completed" }] as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      workflowStages: [
        { id: 10, workflowId: 1, sequence: 1, role: "finance-manager", roleLabel: "Finance Review", status: "current", updatedAt: hoursAgo(200) },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
    const signals = runSignals(snapshot, { now: NOW });
    assert.equal(signals.filter((s) => s.rule === "stalled-stage").length, 0);
  });
});

describe("runSignals — cross-cutting behavior", () => {
  test("a quiet project with nothing unusual yields no signals", () => {
    const snapshot = withOverrides({});
    assert.deepEqual(runSignals(snapshot, { now: NOW }), []);
  });

  test("a throwing rule loses only itself — every other rule still runs", () => {
    const throwingRule: SignalRule = {
      rule: "throws",
      phases: ["Construction"],
      evaluate: () => {
        throw new Error("boom");
      },
    };
    const okRule: SignalRule = {
      rule: "ok",
      phases: ["Construction"],
      evaluate: () => ({
        key: "ok:1",
        rule: "ok",
        label: "fine",
        ownerRoles: ["admin"],
        severity: "info",
        detail: "still works",
      }),
    };
    const snapshot = withOverrides({});
    const signals = runSignals(snapshot, { now: NOW }, [throwingRule, okRule]);
    assert.equal(signals.length, 1);
    assert.equal(signals[0]!.rule, "ok");
  });

  test("results are sorted critical, then warn, then info", () => {
    const rules: SignalRule[] = [
      { rule: "a", phases: ["Construction"], evaluate: () => ({ key: "a", rule: "a", label: "l", ownerRoles: [], severity: "info", detail: "d" }) },
      { rule: "b", phases: ["Construction"], evaluate: () => ({ key: "b", rule: "b", label: "l", ownerRoles: [], severity: "critical", detail: "d" }) },
      { rule: "c", phases: ["Construction"], evaluate: () => ({ key: "c", rule: "c", label: "l", ownerRoles: [], severity: "warn", detail: "d" }) },
    ];
    const signals = runSignals(withOverrides({}), { now: NOW }, rules);
    assert.deepEqual(signals.map((s) => s.severity), ["critical", "warn", "info"]);
  });

  test("every emitted signal has a non-empty detail containing a digit", () => {
    const snapshot = withOverrides({
      project: { ...emptySnapshot().project, contractValue: "4500000" },
      budgets: [{ planned: "5320000", actual: "68000" }] as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      tasks: [{ status: "Completed" }, { status: "Pending" }] as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      workflows: [{ id: 1, code: "WF-1004", title: "Budget Change", status: "active" }] as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      workflowStages: [
        { id: 10, workflowId: 1, sequence: 1, role: "finance-manager", roleLabel: "Finance Review", status: "current", updatedAt: hoursAgo(60) },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
      issues: [
        { category: "Material", status: "Submitted", createdAt: daysAgo(1) },
        { category: "Material", status: "Resolved", createdAt: daysAgo(2) },
        { category: "Material", status: "Resolved", createdAt: daysAgo(3) },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
    const signals = runSignals(snapshot, { now: NOW });
    assert.ok(signals.length > 0);
    for (const signal of signals) {
      assert.ok(signal.detail.length > 0, `${signal.rule} has an empty detail`);
      assert.match(signal.detail, /\d/, `${signal.rule}'s detail has no digit: "${signal.detail}"`);
    }
  });
});
