import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  canSetDeliverableStatus,
  deliverableForDiscipline,
  designProgress,
  nextPhaseFor,
  normalizeDeliveryType,
  phaseLabel,
  planSetAverage,
  STATUS_POINTS,
} from "./delivery.js";
import { NEXT_PHASE } from "./phases.js";

describe("phase path by delivery type", () => {
  test("Design path skips Pre-Construction and Construction", () => {
    assert.equal(nextPhaseFor("Design", "Proposal"), "Design");
    assert.equal(nextPhaseFor("Design", "Design"), "Closeout");
    assert.equal(nextPhaseFor("Design", "Closeout"), "Completed");
    assert.equal(nextPhaseFor("Design", "Completed"), "Archived");
    assert.equal(nextPhaseFor("Design", "Archived"), null);
  });
  test("Construction path is exactly the existing NEXT_PHASE table, for every phase", () => {
    for (const [phase, next] of Object.entries(NEXT_PHASE)) {
      assert.equal(nextPhaseFor("Construction", phase as keyof typeof NEXT_PHASE), next, phase);
    }
  });
  test("unknown / missing delivery type behaves as Construction", () => {
    assert.equal(normalizeDeliveryType(undefined), "Construction");
    assert.equal(normalizeDeliveryType("Landscape"), "Construction");
    assert.equal(nextPhaseFor(null, "Design"), "Pre-Construction");
  });
  test("a Design project's Closeout reads Turnover; a Construction project's does not", () => {
    assert.equal(phaseLabel("Design", "Closeout"), "Turnover");
    assert.equal(phaseLabel("Design", "Design"), "Design");
    assert.equal(phaseLabel("Construction", "Closeout"), "Closeout");
  });
});

describe("plan-set progress", () => {
  test("status points are 0 / 40 / 70 / 90 / 100", () => {
    assert.deepEqual(STATUS_POINTS, { not_started: 0, in_progress: 40, for_review: 70, approved: 90, issued: 100 });
  });
  test("average over the plan sets", () => {
    assert.equal(planSetAverage([]), 0);
    assert.equal(planSetAverage([{ status: "approved" }, { status: "not_started" }]), 45);
    assert.equal(planSetAverage([{ status: "issued" }, { status: "issued" }]), 100);
  });
  test("Design phase scales the average into 10-90", () => {
    assert.equal(designProgress("Design", [], []), 10);
    assert.equal(designProgress("Design", [{ status: "not_started" }], []), 10);
    assert.equal(designProgress("Design", [{ status: "in_progress" }, { status: "for_review" }], []), 10 + Math.round(80 * 0.55));
    assert.equal(designProgress("Design", [{ status: "issued" }, { status: "issued" }], []), 90);
  });
  test("Proposal scales gates into 0-10, Turnover into 90-99", () => {
    assert.equal(designProgress("Proposal", [], [{ passed: true }, { passed: true }, { passed: true }, { passed: false }, { passed: false }]), 6);
    assert.equal(designProgress("Closeout", [], [{ passed: false }, { passed: false }, { passed: false }, { passed: false }]), 90);
    assert.equal(designProgress("Closeout", [], [{ passed: true }, { passed: true }, { passed: false }, { passed: false }]), 95);
    assert.equal(designProgress("Closeout", [], [{ passed: true }, { passed: true }, { passed: true }, { passed: true }]), 99);
  });
  test("Completed and Archived are 100; a phase off the Design path returns null", () => {
    assert.equal(designProgress("Completed", [], []), 100);
    assert.equal(designProgress("Archived", [], []), 100);
    assert.equal(designProgress("Construction", [], []), null);
  });
});

describe("discipline mapping", () => {
  test("free-text design disciplines map onto the five plan sets", () => {
    assert.equal(deliverableForDiscipline("Architectural"), "Architectural");
    assert.equal(deliverableForDiscipline("Structural"), "Structural");
    for (const d of ["MEP", "MEPF", "Electrical", "Mechanical", "Plumbing", "Fire Protection"]) assert.equal(deliverableForDiscipline(d), "MEP", d);
    assert.equal(deliverableForDiscipline("Civil"), "Civil");
    assert.equal(deliverableForDiscipline("Interior Design"), "Interior");
    assert.equal(deliverableForDiscipline("Landscape"), null);
    assert.equal(deliverableForDiscipline(""), null);
  });
});

describe("who may move a plan set", () => {
  test("architect works it up to review; consultant approves; PM and Admin do any step; others none", () => {
    assert.equal(canSetDeliverableStatus("architect", "not_started", "in_progress"), true);
    assert.equal(canSetDeliverableStatus("architect", "in_progress", "for_review"), true);
    assert.equal(canSetDeliverableStatus("architect", "for_review", "approved"), false);
    assert.equal(canSetDeliverableStatus("consultant", "for_review", "approved"), true);
    assert.equal(canSetDeliverableStatus("consultant", "approved", "issued"), false);
    assert.equal(canSetDeliverableStatus("project-manager", "approved", "issued"), true);
    assert.equal(canSetDeliverableStatus("admin", "not_started", "issued"), true);
    assert.equal(canSetDeliverableStatus("engineer", "not_started", "in_progress"), false);
    assert.equal(canSetDeliverableStatus("project-manager", "approved", "approved"), false);
    assert.equal(canSetDeliverableStatus("project-manager", "approved", "nonsense"), false);
  });
});
