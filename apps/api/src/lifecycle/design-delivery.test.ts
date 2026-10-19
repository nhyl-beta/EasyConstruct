// Design delivery type: gates, progress and regression guards for the
// Construction path. Pure functions over hand-built snapshots (no database;
// importing service.ts does not open a connection until the first query).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { evaluateGate } from "./gates.js";
import { computeProgress } from "./service.js";
import { PHASE_BANDS } from "./phases.js";
import type { LifecycleSnapshot } from "./repository.js";

function snap(over: Record<string, unknown> = {}, project: Record<string, unknown> = {}): LifecycleSnapshot {
  return {
    project: { id: 1, code: "T-1", name: "T", pm: "PM", status: "Design", progress: 0, contractValue: "1000000", deliveryType: "Design", designDisciplines: [], siteLatitude: null, siteLongitude: null, pmUserId: null, ...project },
    members: [], proposals: [], proposalWorkflows: [], documents: [], designs: [], designReviews: [], blueprints: [],
    requirements: [], budgets: [], milestones: [], milestoneLinks: [], tasks: [], issues: [], engineeringReports: [],
    payrollBatches: [], workflows: [], workflowStages: [], phaseHistory: [], staffedEmployees: [],
    closeoutTemplateId: null, designTurnoverTemplateId: null, openRequests: [], deliverables: [],
    validationResults: [], issuePrecedents: [],
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const keys = (c: { key: string }[]) => c.map((x) => x.key);
const failing = (c: { key: string; passed: boolean }[]) => c.filter((x) => !x.passed).map((x) => x.key);

const set = (discipline: string, status = "in_progress", lead = 5) => ({ id: 1, projectCode: "T-1", discipline, status, leadUserId: lead, leadName: "Lead" });
const design = (discipline: string, files = 1, status = "Approved") => ({ id: 9, discipline, status, fileUrls: Array.from({ length: files }, (_, i) => ({ name: `f${i}`, url: `/uploads/${i}` })) });

describe("Design project — gates", () => {
  test("Proposal keeps P1-P5", () => {
    assert.deepEqual(keys(evaluateGate("Proposal", snap({}, { status: "Proposal" }))), ["P1", "P2", "P3", "P4", "P5"]);
  });

  test("Design phase has its own checks; the Construction D1 (staffed engineer) is not among them", () => {
    const checks = evaluateGate("Design", snap());
    assert.deepEqual(keys(checks), ["DP1", "DP2", "D2", "D3", "D4"]);
  });

  test("DP1 needs every plan set to have a lead; DP2 needs a design with files per plan set", () => {
    const base = { deliverables: [set("Architectural"), set("Structural")], designs: [design("Architectural"), design("Structural")] };
    assert.deepEqual(failing(evaluateGate("Design", snap(base))).filter((k) => k === "DP1" || k === "DP2"), []);
    const noLead = snap({ ...base, deliverables: [set("Architectural"), { ...set("Structural"), leadUserId: null }] });
    assert.ok(failing(evaluateGate("Design", noLead)).includes("DP1"));
    const noFiles = snap({ ...base, designs: [design("Architectural"), design("Structural", 0)] });
    assert.ok(failing(evaluateGate("Design", noFiles)).includes("DP2"));
    assert.ok(failing(evaluateGate("Design", snap({ deliverables: [] }))).includes("DP1"), "no plan sets yet");
  });

  test("a design maps to its plan set by discipline (Electrical counts for MEP)", () => {
    const s = snap({ deliverables: [set("MEP")], designs: [design("Electrical")] });
    assert.ok(!failing(evaluateGate("Design", s)).includes("DP2"));
    const wrong = snap({ deliverables: [set("MEP")], designs: [design("Structural")] });
    assert.ok(failing(evaluateGate("Design", wrong)).includes("DP2"));
  });

  test("all gates pass for a finished Design phase", () => {
    const s = snap({
      deliverables: [set("Architectural", "issued")],
      designs: [design("Architectural")],
      blueprints: [{ approval: "Approved", status: "Current" }],
    });
    assert.deepEqual(failing(evaluateGate("Design", s)), []);
  });

  test("an open RFI/RFA blocks the Design phase (D4) and Turnover (T4)", () => {
    const open = [{ number: "RFI-T-1-AR-001-26", status: "open" }];
    assert.ok(failing(evaluateGate("Design", snap({ openRequests: open }))).includes("D4"));
    assert.ok(failing(evaluateGate("Closeout", snap({ openRequests: open }, { status: "Closeout" }))).includes("T4"));
    assert.ok(!failing(evaluateGate("Closeout", snap({}, { status: "Closeout" }))).includes("T4"));
  });

  test("Turnover needs a Turnover Document, Client Acceptance and a completed Design Turnover workflow", () => {
    const closeout = { status: "Closeout" };
    assert.deepEqual(keys(evaluateGate("Closeout", snap({}, closeout))), ["T1", "T2", "T3", "T4", "T5"]);
    assert.deepEqual(failing(evaluateGate("Closeout", snap({}, closeout))), ["T1", "T2", "T3"]);
    const ready = snap(
      { documents: [{ type: "Turnover Document" }, { type: "Client Acceptance" }], designTurnoverTemplateId: 7, workflows: [{ id: 1, templateId: 7, status: "completed" }] },
      closeout,
    );
    assert.deepEqual(failing(evaluateGate("Closeout", ready)), []);
    const onlyAcceptance = snap({ documents: [{ type: "Client Acceptance" }] }, closeout);
    assert.deepEqual(failing(evaluateGate("Closeout", onlyAcceptance)), ["T1", "T3"]);
  });

  test("a Project Closeout workflow does not satisfy T3", () => {
    const s = snap({ designTurnoverTemplateId: 7, closeoutTemplateId: 3, workflows: [{ id: 1, templateId: 3, status: "completed" }] }, { status: "Closeout" });
    assert.ok(failing(evaluateGate("Closeout", s)).includes("T3"));
  });

  test("Pre-Construction, Construction, Completed and Archived have no checks on a Design project", () => {
    for (const p of ["Pre-Construction", "Construction", "Completed", "Archived"] as const) {
      assert.deepEqual(evaluateGate(p, snap()), [], p);
    }
  });
});

describe("Design project — progress", () => {
  test("Proposal 0-10 by gate share", () => {
    const p = computeProgress("Proposal", snap({}, { status: "Proposal" }));
    assert.equal(p, 0);
  });
  test("Design phase = 10 + 80 x average plan-set points", () => {
    assert.equal(computeProgress("Design", snap()), 10);
    assert.equal(computeProgress("Design", snap({ deliverables: [set("Architectural", "not_started"), set("Structural", "approved")] })), 10 + Math.round(80 * 0.45));
    assert.equal(computeProgress("Design", snap({ deliverables: [set("Architectural", "issued"), set("Structural", "issued")] })), 90);
  });
  test("Turnover 90-99 and terminal phases 100", () => {
    const closeout = { status: "Closeout" };
    // T4 (no open request) passes on its own, so 1 of 4 checks: 90 + 9 x 0.25.
    assert.equal(computeProgress("Closeout", snap({}, closeout)), 94); // one more gate (T5) passing
    const ready = snap({ documents: [{ type: "Turnover Document" }, { type: "Client Acceptance" }], designTurnoverTemplateId: 7, workflows: [{ id: 1, templateId: 7, status: "completed" }] }, closeout);
    assert.equal(computeProgress("Closeout", ready), 99);
    assert.equal(computeProgress("Completed", snap()), 100);
    assert.equal(computeProgress("Archived", snap()), 100);
  });
  test("progress never exceeds the band for the phase", () => {
    const all = snap({ deliverables: [set("Architectural", "issued")] });
    assert.ok(computeProgress("Design", all) <= 90);
  });
});

describe("Construction projects are unchanged", () => {
  const construction = (over: Record<string, unknown> = {}, status = "Construction") => snap(over, { status, deliveryType: "Construction" });

  test("a project with no delivery type at all is a Construction project", () => {
    const legacy = snap({ tasks: [{ status: "Completed" }, { status: "Pending" }] }, { status: "Construction", deliveryType: undefined });
    assert.equal(computeProgress("Construction", legacy), Math.round(30 + 65 * 0.5));
    assert.deepEqual(keys(evaluateGate("Construction", legacy)), ["K1", "K2", "K3", "K4"]);
  });

  test("Construction progress formula and bands are exactly as before", () => {
    assert.equal(computeProgress("Construction", construction()), 30);
    const half = construction({ tasks: [{ status: "Completed" }, { status: "Pending" }] });
    assert.equal(computeProgress("Construction", half), 63);
    assert.deepEqual(PHASE_BANDS, {
      Proposal: { start: 0, end: 10 },
      Design: { start: 10, end: 25 },
      "Pre-Construction": { start: 25, end: 30 },
      Construction: { start: 30, end: 95 },
      Closeout: { start: 95, end: 99 },
      Completed: { start: 100, end: 100 },
      Archived: { start: 100, end: 100 },
    });
    assert.equal(computeProgress("Design", construction({}, "Design")), 10);
  });

  test("gate keys per phase are unchanged", () => {
    const c = (p: Parameters<typeof evaluateGate>[0]) => keys(evaluateGate(p, construction({}, p)));
    assert.deepEqual(c("Design"), ["D1", "D2", "D3"]);
    assert.deepEqual(c("Pre-Construction"), ["C1", "C2", "C3", "C4", "C5"]);
    assert.deepEqual(c("Construction"), ["K1", "K2", "K3", "K4"]);
    assert.deepEqual(c("Closeout"), ["X1", "X2", "X3", "X4", "X5", "X6"]);
  });

  test("an unsettled purchase or order blocks closing a Construction project (X6) and a Design turnover (T5)", () => {
    const open = construction({ unsettledPurchasing: ["PR-0001", "PO-0002"] }, "Closeout");
    const x6 = evaluateGate("Closeout", open).find((c) => c.key === "X6")!;
    assert.equal(x6.passed, false);
    assert.equal(x6.label, "No unsettled procurement");
    assert.match(x6.detail ?? "", /PR-0001/);
    assert.deepEqual(x6.ownerRoles, ["project-manager", "admin", "finance-manager"]);
    assert.ok(!failing(evaluateGate("Closeout", construction({ unsettledPurchasing: [] }, "Closeout"))).includes("X6"));
    const design = snap({ unsettledPurchasing: ["PO-0003"] }, { status: "Closeout" });
    assert.ok(failing(evaluateGate("Closeout", design)).includes("T5"));
    assert.ok(!failing(evaluateGate("Closeout", snap({}, { status: "Closeout" }))).includes("T5"));
  });

  test("an open RFI/RFA blocks closing a Construction project (X5)", () => {
    const open = construction({ openRequests: [{ number: "RFI-T-1-AR-001-26", status: "open" }] }, "Closeout");
    assert.ok(failing(evaluateGate("Closeout", open)).includes("X5"));
    assert.ok(!failing(evaluateGate("Closeout", construction({}, "Closeout"))).includes("X5"));
  });
});
