import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  canRaise,
  codeToken,
  computeDueDate,
  formatControlNo,
  formatRequestNumber,
  impliesChangeOrder,
  isOpenRequest,
  isOverdue,
  needsCountersign,
  statusAfterResponse,
} from "./rules.js";

const d = new Date("2022-03-15T10:00:00Z");

describe("numbering", () => {
  test("RFI-PROJECT-DISC-SEQ-YY", () => {
    assert.equal(formatRequestNumber("RFI", "PCMC", "AR", 5, d), "RFI-PCMC-AR-005-22");
    assert.equal(formatRequestNumber("RFA", "DEMO-S4", "ST", 12, new Date("2026-10-04T00:00:00Z")), "RFA-DEMO-S4-ST-012-26");
  });
  test("project codes are reduced to letters, digits and hyphens", () => {
    assert.equal(codeToken("Zh 01"), "ZH01");
    assert.equal(codeToken("GTSP - 00"), "GTSP-00");
  });
  test("transmittal control no", () => {
    assert.equal(formatControlNo("PCMC", 1, d), "PCMC-DOC-01-22");
  });
});

describe("deadlines", () => {
  test("default windows: RFI 3 days, RFA 4 days; an explicit window wins", () => {
    const from = new Date("2026-10-01T00:00:00Z");
    assert.equal(computeDueDate("RFI", from).toISOString(), "2026-10-04T00:00:00.000Z");
    assert.equal(computeDueDate("RFA", from).toISOString(), "2026-10-05T00:00:00.000Z");
    assert.equal(computeDueDate("RFI", from, 7).toISOString(), "2026-10-08T00:00:00.000Z");
    assert.equal(computeDueDate("RFI", from, 0).toISOString(), "2026-10-04T00:00:00.000Z");
  });
  test("overdue only while a response is awaited and the due date has passed", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    const past = new Date("2026-10-05T00:00:00Z");
    const future = new Date("2026-10-20T00:00:00Z");
    assert.equal(isOverdue({ status: "open", dueDate: past }, now), true);
    assert.equal(isOverdue({ status: "in_review", dueDate: past }, now), true);
    assert.equal(isOverdue({ status: "open", dueDate: future }, now), false);
    for (const s of ["answered", "approved", "approved_as_noted", "rejected", "closed", "draft"]) {
      assert.equal(isOverdue({ status: s, dueDate: past }, now), false, s);
    }
    assert.equal(isOverdue({ status: "open", dueDate: null }, now), false);
  });
});

describe("open requests (closing gate)", () => {
  test("open means not answered/approved/approved-as-noted/rejected/closed — drafts included", () => {
    for (const s of ["draft", "open", "in_review"]) assert.equal(isOpenRequest(s), true, s);
    for (const s of ["answered", "approved", "approved_as_noted", "rejected", "closed"]) assert.equal(isOpenRequest(s), false, s);
  });
});

describe("who may act", () => {
  test("PM, Engineer and Admin raise; designers do not raise to the client side", () => {
    assert.equal(canRaise("project-manager"), true);
    assert.equal(canRaise("engineer"), true);
    assert.equal(canRaise("admin"), true);
    assert.equal(canRaise("architect"), false);
    assert.equal(canRaise("consultant"), false);
    assert.equal(canRaise("site-personnel"), false);
  });
  test("an engineer's request needs the PM to countersign; a PM's does not", () => {
    assert.equal(needsCountersign("engineer"), true);
    assert.equal(needsCountersign("project-manager"), false);
    assert.equal(needsCountersign("admin"), false);
  });
});

describe("responses", () => {
  test("an RFI is answered; an RFA takes its outcome as status and requires one", () => {
    assert.equal(statusAfterResponse("RFI", undefined), "answered");
    assert.equal(statusAfterResponse("RFA", "approved_as_noted"), "approved_as_noted");
    assert.throws(() => statusAfterResponse("RFA", undefined));
  });
  test("a change order is implied by any cost or time impact", () => {
    assert.equal(impliesChangeOrder({ costImpact: "none", timeImpact: "none" }), false);
    assert.equal(impliesChangeOrder({ costImpact: "increase", timeImpact: "none" }), true);
    assert.equal(impliesChangeOrder({ costImpact: "none", timeImpact: "decrease" }), true);
  });
});
