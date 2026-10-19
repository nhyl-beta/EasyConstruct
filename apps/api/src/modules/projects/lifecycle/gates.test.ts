// apps/api/src/lifecycle/gates.test.ts — NEW (L2)
//
// Every gate check (gates.ts) is a pure function over a LifecycleSnapshot —
// no database access — so each is testable with a hand-built snapshot and
// Node's built-in test runner (no new runtime dep). Run with `npm test`.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { evaluateGate } from "./gates.js";
import type { LifecycleSnapshot } from "./repository.js";

/** A snapshot with nothing on it — every gate should fail against this. */
function emptySnapshot(): LifecycleSnapshot {
  return {
    project: {
      id: 1,
      code: "TEST-000",
      name: "Test Project",
      pm: "Test PM",
      status: "Proposal",
      statusTone: "neutral",
      progress: 0,
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
    openRequests: [],
    // ai-signals D2: decision-support-only fields — gates.ts never reads
    // them, kept here only so the snapshot shape stays complete.
    validationResults: [],
    issuePrecedents: [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function withOverrides(overrides: Partial<LifecycleSnapshot>): LifecycleSnapshot {
  return { ...emptySnapshot(), ...overrides };
}

const keysOf = (checks: { key: string }[]) => checks.map((c) => c.key);
const failing = (checks: { key: string; passed: boolean }[]) =>
  checks.filter((c) => !c.passed).map((c) => c.key);

describe("evaluateGate — Proposal (P1-P5)", () => {
  test("empty snapshot fails every check", () => {
    const checks = evaluateGate("Proposal", emptySnapshot());
    assert.deepEqual(keysOf(checks), ["P1", "P2", "P3", "P4", "P5"]);
    assert.deepEqual(failing(checks), ["P1", "P2", "P3", "P4", "P5"]);
  });

  test("staffed architect+consultant, approved proposal, award docs all pass", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = withOverrides({
      members: [
        { userId: 1, role: "architect", userName: "Arch" },
        { userId: 2, role: "consultant", userName: "Cons" },
      ],
      proposals: [{ id: 1, workflowId: 10 }],
      proposalWorkflows: [{ id: 10, status: "completed" }],
      documents: [
        { type: "Notice of Award" },
        { type: "Contract" },
      ],
    } as any);
    snapshot.project.contractValue = "500000";

    const checks = evaluateGate("Proposal", snapshot);
    assert.deepEqual(failing(checks), []);
  });
});

describe("evaluateGate — Design (D1-D3)", () => {
  test("no designs fails D1/D2/D3", () => {
    const checks = evaluateGate("Design", emptySnapshot());
    assert.deepEqual(failing(checks), ["D1", "D2", "D3"]);
  });

  test("design with files assigned to a staffed engineer, approved, current approved blueprint all pass", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = withOverrides({
      members: [{ userId: 5, role: "engineer", userName: "Eng" }],
      designs: [
        {
          id: 1,
          fileUrls: ["a.dwg"],
          assignedEngineerId: 5,
          status: "Approved",
        },
      ],
      designReviews: [],
      blueprints: [{ approval: "Approved", status: "Current" }],
    } as any);

    const checks = evaluateGate("Design", snapshot);
    assert.deepEqual(failing(checks), []);
  });

  test("a pending review on an approved design still fails D2", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = withOverrides({
      designs: [{ id: 1, fileUrls: [], assignedEngineerId: null, status: "Approved" }],
      designReviews: [{ designId: 1, status: "Pending" }],
    } as any);

    const checks = evaluateGate("Design", snapshot);
    const d2 = checks.find((c) => c.key === "D2")!;
    assert.equal(d2.passed, false);
  });
});

describe("evaluateGate — Pre-Construction (C1-C5)", () => {
  test("empty snapshot fails every check", () => {
    const checks = evaluateGate("Pre-Construction", emptySnapshot());
    assert.deepEqual(failing(checks), ["C1", "C2", "C3", "C4", "C5"]);
  });

  test("approved requirements/budget, dated active milestone, staffed+linked crew, NTP+coords all pass", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = withOverrides({
      requirements: [
        { category: "Materials", status: "Approved" },
        { category: "Specifications", status: "Approved" },
      ],
      budgets: [{ planned: 100000, status: "approved" }],
      milestones: [{ id: 1, title: "M1", status: "active", estimatedCompletionDate: "2026-10-01" }],
      members: [{ userId: 9, role: "site-personnel", userName: "SP" }],
      staffedEmployees: [{ userId: 9, status: "Active" }],
      tasks: [{ id: 1, status: "Pending", assignedToUserId: 9 }],
      milestoneLinks: [{ milestoneId: 1, linkType: "task", linkId: 1 }],
      documents: [{ type: "Notice to Proceed" }],
    } as any);
    snapshot.project.siteLatitude = "14.5";
    snapshot.project.siteLongitude = "121.0";

    const checks = evaluateGate("Pre-Construction", snapshot);
    assert.deepEqual(failing(checks), []);
  });

  test("a site-personnel member with no Active employee record fails C4", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = withOverrides({
      members: [{ userId: 9, role: "site-personnel", userName: "SP" }],
      staffedEmployees: [],
      tasks: [{ id: 1, status: "Pending", assignedToUserId: 9 }],
    } as any);

    const checks = evaluateGate("Pre-Construction", snapshot);
    const c4 = checks.find((c) => c.key === "C4")!;
    assert.equal(c4.passed, false);
    assert.match(c4.detail ?? "", /Active employee record/);
  });
});

describe("evaluateGate — Construction exit (K1-K4)", () => {
  test("open tasks/milestones/issues/workflows all fail", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = withOverrides({
      tasks: [{ id: 1, status: "Pending", assignedToUserId: 1 }],
      milestones: [{ id: 1, title: "M1", status: "active" }],
      issues: [{ status: "Submitted" }],
      workflows: [{ id: 1, status: "active", templateId: 1 }],
      workflowStages: [{ workflowId: 1, status: "current", role: "finance-manager" }],
    } as any);

    const checks = evaluateGate("Construction", snapshot);
    assert.deepEqual(failing(checks), ["K1", "K2", "K3", "K4"]);
    // K4's ownerRoles should resolve to the actual current stage's role,
    // not fall back to project-manager, when one exists.
    const k4 = checks.find((c) => c.key === "K4")!;
    assert.deepEqual(k4.ownerRoles, ["finance-manager"]);
  });

  test("everything closed/completed passes", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = withOverrides({
      tasks: [{ id: 1, status: "Completed", assignedToUserId: 1 }],
      milestones: [{ id: 1, title: "M1", status: "completed" }],
      issues: [{ status: "Resolved" }],
      workflows: [{ id: 1, status: "completed", templateId: 1 }],
      workflowStages: [],
    } as any);

    const checks = evaluateGate("Construction", snapshot);
    assert.deepEqual(failing(checks), []);
  });
});

describe("evaluateGate — Closeout (X1-X5)", () => {
  test("empty snapshot fails every check", () => {
    const checks = evaluateGate("Closeout", emptySnapshot());
    assert.deepEqual(failing(checks), ["X1", "X2", "X3", "X4"]);
  });

  test("approved final inspection, COC on file, approved-since-entry payroll with none pending, completed closeout workflow all pass", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = withOverrides({
      engineeringReports: [{ type: "Final Inspection", status: "Approved" }],
      documents: [{ type: "Certificate of Completion" }],
      phaseHistory: [{ toStatus: "Closeout", createdAt: new Date("2026-01-01") }],
      payrollBatches: [{ status: "approved", createdAt: new Date("2026-02-01") }],
      workflows: [{ id: 1, status: "completed", templateId: 99 }],
      workflowStages: [],
      closeoutTemplateId: 99,
    } as any);

    const checks = evaluateGate("Closeout", snapshot);
    assert.deepEqual(failing(checks), []);
    assert.deepEqual(keysOf(checks), ["X1", "X2", "X3", "X4", "X5", "X6"]);
  });

  test("X5: an open RFI/RFA hard-blocks closing; answered ones do not", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const open = withOverrides({ openRequests: [{ number: "RFI-TEST-AR-001-26", status: "open" }] } as any);
    const x5 = evaluateGate("Closeout", open).find((c) => c.key === "X5")!;
    assert.equal(x5.passed, false);
    assert.match(x5.detail ?? "", /RFI-TEST-AR-001-26/);
    assert.deepEqual(x5.ownerRoles, ["project-manager", "admin"]);
    const none = evaluateGate("Closeout", withOverrides({ openRequests: [] })).find((c) => c.key === "X5")!;
    assert.equal(none.passed, true);
  });

  test("X5 does not appear in the other phases", () => {
    for (const phase of ["Proposal", "Design", "Pre-Construction", "Construction"] as const) {
      assert.ok(!keysOf(evaluateGate(phase, emptySnapshot())).includes("X5"), phase);
    }
  });

  test("a payroll batch approved BEFORE entering Closeout does not satisfy X3", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = withOverrides({
      phaseHistory: [{ toStatus: "Closeout", createdAt: new Date("2026-02-01") }],
      payrollBatches: [{ status: "approved", createdAt: new Date("2026-01-01") }],
    } as any);

    const checks = evaluateGate("Closeout", snapshot);
    const x3 = checks.find((c) => c.key === "X3")!;
    assert.equal(x3.passed, false);
  });

  test("a still-pending payroll batch fails X3 even alongside an approved one", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = withOverrides({
      phaseHistory: [{ toStatus: "Closeout", createdAt: new Date("2026-01-01") }],
      payrollBatches: [
        { status: "approved", createdAt: new Date("2026-02-01") },
        { status: "pending", createdAt: new Date("2026-02-02") },
      ],
    } as any);

    const checks = evaluateGate("Closeout", snapshot);
    const x3 = checks.find((c) => c.key === "X3")!;
    assert.equal(x3.passed, false);
  });

  test("no Project Closeout template configured (closeoutTemplateId null) means X4 can never pass", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = withOverrides({
      workflows: [{ id: 1, status: "completed", templateId: 1 }],
      closeoutTemplateId: null,
    } as any);

    const checks = evaluateGate("Closeout", snapshot);
    const x4 = checks.find((c) => c.key === "X4")!;
    assert.equal(x4.passed, false);
  });
});
