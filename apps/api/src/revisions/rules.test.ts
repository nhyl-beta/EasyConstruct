import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  allowedNextStatuses,
  assertTransition,
  nextVersionNumber,
  normalizeItemType,
  normalizeStatus,
  statusWhenSuperseded,
} from "./rules.js";
import { ForbiddenError, ValidationError } from "../utils/errors.js";

describe("version numbering", () => {
  test("a new item starts at 1; otherwise one past the highest, gaps notwithstanding", () => {
    assert.equal(nextVersionNumber([]), 1);
    assert.equal(nextVersionNumber([1, 2, 3]), 4);
    assert.equal(nextVersionNumber([1, 5, 2]), 6);
  });
});

describe("supersede logic", () => {
  test("open versions become Superseded; decided versions keep their status", () => {
    assert.equal(statusWhenSuperseded("Submitted"), "Superseded");
    assert.equal(statusWhenSuperseded("Under Review"), "Superseded");
    assert.equal(statusWhenSuperseded("Draft"), "Superseded");
    assert.equal(statusWhenSuperseded("Approved"), "Approved");
    assert.equal(statusWhenSuperseded("Rejected"), "Rejected");
  });
});

describe("status transitions", () => {
  test("reviewers move Submitted -> Under Review -> Approved/Rejected", () => {
    for (const role of ["consultant", "project-manager", "admin"]) {
      assert.doesNotThrow(() => assertTransition("Submitted", "Under Review", role, undefined));
      assert.doesNotThrow(() => assertTransition("Under Review", "Approved", role, undefined));
      assert.doesNotThrow(() => assertTransition("Submitted", "Approved", role, undefined));
      assert.doesNotThrow(() => assertTransition("Under Review", "Rejected", role, "Wrong scale"));
    }
  });

  test("a rejection needs a comment", () => {
    assert.throws(() => assertTransition("Under Review", "Rejected", "consultant", "  "), ValidationError);
  });

  test("decided and superseded revisions are final", () => {
    for (const from of ["Approved", "Rejected", "Superseded"] as const) {
      assert.deepEqual(allowedNextStatuses(from, "admin"), []);
      assert.throws(() => assertTransition(from, "Under Review", "admin", undefined), ValidationError);
    }
  });

  test("an architect can submit a draft but cannot review anything", () => {
    assert.doesNotThrow(() => assertTransition("Draft", "Submitted", "architect", undefined));
    assert.throws(() => assertTransition("Submitted", "Approved", "architect", undefined), ValidationError);
  });

  test("other roles are refused outright", () => {
    for (const role of ["engineer", "site-personnel", "owner", "finance-manager"]) {
      assert.throws(() => assertTransition("Submitted", "Approved", role, undefined), ForbiddenError);
    }
  });

  test("moving to the same status is rejected", () => {
    assert.throws(() => assertTransition("Submitted", "Submitted", "consultant", undefined), ValidationError);
  });
});

describe("normalizers", () => {
  test("unknown status text reads as Submitted; known values pass through", () => {
    assert.equal(normalizeStatus("Approved"), "Approved");
    assert.equal(normalizeStatus("weird"), "Submitted");
    assert.equal(normalizeStatus(null), "Submitted");
  });
  test("item type must be one of the four", () => {
    assert.equal(normalizeItemType("plan"), "plan");
    assert.throws(() => normalizeItemType("spreadsheet"), ValidationError);
  });
});
