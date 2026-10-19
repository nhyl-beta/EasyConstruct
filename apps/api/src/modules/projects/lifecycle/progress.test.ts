// apps/api/src/lifecycle/progress.test.ts — NEW (L2)
//
// computeProgress (lifecycle/service.ts) is a pure function over a phase +
// LifecycleSnapshot — no database access — so it's testable the same way
// gates.ts is. Importing service.ts pulls in db/connection.ts transitively,
// but pg's Pool only connects lazily on first query, and none of these
// tests issue one.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computeProgress } from "./service.js";
import { PHASE_BANDS } from "./phases.js";
import type { LifecycleSnapshot } from "./repository.js";

function emptySnapshot(status = "Proposal"): LifecycleSnapshot {
  return {
    project: {
      id: 1,
      code: "TEST-000",
      name: "Test Project",
      pm: "Test PM",
      status,
      statusTone: "neutral",
      progress: 42,
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

describe("computeProgress", () => {
  test("Completed and Archived are always 100", () => {
    assert.equal(computeProgress("Completed", emptySnapshot("Completed")), 100);
    assert.equal(computeProgress("Archived", emptySnapshot("Archived")), 100);
  });

  test("On Hold and Cancelled freeze at the project's stored progress", () => {
    const snapshot = emptySnapshot("On Hold");
    snapshot.project.progress = 57;
    assert.equal(computeProgress("On Hold", snapshot), 57);

    const cancelled = emptySnapshot("Cancelled");
    cancelled.project.progress = 12;
    assert.equal(computeProgress("Cancelled", cancelled), 12);
  });

  test("Construction derives from completed/total tasks, not gate checks", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = emptySnapshot("Construction");
    (snapshot as any).tasks = [
      { id: 1, status: "Completed" },
      { id: 2, status: "Completed" },
      { id: 3, status: "Pending" },
    ];
    // band.start=30, band.end=95 (see phases.ts) -> 30 + 65*(2/3) ≈ 73
    assert.equal(computeProgress("Construction", snapshot), 73);
  });

  test("Construction counts live milestones, so completing one raises progress", () => {
    const snapshot = emptySnapshot("Construction");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (snapshot as any).tasks = [{ id: 1, status: "Completed" }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (snapshot as any).milestones = [
      { id: 1, status: "active" },
      { id: 2, status: "draft" },
      { id: 3, status: "cancelled" },
    ];
    // 1 of 2 units done -> 30 + 65 * 0.5 = 62.5 -> 63 (draft/cancelled ignored)
    assert.equal(computeProgress("Construction", snapshot), 63);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (snapshot as any).milestones[0].status = "completed";
    // 2 of 2 units done -> 95
    assert.equal(computeProgress("Construction", snapshot), 95);
  });

  test("Construction with zero tasks sits at the band's start, not 0", () => {
    const snapshot = emptySnapshot("Construction");
    assert.equal(computeProgress("Construction", snapshot), PHASE_BANDS.Construction.start);
  });

  test("a sequenced phase with no passing gate checks sits at the band's start", () => {
    const snapshot = emptySnapshot("Proposal");
    assert.equal(computeProgress("Proposal", snapshot), PHASE_BANDS.Proposal.start);
  });

  test("a sequenced phase with every gate check passing reaches the band's end", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = emptySnapshot("Proposal");
    (snapshot as any).members = [
      { userId: 1, role: "architect", userName: "Arch" },
      { userId: 2, role: "consultant", userName: "Cons" },
    ];
    (snapshot as any).proposals = [{ id: 1, workflowId: 10 }];
    (snapshot as any).proposalWorkflows = [{ id: 10, status: "completed" }];
    (snapshot as any).documents = [{ type: "Notice of Award" }, { type: "Contract" }];
    (snapshot as any).project.contractValue = "500000";

    assert.equal(computeProgress("Proposal", snapshot), PHASE_BANDS.Proposal.end);
  });

  test("a partially-passing phase lands strictly between the band's start and end", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = emptySnapshot("Proposal");
    // Only P1 (architect staffed) passes out of P1-P5.
    (snapshot as any).members = [{ userId: 1, role: "architect", userName: "Arch" }];

    const progress = computeProgress("Proposal", snapshot);
    assert.ok(progress > PHASE_BANDS.Proposal.start && progress < PHASE_BANDS.Proposal.end);
  });
});
